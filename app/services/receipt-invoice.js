import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "./client";
import { fetchProductDataFromOrder } from "./product";
import { fetchShippingProductData } from "./shipping";
import { sendEmail } from "./sendEmail";

export async function generateInvoice(order) {
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
    await prisma.gESinvoices.delete({ where: { id: existingInvoice.id } });
  }

  // Fetch client data
  const clientResult = await fetchClientDataFromOrder(order);
  if (!clientResult.clientId || !clientResult.status) {
    throw new Error("Invalid response from fetchClientDataFromOrder");
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
        `Missing product title, unit price, or product ID for item`,
      );
    }

    const productResult = await fetchProductDataFromOrder(order, item);
    if (!productResult.productId || !productResult.status) {
      throw new Error(`Invalid product data for ${item.title}`);
    }

    const productTaxId = taxMap[item.taxRate || 23] || 1;
    const orderCountry = order.shippingAddress?.country || "Portugal";
    const taxRate = orderCountry === "Portugal" ? 23.0 : 0.0;

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

  // Add shipping line item
  const shippingData = await fetchShippingProductData(
    order,
    apiUrl,
    login.token,
  );
  if (shippingData) {
    lines.push(shippingData.lineItem);
    productResults.push(shippingData.productResult);
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

  // Create invoice
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
    throw new Error(`Invoice creation failed: ${err.message}`);
  }

  const responseText = await response.text();
  if (!response.ok) {
    const result = JSON.parse(responseText || "{}");
    const errorMsg =
      result.message ||
      result.error ||
      (result.errors ? JSON.stringify(result.errors) : null) ||
      response.statusText ||
      "Unknown error";
    throw new Error(`Failed to create invoice: ${errorMsg}`);
  }

  let result;
  try {
    result = JSON.parse(responseText || "{}");
  } catch {
    throw new Error("Failed to parse API response");
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
    } catch (err) {
      throw new Error(`Failed to save invoice to database: ${err.message}`);
    }
  }

  // Download PDF using invoiceId
  let invoiceFile = null;
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const downloadEndpoint = `${apiUrl}sales/documents/${invoiceId}/type/FR`;
    const downloadResponse = await fetch(downloadEndpoint, {
      method: "GET",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download PDF: ${downloadResponse.statusText}`);
    }

    const pdfData = await downloadResponse.json();
    const pdfBase64 = pdfData.data?.document;
    if (!pdfBase64) {
      throw new Error("PDF document missing in GESfaturacao response");
    }

    const pdfContent = Buffer.from(pdfBase64, "base64");
    const contentLength = pdfContent.length;

    // Validate PDF content
    if (pdfContent.toString("ascii", 0, 4) !== "%PDF") {
      throw new Error("Invalid PDF content: missing %PDF header");
    }

    invoiceFile = {
      contentType: "application/pdf",
      data: pdfBase64,
      filename: `fatura_${invoiceId}.pdf`,
      size: contentLength,
    };
  } catch (err) {
    console.warn(
      `[generateInvoice] Error downloading PDF for invoice ${savedInvoiceNumber}: ${err.message}`,
    );
    invoiceFile = null;
  }

  // Send email if configured
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
    } catch (err) {
      console.error(
        `[generateInvoice] Failed to send email for invoice ${savedInvoiceNumber}: ${err.message}`,
      );
    }
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
