import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "./client";
import { fetchProductDataFromOrder } from "./product";
import { fetchShippingProductData } from "./shipping";
import { sendEmail } from "./sendEmail";

export async function generateInvoice(order) {
  console.log(
    `[generateInvoice] Processing invoice for order ${order.orderNumber} (ID: ${order.id})`,
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

  const existingInvoice = await prisma.gESinvoices.findFirst({
    where: { order_id: order.id.toString() },
  });

  if (existingInvoice && existingInvoice.invoice_status === 1) {
    console.log(
      `[generateInvoice] Found existing finalized invoice ${existingInvoice.invoice_number} for order ${order.orderNumber} (invoice_id: ${existingInvoice.invoice_id})`,
    );

    let invoiceFile = null;
    try {
      const downloadEndpoint = `${apiUrl}sales/documents/${existingInvoice.invoice_id}/type/FR`;
      console.log(`[generateInvoice] Fetching PDF from: ${downloadEndpoint}`);
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
        `[generateInvoice] Raw PDF response for invoice ${existingInvoice.invoice_id}: ${downloadResponseText}`,
      );

      if (!downloadResponse.ok) {
        console.warn(
          `[generateInvoice] Failed to download PDF for invoice ${existingInvoice.invoice_number}: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
        );
        throw new Error(
          `Failed to download PDF: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
        );
      }

      let pdfData;
      try {
        pdfData = JSON.parse(downloadResponseText || "{}");
      } catch {
        console.error(
          `[generateInvoice] Failed to parse PDF response for invoice ${existingInvoice.invoice_number}: ${downloadResponseText}`,
        );
        throw new Error(
          `Failed to parse PDF response: ${downloadResponseText}`,
        );
      }

      const pdfBase64 = pdfData.data?.document;
      if (!pdfBase64) {
        console.error(
          `[generateInvoice] PDF document missing in response for invoice ${existingInvoice.invoice_number}: ${JSON.stringify(pdfData, null, 2)}`,
        );
        throw new Error("PDF document missing in GESfaturacao response");
      }

      const pdfContent = Buffer.from(pdfBase64, "base64");
      const contentLength = pdfContent.length;
      console.log(
        `[generateInvoice] PDF size for invoice ${existingInvoice.invoice_number}: ${contentLength} bytes`,
      );

      const pdfHeader = pdfContent.toString("ascii", 0, 4);
      console.log(
        `[generateInvoice] PDF header for invoice ${existingInvoice.invoice_number}: ${pdfHeader}`,
      );
      if (pdfHeader !== "%PDF") {
        console.error(
          `[generateInvoice] Invalid PDF content for invoice ${existingInvoice.invoice_number}, missing %PDF header`,
        );
        throw new Error("Invalid PDF content: missing %PDF header");
      }

      invoiceFile = {
        contentType: "application/pdf",
        data: pdfBase64,
        filename: `fatura_${existingInvoice.invoice_id}.pdf`,
        size: contentLength,
      };
      console.log(
        `[generateInvoice] Successfully downloaded PDF for invoice ${existingInvoice.invoice_number} (finalized: true)`,
      );
    } catch (err) {
      console.warn(
        `[generateInvoice] Error downloading PDF for invoice ${existingInvoice.invoice_number}: ${err.message}. Allowing regeneration.`,
      );
    }

    if (invoiceFile && login.email_auto && order.customerEmail !== "N/A") {
      console.log(
        `[generateInvoice] email_auto is ${login.email_auto} for invoice ${existingInvoice.invoice_number}. Sending email to ${order.customerEmail}.`,
      );
      try {
        await sendEmail({
          id: parseInt(existingInvoice.invoice_id),
          type: "FR",
          email: order.customerEmail,
          expired: false,
          apiUrl,
          token: login.token,
        });
        console.log(
          `[generateInvoice] Email sent successfully for invoice ${existingInvoice.invoice_number} to ${order.customerEmail}.`,
        );
      } catch (err) {
        console.error(
          `[generateInvoice] Failed to send email for invoice ${existingInvoice.invoice_number}: ${err.message}`,
        );
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientId: existingInvoice.clientId || "N/A",
      clientStatus: "N/A",
      clientFound: false,
      customerData: null,
      products: [],
      invoice: {
        id: existingInvoice.invoice_id,
        document_number: existingInvoice.invoice_number,
      },
      invoiceFile,
      invoiceNumber: existingInvoice.invoice_number,
      success: true,
    };
  } else if (existingInvoice) {
    console.log(
      `[generateInvoice] Found draft invoice ${existingInvoice.invoice_number} (status: ${existingInvoice.invoice_status}) for order ${order.orderNumber}. Deleting and generating new invoice.`,
    );
    await prisma.gESinvoices.delete({
      where: { id: existingInvoice.id },
    });
  } else {
    console.log(
      `[generateInvoice] No existing invoice for order ${order.orderNumber}. Generating new invoice.`,
    );
  }

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

    const productTaxId = taxMap[item.taxRate || 23] || 1;
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
  const invoiceNumber = result.data?.number || "N/A";
  const invoiceTotal = result.data?.total || order.totalValue.toFixed(2);
  const invoiceDate = result.data?.date
    ? new Date(result.data.date)
    : new Date();
  const isFinalized = result.data?.finalize ?? login.finalized ?? true;

  let savedInvoiceNumber = invoiceNumber;
  let savedInvoice = null;
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
        `[generateInvoice] Saved invoice ${savedInvoice.invoice_number} to gESinvoices for order ${order.orderNumber} (order_id: ${savedInvoice.order_id})`,
      );
      savedInvoiceNumber = savedInvoice.invoice_number;
    } catch (err) {
      console.error(
        `[generateInvoice] Failed to save invoice to gESinvoices: ${err.message}`,
      );
      throw new Error(`Failed to save invoice to database: ${err.message}`);
    }
  } else {
    console.log(
      `[generateInvoice] Invoice for order ${order.orderNumber} is not finalized (status: ${isFinalized}). Skipping save to gESinvoices.`,
    );
  }

  let invoiceFile = null;
  if (invoiceId) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
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

      const downloadResponseText = await downloadResponse.text();

      if (!downloadResponse.ok) {
        console.warn(
          `[generateInvoice] Failed to download PDF for invoice ${savedInvoiceNumber}: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
        );
        throw new Error(
          `Failed to download PDF: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
        );
      }

      let pdfData;
      try {
        pdfData = JSON.parse(downloadResponseText || "{}");
      } catch {
        console.error(
          `[generateInvoice] Failed to parse PDF response for invoice ${savedInvoiceNumber}: ${downloadResponseText}`,
        );
        throw new Error(
          `Failed to parse PDF response: ${downloadResponseText}`,
        );
      }

      const pdfBase64 = pdfData.data?.document;
      if (!pdfBase64) {
        console.error(
          `[generateInvoice] PDF document missing in response for invoice ${savedInvoiceNumber}: ${JSON.stringify(pdfData, null, 2)}`,
        );
        throw new Error("PDF document missing in GESfaturacao response");
      }

      const pdfContent = Buffer.from(pdfBase64, "base64");
      const contentLength = pdfContent.length;

      // Validate PDF content
      const pdfHeader = pdfContent.toString("ascii", 0, 4);
      console.log(
        `[generateInvoice] PDF header for invoice ${savedInvoiceNumber}: ${pdfHeader}`,
      );
      if (pdfHeader !== "%PDF") {
        console.error(
          `[generateInvoice] Invalid PDF content for invoice ${savedInvoiceNumber}, missing %PDF header`,
        );
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
        `[generateInvoice] Error downloading PDF for invoice ${savedInvoiceNumber}: ${err.message}. Returning invoice data without PDF.`,
      );
      invoiceFile = null;
    }
  } else {
    console.error(`[generateInvoice] Invoice ID missing in response`);
    throw new Error("Invoice ID missing in GESfaturacao response");
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
        `[generateInvoice] Email sent successfully for invoice ${savedInvoiceNumber} to ${order.customerEmail}.`,
      );
    } catch (err) {
      console.error(
        `[generateInvoice] Failed to send email for invoice ${savedInvoiceNumber}: ${err.message}`,
      );
    }
  } else {
    console.log(
      `[generateInvoice] Email not sent for invoice ${savedInvoiceNumber}: email_auto is ${login.email_auto}, customerEmail is ${order.customerEmail}, isFinalized is ${isFinalized}`,
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
  };
}
