import { getMonetaryValue } from "../utils/getMonetaryValue";
import { clampDiscount } from "../utils/clampDiscount";

export function Discounts(order) {
  const discountOnly = {};
  let subtotalProductsBeforeDiscounts = 0.0;
  let subtotalProductsWithVat = 0.0;
  let discountAmountExclTax = 0.0;
  let invoiceLevelDiscount = 0.0;
  let isProductSpecificDiscount = false;
  let generalDiscountPercentage = 0.0;

  const orderDetails = order.lineItems.map((item) => {
    const productId =
      item.productId?.split("/").pop() || item.variantId?.split("/").pop();
    if (!productId) {
      throw new Error(
        `Falta productId ou variantId para o item: ${item.title}`,
      );
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

  for (const detail of orderDetails) {
    const { originalPrice, productQuantity, taxRate } = detail;
    const lineSubtotalExcl = originalPrice * productQuantity;
    subtotalProductsBeforeDiscounts += lineSubtotalExcl;
    const lineVat = lineSubtotalExcl * (taxRate / 100.0);
    subtotalProductsWithVat += lineSubtotalExcl + lineVat;
  }

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

  const totalDiscountWithVat = getMonetaryValue(
    order.totalDiscountsSet?.shopMoney?.amount,
    "totalDiscountsSet",
  );

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

  if (isProductSpecificDiscount) {
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
        `desconto específico para o produto ${productId}`,
      );
      discountAmountExclTax += parseFloat(discount.toFixed(3));
    }

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
        "desconto de envio",
      );
      discountAmountExclTax += parseFloat(shippingDiscountExclTax.toFixed(3));
    } else {
      discountOnly["shipping"] = 0;
    }
  } else if (hasGeneralDiscount) {
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
  } else {
    orderDetails.forEach((detail) => {
      discountOnly[detail.productId] = 0;
    });
    discountOnly["shipping"] = 0;
  }

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
