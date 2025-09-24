import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "../services/clientService";
import { fetchProductDataFromOrder } from "../services/productService";

export async function generateInvoice(order) {
  console.log(
    `[generateInvoice] Generating invoice for order ${order.orderNumber} (ID: ${order.id})`,
  );
  console.log("[generateInvoice] Order data:", JSON.stringify(order, null, 2));

  // Validate order data
  if (!order.id || !order.orderNumber) {
    throw new Error("Missing orderId or orderNumber");
  }
  if (
    !order.lineItems ||
    !Array.isArray(order.lineItems) ||
    order.lineItems.length === 0
  ) {
    throw new Error("No valid line items provided in order data");
  }

  // Fetch GES login data
  console.log("[generateInvoice] GES_LICENSE:", process.env.GES_LICENSE);
  const login = await prisma.gESlogin.findFirst({
    where: { dom_licenca: process.env.GES_LICENSE },
    orderBy: { date_login: "desc" },
  });

  if (!login || !login.token || !login.dom_licenca || !login.id_serie) {
    throw new Error(
      "No active GES session, token, dom_licenca, or id_serie found in Prisma gESlogin",
    );
  }

  const expireDate = login.date_expire ? new Date(login.date_expire) : null;
  if (!expireDate || expireDate < new Date()) {
    await prisma.gESlogin.delete({ where: { id: login.id } });
    throw new Error("GES session expired");
  }

  let apiUrl = login.dom_licenca;
  if (!apiUrl.endsWith("/")) apiUrl += "/";

  console.log("[generateInvoice] API URL:", apiUrl);
  console.log("[generateInvoice] Serie:", login.id_serie);
  console.log("[generateInvoice] Finalized:", login.finalized);

  // Fetch client data
  const clientResult = await fetchClientDataFromOrder(order);
  console.log(
    "[generateInvoice] Client result:",
    JSON.stringify(clientResult, null, 2),
  );
  if (!clientResult.clientId || !clientResult.status) {
    throw new Error(
      `Invalid response from fetchClientDataFromOrder: missing clientId or status. Result: ${JSON.stringify(clientResult)}`,
    );
  }

  // Fetch available tax IDs for debugging
  let availableTaxes = [];
  try {
    const taxesResponse = await fetch(`${apiUrl}taxes`, {
      method: "GET",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    const taxesData = await taxesResponse.json();
    console.log(
      "[generateInvoice] Available taxes:",
      JSON.stringify(taxesData, null, 2),
    );
    availableTaxes = taxesData.data || [];
  } catch (error) {
    console.warn(
      `[generateInvoice] Failed to fetch available taxes: ${error.message}. Using default taxId: 1`,
    );
  }

  // Tax map for reference
  const taxMap = {
    23.0: 1, // Normal (PT)
    13.0: 2, // Intermédia (PT)
    6.0: 3, // Reduzida (PT)
    0.0: 4, // Isento (PT)
  };

  // Fetch product data and build lines
  const lines = [];
  const productResults = [];
  for (const [index, item] of order.lineItems.entries()) {
    if (!item.title || !item.unitPrice || !item.productId) {
      throw new Error(
        `Missing product title, unit price, or product ID for item: ${JSON.stringify(item)}`,
      );
    }

    const productResult = await fetchProductDataFromOrder(order, item);
    console.log(
      `[generateInvoice] Product result for ${item.title}:`,
      JSON.stringify(productResult, null, 2),
    );
    if (!productResult.productId || !productResult.status) {
      throw new Error(
        `Invalid product data for ${item.title}: ${JSON.stringify(productResult)}`,
      );
    }

    // Default tax ID to 1 (23% VAT)
    const productTaxId = 1;
    const orderCountry = order.shippingAddress?.country || "Portugal";
    const taxRate = orderCountry === "Portugal" ? 23.0 : 0.0;
    console.log(
      `[generateInvoice] Using taxId ${productTaxId} for item ${item.title} (taxRate: ${taxRate}%)`,
    );

    lines.push({
      id: parseInt(productResult.productId, 10), // Use GES product ID
      tax: productTaxId, // Default to 1
      quantity: item.quantity,
      price: item.unitPrice, // Use full price including VAT
      description: item.title,
      discount: 0,
      retention: 0,
      exemption_reason: productTaxId === 4 ? "M01" : "", // Add for tax: 4
    });

    productResults.push({
      title: item.title,
      productId: productResult.productId,
      status: productResult.status,
      found: productResult.found,
    });
  }

  // Calculate dates
  const date = new Date().toISOString().split("T")[0]; // e.g., 2025-09-24
  const expirationDate = new Date();
  expirationDate.setMonth(expirationDate.getMonth() + 1);
  const expiration = expirationDate.toISOString().split("T")[0]; // e.g., 2025-10-24

  // Build payload
  const payload = {
    client: parseInt(clientResult.clientId, 10),
    serie: parseInt(login.id_serie, 10),
    date,
    expiration,
    coin: 1,
    payment: 1,
    needsBank: false,
    bank: "", // Empty as per API requirement when needsBank is false
    lines,
    finalize: login.finalized ?? true,
    reference: order.orderNumber,
    observations: order.note === "N/A" ? "" : order.note,
  };

  console.log(
    "[generateInvoice] Final payload:",
    JSON.stringify(payload, null, 2),
  );

  // POST request to create invoice
  const endpoint = `${apiUrl}sales/receipt-invoices`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: login.token,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(
      `[generateInvoice] Invoice creation fetch failed: ${err.message}`,
    );
    throw new Error(`Invoice creation fetch failed: ${err.message}`);
  }

  const responseText = await response.text();
  console.log("[generateInvoice] API Response:", responseText);
  let result;
  try {
    result = JSON.parse(responseText || "{}");
  } catch {
    console.error(
      `[generateInvoice] Failed to parse API response: ${responseText}`,
    );
    throw new Error(`Failed to parse API response: ${responseText}`);
  }

  if (!response.ok) {
    const errorMsg =
      result.message ||
      result.error ||
      (result.errors ? JSON.stringify(result.errors) : null) ||
      response.statusText ||
      "Unknown error";
    console.error(
      `[generateInvoice] Failed to create invoice: ${errorMsg} (Status: ${response.status})`,
    );
    throw new Error(
      `Failed to create invoice: ${errorMsg} (Status: ${response.status})`,
    );
  }

  console.log(
    `[generateInvoice] Invoice created for order ${order.orderNumber}:`,
    JSON.stringify(result, null, 2),
  );

  // Fetch PDF
  let invoiceFile = null;
  const invoiceId = result.data?.id || result.id;
  if (invoiceId) {
    const downloadEndpoint = `${apiUrl}sales/documents/${invoiceId}/type/FR`;
    console.log(`[generateInvoice] Fetching PDF from: ${downloadEndpoint}`);
    try {
      const downloadResponse = await fetch(downloadEndpoint, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const downloadResponseText = await downloadResponse.text();
      console.log(
        `[generateInvoice] Raw PDF response: ${downloadResponseText} (Status: ${downloadResponse.status})`,
      );

      if (!downloadResponse.ok) {
        console.warn(
          `[generateInvoice] Failed to download invoice PDF: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
        );
        throw new Error(
          `Failed to download invoice PDF: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
        );
      }

      let pdfData;
      try {
        pdfData = JSON.parse(downloadResponseText || "{}");
      } catch {
        console.error(
          `[generateInvoice] Failed to parse PDF response: ${downloadResponseText}`,
        );
        throw new Error(
          `Failed to parse PDF response: ${downloadResponseText}`,
        );
      }

      const pdfBase64 = pdfData.data?.document;
      if (!pdfBase64) {
        console.error(
          `[generateInvoice] PDF document missing in response: ${JSON.stringify(pdfData, null, 2)}`,
        );
        throw new Error("PDF document missing in GESfaturacao response");
      }

      const pdfContent = Buffer.from(pdfBase64, "base64");
      const contentLength = pdfContent.length;
      console.log(
        `[generateInvoice] PDF decoded, size: ${contentLength} bytes`,
      );

      // Validate PDF content
      const pdfHeader = pdfContent.toString("ascii", 0, 4);
      if (pdfHeader !== "%PDF") {
        console.error(
          `[generateInvoice] Invalid PDF content, missing %PDF header`,
        );
        throw new Error("Invalid PDF content: missing %PDF header");
      }

      invoiceFile = {
        contentType: "application/pdf",
        data: pdfBase64,
        filename: `invoice_${order.orderNumber}.pdf`,
        size: contentLength,
      };
      console.log(
        `[generateInvoice] PDF prepared for order ${order.orderNumber}: ${invoiceFile.filename}, ${contentLength} bytes`,
      );
    } catch (err) {
      console.error(
        `[generateInvoice] Error downloading invoice PDF: ${err.message}`,
      );
      throw new Error(`Error downloading invoice PDF: ${err.message}`);
    }
  } else {
    console.error(`[generateInvoice] Invoice ID missing in response`);
    throw new Error("Invoice ID missing in GESfaturacao response");
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    clientId: clientResult.clientId,
    clientStatus: clientResult.status,
    clientFound: clientResult.found,
    customerData: clientResult.customerData,
    products: productResults,
    invoice: result,
    invoiceFile,
  };
}
