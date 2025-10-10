export function Discounts(order) {
  const discountOnly = {};
  let subtotalProductsBeforeDiscounts = 0.0;
  let subtotalProductsWithVat = 0.0;
  let discountAmountExclTax = 0.0;
  let isProductSpecificDiscount = false;

  function clampDiscount(value, context = "unknown") {
    if (value < 0 || value > 100) {
      console.error(
        `[Discounts] Invalid discount detected in ${context}: ${value}%. Discounts must be between 0% and 100%.`,
      );
      throw new Error(
        `Invalid discount in ${context}: ${value}%. Discounts must be between 0% and 100%.`,
      );
    }
    return parseFloat(value.toFixed(4));
  }

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
      (order.shippingAddress?.country === "Portugal" ? 23.0 : 0);
    let itemDiscount = 0;
    if (item.discountAllocations?.length > 0) {
      itemDiscount = item.discountAllocations.reduce(
        (sum, alloc) =>
          sum + parseFloat(alloc.allocatedAmountSet.shopMoney.amount || 0),
        0,
      );
    }
    return {
      productId,
      originalPrice: parseFloat(
        item.originalUnitPriceSet?.shopMoney?.amount || item.unitPrice || 0,
      ),
      productQuantity: item.quantity || 1,
      taxRate,
      discount: itemDiscount,
    };
  });

  // Calculate subtotal for products
  for (const detail of orderDetails) {
    const { originalPrice, productQuantity, taxRate } = detail;
    const unitExcl =
      taxRate > 0 ? originalPrice / (1 + taxRate / 100) : originalPrice;
    const lineSubtotalExcl = unitExcl * productQuantity;
    subtotalProductsBeforeDiscounts += lineSubtotalExcl;
    const lineVat = lineSubtotalExcl * (taxRate / 100.0);
    subtotalProductsWithVat += lineSubtotalExcl + lineVat;
  }

  // Add shipping to subtotal if present
  const shippingPrice = parseFloat(order.shippingLine?.price || 0);
  let shippingTaxRate =
    order.shippingLine?.taxLines?.[0]?.rate * 100 ||
    (order.shippingAddress?.country === "Portugal" ? 23.0 : 0);
  const allProductsZeroTax = orderDetails.every(
    (detail) => detail.taxRate === 0,
  );
  if (allProductsZeroTax) {
    shippingTaxRate = 0;
  }
  const shippingExclTax = shippingPrice / (1 + shippingTaxRate / 100);
  subtotalProductsWithVat += shippingPrice;
  subtotalProductsBeforeDiscounts += shippingExclTax;

  // Check discountApplications for general vs. product-specific
  const hasGeneralDiscount = order.discountApplications?.some(
    (app) =>
      app.node.targetType === "LINE_ITEM" && app.node.targetSelection === "ALL",
  );
  const hasEntitledDiscount = order.discountApplications?.some(
    (app) =>
      app.node.targetType === "LINE_ITEM" &&
      app.node.targetSelection === "ENTITLED",
  );
  const hasShippingDiscount = order.discountApplications?.some(
    (app) =>
      app.node.targetType === "SHIPPING_LINE" &&
      app.node.targetSelection === "ALL",
  );

  // Calculate total discounts from Shopify
  const totalDiscountWithVat = parseFloat(
    order.totalDiscountsSet?.shopMoney?.amount || 0,
  );

  // Determine discount type
  let totalItemDiscountsWithVat = orderDetails.reduce(
    (sum, detail) => sum + detail.discount,
    0,
  );
  if (hasEntitledDiscount || totalItemDiscountsWithVat > 0) {
    isProductSpecificDiscount = true;
  } else if (
    hasGeneralDiscount &&
    !hasEntitledDiscount &&
    !hasShippingDiscount
  ) {
    isProductSpecificDiscount = false;
  }

  // Calculate discounts
  if (isProductSpecificDiscount) {
    // Product-specific discounts
    for (const detail of orderDetails) {
      const { productId, originalPrice, productQuantity, discount, taxRate } =
        detail;
      const lineTotalWithVat = originalPrice * productQuantity;
      const discountPercent =
        lineTotalWithVat > 0 ? (discount / lineTotalWithVat) * 100 : 0;
      discountOnly[productId] = clampDiscount(
        discountPercent,
        `product-specific discount for ${productId}`,
      );
      console.log(
        `[Discounts] Product ${productId}: Discount ${discount.toFixed(2)}€ (VAT-inclusive, ${discountOnly[productId].toFixed(3)}%)`,
      );
      discountAmountExclTax += parseFloat(
        (discount / (1 + taxRate / 100)).toFixed(3),
      );
    }
    // Check for shipping discount
    discountOnly["shipping"] = 0; // No shipping discount for sho-jc1034
  } else if (hasGeneralDiscount) {
    // Global discount: allocate proportionally
    const generalDiscount = order.discountApplications.find(
      (app) =>
        app.node.targetType === "LINE_ITEM" &&
        app.node.targetSelection === "ALL",
    );
    let expectedDiscountWithVat = totalDiscountWithVat;
    let nominalDiscountPercent = 0;
    if (generalDiscount.node.value.__typename === "PricingPercentageValue") {
      nominalDiscountPercent = parseFloat(
        generalDiscount.node.value.percentage || 0,
      );
      expectedDiscountWithVat =
        subtotalProductsWithVat * (nominalDiscountPercent / 100);
    } else if (generalDiscount.node.value.__typename === "MoneyV2") {
      expectedDiscountWithVat = parseFloat(
        generalDiscount.node.value.amount || 0,
      );
      nominalDiscountPercent =
        subtotalProductsWithVat > 0
          ? (expectedDiscountWithVat / subtotalProductsWithVat) * 100
          : 0;
    }

    let totalAllocatedDiscountWithVat = 0.0;
    const discountAllocations = [];

    // Allocate discount to products
    for (const detail of orderDetails) {
      const { productId, originalPrice, productQuantity, taxRate } = detail;
      const lineTotalWithVat = originalPrice * productQuantity;
      const lineWeight =
        subtotalProductsWithVat > 0
          ? lineTotalWithVat / subtotalProductsWithVat
          : 0;
      let lineDiscountWithVat = expectedDiscountWithVat * lineWeight;
      lineDiscountWithVat = parseFloat(lineDiscountWithVat.toFixed(2));
      const discountPercent = (lineDiscountWithVat / lineTotalWithVat) * 100;
      discountOnly[productId] = clampDiscount(
        discountPercent,
        `general discount for ${productId}`,
      );
      console.log(
        `[Discounts] Product ${productId}: Discount ${lineDiscountWithVat.toFixed(2)}€ (VAT-inclusive, ${discountOnly[productId].toFixed(3)}%)`,
      );
      totalAllocatedDiscountWithVat += lineDiscountWithVat;
      discountAmountExclTax += parseFloat(
        (lineDiscountWithVat / (1 + taxRate / 100)).toFixed(3),
      );
      discountAllocations.push({ productId, lineDiscountWithVat });
    }

    // Allocate discount to shipping
    if (shippingPrice > 0 && !hasShippingDiscount) {
      const shippingWeight =
        subtotalProductsWithVat > 0
          ? shippingPrice / subtotalProductsWithVat
          : 0;
      let shippingDiscountWithVat = expectedDiscountWithVat * shippingWeight;
      shippingDiscountWithVat = parseFloat(shippingDiscountWithVat.toFixed(2));
      const shippingDiscountPercent =
        (shippingDiscountWithVat / shippingPrice) * 100;
      discountOnly["shipping"] = clampDiscount(
        shippingDiscountPercent,
        "general discount for shipping",
      );
      console.log(
        `[Discounts] Shipping: Discount ${shippingDiscountWithVat.toFixed(2)}€ (VAT-inclusive, ${discountOnly["shipping"].toFixed(3)}%)`,
      );
      totalAllocatedDiscountWithVat += shippingDiscountWithVat;
      discountAmountExclTax += parseFloat(
        (shippingDiscountWithVat / (1 + shippingTaxRate / 100)).toFixed(3),
      );
      discountAllocations.push({
        productId: "shipping",
        lineDiscountWithVat: shippingDiscountWithVat,
      });
    } else {
      discountOnly["shipping"] = 0;
    }

    // Adjust discounts to match expected total discount
    if (
      Math.abs(totalAllocatedDiscountWithVat - expectedDiscountWithVat) > 0.01
    ) {
      const difference =
        expectedDiscountWithVat - totalAllocatedDiscountWithVat;
      console.log(
        `[Discounts] Adjusting discount by ${difference.toFixed(2)}€ to match expected total discount of ${expectedDiscountWithVat.toFixed(2)}€`,
      );
      const largestLine = discountAllocations.reduce(
        (max, alloc) =>
          alloc.lineDiscountWithVat > max.lineDiscountWithVat ? alloc : max,
        discountAllocations[0],
      );
      if (largestLine) {
        largestLine.lineDiscountWithVat += difference;
        largestLine.lineDiscountWithVat = parseFloat(
          largestLine.lineDiscountWithVat.toFixed(2),
        );
        const lineTotalWithVat =
          largestLine.productId === "shipping"
            ? shippingPrice
            : orderDetails.find((d) => d.productId === largestLine.productId)
                .originalPrice *
              orderDetails.find((d) => d.productId === largestLine.productId)
                .productQuantity;
        const adjustedDiscountPercent =
          (largestLine.lineDiscountWithVat / lineTotalWithVat) * 100;
        discountOnly[largestLine.productId] = clampDiscount(
          adjustedDiscountPercent,
          `adjusted general discount for ${largestLine.productId}`,
        );
        console.log(
          `[Discounts] Adjusted discount for ${largestLine.productId}: ${largestLine.lineDiscountWithVat.toFixed(2)}€ (VAT-inclusive, ${discountOnly[largestLine.productId].toFixed(3)}%)`,
        );
        discountAmountExclTax = 0.0;
        discountAllocations.forEach((alloc) => {
          const taxRate =
            alloc.productId === "shipping"
              ? shippingTaxRate
              : orderDetails.find((d) => d.productId === alloc.productId)
                  .taxRate;
          discountAmountExclTax += parseFloat(
            (alloc.lineDiscountWithVat / (1 + taxRate / 100)).toFixed(3),
          );
        });
      }
    }
  } else {
    orderDetails.forEach((detail) => {
      discountOnly[detail.productId] = 0;
    });
    discountOnly["shipping"] = 0;
  }

  return {
    discountOnly,
    subtotalProductsWithVat,
    discountAmount: discountAmountExclTax,
    isProductSpecificDiscount,
  };
}
