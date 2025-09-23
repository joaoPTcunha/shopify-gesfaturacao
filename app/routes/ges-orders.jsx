import { json } from "@remix-run/node";
import OrdersTable from "../components/OrdersTable";
import { fetchClientDataFromOrder } from "../services/clientService";

export async function loader() {
  try {
    const query = `
      query {
        orders(first: 250, sortKey: CREATED_AT, reverse: true, query: "financial_status:PAID") {
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
              lineItems(first: 5) {
                edges {
                  node {
                    title
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                        currencyCode
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
                address1
                address2
                city
                province
                country
                zip
                phone
              }
              billingAddress {
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
                price
              }
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_API_TOKEN,
        },
        body: JSON.stringify({ query }),
      },
    );

    const data = await response.json();

    if (data.errors) {
      throw new Error(JSON.stringify(data.errors));
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
          unitPrice: parseFloat(
            item.originalUnitPriceSet?.shopMoney?.amount || 0,
          ),
        })) || [],
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
            price: parseFloat(node.shippingLine.price || 0),
          }
        : null,
    }));

    return json({ orders, error: null });
  } catch (error) {
    console.error("Erro ao buscar pedidos:", error);
    return json({ orders: [], error: error.message }, { status: 500 });
  }
}

export async function action({ request }) {
  let order = null;
  try {
    const formData = await request.formData();
    const orderData = formData.get("order");
    if (!orderData) {
      throw new Error("No order data provided in FormData");
    }
    try {
      order = JSON.parse(orderData);
    } catch (parseError) {
      throw new Error(`Failed to parse order data: ${parseError.message}`);
    }
    const orderId = order.id;
    const orderNumber = order.orderNumber;

    console.log(
      `[ges-orders/action] Processing client check/creation for order ${orderNumber} (ID: ${orderId})`,
    );
    console.log(
      `[ges-orders/action] Received order data:`,
      JSON.stringify(order, null, 2),
    );

    const result = await fetchClientDataFromOrder(order);

    console.log(
      `[ges-orders/action] Result for order ${orderNumber}:`,
      JSON.stringify(result, null, 2),
    );

    if (!result.clientId || !result.status) {
      console.error(
        `[ges-orders/action] Invalid result for order ${orderNumber}: missing clientId or status`,
        JSON.stringify(result, null, 2),
      );
      throw new Error(
        "Invalid response from fetchClientDataFromOrder: missing clientId or status",
      );
    }

    return json({
      orderId,
      orderNumber,
      clientId: result.clientId,
      found: result.found,
      status: result.status,
      customerData: result.customerData,
    });
  } catch (error) {
    console.error(
      `[ges-orders/action] Error checking/creating client for order ${order?.orderNumber || "unknown"} (ID: ${order?.id || "unknown"}): ${error.message}`,
    );
    const status = error.message.includes("Client creation failed") ? 400 : 500;
    return json(
      {
        error: `Failed to check/create client: ${error.message}`,
        orderId: order?.id || "unknown",
        orderNumber: order?.orderNumber || "unknown",
        clientId: null,
        found: false,
        status: null,
      },
      { status },
    );
  }
}

export default function Orders() {
  return <OrdersTable />;
}
