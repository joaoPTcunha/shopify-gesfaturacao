import prisma from "../../prisma/client";

export async function fetchShippingProductData(order, apiUrl, token) {
  console.log("[fetchShippingProductData] Fetching shipping product data...");

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

  if (!order.shippingLine?.price || order.shippingLine.price <= 0) {
    console.warn(
      "[fetchShippingProductData] No valid shipping price found in order, skipping shipping line item",
    );
    return null;
  }

  try {
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
    console.log(
      "[fetchShippingProductData] Shipping product details:",
      JSON.stringify(shippingProduct, null, 2),
    );

    const shippingTaxId = shippingProduct.data?.tax?.id || 1;
    const shippingDescription =
      shippingProduct.data?.description || "Nome Não Encontrado";

    return {
      lineItem: {
        id: parseInt(login.id_product_shipping),
        tax: shippingTaxId,
        quantity: 1,
        price: order.shippingLine.price,
        description: shippingDescription,
        discount: 0,
        retention: 0,
        exemption_reason: shippingTaxId === 4 ? "M01" : "",
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
