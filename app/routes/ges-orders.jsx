import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate } from "@remix-run/react";
import { useEffect } from "react";
import { toast } from "sonner";
import prisma from "../../prisma/client";
import OrdersTable from "../components/OrdersTable";
import { fetchClientDataFromOrder } from "../services/client";
import { fetchProductDataFromOrder } from "../services/product";
import { generateInvoice } from "../services/receipt-invoice";
import { downloadInvoicePDF } from "../services/download";
import { sendEmail } from "../services/sendEmail";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 250);
    const offset = parseInt(url.searchParams.get("offset")) || 0;

    const query = `
      query($first: Int!, $query: String!) {
        orders(
          first: $first
          sortKey: CREATED_AT
          reverse: true
          query: $query
        ) {
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              totalDiscountsSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              displayFinancialStatus
              customer {
                id
                firstName
                lastName
                email
                metafields(first: 5, namespace: "custom") {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
              }
              lineItems(first: 50) {
                edges {
                  node {
                    title
                    quantity
                    product {
                      id
                    }
                    variant {
                      id
                      taxable
                      sku
                    }
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                    taxLines {
                      priceSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      rate
                      ratePercentage
                      title
                    }
                    discountAllocations {
                      allocatedAmountSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      discountApplication {
                        targetType
                        allocationMethod
                        value {
                          __typename
                          ... on MoneyV2 {
                            amount
                            currencyCode
                          }
                          ... on PricingPercentageValue {
                            percentage
                          }
                        }
                      }
                    }
                  }
                }
              }
              discountApplications(first: 10) {
                edges {
                  node {
                    targetType
                    targetSelection
                    allocationMethod
                    value {
                      __typename
                      ... on MoneyV2 {
                        amount
                        currencyCode
                      }
                      ... on PricingPercentageValue {
                        percentage
                      }
                    }
                  }
                }
              }
              metafields(first: 1, namespace: "invoicing") {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
              shippingAddress {
                name
                company
                address1
                address2
                city
                province
                country
                zip
                phone
              }
              billingAddress {
                name
                company
                address1
                address2
                city
                province
                country
                zip
                phone
              }
              note
              paymentGatewayNames
              shippingLine {
                title
                originalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                taxLines {
                  priceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  rate
                  ratePercentage
                  title
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      first: limit,
      query: "financial_status:PAID",
    };

    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_API_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    const data = await response.json();

    if (data.errors) {
      throw new Error(
        "Erro ao consultar a API do Shopify: " + JSON.stringify(data.errors),
      );
    }

    if (!data.data || !data.data.orders || !data.data.orders.edges) {
      return json(
        {
          orders: [],
          error: "Nenhum pedido encontrado ou estrutura de dados inválida",
        },
        { status: 500 },
      );
    }

    const orders = data.data.orders.edges.map(({ node }) => ({
      id: node.id,
      orderNumber: node.name,
      orderDate: node.createdAt,
      totalValue: parseFloat(node.totalPriceSet?.shopMoney?.amount || 0),
      currency: node.totalPriceSet?.shopMoney?.currencyCode || "N/A",
      status: node.displayFinancialStatus || "N/A",
      customerId: node.customer?.id || "N/A",
      customerName:
        `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim() ||
        "N/A",
      customerEmail: node.customer?.email || "N/A",
      customerMetafields: node.customer?.metafields?.edges || [],
      invoiceNumber:
        node.metafields?.edges?.find(
          (edge) => edge.node.key === "invoice_number",
        )?.node.value || "N/A",
      lineItems:
        node.lineItems?.edges?.map(({ node: item }) => ({
          title: item.title || "N/A",
          quantity: item.quantity || 0,
          productId: item.product?.id || "N/A",
          taxable: item.variant?.taxable ?? true,
          unitPrice: parseFloat(
            item.originalUnitPriceSet?.shopMoney?.amount || 0,
          ),
          taxLines: item.taxLines || [],
          discountAllocations: item.discountAllocations || [],
          sku: item.variant?.sku || "",
          variant: item.variant,
        })) || [],
      discountApplications: node.discountApplications?.edges || [],
      shippingAddress: node.shippingAddress
        ? {
            address1: node.shippingAddress.address1 || "N/A",
            address2: node.shippingAddress.address2 || "",
            city: node.shippingAddress.city || "N/A",
            province: node.shippingAddress.province || "N/A",
            country: node.shippingAddress.country || "N/A",
            zip: node.shippingAddress.zip || "N/A",
            phone: node.shippingAddress.phone || "N/A",
          }
        : null,
      billingAddress: node.billingAddress
        ? {
            address1: node.billingAddress.address1 || "N/A",
            address2: node.billingAddress.address2 || "",
            city: node.billingAddress.city || "N/A",
            province: node.billingAddress.province || "N/A",
            country: node.billingAddress.country || "N/A",
            zip: node.billingAddress.zip || "N/A",
            phone: node.billingAddress.phone || "N/A",
          }
        : null,
      note: node.note || "N/A",
      paymentGatewayNames: node.paymentGatewayNames || [],
      shippingLine: node.shippingLine
        ? {
            title: node.shippingLine.title || "N/A",
            price: parseFloat(
              node.shippingLine.discountedPriceSet?.shopMoney?.amount ||
                node.shippingLine.originalPriceSet?.shopMoney?.amount ||
                0,
            ),
            originalPrice: parseFloat(
              node.shippingLine.originalPriceSet?.shopMoney?.amount || 0,
            ),
            taxLines: node.shippingLine.taxLines || [],
          }
        : null,
    }));

    const orderIds = orders.map((order) => order.id.toString());
    const invoices = await prisma.gESinvoices.findMany({
      where: {
        order_id: { in: orderIds },
      },
      select: {
        order_id: true,
        invoice_number: true,
        invoice_status: true,
        invoice_id: true,
      },
    });

    const ordersWithInvoices = orders.map((order) => {
      const invoice = invoices.find(
        (inv) => inv.order_id === order.id.toString(),
      );
      return {
        ...order,
        invoiceNumber: invoice ? invoice.invoice_number : "N/A",
        invoiceId: invoice ? invoice.invoice_id : null,
      };
    });

    return json({ orders: ordersWithInvoices, error: null });
  } catch (error) {
    console.error("Erro ao carregar pedidos:", error);
    return json(
      { orders: [], error: `Erro ao carregar pedidos: ${error.message}` },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  let order = null;
  let clientResult = null;
  let productResults = [];
  let actionType = null;
  let orderId = null;
  let orderNumber = null;

  try {
    const formData = await request.formData();
    actionType = formData.get("actionType")?.toString() || "generateInvoice";
    orderId = formData.get("orderId")?.toString();
    orderNumber = formData.get("orderNumber")?.toString();
    const customerEmail = formData.get("customerEmail")?.toString();
    const invoiceNumber = formData.get("invoiceNumber")?.toString();

    if (!orderId) {
      throw new Error("O ID do pedido está ausente nos dados do formulário");
    }

    if (actionType === "generateInvoice") {
      const orderData = formData.get("order");
      if (!orderData) {
        throw new Error("Nenhum dado do pedido fornecido no formulário");
      }

      try {
        order = JSON.parse(orderData);
      } catch (parseError) {
        throw new Error(
          `Falha ao processar os dados do pedido: ${parseError.message}`,
        );
      }

      if (order.id !== orderId) {
        throw new Error(
          "Inconsistência entre o ID do pedido no formulário e nos dados do pedido",
        );
      }

      clientResult = await fetchClientDataFromOrder(order);

      if (!clientResult.clientId || !clientResult.status) {
        console.error(
          `[ges-orders/action] Resultado inválido do cliente para o pedido ${order.orderNumber}: ID ou estado ausente`,
          JSON.stringify(clientResult, null, 2),
        );
        throw new Error(
          "Resposta inválida de fetchClientDataFromOrder: ID ou estado do cliente ausente",
        );
      }

      productResults = [];
      for (const lineItem of order.lineItems) {
        const productResult = await fetchProductDataFromOrder(order, lineItem);
        productResults.push({
          title: lineItem.title,
          productId: productResult.productId,
          status: productResult.status,
          found: productResult.found,
        });
      }

      if (
        productResults.some((result) => !result.productId || !result.status)
      ) {
        console.error(
          `[ges-orders/action] Resultado inválido do produto para o pedido ${order.orderNumber}:`,
          JSON.stringify(productResults, null, 2),
        );
        throw new Error(
          "Resposta inválida de fetchProductDataFromOrder: ID ou estado do produto ausente",
        );
      }

      const invoiceResult = await generateInvoice(order);
      return json({
        ...invoiceResult,
        orderId,
        orderNumber,
        actionType,
        success: true,
        message: `Fatura gerada com sucesso para o pedido ${orderNumber}`,
      });
    } else if (actionType === "downloadInvoice") {
      const existingInvoice = await prisma.gESinvoices.findFirst({
        where: { order_id: orderId },
      });

      if (!existingInvoice || existingInvoice.invoice_status !== 1) {
        throw new Error(
          `Nenhuma fatura finalizada encontrada para o pedido ${orderNumber || orderId}`,
        );
      }

      const login = await prisma.gESlogin.findFirst({
        where: { dom_licenca: process.env.GES_LICENSE },
        orderBy: { date_login: "desc" },
      });

      if (!login || !login.token || !login.dom_licenca || !login.id_serie) {
        throw new Error("Login ou configurações do GESFaturação em falta.");
      }

      const expireDate = login.date_expire ? new Date(login.date_expire) : null;
      if (!expireDate || expireDate < new Date()) {
        await prisma.gESlogin.delete({ where: { id: login.id } });
        throw new Error("Sessão GES expirada");
      }

      let apiUrl = login.dom_licenca;
      if (!apiUrl.endsWith("/")) apiUrl += "/";

      const invoiceFile = await downloadInvoicePDF(
        existingInvoice.invoice_id,
        "FR",
        apiUrl,
        login.token,
      );

      return json({
        success: true,
        orderId,
        orderNumber: orderNumber || existingInvoice.order_id,
        actionType,
        invoiceFile,
        invoiceNumber: existingInvoice.invoice_number,
        message: `Fatura ${existingInvoice.invoice_number} descarregada com sucesso`,
      });
    } else if (actionType === "sendEmail") {
      if (
        !orderId ||
        !orderNumber ||
        !customerEmail ||
        !invoiceNumber ||
        invoiceNumber === "N/A"
      ) {
        throw new Error(
          `Parâmetros ausentes ou inválidos para enviar e-mail: orderId=${orderId}, orderNumber=${orderNumber}, customerEmail=${customerEmail}, invoiceNumber=${invoiceNumber}`,
        );
      }

      const existingInvoice = await prisma.gESinvoices.findFirst({
        where: { order_id: orderId, invoice_number: invoiceNumber },
      });

      if (!existingInvoice || existingInvoice.invoice_status !== 1) {
        throw new Error(
          `Nenhuma fatura finalizada encontrada para o pedido ${orderNumber} com o número de fatura ${invoiceNumber}`,
        );
      }

      const login = await prisma.gESlogin.findFirst({
        where: { dom_licenca: process.env.GES_LICENSE },
        orderBy: { date_login: "desc" },
      });

      if (!login || !login.token || !login.dom_licenca) {
        throw new Error(
          "Não foi possível enviar o e-mail. Por favor, aceda à página de login e introduza as suas credenciais.",
        );
      }

      const expireDate = login.date_expire ? new Date(login.date_expire) : null;
      if (!expireDate || expireDate < new Date()) {
        await prisma.gESlogin.delete({ where: { id: login.id } });
        throw new Error("Sessão GES expirada");
      }

      let apiUrl = login.dom_licenca;
      if (!apiUrl.endsWith("/")) apiUrl += "/";

      const emailResult = await sendEmail({
        id: existingInvoice.invoice_id,
        type: "FR",
        email: customerEmail,
        expired: false,
        apiUrl,
        token: login.token,
      });

      return json({
        success: true,
        orderId,
        orderNumber,
        actionType,
        invoiceNumber,
        emailSent: true,
        emailResult,
        message: `E-mail com a fatura ${invoiceNumber} enviado com sucesso`,
      });
    } else {
      throw new Error(`Tipo de ação desconhecido: ${actionType}`);
    }
  } catch (error) {
    const status = error.message.includes("criação falhou") ? 400 : 500;
    return json(
      {
        error: `Erro: ${error.message}`,
        orderId: orderId || order?.id || "desconhecido",
        orderNumber: orderNumber || order?.orderNumber || "desconhecido",
        actionType: actionType || "desconhecido",
        clientId: clientResult?.clientId || null,
        clientFound: clientResult?.found || false,
        clientStatus: clientResult?.status || null,
        products: productResults || [],
      },
      { status },
    );
  }
}

export default function Orders() {
  const { orders, error: loaderError } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();

  useEffect(() => {
    if (loaderError) {
      toast.error(loaderError, {
        duration: 3000,
      });
    }

    if (actionData) {
      if (actionData.success) {
        toast.success(actionData.message, {
          duration: 3000,
        });
        if (actionData.actionType === "generateInvoice") {
          setTimeout(() => {
            navigate(0);
          }, 3000);
        }
      } else if (actionData.error) {
        toast.error(actionData.error, {
          duration: 3000,
        });
      }
    }
  }, [actionData, loaderError, navigate]);

  return <OrdersTable orders={orders} />;
}
