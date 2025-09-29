export function getOrderDiscounts(order) {
  console.log(
    `[getOrderDiscounts] Calculating general discount for order ${order.orderNumber}`,
  );

  // Initialize discount tracking
  let subtotalProductsBeforeDiscounts = 0.0; // Total without VAT before discounts
  let subtotalProductsWithVat = 0.0; // Total with VAT before discounts
  let discountAmountExclTax = 0.0; // Total general discount amount (excl. VAT)
  let discountPercent = 0.0; // General discount percentage

  // Map order line items to order details
  const orderDetails = order.lineItems.map((item) => {
    const productId =
      item.productId?.split("/").pop() || item.variantId?.split("/").pop();
    if (!productId) {
      throw new Error(`Missing productId or variantId for item: ${item.title}`);
    }
    const taxRate =
      item.taxLines?.[0]?.ratePercentage ||
      item.taxLines?.[0]?.rate * 100 ||
      23.0; // Default to 23% if not provided
    let itemDiscount = 0;
    if (item.discountAllocations?.length > 0) {
      itemDiscount = item.discountAllocations.reduce(
        (sum, alloc) =>
          sum + parseFloat(alloc.allocatedAmountSet.shopMoney.amount),
        0,
      );
    }
    return {
      productId,
      originalPrice: item.unitPrice || 0,
      productQuantity: item.quantity || 1,
      taxRate,
      discount: itemDiscount,
    };
  });

  // Calculate subtotal for products (before general discounts)
  for (const detail of orderDetails) {
    const originalPrice = detail.originalPrice;
    const quantity = detail.productQuantity;
    const taxRate = detail.taxRate;

    // Calculate line subtotal (excluding VAT, before item-specific discounts)
    const unitExcl = originalPrice / (1 + taxRate / 100);
    const lineSubtotalExcl = unitExcl * quantity;
    subtotalProductsBeforeDiscounts += lineSubtotalExcl;
    const lineVat = lineSubtotalExcl * (taxRate / 100.0);
    subtotalProductsWithVat += lineSubtotalExcl + lineVat;

    console.log(
      `[getOrderDiscounts] Product ID: ${detail.productId} | Original Price: ${originalPrice} | Quantity: ${quantity} | Tax Rate: ${taxRate}% | Line Subtotal (excl. VAT): ${lineSubtotalExcl} | Line VAT: ${lineVat}`,
    );
  }

  // Fetch general discount from discountApplications (order-level, excluding shipping)
  const generalDiscounts =
    order.discountApplications?.filter(
      (app) =>
        app.node.targetSelection === "ALL" &&
        app.node.targetType === "LINE_ITEM",
    ) || [];

  // Calculate total general discount
  let totalDiscountWithVat = 0.0;
  for (const app of generalDiscounts) {
    const node = app.node;
    const valueType = node.value.__typename;
    let discountValue = 0;
    if (valueType === "PricingPercentageValue") {
      discountValue = node.value.percentage;
      const discountAmount = (discountValue / 100.0) * subtotalProductsWithVat;
      totalDiscountWithVat += discountAmount;
    } else if (valueType === "MoneyV2") {
      discountValue = parseFloat(node.value.amount || 0);
      totalDiscountWithVat += discountValue;
    }
    console.log(
      `[getOrderDiscounts] General discount: Type: ${valueType} | Value: ${discountValue} | Amount (with VAT): ${totalDiscountWithVat}`,
    );
  }

  // Use Shopify's reported total discount if available
  const expectedDiscountWithVat = parseFloat(
    order.totalDiscountsSet?.shopMoney?.amount || totalDiscountWithVat,
  );
  const weightedTaxRate =
    subtotalProductsBeforeDiscounts > 0
      ? (subtotalProductsWithVat - subtotalProductsBeforeDiscounts) /
        subtotalProductsBeforeDiscounts
      : 0.23;
  discountAmountExclTax = expectedDiscountWithVat / (1 + weightedTaxRate);

  if (subtotalProductsBeforeDiscounts > 0) {
    discountPercent =
      (discountAmountExclTax / subtotalProductsBeforeDiscounts) * 100.0;
    discountPercent = parseFloat(discountPercent.toFixed(3));
  }

  console.log(
    `[getOrderDiscounts] Expected total discount (with VAT): ${expectedDiscountWithVat} | Weighted Tax Rate: ${(weightedTaxRate * 100).toFixed(2)}% | General discount (excl. VAT): ${discountAmountExclTax} | General discount percent: ${discountPercent}%`,
  );

  return {
    discountAmount: discountAmountExclTax,
    discountPercent,
    subtotalProductsWithVat,
    subtotalProductsBeforeDiscounts,
    weightedTaxRate,
  };
}
