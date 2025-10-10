import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "./client";
import { fetchProductDataFromOrder } from "./product";
import { fetchShippingProductData } from "./shipping";
import { sendEmail } from "./sendEmail";
import { Discounts } from "./discounts";
import { downloadInvoicePDF } from "./download";

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
    await prisma.gESinvoices.delete({ where: { id: login.id } });
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
  } catch (error) {
    console.warn(
      `[generateInvoice] Failed to fetch taxes: ${error.message}. Using default taxId: 1`,
    );
  }

  const taxMap = { 23: 1, 13: 2, 6: 3, 0: 4 };

  // Get discounts
  const discountData = Discounts(order);
  const discountOnly = discountData.discountOnly;
  const subtotalProductsWithVat = discountData.subtotalProductsWithVat;
  const discountAmountExclTax = discountData.discountAmount;
  const isProductSpecificDiscount = discountData.isProductSpecificDiscount;

  // Calculate line items
  const lines = [];
  const productResults = [];
  const orderCountry = order.shippingAddress?.country || "Portugal";
  const defaultTaxRate = orderCountry === "Portugal" ? 23 : 0;
  let totalBaseExclTax = 0.0;
  let totalBaseVat = 0.0;
  let totalDiscountExclTax = 0.0;

  for (const [index, item] of order.lineItems.entries()) {
    if (!item.title || !item.unitPrice || !item.productId) {
      throw new Error(
        `Missing product title, unit price, or product ID for item: ${item.title || "unknown"}`,
      );
    }

    const productResult = await fetchProductDataFromOrder(order, item);
    if (!productResult.productId || !productResult.status) {
      throw new Error(
        `Invalid product data for ${item.title}: ${JSON.stringify(productResult)}`,
      );
    }

    const isTaxable = item.taxable ?? true;
    const productTaxId = isTaxable ? 1 : 4;

    // Calculate tax rate
    const taxRate = isTaxable
      ? item.taxLines?.length > 0
        ? item.taxLines[0].ratePercentage
          ? parseFloat(item.taxLines[0].ratePercentage)
          : item.taxLines[0].rate
            ? item.taxLines[0].rate * 100
            : defaultTaxRate
        : defaultTaxRate
      : 0;

    // Treat unitPrice as VAT-exclusive if taxLines exists, else VAT-inclusive
    const originalPriceExclTax =
      isTaxable && item.taxLines?.length > 0
        ? parseFloat(item.unitPrice)
        : isTaxable
          ? parseFloat(item.unitPrice) / (1 + taxRate / 100)
          : parseFloat(item.unitPrice);
    const roundedUnitPrice = parseFloat(originalPriceExclTax.toFixed(3));
    const vatInclusivePrice = item.originalUnitPriceSet?.shopMoney?.amount
      ? parseFloat(item.originalUnitPriceSet.shopMoney.amount)
      : originalPriceExclTax * (1 + taxRate / 100);

    // Safely extract productId
    let productId;
    try {
      if (typeof item.productId !== "string" || !item.productId.includes("/")) {
        throw new Error(`Invalid productId format for item: ${item.title}`);
      }
      productId = item.productId.split("/").pop();
      if (!productId) {
        throw new Error(`Failed to extract productId for item: ${item.title}`);
      }
    } catch (err) {
      console.warn(
        `[generateInvoice] ${err.message}. Defaulting to item index for discount lookup.`,
      );
      productId = `item-${index}`;
    }

    let totalLineDiscount = 0.0;
    if (isProductSpecificDiscount && item.discountAllocations?.length > 0) {
      const discountAmount = item.discountAllocations.reduce((sum, alloc) => {
        return sum + parseFloat(alloc.allocatedAmountSet.shopMoney.amount || 0);
      }, 0);
      totalLineDiscount =
        (discountAmount / (vatInclusivePrice * item.quantity)) * 100;
    }

    let exemptionId = 0;
    if (productTaxId === 4) {
      const gesProduct = productResult.productData.gesProduct;
      if (gesProduct && gesProduct.exemptionID) {
        exemptionId = parseInt(gesProduct.exemptionID, 10);
        console.log(
          `[generateInvoice] Using product exemptionID: ${exemptionId} for ${item.title}`,
        );
      }
    }

    const line = {
      id: parseInt(productResult.productId),
      description: item.title.substring(0, 100),
      quantity: item.quantity,
      price: roundedUnitPrice,
      tax: productTaxId,
      discount: parseFloat(totalLineDiscount.toFixed(3)),
      retention: 0.0,
      exemption: exemptionId,
      unit: 1,
      type: "P",
    };
    lines.push(line);

    const lineSubtotalExcl = roundedUnitPrice * item.quantity;
    const lineAfterDiscountExcl =
      lineSubtotalExcl * (1 - totalLineDiscount / 100.0);
    totalDiscountExclTax += lineSubtotalExcl - lineAfterDiscountExcl;
    const lineVat = lineAfterDiscountExcl * (taxRate / 100.0);
    totalBaseExclTax += lineAfterDiscountExcl;
    totalBaseVat += lineVat;

    productResults.push({
      title: item.title,
      productId: productResult.productId,
      status: productResult.status,
      found: productResult.found,
    });
  }

  // Process shipping
  let totalShippingExclTax = getMonetaryValue(
    order.shippingLine?.price,
    "shippingLine",
  );
  let shippingTaxRate = order.shippingLine?.taxLines?.[0]?.rate
    ? order.shippingLine.taxLines[0].rate * 100
    : defaultTaxRate;

  // Check if all line items have a tax rate of 0%
  const allProductsZeroTax = order.lineItems.every((item) => {
    const isTaxable = item.taxable ?? true;
    const taxRate = isTaxable
      ? item.taxLines?.length > 0
        ? item.taxLines[0].ratePercentage
          ? parseFloat(item.taxLines[0].ratePercentage)
          : item.taxLines[0].rate
            ? item.taxLines[0].rate * 100
            : defaultTaxRate
        : defaultTaxRate
      : 0;
    return taxRate === 0;
  });

  // If all products have 0% tax, set shipping tax to 0%
  if (allProductsZeroTax) {
    shippingTaxRate = 0;
  }

  let totalShippingWithVat =
    totalShippingExclTax * (1 + shippingTaxRate / 100.0);
  let isFreeShipping = false;
  let originalShippingExclTax = totalShippingExclTax;
  let shippingDiscountPercent = 0.0;

  const shippingData = await fetchShippingProductData(
    order,
    apiUrl,
    login.token,
  );
  if (shippingData) {
    isFreeShipping = order.discountApplications?.some(
      (app) =>
        app.node.targetType === "SHIPPING_LINE" &&
        app.node.targetSelection === "ALL" &&
        ((app.node.value?.__typename === "PricingPercentageValue" &&
          app.node.value.percentage === 100) ||
          (app.node.value?.__typename === "MoneyV2" &&
            getMonetaryValue(app.node.value, "shippingDiscount") ===
              totalShippingWithVat)),
    );

    if (isFreeShipping) {
      shippingDiscountPercent = 100.0;
      totalShippingExclTax = 0.0;
    }

    const shippingTaxId = taxMap[shippingTaxRate] || 1;
    const shippingExemptionId = shippingTaxRate === 0 ? 1 : 0;

    const shippingLine = {
      id: parseInt(shippingData.lineItem.id),
      description: shippingData.lineItem.description || "Custos de Envio",
      quantity: 1.0,
      price: parseFloat(originalShippingExclTax.toFixed(3)),
      tax: shippingTaxId,
      discount: shippingDiscountPercent,
      retention: 0.0,
      exemption: shippingExemptionId,
      unit: 1,
      type: "S",
    };
    lines.push(shippingLine);

    totalBaseExclTax += totalShippingExclTax;
    totalBaseVat += totalShippingExclTax * (shippingTaxRate / 100.0);
  }

  // Calculate totals
  const totalBeforeDiscountsWithVat =
    subtotalProductsWithVat +
    (isFreeShipping
      ? originalShippingExclTax * (1 + shippingTaxRate / 100.0)
      : totalShippingWithVat);
  const expectedTotalWithVat = getMonetaryValue(order.totalValue, "totalValue");

  // Apply general discount at invoice level
  let adjustedGlobalPercent = 0.0;
  if (!isProductSpecificDiscount && order.discountApplications?.length > 0) {
    const generalDiscount = order.discountApplications.find(
      (app) =>
        app.node.targetType === "LINE_ITEM" &&
        app.node.targetSelection === "ALL",
    );
    if (generalDiscount) {
      const valueType = generalDiscount.node.value.__typename;
      if (valueType === "PricingPercentageValue") {
        adjustedGlobalPercent = parseFloat(
          generalDiscount.node.value.percentage || 0,
        );
      } else if (valueType === "MoneyV2") {
        const discountValue = parseFloat(
          generalDiscount.node.value.amount || 0,
        );
        adjustedGlobalPercent =
          (discountValue / totalBeforeDiscountsWithVat) * 100;
        adjustedGlobalPercent = parseFloat(adjustedGlobalPercent.toFixed(4));
      }
    }
  }

  // Verify total matches expected
  const calculatedTotalWithVat =
    (totalBaseExclTax + totalBaseVat) * (1 - adjustedGlobalPercent / 100.0);
  if (Math.abs(calculatedTotalWithVat - expectedTotalWithVat) > 0.01) {
    console.warn(
      `[generateInvoice] Total mismatch: calculated=${calculatedTotalWithVat}, expected=${expectedTotalWithVat}`,
    );
    if (totalBaseExclTax + totalBaseVat > 0) {
      adjustedGlobalPercent =
        100 * (1 - expectedTotalWithVat / (totalBaseExclTax + totalBaseVat));
      adjustedGlobalPercent = parseFloat(adjustedGlobalPercent.toFixed(4));
      console.log(
        `[generateInvoice] Adjusted global discount to ${adjustedGlobalPercent}% to match expected total`,
      );
    }
  }

  // Prepare observations
  let observations = order.note === "N/A" ? "" : order.note;

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
    payment: 3,
    needsBank: false,
    bank: 0,
    lines,
    finalize: login.finalized ?? true,
    reference: order.orderNumber,
    observations,
    discount: adjustedGlobalPercent,
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
