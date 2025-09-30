import prisma from "../../prisma/client";

export async function fetchProductDataFromOrder(order, lineItem) {
  if (!lineItem.title || !lineItem.unitPrice || !lineItem.productId) {
    throw new Error("Missing product title, unit price, or product ID");
  }

  // Log the entire lineItem for debugging
  console.log(`[LOGPRODUTOS] lineItem:`, JSON.stringify(lineItem, null, 2));

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

  const stockQuantity = lineItem.quantity;
  const productId = lineItem.productId.replace("gid://shopify/Product/", "");

  const productCode =
    lineItem.sku || lineItem.variant?.sku || `sho${productId}`;
  const lineItemWithSku = {
    ...lineItem,
    sku: productCode,
  };

  console.log(
    `[LOGPRODUTOS] lineItem with SKU:`,
    JSON.stringify(lineItemWithSku, null, 2),
  );
  console.log(`[CODE PRODUTO] Searching for product with code: ${productCode}`);
  console.log(`[CODE PRODUTO] productId: ${productId}`);

  const searchUrl = `${apiUrl}products/code/${encodeURIComponent(productCode)}`;

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
  let searchResponseBody = {};
  try {
    searchResponseBody = JSON.parse(searchResponseText);
  } catch {
    console.error(
      `[fetchProductDataFromOrder] Invalid JSON response: ${searchResponseText}`,
    );
    searchResponseBody = { errors: [{ message: "Invalid JSON response" }] };
  }

  const errors = searchResponseBody.errors
    ? Array.isArray(searchResponseBody.errors)
      ? searchResponseBody.errors
      : [searchResponseBody.errors]
    : [];

  console.log(
    `[fetchProductDataFromOrder] Search response status: ${searchResponse.status}`,
  );
  console.log(
    `[fetchProductDataFromOrder] Search response body:`,
    JSON.stringify(searchResponseBody, null, 2),
  );

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
  const isTaxable = lineItem.taxable ?? true;
  const tax = isTaxable
    ? taxRates.find(
        (t) =>
          t.region === (orderCountry === "Portugal" ? "PT" : orderCountry) &&
          t.value === defaultTaxRate,
      ) || taxRates.find((t) => t.id === "1")
    : taxRates.find((t) => t.id === "4");

  const taxRatePercentage = parseFloat(tax.value) / 100;
  const unitPriceExcludingVat = lineItem.unitPrice / (1 + taxRatePercentage);
  const roundedUnitPrice = parseFloat(unitPriceExcludingVat.toFixed(3));

  // Check if product was not found or search failed
  if (
    searchResponse.status === 404 ||
    searchResponse.status === 400 ||
    errors.some(
      (err) =>
        err.code === "PC_PRODUCT_NOT_FOUND" ||
        err.code === "PRODUCT_NOT_FOUND" ||
        err.code === "PV_CODE_11" ||
        err.message?.toLowerCase().includes("not found"),
    )
  ) {
    console.log(
      `[fetchProductDataFromOrder] Product ${productCode} not found, creating new product`,
    );

    const createUrl = `${apiUrl}products`;
    const productData = {
      name: lineItem.title,
      code: productCode, // Use prioritized SKU
      type: "P",
      unit: "un", // Default unit
      pvp: lineItem.unitPrice,
      tax: parseInt(tax.id, 10),
      price: roundedUnitPrice,
      stock: stockQuantity,
      initial_stock: stockQuantity,
      minimum_stock: 0,
      serial_number: "",
      currency: order.currency || "EUR",
      description: lineItem.title,
      exemption_reason: isTaxable ? "" : "M01",
    };

    console.log(
      `[fetchProductDataFromOrder] Creating product with data:`,
      JSON.stringify(productData, null, 2),
    );

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
      `[fetchProductDataFromOrder] Create response status: ${createResponse.status}`,
    );
    console.log(
      `[fetchProductDataFromOrder] Create response body: ${createResponseText}`,
    );

    if (!createResponse.ok) {
      throw new Error(`Product creation failed: ${createResponseText}`);
    }

    let newProduct;
    try {
      newProduct = JSON.parse(createResponseText);
    } catch (parseError) {
      console.error(
        `[fetchProductDataFromOrder] Failed to parse create response: ${parseError.message}`,
      );
      throw new Error(
        `Failed to parse product creation response: ${createResponseText}`,
      );
    }

    return {
      productId: newProduct.data?.id || newProduct.id,
      found: false,
      status: "created",
      productCode: productCode,
      productData: lineItem,
      createdProduct: newProduct,
    };
  }

  // Product found, now fetch the complete product details
  if (searchResponse.ok) {
    console.log(
      `[fetchProductDataFromOrder] Product ${productCode} found, fetching details`,
    );

    let product;
    try {
      product = JSON.parse(searchResponseText);
    } catch (parseError) {
      console.error(
        `[fetchProductDataFromOrder] Failed to parse found product: ${parseError.message}`,
      );
      throw new Error(
        `Failed to parse product search response: ${searchResponseText}`,
      );
    }

    const productIdGes = product.data?.id || product.id;

    // Update stock if necessary
    if (stockQuantity > 0) {
      const stockUrl = `${apiUrl}products/${productIdGes}/stock`;
      const stockData = {
        stock: stockQuantity,
        initial_stock: stockQuantity,
      };

      try {
        const stockResponse = await fetch(stockUrl, {
          method: "PUT",
          headers: {
            Authorization: login.token,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(stockData),
        });

        if (stockResponse.ok) {
          console.log(
            `[fetchProductDataFromOrder] Stock updated successfully for ${productCode}`,
          );
        } else {
          console.warn(
            `[fetchProductDataFromOrder] Failed to update stock for ${productCode}: ${await stockResponse.text()}`,
          );
        }
      } catch (stockError) {
        console.error(
          `[fetchProductDataFromOrder] Stock update error for ${productCode}: ${stockError.message}`,
        );
      }
    }

    // Fetch complete product details
    const detailsUrl = `${apiUrl}products/${productIdGes}`;
    try {
      const detailsResponse = await fetch(detailsUrl, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (detailsResponse.ok) {
        const detailsData = await detailsResponse.json();
        console.log(
          `[fetchProductDataFromOrder] Full product details fetched for ${productCode}`,
        );
        return {
          productId: productIdGes,
          found: true,
          status: "found",
          productCode: productCode,
          productData: {
            ...lineItem,
            gesProduct: detailsData.data || detailsData,
          },
        };
      } else {
        console.warn(
          `[fetchProductDataFromOrder] Could not fetch full details for ${productCode}, using search data`,
        );
        return {
          productId: productIdGes,
          found: true,
          status: "found",
          productCode: productCode,
          productData: lineItem,
        };
      }
    } catch (detailsError) {
      console.warn(
        `[fetchProductDataFromOrder] Error fetching product details for ${productCode}: ${detailsError.message}`,
      );
      return {
        productId: productIdGes,
        found: true,
        status: "found",
        productCode: productCode,
        productData: lineItem,
      };
    }
  }

  // Handle other error cases
  const errorMessage =
    errors.length > 0
      ? errors
          .map(
            (err) =>
              `${err.code || "Unknown error"}: ${err.message || "No message"}`,
          )
          .join("; ")
      : `Unexpected response status: ${searchResponse.status}`;

  console.error(
    `[fetchProductDataFromOrder] Product search failed for ${productCode}: ${errorMessage}`,
  );
  throw new Error(`Product search failed: ${errorMessage}`);
}
