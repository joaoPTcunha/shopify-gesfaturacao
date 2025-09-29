// receipt-invoice.js
import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "./client";
import { fetchProductDataFromOrder } from "./product";
import { fetchShippingProductData } from "./shipping";
import { sendEmail } from "./sendEmail";
import { fetchDiscountProductData } from "./discountProduct";
import { getOrderDiscounts } from "./discountOrder";

// Helper function to safely extract monetary value
function getMonetaryValue(value, fieldName = "unknown") {
  if (value === null || value === undefined) {
    console.warn(
      `[generateInvoice] ${fieldName} is null or undefined, defaulting to 0`,
    );
    return 0;
  }
  if (typeof value === "object" && "amount" in value) {
    return parseFloat(value.amount) || 0;
  }
  if (typeof value === "string" || typeof value === "number") {
    return parseFloat(value) || 0;
  }
  console.warn(
    `[generateInvoice] Invalid ${fieldName} format: ${JSON.stringify(value)}, defaulting to 0`,
  );
  return 0;
}

export async function generateInvoice(order) {
  console.log(
    `[generateInvoice] Processing invoice for order ${order.orderNumber} (ID: ${order.id})`,
  );
  console.log(
    `[generateInvoice] Order data: ${JSON.stringify(order, null, 2)}`,
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
      `[generateInvoice] Deleting existing invoice ${existingInvoice.invoice_number} for order ${order.orderNumber}`,
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

  // Calculate line items (no product-specific discounts)
  const lines = [];
  const productResults = [];
  const orderCountry = order.shippingAddress?.country || "Portugal";
  const defaultTaxRate = orderCountry === "Portugal" ? 23 : 0;
  let totalBaseExclTax = 0.0;
  let totalTax = 0.0;

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

    // Determine tax rate
    const taxRate = item.taxLines?.[0]?.rate
      ? item.taxLines[0].rate * 100
      : defaultTaxRate;
    const productTaxId = taxMap[taxRate] || 1;

    // Calculate price excluding VAT
    const unitPriceExclTax = item.unitPrice / (1 + taxRate / 100);
    const roundedUnitPrice = parseFloat(unitPriceExclTax.toFixed(3));

    const lineSubtotalExclTax = roundedUnitPrice * item.quantity;
    const lineTax = lineSubtotalExclTax * (taxRate / 100);

    lines.push({
      id: parseInt(productResult.productId),
      tax: productTaxId,
      quantity: item.quantity,
      price: roundedUnitPrice,
      description: item.title.substring(0, 100),
      discount: 0, // No product-specific discounts
      retention: 0,
      exemption_reason: productTaxId === 4 ? "M01" : "",
      type: "P",
    });

    totalBaseExclTax += lineSubtotalExclTax;
    totalTax += lineTax;

    productResults.push({
      title: item.title,
      productId: productResult.productId,
      status: productResult.status,
      found: productResult.found,
    });

    console.log(
      `[generateInvoice] Line item: ${item.title} | Price (with VAT): ${item.unitPrice} | Tax Rate: ${taxRate}% | Price (excl. VAT): ${roundedUnitPrice} | Quantity: ${item.quantity} | Subtotal (excl. VAT): ${lineSubtotalExclTax} | Tax: ${lineTax}`,
    );
  }

  // Add shipping line item
  let shippingTaxRate = defaultTaxRate;
  let shippingPriceExclTax = 0;
  let originalShippingExclTax = 0;

  const shippingData = await fetchShippingProductData(
    order,
    apiUrl,
    login.token,
  );
  if (shippingData) {
    const shippingItem = {
      unitPrice: getMonetaryValue(
        order.shippingLine?.originalPrice || order.shippingLine?.price,
        "shippingLine",
      ),
      quantity: 1,
    };

    shippingTaxRate = order.shippingLine?.taxLines?.[0]?.rate
      ? order.shippingLine.taxLines[0].rate * 100
      : defaultTaxRate;
    const shippingTaxId = taxMap[shippingTaxRate] || 1;

    // Check for free shipping discount
    const isFreeShipping =
      order.discountApplications?.some((app) => {
        const value = app.node.value;
        const typename = value.__typename;
        return (
          app.node.targetType === "SHIPPING_LINE" &&
          app.node.targetSelection === "ALL" &&
          ((typename === "PricingPercentageValue" &&
            value.percentage === 100) ||
            (typename === "MoneyV2" &&
              parseFloat(value.amount) === order.shippingLine.originalPrice))
        );
      }) || false;

    if (isFreeShipping) {
      originalShippingExclTax =
        shippingItem.unitPrice / (1 + shippingTaxRate / 100);
      shippingPriceExclTax = 0;
      console.log(
        `[generateInvoice] Free shipping detected. Original shipping (excl. VAT): ${originalShippingExclTax}`,
      );
    } else {
      originalShippingExclTax =
        shippingItem.unitPrice / (1 + shippingTaxRate / 100);
      shippingPriceExclTax = parseFloat(originalShippingExclTax.toFixed(3));
    }

    const shippingLine = {
      id: parseInt(shippingData.lineItem.id),
      tax: shippingTaxId,
      quantity: 1,
      price: shippingPriceExclTax,
      description: shippingData.lineItem.description || "Custos de Envio",
      discount: isFreeShipping ? 100 : 0, // Apply 100% discount for free shipping
      retention: 0,
      exemption_reason: shippingTaxRate === 0 ? "M01" : "",
      type: "S",
    };

    lines.push(shippingLine);
    productResults.push(shippingData.productResult);

    const shippingTax = shippingPriceExclTax * (shippingTaxRate / 100);
    totalBaseExclTax += shippingPriceExclTax;
    totalTax += shippingTax;

    console.log(
      `[generateInvoice] Shipping line: Price (excl. VAT): ${shippingPriceExclTax} | Tax Rate: ${shippingTaxRate}% | Discount: ${isFreeShipping ? 100 : 0}% | Tax: ${shippingTax}`,
    );
  }

  // Calculate general discount
  const discountOrderData = await getOrderDiscounts(order);
  const adjustedGlobalPercent = discountOrderData.discountPercent || 0;
  const totalDiscountExclTax = discountOrderData.discountAmount || 0;
  let observations = order.note === "N/A" ? "" : order.note;

  if (adjustedGlobalPercent > 0 && totalDiscountExclTax > 0) {
    observations += `\nGeneral discount applied: ${totalDiscountExclTax.toFixed(2)} ${order.currency || "EUR"} (Global Discount: ${adjustedGlobalPercent}%)`;
    console.log(
      `[generateInvoice] General discount applied: ${totalDiscountExclTax.toFixed(2)} (excl. VAT) | Percent: ${adjustedGlobalPercent}%`,
    );
  }

  // Validate totals
  const expectedTotalWithVat = getMonetaryValue(order.totalValue, "totalValue");
  const calculatedTotalWithVat =
    (totalBaseExclTax + totalTax) * (1 - adjustedGlobalPercent / 100);

  if (Math.abs(calculatedTotalWithVat - expectedTotalWithVat) > 0.01) {
    console.warn(
      `[generateInvoice] Total mismatch detected. Calculated: ${calculatedTotalWithVat.toFixed(2)} | Expected: ${expectedTotalWithVat.toFixed(2)}`,
    );
    if (totalBaseExclTax + totalTax > 0) {
      adjustedGlobalPercent =
        100 * (1 - expectedTotalWithVat / (totalBaseExclTax + totalTax));
      adjustedGlobalPercent = parseFloat(adjustedGlobalPercent.toFixed(3));
      observations += `\nAdjusted global discount to ${adjustedGlobalPercent}% to match order total`;
      console.log(
        `[generateInvoice] Adjusted global discount to ${adjustedGlobalPercent}% to match expected total: ${expectedTotalWithVat}`,
      );
    }
  }

  console.log(
    `[generateInvoice] Totals - Base (excl. VAT): ${totalBaseExclTax.toFixed(2)} | Tax: ${totalTax.toFixed(2)} | Discount (excl. VAT): ${totalDiscountExclTax.toFixed(2)} | Total with VAT: ${calculatedTotalWithVat.toFixed(2)} | Expected: ${expectedTotalWithVat}`,
  );

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
    observations,
    discount: adjustedGlobalPercent, // Apply general discount percentage
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
  if (!response.ok) {
    const result = JSON.parse(responseText || "{}");
    const errorMsg =
      result.message ||
      result.error ||
      (result.errors ? JSON.stringify(result.errors) : null) ||
      response.statusText ||
      "Unknown error";
    console.error(`[generateInvoice] Failed to create invoice: ${errorMsg}`);
    throw new Error(`Failed to create invoice: ${errorMsg}`);
  }

  let result;
  try {
    result = JSON.parse(responseText || "{}");
  } catch {
    console.error(
      `[generateInvoice] Failed to parse API response: ${responseText}`,
    );
    throw new Error(`Failed to parse API response: ${responseText}`);
  }

  const invoiceId = result.data?.id || result.id;
  const invoiceNumber = result.data?.number || "N/A";
  const invoiceTotal = result.data?.total || expectedTotalWithVat.toFixed(2);
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
          order_total: expectedTotalWithVat.toFixed(2),
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

    if (pdfContent.toString("ascii", 0, 4) !== "%PDF") {
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
      `[generateInvoice] Error downloading PDF for invoice ${savedInvoiceNumber}: ${err.message}`,
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
