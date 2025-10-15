import prisma from "../../prisma/client";
import { fetchClientDataFromOrder } from "./client";
import { fetchProductDataFromOrder } from "./product";
import { fetchShippingProductData } from "./shipping";
import { sendEmail } from "./sendEmail";
import { Discounts } from "./discounts";
import { getMonetaryValue } from "../utils/getMonetaryValue";

export async function generateInvoice(order) {
  if (!order.id || !order.orderNumber) {
    throw new Error("Falta orderId ou orderNumber");
  }
  if (
    !order.lineItems ||
    !Array.isArray(order.lineItems) ||
    order.lineItems.length === 0
  ) {
    throw new Error("Não foram fornecidos itens válidos na encomenda");
  }

  const login = await prisma.gESlogin.findFirst({
    where: { dom_licenca: process.env.GES_LICENSE },
    orderBy: { date_login: "desc" },
  });

  if (!login.id_serie || !login.id_product_shipping) {
    throw new Error(
      "Configuração incompleta: por favor, defina a série e o produto de portes na página de configuração do GESFaturação.",
    );
  }

  const expireDate = login.date_expire ? new Date(login.date_expire) : null;
  if (!expireDate || expireDate < new Date()) {
    await prisma.gESlogin.delete({ where: { id: login.id } });
    throw new Error("Sessão GES expirada");
  }

  let apiUrl = login.dom_licenca;
  if (!apiUrl.endsWith("/")) apiUrl += "/";

  const existingInvoice = await prisma.gESinvoices.findFirst({
    where: { order_id: order.id.toString() },
  });

  if (existingInvoice) {
    await prisma.gESinvoices.delete({ where: { id: existingInvoice.id } });
  }

  const clientResult = await fetchClientDataFromOrder(order);
  if (!clientResult.clientId || !clientResult.status) {
    throw new Error(
      `Resposta inválida de fetchClientDataFromOrder: ${JSON.stringify(clientResult)}`,
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
    availableTaxes = taxesData.data || [];
  } catch (error) {
    console.warn(
      `[generateInvoice] Falha ao obter taxas: ${error.message}. Usando taxId padrão: 1`,
    );
  }

  const taxMap = { 23: 1, 13: 2, 6: 3, 0: 4 };

  const discountData = Discounts(order);
  const discountOnly = discountData.discountOnly;
  const subtotalProductsWithVat = discountData.subtotalProductsWithVat;
  const discountAmountExclTax = discountData.discountAmount;
  const invoiceLevelDiscount = discountData.invoiceLevelDiscount;
  const isProductSpecificDiscount = discountData.isProductSpecificDiscount;

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
        `Falta título, preço unitário ou ID do produto para o item: ${item.title || "desconhecido"}`,
      );
    }

    const productResult = await fetchProductDataFromOrder(order, item);
    if (!productResult.productId || !productResult.status) {
      throw new Error(
        `Dados de produto inválidos para ${item.title}: ${JSON.stringify(productResult)}`,
      );
    }

    const isTaxable = item.taxable ?? true;
    const productTaxId = isTaxable ? 1 : 4;

    const taxRate = isTaxable
      ? item.taxLines?.length > 0
        ? item.taxLines[0].ratePercentage
          ? parseFloat(item.taxLines[0].ratePercentage)
          : item.taxLines[0].rate
            ? item.taxLines[0].rate * 100
            : defaultTaxRate
        : defaultTaxRate
      : 0;

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

    let productId;
    try {
      if (typeof item.productId !== "string" || !item.productId.includes("/")) {
        throw new Error(
          `Formato de productId inválido para o item: ${item.title}`,
        );
      }
      productId = item.productId.split("/").pop();
      if (!productId) {
        throw new Error(
          `Falha ao extrair productId para o item: ${item.title}`,
        );
      }
    } catch (err) {
      console.warn(
        `[generateInvoice] ${err.message}. Usando índice do item como padrão para pesquisa de desconto.`,
      );
      productId = `item-${index}`;
    }

    let totalLineDiscount = 0.0;
    if (isProductSpecificDiscount) {
      totalLineDiscount = discountOnly[productId] || 0.0;
    } else {
      totalLineDiscount = 0.0;
    }

    let exemptionId = 0;
    if (productTaxId === 4) {
      const gesProduct = productResult.productData.gesProduct;
      if (gesProduct && gesProduct.exemptionID) {
        exemptionId = parseInt(gesProduct.exemptionID, 10);
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

  let totalShippingExclTax = getMonetaryValue(
    order.shippingLine?.price,
    "shippingLine",
  );
  let shippingTaxRate = order.shippingLine?.taxLines?.[0]?.rate
    ? order.shippingLine.taxLines[0].rate * 100
    : defaultTaxRate;

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
            getMonetaryValue(app.node.value, "shippingDiscount") >=
              totalShippingWithVat)),
    );

    if (isFreeShipping) {
      shippingDiscountPercent = 100.0;
    } else if (isProductSpecificDiscount) {
      shippingDiscountPercent = discountOnly["shipping"] || 0.0;
    } else {
      shippingDiscountPercent = 0.0;
    }

    const shippingTaxId = taxMap[shippingTaxRate] || 1;
    const shippingExemptionId = shippingTaxRate === 0 ? 5 : 0;

    const shippingLine = {
      id: parseInt(shippingData.lineItem.id),
      description: shippingData.lineItem.description || "Custos de Envio",
      quantity: 1.0,
      price: parseFloat(originalShippingExclTax.toFixed(3)),
      tax: shippingTaxId,
      discount: parseFloat(shippingDiscountPercent.toFixed(3)),
      retention: 0.0,
      exemption: shippingExemptionId,
      unit: 1,
      type: "S",
    };
    lines.push(shippingLine);

    const shippingAfterDiscountExcl =
      originalShippingExclTax * (1 - shippingDiscountPercent / 100.0);
    totalBaseExclTax += shippingAfterDiscountExcl;
    totalBaseVat += shippingAfterDiscountExcl * (shippingTaxRate / 100.0);
    totalDiscountExclTax += originalShippingExclTax - shippingAfterDiscountExcl;
  }

  const totalBeforeDiscountsWithVat =
    subtotalProductsWithVat +
    (isFreeShipping
      ? originalShippingExclTax * (1 + shippingTaxRate / 100.0)
      : totalShippingWithVat);
  const expectedTotalWithVat = getMonetaryValue(order.totalValue, "totalValue");

  let adjustedGlobalPercent = 0.0;
  if (!isProductSpecificDiscount && order.discountApplications?.length > 0) {
    const generalDiscount = order.discountApplications.find(
      (app) =>
        app.node.targetType === "LINE_ITEM" &&
        app.node.targetSelection === "ALL" &&
        app.node.allocationMethod === "ACROSS",
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
          totalBeforeDiscountsWithVat > 0
            ? (discountValue / totalBeforeDiscountsWithVat) * 100
            : 0;
        adjustedGlobalPercent = parseFloat(adjustedGlobalPercent.toFixed(4));
      }
    }
    if (invoiceLevelDiscount > 0) {
      const totalExclTax =
        totalBaseExclTax + (isFreeShipping ? 0 : originalShippingExclTax);
      adjustedGlobalPercent =
        totalExclTax > 0 ? (invoiceLevelDiscount / totalExclTax) * 100 : 0;
      adjustedGlobalPercent = parseFloat(adjustedGlobalPercent.toFixed(4));
    }
  }

  const calculatedTotalWithVat =
    (totalBaseExclTax + totalBaseVat) * (1 - adjustedGlobalPercent / 100.0);
  if (Math.abs(calculatedTotalWithVat - expectedTotalWithVat) > 0.01) {
    console.warn(
      `[generateInvoice] Diferença no total: calculado=${calculatedTotalWithVat}, esperado=${expectedTotalWithVat}`,
    );
    if (totalBaseExclTax + totalBaseVat > 0) {
      adjustedGlobalPercent =
        100 * (1 - expectedTotalWithVat / (totalBaseExclTax + totalBaseVat));
      adjustedGlobalPercent = parseFloat(adjustedGlobalPercent.toFixed(4));
      console.log(
        `[generateInvoice] Desconto global ajustado para ${adjustedGlobalPercent}% para corresponder ao total esperado`,
      );
    }
  }

  let observations = order.note === "N/A" ? "" : order.note;
  if (adjustedGlobalPercent > 0) {
    const discountAmountWithVat =
      (adjustedGlobalPercent / 100) * (totalBaseExclTax + totalBaseVat);
    observations += `\nDesconto geral aplicado: ${discountAmountWithVat.toFixed(2)} ${order.currency || "EUR"} (Desconto Global: ${adjustedGlobalPercent}%)`;
  }
  if (isFreeShipping) {
    observations += `\nEnvio grátis aplicado: 100% de desconto nos custos de envio`;
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
    payment: 3,
    needsBank: false,
    bank: 0,
    lines,
    finalize: login.finalized,
    reference: order.orderNumber,
    observations,
    discount: parseFloat(adjustedGlobalPercent.toFixed(4)),
  };

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
    throw new Error(`Falha na criação da fatura: ${err.message}`);
  }

  const responseText = await response.text();
  if (!response.ok) {
    const result = JSON.parse(responseText || "{}");
    const errorMsg =
      result.message ||
      result.error ||
      (result.errors ? JSON.stringify(result.errors) : null) ||
      response.statusText ||
      "Erro desconhecido";
    throw new Error(`Falha na criação da fatura: ${errorMsg}`);
  }

  let result;
  try {
    result = JSON.parse(responseText || "{}");
  } catch {
    throw new Error(`Falha ao analisar a resposta da API: ${responseText}`);
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
      throw new Error(
        `Falha ao guardar a fatura na base de dados: ${err.message}`,
      );
    }
  }

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
      throw new Error(
        `Falha ao descarregar PDF: ${downloadResponse.statusText}`,
      );
    }

    const pdfData = await downloadResponse.json();
    const pdfBase64 = pdfData.data?.document;
    if (!pdfBase64) {
      throw new Error("Documento PDF ausente na resposta do GESfaturacao");
    }

    const pdfContent = Buffer.from(pdfBase64, "base64");
    const contentLength = pdfContent.length;

    if (pdfContent.toString("ascii", 0, 4) !== "%PDF") {
      throw new Error("Conteúdo PDF inválido: falta o cabeçalho %PDF");
    }

    invoiceFile = {
      contentType: "application/pdf",
      data: pdfBase64,
      filename: isFinalized
        ? `fatura_${invoiceId}.pdf`
        : `fatura_Rascunho_${invoiceId}.pdf`,
      size: contentLength,
    };
  } catch (err) {
    console.warn(
      `[generateInvoice] Erro ao descarregar PDF para a fatura ${savedInvoiceNumber}: ${err.message}`,
    );
    invoiceFile = null;
  }

  let emailActuallySent = false;
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
      emailActuallySent = true;
    } catch (err) {
      console.error(
        `[generateInvoice] Falha ao enviar email para a fatura ${savedInvoiceNumber}: ${err.message}`,
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
    isFinalized,
    emailSent: emailActuallySent,
    success: true,
    actionType: "generateInvoice",
  };
}
