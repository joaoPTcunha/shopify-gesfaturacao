import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "../services/client";
import { fetchProductDataFromOrder } from "../services/product";
import { fetchShippingProductData } from "../services/shipping";

export async function generateInvoice(order) {
  console.log(
    `[generateInvoice] Generating invoice for order ${order.orderNumber} (ID: ${order.id})`,
  );
  console.log("[generateInvoice] Order data:", JSON.stringify(order, null, 2));

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

  const taxMap = {
    23: 1,
    13: 2,
    6: 3,
    0: 4,
  };

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

    const productTaxId = 1;
    const orderCountry = order.shippingAddress?.country || "Portugal";
    const taxRate = orderCountry === "Portugal" ? 23.0 : 0.0;
    console.log(
      `[generateInvoice] Using taxId ${productTaxId} for item ${item.title} (taxRate: ${taxRate}%)`,
    );

    lines.push({
      id: parseInt(productResult.productId),
      tax: productTaxId,
      quantity: item.quantity,
      price: item.unitPrice,
      description: item.title,
      discount: 0,
      retention: 0,
      exemption_reason: productTaxId === 4 ? "M01" : "",
    });

    productResults.push({
      title: item.title,
      productId: productResult.productId,
      status: productResult.status,
      found: productResult.found,
    });
  }

  // Add shipping as a line item
  const shippingData = await fetchShippingProductData(
    order,
    apiUrl,
    login.token,
  );
  if (shippingData) {
    lines.push(shippingData.lineItem);
    productResults.push(shippingData.productResult);
    console.log(
      `[generateInvoice] Added shipping line item:`,
      JSON.stringify(shippingData.lineItem, null, 2),
    );
  }

  const date = new Date().toISOString().split("T")[0];
  const expirationDate = new Date();
  expirationDate.setMonth(expirationDate.getMonth() + 1);
  const expiration = expirationDate.toISOString().split("T")[0];

  // Build payload
  const payload = {
    client: parseInt(clientResult.clientId, 10),
    serie: parseInt(login.id_serie, 10),
    date,
    expiration,
    coin: 1,
    payment: 1,
    needsBank: false,
    bank: "",
    lines,
    finalize: login.finalized ?? true,
    reference: order.orderNumber,
    observations: order.note === "N/A" ? "" : order.note,
  };

  console.log(
    "[generateInvoice] Final payload:",
    JSON.stringify(payload, null, 2),
  );

  const CreateRIendpoint = `${apiUrl}sales/receipt-invoices`;
  let response;
  try {
    response = await fetch(CreateRIendpoint, {
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

  const invoiceId = result.data?.id || result.id;
  const invoiceNumber = result.data?.document_number || "N/A";
  const invoiceTotal = result.data?.total || order.totalValue.toFixed(2);
  const invoiceDate = result.data?.date
    ? new Date(result.data.date)
    : new Date();

  try {
    await prisma.gESinvoices.create({
      data: {
        order_id: order.id.toString(),
        order_total: order.totalValue.toFixed(2),
        invoice_id: invoiceId.toString(),
        invoice_number: invoiceNumber,
        invoice_total: invoiceTotal.toString(),
        invoice_date: invoiceDate,
        invoice_status: login.finalized ? 1 : 0,
      },
    });
    console.log(
      `[generateInvoice] Saved invoice ${invoiceNumber} to GESinvoices for order ${order.orderNumber}`,
    );
  } catch (err) {
    console.error(
      `[generateInvoice] Failed to save invoice to GESinvoices: ${err.message}`,
    );
    throw new Error(`Failed to save invoice to database: ${err.message}`);
  }

  // Fetch PDF
  let invoiceFile = null;
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
    } catch (err) {
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
    invoiceNumber,
  };
}
