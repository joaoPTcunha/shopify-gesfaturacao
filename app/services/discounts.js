import { getMonetaryValue } from "../utils/getMonetaryValue";
import { clampDiscount } from "../utils/clampDiscount";

export function Discounts(order) {
  console.log(
    `[getOrderDiscounts] Calculating discounts for order ${order.name || "undefined"}`,
  );

  const discountOnly = {};
  let subtotalProductsBeforeDiscounts = 0.0;
  let subtotalProductsWithVat = 0.0;
  let discountAmountExclTax = 0.0;
  let invoiceLevelDiscount = 0.0;
  let isProductSpecificDiscount = false;
  let generalDiscountPercentage = 0.0;

  // Map order line items to order details
  const orderDetails = order.lineItems.map((item) => {
    const productId =
      item.productId?.split("/").pop() || item.variantId?.split("/").pop();
    if (!productId) {
      throw new Error(`Missing productId or variantId for item: ${item.title}`);
    }
    const isTaxable = item.taxable ?? true;
    const taxRate = isTaxable
      ? item.taxLines?.[0]?.ratePercentage ||
        (item.taxLines?.[0]?.rate ? item.taxLines[0].rate * 100 : 0) ||
        (order.shippingAddress?.country === "Portugal" ? 23.0 : 0)
      : 0;
    const originalPrice = parseFloat(
      item.originalUnitPriceSet?.shopMoney?.amount || item.unitPrice || 0,
    );
    const unitPriceExclTax =
      taxRate > 0 ? originalPrice / (1 + taxRate / 100) : originalPrice;
    let itemDiscountExclTax = 0;
    if (item.discountAllocations?.length > 0) {
      const itemDiscountWithVat = item.discountAllocations.reduce(
        (sum, alloc) =>
          sum + parseFloat(alloc.allocatedAmountSet.shopMoney.amount || 0),
        0,
      );
      itemDiscountExclTax =
        taxRate > 0
          ? itemDiscountWithVat / (1 + taxRate / 100)
          : itemDiscountWithVat;
    }
    return {
      productId,
      originalPrice: unitPriceExclTax,
      productQuantity: item.quantity || 1,
      taxRate,
      discount: itemDiscountExclTax,
      title: item.title,
    };
  });

  // Calculate subtotal for products
  for (const detail of orderDetails) {
    const { originalPrice, productQuantity, taxRate } = detail;
    const lineSubtotalExcl = originalPrice * productQuantity;
    subtotalProductsBeforeDiscounts += lineSubtotalExcl;
    const lineVat = lineSubtotalExcl * (taxRate / 100.0);
    subtotalProductsWithVat += lineSubtotalExcl + lineVat;
    console.log(
      `[getOrderDiscounts] Product ID: ${detail.productId} | Original Price (excl. VAT): ${originalPrice.toFixed(3)} | Quantity: ${detail.productQuantity} | Tax Rate: ${taxRate}% | Line Subtotal (excl. VAT): ${lineSubtotalExcl.toFixed(3)} | Line VAT: ${lineVat.toFixed(3)} | Line Discount (excl. VAT): ${detail.discount.toFixed(3)}`,
    );
  }

  // Add shipping to subtotal if present
  let shippingPrice = getMonetaryValue(
    order.shippingLine?.price,
    "shippingLine",
  );
  let shippingTaxRate =
    order.shippingLine?.taxLines?.[0]?.rate * 100 ||
    (order.shippingAddress?.country === "Portugal" ? 23.0 : 0);
  const allProductsZeroTax = orderDetails.every(
    (detail) => detail.taxRate === 0,
  );
  if (allProductsZeroTax) {
    shippingTaxRate = 0;
  }
  const shippingExclTax =
    shippingTaxRate > 0
      ? shippingPrice / (1 + shippingTaxRate / 100)
      : shippingPrice;
  subtotalProductsBeforeDiscounts += shippingExclTax;
  subtotalProductsWithVat += shippingPrice;

  // Identify discount types
  const hasGeneralDiscount = order.discountApplications?.some(
    (app) =>
      app.node.targetType === "LINE_ITEM" &&
      app.node.targetSelection === "ALL" &&
      app.node.allocationMethod === "ACROSS",
  );
  const hasEntitledDiscount = order.discountApplications?.some(
    (app) =>
      app.node.targetType === "LINE_ITEM" &&
      app.node.targetSelection === "ENTITLED" &&
      app.node.allocationMethod === "EACH",
  );
  const hasShippingDiscount = order.discountApplications?.some(
    (app) =>
      app.node.targetType === "SHIPPING_LINE" &&
      app.node.targetSelection === "ALL",
  );

  if (order.discountApplications?.length > 0) {
    console.log("[DEBUG] Tipos de descontos encontrados:");
    for (const app of order.discountApplications) {
      const node = app.node;
      console.log({
        targetType: node.targetType,
        targetSelection: node.targetSelection,
        allocationMethod: node.allocationMethod,
        valueType: node.value.__typename,
        percentage: node.value.percentage || null,
        amount: node.value.amount || null,
      });
    }
  }

  // Calculate total discounts from Shopify
  const totalDiscountWithVat = getMonetaryValue(
    order.totalDiscountsSet?.shopMoney?.amount,
    "totalDiscountsSet",
  );

  // Determine discount type
  let totalItemDiscountsExclTax = orderDetails.reduce(
    (sum, detail) => sum + detail.discount,
    0,
  );
  if (hasGeneralDiscount && !hasEntitledDiscount && !hasShippingDiscount) {
    isProductSpecificDiscount = false;
  } else if (
    hasEntitledDiscount ||
    totalItemDiscountsExclTax > 0 ||
    hasShippingDiscount
  ) {
    isProductSpecificDiscount = true;
  }

  // Calculate discounts
  if (isProductSpecificDiscount) {
    // Product-specific discounts
    for (const detail of orderDetails) {
      const {
        productId,
        originalPrice,
        productQuantity,
        discount,
        taxRate,
        title,
      } = detail;
      const lineTotalExclTax = originalPrice * productQuantity;
      const discountPercent =
        lineTotalExclTax > 0 ? (discount / lineTotalExclTax) * 100 : 0;
      discountOnly[productId] = clampDiscount(
        discountPercent,
        `product-specific discount for ${productId}`,
      );
      discountAmountExclTax += parseFloat(discount.toFixed(3));
      console.log(
        `[DescontoIndividual] Product ${title} (ID: ${productId}): Discount (excl. VAT): ${discount.toFixed(3)}€ (${discountOnly[productId].toFixed(3)}%)`,
      );
    }

    // Handle shipping discount
    if (hasShippingDiscount) {
      const shippingDiscount = order.discountApplications.find(
        (app) =>
          app.node.targetType === "SHIPPING_LINE" &&
          app.node.targetSelection === "ALL",
      );
      let shippingDiscountPercent = 0;
      let shippingDiscountExclTax = 0;
      if (shippingDiscount) {
        if (
          shippingDiscount.node.value.__typename === "PricingPercentageValue"
        ) {
          shippingDiscountPercent = parseFloat(
            shippingDiscount.node.value.percentage || 0,
          );
          shippingDiscountExclTax =
            shippingExclTax * (shippingDiscountPercent / 100);
        } else if (shippingDiscount.node.value.__typename === "MoneyV2") {
          const shippingDiscountWithVat = parseFloat(
            shippingDiscount.node.value.amount || 0,
          );
          shippingDiscountExclTax =
            shippingTaxRate > 0
              ? shippingDiscountWithVat / (1 + shippingTaxRate / 100)
              : shippingDiscountWithVat;
          shippingDiscountPercent =
            shippingExclTax > 0
              ? (shippingDiscountExclTax / shippingExclTax) * 100
              : 0;
        }
      }
      discountOnly["shipping"] = clampDiscount(
        shippingDiscountPercent,
        "shipping discount",
      );
      discountAmountExclTax += parseFloat(shippingDiscountExclTax.toFixed(3));
      console.log(
        `[DescontoIndividual] Shipping: Discount ${shippingDiscountExclTax.toFixed(3)}€ (excl. VAT, ${discountOnly["shipping"].toFixed(3)}%)`,
      );
    } else {
      discountOnly["shipping"] = 0;
    }
  } else if (hasGeneralDiscount) {
    // General discount (ALL + ACROSS)
    const generalDiscount = order.discountApplications.find(
      (app) =>
        app.node.targetType === "LINE_ITEM" &&
        app.node.targetSelection === "ALL" &&
        app.node.allocationMethod === "ACROSS",
    );
    let expectedDiscountWithVat = totalDiscountWithVat;
    let nominalDiscountPercent = 0;
    if (generalDiscount) {
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
    }

    orderDetails.forEach((detail) => {
      discountOnly[detail.productId] = 0;
    });
    discountOnly["shipping"] = 0;

    invoiceLevelDiscount =
      expectedDiscountWithVat /
      (1 + (subtotalProductsWithVat / subtotalProductsBeforeDiscounts - 1));
    invoiceLevelDiscount = parseFloat(invoiceLevelDiscount.toFixed(3));
    discountAmountExclTax = invoiceLevelDiscount;
    generalDiscountPercentage = nominalDiscountPercent;
    console.log(
      `[DescontoGeral] General discount applied: ${invoiceLevelDiscount.toFixed(3)}€ (excl. VAT, ${generalDiscountPercentage.toFixed(3)}%)`,
    );
  } else {
    orderDetails.forEach((detail) => {
      discountOnly[detail.productId] = 0;
    });
    discountOnly["shipping"] = 0;
    console.log(`[DescontoGeral] No general discount applied.`);
    console.log(`[DescontoIndividual] No individual discounts applied.`);
  }

  // Final discount summary
  console.log(
    `[getOrderDiscounts] Final Discount Summary for Order ${order.name || "undefined"}:`,
  );
  if (isProductSpecificDiscount) {
    console.log(`[DescontoIndividual] Individual Discounts:`);
    orderDetails.forEach((detail) => {
      const discountPercent = discountOnly[detail.productId];
      const discountAmount = detail.discount;
      console.log(
        `[DescontoIndividual] Product ${detail.title} (ID: ${detail.productId}): ${discountAmount.toFixed(3)}€ (${discountPercent.toFixed(3)}%)`,
      );
    });
    if (discountOnly["shipping"] > 0) {
      console.log(
        `[DescontoIndividual] Shipping: ${discountOnly["shipping"].toFixed(3)}%`,
      );
    }
  } else if (hasGeneralDiscount) {
    console.log(
      `[DescontoGeral] General Discount: ${invoiceLevelDiscount.toFixed(3)}€ (${generalDiscountPercentage.toFixed(3)}%)`,
    );
  } else {
    console.log(`[getOrderDiscounts] No discounts applied.`);
  }

  console.log(
    `[getOrderDiscounts] discountOnly: ${JSON.stringify(discountOnly)} | isProductSpecificDiscount: ${isProductSpecificDiscount} | discountAmountExclTax: ${discountAmountExclTax} | invoiceLevelDiscount: ${invoiceLevelDiscount}`,
  );

  return {
    discountOnly,
    subtotalProductsWithVat,
    subtotalProductsBeforeDiscounts,
    discountAmount: discountAmountExclTax,
    invoiceLevelDiscount,
    isProductSpecificDiscount,
    generalDiscountPercentage,
  };
}
