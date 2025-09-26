// app/services/receipt-invoice.js

import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "./client";
import { fetchProductDataFromOrder } from "./product";
import { fetchShippingProductData } from "./shipping";
import { sendEmail } from "./sendEmail";

export async function generateInvoice(order) {
  console.log(
    `[generateInvoice] Processing invoice for order ${order.orderNumber} (ID: ${order.id})`,
  );

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

  const login = await prisma.gESlogin.findFirst({
    where: { dom_licenca: process.env.GES_LICENSE },
    orderBy: { date_login: "desc" },
  });

  if (!login || !login.token || !login.dom_licenca || !login.id_serie) {
    throw new Error(
      "No active GES session, token, dom_licenca, or id_serie found",
    );
  }

  const expireDate = login.date_expire ? new Date(login.date_expire) : null;
  if (!expireDate || expireDate < new Date()) {
    await prisma.gESlogin.delete({ where: { id: login.id } });
    throw new Error("GES session expired");
  }

  let apiUrl = login.dom_licenca;
  if (!apiUrl.endsWith("/")) apiUrl += "/";

  // Check for existing invoice
  const existingInvoice = await prisma.gESinvoices.findFirst({
    where: { order_id: order.id.toString() },
  });

  if (existingInvoice) {
    console.log(
      `[generateInvoice] Found existing invoice ${existingInvoice.invoice_number} (status: ${existingInvoice.invoice_status}) for order ${order.orderNumber}. Deleting and generating new invoice.`,
    );
    await prisma.gESinvoices.delete({ where: { id: existingInvoice.id } });
  }

  // Fetch client data
  const clientResult = await fetchClientDataFromOrder(order);
  if (!clientResult.clientId || !clientResult.status) {
    throw new Error(
      `Invalid response from fetchClientDataFromOrder: ${JSON.stringify(clientResult)}`,
    );
  }

  // Fetch available taxes
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
    availableTaxes = taxesData.data || [];
    console.log(
      `[generateInvoice] Available taxes: ${JSON.stringify(availableTaxes)}`,
    );
  } catch (error) {
    console.warn(
      `[generateInvoice] Failed to fetch taxes: ${error.message}. Using default taxId: 1`,
    );
  }

  const taxMap = { 23: 1, 13: 2, 6: 3, 0: 4 };

  // Prepare line items
  const lines = [];
  const productResults = [];
  for (const [index, item] of order.lineItems.entries()) {
    if (!item.title || !item.unitPrice || !item.productId) {
      throw new Error(
        `Missing product title, unit price, or product ID for item: ${item.title}`,
      );
    }

    const productResult = await fetchProductDataFromOrder(order, item);
    if (!productResult.productId || !productResult.status) {
      throw new Error(
        `Invalid product data for ${item.title}: ${JSON.stringify(productResult)}`,
      );
    }

    const productTaxId = taxMap[item.taxRate || 23] || 1;
    const orderCountry = order.shippingAddress?.country || "Portugal";
    const taxRate = orderCountry === "Portugal" ? item.taxRate || 23.0 : 0.0;

    // Convert unitPrice (with VAT) to exclude VAT
    const unitPriceExclTax = parseFloat(
      (item.unitPrice / (1 + taxRate / 100.0)).toFixed(3),
    );

    lines.push({
      id: parseInt(productResult.productId),
      tax: productTaxId,
      quantity: item.quantity,
      price: unitPriceExclTax, // Send price excluding VAT
      description: item.title.substring(0, 100),
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

    console.log(
      `[generateInvoice] Line item: ${item.title} | Price (with VAT): ${item.unitPrice} | Tax Rate: ${taxRate}% | Price (excl. VAT): ${unitPriceExclTax} | Quantity: ${item.quantity}`,
    );
  }

  // Add shipping line item
  const shippingData = await fetchShippingProductData(
    order,
    apiUrl,
    login.token,
  );
  if (shippingData) {
    const shippingTaxRate =
      order.shippingLine?.taxLines?.[0]?.ratePercentage || 23.0;
    const shippingTaxId = taxMap[shippingTaxRate] || 1;
    const shippingPriceWithVat = parseFloat(order.shippingLine?.price || 0);
    const shippingPriceExclTax = parseFloat(
      (shippingPriceWithVat / (1 + shippingTaxRate / 100.0)).toFixed(3),
    );

    const shippingLine = {
      id: parseInt(shippingData.lineItem.id),
      tax: shippingTaxId,
      quantity: 1,
      price: shippingPriceExclTax, // Send shipping price excluding VAT
      description: shippingData.lineItem.description || "Custos de Envio",
      discount: 0,
      retention: 0,
      exemption_reason: shippingTaxRate === 0 ? "M01" : "",
    };

    lines.push(shippingLine);
    productResults.push(shippingData.productResult);

    console.log(
      `[generateInvoice] Shipping line: Price (with VAT): ${shippingPriceWithVat} | Tax Rate: ${shippingTaxRate}% | Price (excl. VAT): ${shippingPriceExclTax}`,
    );
  }

  // Prepare invoice payload
  const date = new Date().toISOString().split("T")[0];
  const expirationDate = new Date();
  expirationDate.setMonth(expirationDate.getMonth() + 1);
  const expiration = expirationDate.toISOString().split("T")[0];

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
    `[generateInvoice] Final payload: ${JSON.stringify(payload, null, 2)}`,
  );

  // Create invoice
  const createRIendpoint = `${apiUrl}sales/receipt-invoices`;
  let response;
  try {
    response = await fetch(createRIendpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: login.token,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[generateInvoice] Invoice creation failed: ${err.message}`);
    throw new Error(`Invoice creation failed: ${err.message}`);
  }

  const responseText = await response.text();
  console.log(`[generateInvoice] API Response: ${responseText}`);
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
    console.error(`[generateInvoice] Failed to create invoice: ${errorMsg}`);
    throw new Error(`Failed to create invoice: ${errorMsg}`);
  }

  const invoiceId = result.data?.id || result.id;
  const invoiceNumber = result.data?.number || "N/A";
  const invoiceTotal = result.data?.total || order.totalValue.toFixed(2);
  const invoiceDate = result.data?.date
    ? new Date(result.data.date)
    : new Date();
  const isFinalized = result.data?.finalize ?? login.finalized ?? true;

  // Save to gESinvoices only if finalized
  let savedInvoice = null;
  let savedInvoiceNumber = invoiceNumber;
  if (isFinalized) {
    try {
      savedInvoice = await prisma.gESinvoices.create({
        data: {
          order_id: order.id.toString(),
          order_total: order.totalValue.toFixed(2),
          invoice_id: invoiceId.toString(),
          invoice_number: invoiceNumber,
          invoice_total: invoiceTotal.toString(),
          invoice_date: invoiceDate,
          invoice_status: 1,
        },
      });
      console.log(
        `[generateInvoice] Saved invoice ${savedInvoice.invoice_number} to gESinvoices (status: 1)`,
      );
      savedInvoiceNumber = savedInvoice.invoice_number;
    } catch (err) {
      console.error(
        `[generateInvoice] Failed to save invoice to database: ${err.message}`,
      );
      throw new Error(`Failed to save invoice to database: ${err.message}`);
    }
  }

  // Download PDF using invoiceId
  let invoiceFile = null;
  try {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased delay
    const downloadEndpoint = `${apiUrl}sales/documents/${invoiceId}/type/FR`;
    console.log(`[generateInvoice] Fetching PDF from: ${downloadEndpoint}`);
    const downloadResponse = await fetch(downloadEndpoint, {
      method: "GET",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const responseText = await downloadResponse.text();
    console.log(
      `[generateInvoice] Raw PDF response: ${responseText.substring(0, 100)}...`,
    );

    if (!downloadResponse.ok) {
      console.warn(
        `[generateInvoice] Failed to download PDF for invoice ${savedInvoiceNumber}: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
      );
      throw new Error(`Failed to download PDF: ${downloadResponse.statusText}`);
    }

    let pdfData;
    try {
      pdfData = JSON.parse(responseText || "{}");
    } catch {
      console.error(
        `[generateInvoice] Failed to parse PDF response: ${responseText}`,
      );
      throw new Error(`Failed to parse PDF response: ${responseText}`);
    }

    const pdfBase64 = pdfData.data?.document;
    if (!pdfBase64) {
      console.error(
        `[generateInvoice] PDF document missing in response: ${JSON.stringify(pdfData)}`,
      );
      throw new Error("PDF document missing in GESfaturacao response");
    }

    const pdfContent = Buffer.from(pdfBase64, "base64");
    const contentLength = pdfContent.length;
    console.log(`[generateInvoice] PDF size: ${contentLength} bytes`);

    if (pdfContent.toString("ascii", 0, 4) !== "%PDF") {
      console.error(
        `[generateInvoice] Invalid PDF content: missing %PDF header`,
      );
      throw new Error("Invalid PDF content: missing %PDF header");
    }

    invoiceFile = {
      contentType: "application/pdf",
      data: pdfBase64,
      filename: `fatura_${invoiceId}.pdf`,
      size: contentLength,
    };
    console.log(
      `[generateInvoice] Successfully downloaded PDF for invoice ${savedInvoiceNumber}`,
    );
  } catch (err) {
    console.warn(
      `[generateInvoice] Error downloading PDF for invoice ${savedInvoiceNumber}: ${err.message}. Returning invoice data without PDF.`,
    );
    invoiceFile = null;
  }

  if (isFinalized && login.email_auto && order.customerEmail !== "N/A") {
    try {
      await sendEmail({
        id: parseInt(invoiceId),
        type: "FR",
        email: order.customerEmail,
        expired: false,
        apiUrl,
        token: login.token,
      });
      console.log(
        `[generateInvoice] Email sent successfully for invoice ${savedInvoiceNumber} to ${order.customerEmail}`,
      );
    } catch (err) {
      console.error(
        `[generateInvoice] Failed to send email for invoice ${savedInvoiceNumber}: ${err.message}`,
      );
    }
  } else {
    console.log(
      `[generateInvoice] Email not sent: email_auto=${login.email_auto}, customerEmail=${order.customerEmail}, isFinalized=${isFinalized}`,
    );
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
    invoiceNumber: savedInvoiceNumber,
    success: true,
    actionType: "generateInvoice",
  };
}
