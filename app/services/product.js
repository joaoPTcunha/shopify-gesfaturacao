import prisma from "../../prisma/client";

export async function fetchProductDataFromOrder(order, lineItem) {
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

  const productId = lineItem.productId.replace("gid://shopify/Product/", "");
  const productCode = `sho${productId}`;
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
  const isTaxable = lineItem.taxable ?? true; // Use taxable from lineItem
  const tax = isTaxable
    ? taxRates.find(
        (t) =>
          t.region === (orderCountry === "Portugal" ? "PT" : orderCountry) &&
          t.value === defaultTaxRate,
      ) || taxRates.find((t) => t.id === "1")
    : taxRates.find((t) => t.id === "4"); // Use tax ID 4 for non-taxable

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
      exemption_reason: isTaxable ? "" : "M01",
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
