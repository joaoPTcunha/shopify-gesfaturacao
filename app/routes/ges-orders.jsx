import pkg from "@remix-run/node";
const { json, redirect } = pkg;
import prisma from "../../prisma/client";
import { getShopifyClient } from "../../shopify.server";
import OrdersTable from "../components/OrdersTable";

export async function loader({ request }) {
  try {
    // Verificar autenticação GesFaturacao
    const login = await prisma.gESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });
    if (!login || !login.token) {
      console.log("No login or token found, redirecting to /ges-login");
      return redirect("/ges-login");
    }

    // Verificar expiração do token
    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.gESlogin.delete({ where: { id: login.id } });
      console.log("Token expired, deleted login, redirecting to /ges-login");
      return redirect("/ges-login");
    }

    // Query GraphQL para encomendas pagas do Shopify
    const query = `
      query {
        orders(first: 5, sortKey: CREATED_AT, reverse: true, query: "financial_status:PAID") {
          edges {
            node {
              id
              name
              email
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
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
              customer {
                id
                firstName
                lastName
                email
                phone
              }
              financialStatus
              metafields(first: 1, namespace: "invoicing") {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    `;

    let shopifyClient;
    try {
      shopifyClient = getShopifyClient();
      if (!process.env.SHOPIFY_API_TOKEN) {
        throw new Error("SHOPIFY_API_TOKEN is not defined in .env");
      }
    } catch (clientError) {
      console.error("Erro ao inicializar Shopify client:", clientError);
      return json(
        {
          orders: [],
          gesOrders: null,
          error: "Erro ao inicializar Shopify client: " + clientError.message,
        },
        { status: 500 },
      );
    }

    let response;
    try {
      response = await shopifyClient.query({ data: query });
    } catch (queryError) {
      console.error("Erro na consulta GraphQL:", queryError);
      return json(
        {
          orders: [],
          gesOrders: null,
          error: "Erro na consulta GraphQL: " + queryError.message,
        },
        { status: 500 },
      );
    }

    if (response.errors) {
      console.error("Erros GraphQL:", response.errors);
      return json(
        {
          orders: [],
          gesOrders: null,
          error: "Erro na consulta GraphQL: " + JSON.stringify(response.errors),
        },
        { status: 500 },
      );
    }

    console.log("Resposta Shopify:", JSON.stringify(response.data, null, 2));

    const orders = response.data.orders.edges.map(({ node }) => ({
      id: node.id,
      orderNumber: node.name,
      customerName:
        `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim() ||
        "N/A",
      email: node.email || null,
      orderDate: node.createdAt,
      totalValue: parseFloat(node.totalPriceSet.shopMoney.amount),
      status: node.financialStatus,
      invoiceNumber:
        node.metafields.edges.find((edge) => edge.node.key === "invoice_number")
          ?.node.value || null,
      lineItems: node.lineItems.edges.map(({ node: item }) => ({
        title: item.title,
        quantity: item.quantity,
        unitPrice: parseFloat(item.originalUnitPriceSet.shopMoney.amount),
      })),
      customerId: node.customer?.id
        ? node.customer.id.replace("gid://shopify/Customer/", "")
        : null,
      customer: node.customer
        ? {
            customerId: node.customer.id.replace("gid://shopify/Customer/", ""),
            firstName: node.customer.firstName,
            lastName: node.customer.lastName,
            email: node.customer.email,
            phone: node.customer.phone,
          }
        : null,
    }));

    // Sincronizar com Prisma
    for (const order of orders) {
      // Sincronizar cliente
      let customerId = null;
      if (order.customer) {
        const upsertedCustomer = await prisma.sHOcustomer.upsert({
          where: { customerId: order.customer.customerId },
          update: {
            firstName: order.customer.firstName,
            lastName: order.customer.lastName,
            email: order.customer.email,
            phone: order.customer.phone,
          },
          create: {
            customerId: order.customer.customerId,
            firstName: ocustomer.firstName,
            lastName: order.customer.lastName,
            email: order.customer.email,
            phone: order.customer.phone,
          },
        });
        customerId = upsertedCustomer.id;
      }

      // Sincronizar encomenda
      const upsertedOrder = await prisma.sHOorder.upsert({
        where: { orderNumber: order.orderNumber },
        update: {
          customerName: order.customerName,
          email: order.email,
          orderDate: new Date(order.orderDate),
          totalValue: order.totalValue,
          status: order.status,
          invoiceNumber: order.invoiceNumber,
          customerId,
        },
        create: {
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          email: order.email,
          orderDate: new Date(order.orderDate),
          totalValue: order.totalValue,
          status: order.status,
          invoiceNumber: order.invoiceNumber,
          customerId,
        },
      });

      // Apagar itens antigos
      await prisma.sHOorderItem.deleteMany({
        where: { orderId: upsertedOrder.id },
      });

      // Inserir novos itens
      if (order.lineItems) {
        for (const item of order.lineItems) {
          await prisma.sHOorderItem.create({
            data: {
              orderId: upsertedOrder.id,
              title: item.title,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            },
          });
        }
      }
    }

    // Buscar encomendas do Prisma
    const prismaOrders = await prisma.sHOorder.findMany({
      where: { status: "PAID" },
      orderBy: { orderDate: "desc" },
      include: { items: true, customer: true },
    });

    console.log("Encomendas Prisma:", JSON.stringify(prismaOrders, null, 2));

    // Opcional: Buscar encomendas do GesFaturacao
    let gesOrders = null;
    try {
      const gesResponse = await fetch(`${login.dom_licenca}/orders`, {
        method: "GET",
        headers: { Authorization: `Bearer ${login.token}` },
      });
      if (gesResponse.ok) {
        gesOrders = await gesResponse.json();
        console.log(
          "Encomendas GesFaturacao:",
          JSON.stringify(gesOrders, null, 2),
        );
      } else {
        console.error("Erro na API GesFaturacao:", await gesResponse.text());
      }
    } catch (error) {
      console.error("Erro ao buscar encomendas GesFaturacao:", error);
    }

    return json({ orders: prismaOrders, gesOrders, error: null });
  } catch (error) {
    console.error("Erro ao carregar ordens:", error, error.stack);
    return json(
      {
        orders: [],
        gesOrders: null,
        error: "Erro ao carregar ordens: " + error.message,
      },
      { status: 500 },
    );
  }
}

export default function OrdersTablePage() {
  return <OrdersTable />;
}
