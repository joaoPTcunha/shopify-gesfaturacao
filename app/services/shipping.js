import prisma from "../../prisma/client";

export async function fetchShippingProductData(order, apiUrl, token) {
  const login = await prisma.gESlogin.findFirst({
    where: { dom_licenca: process.env.GES_LICENSE },
    orderBy: { date_login: "desc" },
  });

  if (!login || !login.id_product_shipping) {
    console.warn(
      "[fetchShippingProductData] No id_product_shipping found in gESlogin, skipping shipping line item",
    );
    return null;
  }

  const hasShippingDiscount = order.discountApplications?.some(
    (app) =>
      app.node.targetType === "SHIPPING_LINE" &&
      app.node.targetSelection === "ALL" &&
      ((app.node.value?.__typename === "PricingPercentageValue" &&
        app.node.value.percentage === 100) ||
        (app.node.value?.__typename === "MoneyV2" &&
          parseFloat(app.node.value.amount) >=
            parseFloat(order.shippingLine?.price || 0))),
  );

  if (!order.shippingLine?.price && !hasShippingDiscount) {
    console.warn(
      "[fetchShippingProductData] No valid shipping price found in order and no 100% discount, skipping shipping line item",
    );
    return null;
  }

  try {
    const allProductsZeroVat =
      order.lineItems?.every((item) => {
        const rate =
          item.taxLines?.[0]?.ratePercentage ||
          (item.taxLines?.[0]?.rate ?? 0) * 100;
        const taxable =
          item.variant?.taxable !== false && item.taxable !== false;
        return !taxable || parseFloat(rate || 0) === 0;
      }) ?? false;

    const shippingProductResponse = await fetch(
      `${apiUrl}products/${login.id_product_shipping}`,
      {
        method: "GET",
        headers: {
          Authorization: token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
    );

    if (!shippingProductResponse.ok) {
      console.warn(
        `[fetchShippingProductData] Failed to fetch shipping product (ID: ${login.id_product_shipping}): ${shippingProductResponse.statusText}`,
      );
      return null;
    }

    const shippingProduct = await shippingProductResponse.json();

    let shippingTaxRate =
      order.shippingLine?.taxLines?.[0]?.ratePercentage ||
      (order.shippingLine?.taxLines?.[0]?.rate ?? 0) * 100 ||
      23.0;

    let shippingTaxId = shippingProduct.data?.tax?.id || 1;

    if (allProductsZeroVat) {
      shippingTaxRate = 0;
      shippingTaxId = 4;
      console.log(
        "[fetchShippingProductData] All products are VAT 0 → setting shipping VAT 0",
      );
    }

    const shippingPriceWithVat = parseFloat(order.shippingLine?.price || 0);
    const shippingPriceExclTax = parseFloat(
      (shippingTaxRate > 0
        ? shippingPriceWithVat / (1 + shippingTaxRate / 100.0)
        : shippingPriceWithVat
      ).toFixed(3),
    );

    const shippingDescription =
      shippingProduct.data?.description || "Custos de Envio";

    const shippingDiscount = hasShippingDiscount ? 100 : 0;

    return {
      lineItem: {
        id: parseInt(login.id_product_shipping),
        tax: shippingTaxId,
        quantity: 1,
        price: shippingPriceExclTax,
        description: shippingDescription,
        discount: shippingDiscount,
        retention: 0,
        exemption_reason: shippingTaxId === 4 ? "M10" : "",
        type: "S",
      },
      productResult: {
        title: shippingDescription,
        productId: login.id_product_shipping,
        status: true,
        found: true,
      },
    };
  } catch (error) {
    console.warn(
      `[fetchShippingProductData] Failed to fetch shipping product: ${error.message}`,
    );
    return null;
  }
}
