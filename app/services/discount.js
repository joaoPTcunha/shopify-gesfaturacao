// app/services/discount.js

export function getOrderDiscounts(order) {
  console.log(
    `[getOrderDiscounts] Calculating discounts for order ${order.orderNumber}`,
  );

  // Initialize discount tracking
  const discountOnly = {}; // Percentage discount per product
  let subtotalProductsWithVat = 0.0; // Total with VAT before discounts
  let subtotalProductsBeforeDiscounts = 0.0; // Total without VAT before discounts
  let discountAmount = 0.0; // Total discount amount without VAT
  let isProductSpecificDiscount = false; // Track if product-specific discounts are applied

  // Map order line items to order details
  const orderDetails = order.lineItems.map((item) => {
    const productId =
      item.productId?.split("/").pop() || item.variantId?.split("/").pop();
    if (!productId) {
      throw new Error(`Missing productId or variantId for item: ${item.title}`);
    }
    return {
      productId,
      originalPrice: item.unitPrice || 0,
      productQuantity: item.quantity || 1,
      taxRate: item.taxLines?.[0]?.ratePercentage || 23.0, // Default to 23% if not provided
    };
  });

  // Calculate subtotal for products (before discounts)
  for (const detail of orderDetails) {
    const productId = detail.productId;
    const originalPrice = detail.originalPrice;
    const quantity = detail.productQuantity;
    const taxRate = detail.taxRate;

    // Initialize discount for this product
    discountOnly[productId] = 0.0;

    // Calculate line subtotal (excluding VAT)
    const lineSubtotalExcl = originalPrice * quantity;
    subtotalProductsBeforeDiscounts += lineSubtotalExcl;
    const lineVat = lineSubtotalExcl * (taxRate / 100.0);
    subtotalProductsWithVat += lineSubtotalExcl + lineVat;

    console.log(
      `[getOrderDiscounts] Product ID: ${productId} | Original Price: ${originalPrice} | Quantity: ${quantity} | Tax Rate: ${taxRate}% | Line Subtotal (excl. VAT): ${lineSubtotalExcl} | Line VAT: ${lineVat}`,
    );
  }

  // Fetch discount applications (equivalent to PrestaShop cart rules)
  const cartRules =
    order.discountApplications?.edges?.map(({ node }) => {
      const valueType = node.value?.__typename || "FixedAmountDiscount";
      return {
        valueTaxExcl: node.value?.amount
          ? node.value.amount / (1 + (node.taxRate || 23.0) / 100.0)
          : 0,
        value: node.value?.amount || 0,
        idCartRule: node.title || `discount_${node.index}`,
        reductionPercent:
          valueType === "PercentageDiscount" ? node.value.percentage : 0,
        reductionAmount:
          valueType === "FixedAmountDiscount" ? node.value.amount : 0,
        reductionProduct:
          node.targetType === "LINE_ITEM" && node.targetSelection === "ENTITLED"
            ? node.targetId?.split("/").pop()
            : 0, // Map to product ID if applicable
      };
    }) || [];

  // Get expected total discount from order
  const expectedDiscountWithVat = parseFloat(
    order.totalDiscountsSet?.shopMoney?.amount || 0,
  );
  const weightedTaxRate =
    subtotalProductsBeforeDiscounts > 0
      ? (subtotalProductsWithVat - subtotalProductsBeforeDiscounts) /
        subtotalProductsBeforeDiscounts
      : 0.23;
  const expectedDiscountExclTax =
    expectedDiscountWithVat / (1 + weightedTaxRate);

  console.log(
    `[getOrderDiscounts] Expected total discount (with VAT): ${expectedDiscountWithVat} | Weighted Tax Rate: ${(weightedTaxRate * 100).toFixed(2)}% | Expected discount (excl. VAT): ${expectedDiscountExclTax}`,
  );

  // Apply product-specific discounts
  let totalCartRuleDiscountExclTax = 0.0;
  for (const rule of cartRules) {
    const ruleDiscountWithVat = parseFloat(rule.value);
    const reductionProduct = rule.reductionProduct;
    const ruleDiscountExclTax = parseFloat(rule.valueTaxExcl);
    const reductionPercent = parseFloat(rule.reductionPercent);
    const reductionAmount = parseFloat(rule.reductionAmount);

    if (reductionProduct && discountOnly.hasOwnProperty(reductionProduct)) {
      let productPrice = 0.0;
      let productQuantity = 0.0;
      let productTaxRate = 0.0;

      // Find matching product in order details
      for (const detail of orderDetails) {
        if (detail.productId === reductionProduct) {
          productPrice = detail.originalPrice;
          productQuantity = detail.productQuantity;
          productTaxRate = detail.taxRate;
          break;
        }
      }

      if (productPrice > 0 && productQuantity > 0) {
        const totalProductValueExclTax = productPrice * productQuantity;
        let discountExclTax = 0.0;

        if (reductionAmount > 0) {
          discountExclTax = reductionAmount / (1 + productTaxRate / 100.0);
          console.log(
            `[getOrderDiscounts] Applying fixed discount of ${reductionAmount} EUR (with VAT) converted to ${discountExclTax} EUR (excl. VAT) for product ID: ${reductionProduct}`,
          );
        } else if (reductionPercent > 0) {
          discountExclTax =
            totalProductValueExclTax * (reductionPercent / 100.0);
          console.log(
            `[getOrderDiscounts] Applying percentage discount of ${reductionPercent}% for product ID: ${reductionProduct}`,
          );
        }

        // Ensure discount does not exceed product value
        if (discountExclTax > totalProductValueExclTax) {
          discountExclTax = totalProductValueExclTax;
          console.log(
            `[getOrderDiscounts] Warning - Discount (excl. VAT: ${discountExclTax}) exceeds product value (excl. VAT: ${totalProductValueExclTax}) for product ID: ${reductionProduct}. Limiting to product value.`,
          );
        }

        const discountPercent =
          (discountExclTax / totalProductValueExclTax) * 100.0;
        discountOnly[reductionProduct] += parseFloat(
          discountPercent.toFixed(3),
        );
        totalCartRuleDiscountExclTax += discountExclTax;
        discountAmount += discountExclTax;
        isProductSpecificDiscount = true;

        console.log(
          `[getOrderDiscounts] Applied discount to product ID: ${reductionProduct} | Discount: ${discountOnly[reductionProduct]}% (excl. VAT: ${discountExclTax}, product price: ${productPrice}, quantity: ${productQuantity}, total excl. VAT: ${totalProductValueExclTax})`,
        );
      }
    }
  }

  console.log(
    `[getOrderDiscounts] Subtotal before discounts (excl. VAT): ${subtotalProductsBeforeDiscounts}`,
  );
  console.log(
    `[getOrderDiscounts] Subtotal before discounts (with VAT): ${subtotalProductsWithVat}`,
  );
  console.log(
    `[getOrderDiscounts] Total discount (excl. VAT): ${discountAmount}`,
  );
  console.log(
    `[getOrderDiscounts] Final discounts -> Total (excl. VAT): ${discountAmount} | Per product: ${JSON.stringify(discountOnly)}`,
  );

  return {
    discountOnly,
    subtotalProductsWithVat,
    subtotalProductsBeforeDiscounts,
    discountAmount,
    isProductSpecificDiscount,
    weightedTaxRate,
  };
}
