import prisma from "../../prisma/client";

/**
 * Fetch stock quantity from Shopify using GraphQL
 */
export async function fetchShopifyStockQuantity(
  productId,
  variantId,
  loginToken,
) {
  console.log(
    `[fetchShopifyStockQuantity] Fetching stock for productId: ${productId}, variantId: ${variantId || "N/A"}`,
  );

  const shopifyStoreUrl =
    "https://your-shopify-store.myshopify.com/admin/api/2025-01/graphql.json";

  const query = `
    query ($productId: ID!, $variantId: ID) {
      product(id: $productId) {
        variants(first: 10) {
          edges {
            node {
              id
              inventoryItem {
                inventoryLevel(locationId: "gid://shopify/Location/YOUR_LOCATION_ID") {
                  available
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    productId: `gid://shopify/Product/${productId.replace("gid://shopify/Product/", "")}`,
    variantId: variantId || null,
  };

  try {
    const response = await fetch(shopifyStoreUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": loginToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error(
        `[fetchShopifyStockQuantity] Shopify GraphQL request failed: ${response.statusText}`,
      );
      throw new Error(`Shopify GraphQL request failed: ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log(
      `[fetchShopifyStockQuantity] GraphQL response:`,
      JSON.stringify(responseData, null, 2),
    );

    if (responseData.errors) {
      console.error(
        `[fetchShopifyStockQuantity] GraphQL errors: ${JSON.stringify(responseData.errors)}`,
      );
      return 0;
    }

    const variants = responseData.data?.product?.variants?.edges || [];
    let stockQuantity = 0;

    if (variantId) {
      const targetVariant = variants.find((v) => v.node.id === variantId);
      if (targetVariant) {
        stockQuantity =
          targetVariant.node.inventoryItem?.inventoryLevel?.available || 0;
      } else {
        console.error(
          `[fetchShopifyStockQuantity] Variant ${variantId} not found for product ${productId}`,
        );
      }
    } else {
      // Sum stock across all variants if no specific variantId is provided
      stockQuantity = variants.reduce(
        (total, v) =>
          total + (v.node.inventoryItem?.inventoryLevel?.available || 0),
        0,
      );
    }

    console.log(`[fetchShopifyStockQuantity] Stock quantity: ${stockQuantity}`);
    return stockQuantity;
  } catch (error) {
    console.error(
      `[fetchShopifyStockQuantity] Failed to fetch stock: ${error.message}`,
    );
    return 0; // fallback
  }
}

/**
 * Create or fetch product from GESfaturacao based on Shopify order line item
 */
export async function fetchProductDataFromOrder(order, lineItem) {
  console.log(
    `[fetchProductDataFromOrder] Processing product for order ${order.orderNumber}`,
  );
  console.log(
    `[fetchProductDataFromOrder] Line item:`,
    JSON.stringify(lineItem, null, 2),
  );

  if (!lineItem.title || !lineItem.unitPrice || !lineItem.productId) {
    throw new Error("Missing product title, unit price, or product ID");
  }

  const login = await prisma.GESlogin.findFirst({
    orderBy: { date_login: "desc" },
  });
  if (!login || !login.token) throw new Error("No active GES session");

  const expireDate = login.date_expire ? new Date(login.date_expire) : null;
  if (!expireDate || expireDate < new Date()) {
    await prisma.GESlogin.delete({ where: { id: login.id } });
    throw new Error("GES session expired");
  }

  let apiUrl = login.dom_licenca;
  if (!apiUrl.endsWith("/")) apiUrl += "/";

  // Fetch stock quantity from Shopify
  const stockQuantity = lineItem.quantity;
  console.log(
    `[fetchProductDataFromOrder] Stock quantity for product ${lineItem.productId}: ${stockQuantity}`,
  );

  const productId = lineItem.productId.replace("gid://shopify/Product/", "");
  const productCode = `sho${productId}`;
  const searchUrl = `${apiUrl}products/code/${encodeURIComponent(productCode)}`;
  console.log(`[fetchProductDataFromOrder] Checking product: ${searchUrl}`);

  let searchResponse;
  try {
    searchResponse = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  } catch (fetchError) {
    throw new Error(`Product search fetch failed: ${fetchError.message}`);
  }

  const searchResponseText = await searchResponse.text();
  console.log(
    `[fetchProductDataFromOrder] Search response: ${searchResponseText}`,
  );

  let searchResponseBody = {};
  try {
    searchResponseBody = JSON.parse(searchResponseText);
  } catch {
    console.error(
      `[fetchProductDataFromOrder] Invalid JSON: ${searchResponseText}`,
    );
  }

  const errors = searchResponseBody.errors
    ? Array.isArray(searchResponseBody.errors)
      ? searchResponseBody.errors
      : [searchResponseBody.errors]
    : [];

  // Tax rates
  const taxRates = [
    { id: "1", name: "Normal", value: "23", region: "PT" },
    { id: "2", name: "Intermédia", value: "13", region: "PT" },
    { id: "3", name: "Reduzida", value: "6", region: "PT" },
    { id: "4", name: "Isento", value: "0", region: "PT" },
    { id: "13", name: "Taxa Normal", value: "8", region: "CH" },
  ];

  const orderCountry = order.shippingAddress?.country || "Portugal";
  const defaultTaxRate = orderCountry === "Portugal" ? "23" : "0";
  const tax =
    taxRates.find(
      (t) =>
        t.region === (orderCountry === "Portugal" ? "PT" : orderCountry) &&
        t.value === defaultTaxRate,
    ) || taxRates.find((t) => t.id === "1"); // fallback -> Normal 23%

  const taxRatePercentage = parseFloat(tax.value) / 100;
  const unitPriceExcludingVat = lineItem.unitPrice / (1 + taxRatePercentage);
  const roundedUnitPrice = parseFloat(unitPriceExcludingVat.toFixed(3));

  if (
    searchResponse.status === 404 ||
    errors.some(
      (err) =>
        err.code === "PC_PRODUCT_NOT_FOUND" ||
        err.code === "PRODUCT_NOT_FOUND" ||
        err.code === "PV_CODE_11",
    )
  ) {
    console.log(`[fetchProductDataFromOrder] Product not found, creating...`);

    const createUrl = `${apiUrl}products`;
    const productData = {
      name: lineItem.title,
      code: productCode,
      type: "P",
      unit: lineItem.quantity,
      pvp: lineItem.unitPrice,
      tax: parseInt(tax.id, 10),
      price: roundedUnitPrice,
      stock: stockQuantity,
      initial_stock: stockQuantity,
      minimum_stock: 0,
      serial_number: "",
      currency: order.currency || "EUR",
      description: lineItem.title,
      exemption_reason: "",
    };

    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productData),
    });

    const createResponseText = await createResponse.text();
    console.log(
      `[fetchProductDataFromOrder] Create response: ${createResponseText}`,
    );

    if (!createResponse.ok) {
      throw new Error(`Product creation failed: ${createResponseText}`);
    }

    const newProduct = JSON.parse(createResponseText);
    return {
      productId: newProduct.data?.id || newProduct.id,
      found: true,
      status: "created",
      productData: lineItem,
    };
  }

  if (searchResponse.ok) {
    const product = JSON.parse(searchResponseText);
    return {
      productId: product.data?.id || product.id,
      found: true,
      status: "found",
      productData: lineItem,
    };
  }

  throw new Error(
    `Unexpected product search response: ${searchResponseText || "Unknown error"}`,
  );
}
