export function getOrderDiscounts(order) {
  // Initialize discount tracking
  const discountOnly = {};
  let subtotalProductsBeforeDiscounts = 0.0; // Total without VAT before discounts
  let subtotalProductsWithVat = 0.0; // Total with VAT before discounts
  let discountAmountExclTax = 0.0; // Total discount amount (excl. VAT)
  let isProductSpecificDiscount = false;

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
      23.0; // Default to 23% for Portugal
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
      originalPrice: item.unitPrice || 0,
      productQuantity: item.quantity || 1,
      taxRate,
      discount: itemDiscount,
    };
  });

  // Calculate subtotal and check if discounts are product-specific
  let totalItemDiscountsWithVat = 0.0;
  for (const detail of orderDetails) {
    const { productId, originalPrice, productQuantity, taxRate, discount } =
      detail;

    // Calculate line subtotal (excluding VAT, before discounts)
    const unitExcl = originalPrice / (1 + taxRate / 100);
    const lineSubtotalExcl = unitExcl * productQuantity;
    subtotalProductsBeforeDiscounts += lineSubtotalExcl;
    const lineVat = lineSubtotalExcl * (taxRate / 100.0);
    subtotalProductsWithVat += lineSubtotalExcl + lineVat;
    totalItemDiscountsWithVat += discount;
  }

  // Determine discount type based on total value
  const totalValue = parseFloat(order.totalValue || 0);
  const expectedTotalBeforeDiscounts = order.lineItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const expectedDiscountWithVat = expectedTotalBeforeDiscounts - totalValue;

  // Check if general discount matches total
  if (hasGeneralDiscount && !hasEntitledDiscount) {
    const generalDiscount = order.discountApplications.find(
      (app) =>
        app.node.targetType === "LINE_ITEM" &&
        app.node.targetSelection === "ALL",
    );
    let generalDiscountAmount = 0.0;
    if (generalDiscount.node.value.__typename === "PricingPercentageValue") {
      generalDiscountAmount =
        (generalDiscount.node.value.percentage / 100) * subtotalProductsWithVat;
    } else if (generalDiscount.node.value.__typename === "MoneyV2") {
      generalDiscountAmount = parseFloat(
        generalDiscount.node.value.amount || 0,
      );
    }
    if (Math.abs(generalDiscountAmount - expectedDiscountWithVat) < 0.01) {
      isProductSpecificDiscount = false; // General discount matches total
    } else if (totalItemDiscountsWithVat > 0) {
      isProductSpecificDiscount = true; // Product-specific discounts present
    }
  } else if (hasEntitledDiscount || totalItemDiscountsWithVat > 0) {
    isProductSpecificDiscount = true; // Product-specific discounts via ENTITLED or discountAllocations
  }

  // Calculate discounts
  if (isProductSpecificDiscount) {
    // Product-specific discounts
    for (const detail of orderDetails) {
      const { productId, originalPrice, productQuantity, discount } = detail;
      const lineTotalWithVat = originalPrice * productQuantity;
      discountOnly[productId] =
        lineTotalWithVat > 0 ? (discount / lineTotalWithVat) * 100 : 0;
      discountAmountExclTax += discount / (1 + detail.taxRate / 100);
    }
  } else if (hasGeneralDiscount) {
    // General discounts
    const generalDiscount = order.discountApplications.find(
      (app) =>
        app.node.targetType === "LINE_ITEM" &&
        app.node.targetSelection === "ALL",
    );
    let totalDiscountWithVat = 0.0;
    if (generalDiscount.node.value.__typename === "PricingPercentageValue") {
      const discountValue = generalDiscount.node.value.percentage || 0;
      totalDiscountWithVat = (discountValue / 100.0) * subtotalProductsWithVat;
    } else if (generalDiscount.node.value.__typename === "MoneyV2") {
      totalDiscountWithVat = parseFloat(generalDiscount.node.value.amount || 0);
    }

    const weightedTaxRate =
      subtotalProductsBeforeDiscounts > 0
        ? (subtotalProductsWithVat - subtotalProductsBeforeDiscounts) /
          subtotalProductsBeforeDiscounts
        : 0.23;
    discountAmountExclTax = totalDiscountWithVat / (1 + weightedTaxRate);
    const discountPercent =
      subtotalProductsBeforeDiscounts > 0
        ? (discountAmountExclTax / subtotalProductsBeforeDiscounts) * 100.0
        : 0.0;

    for (const detail of orderDetails) {
      discountOnly[detail.productId] = parseFloat(discountPercent.toFixed(3));
    }
  }

  return {
    discountOnly,
    subtotalProductsWithVat,
    discountAmount: discountAmountExclTax,
    isProductSpecificDiscount,
  };
}
