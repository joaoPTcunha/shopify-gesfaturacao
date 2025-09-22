// app/routes/api.shopify.order.$id.jsx
import { json } from "@remix-run/node";

export async function loader({ params }) {
  const { id } = params;
  console.log(`[api.shopify.order.$id] Fetching order ID: ${id}`);

  if (!id || !id.startsWith("gid://shopify/Order/")) {
    console.error(`[api.shopify.order.$id] Invalid order ID format: ${id}`);
    return json({ error: "Invalid order ID format" }, { status: 400 });
  }

  try {
    const query = `
      query ($id: ID!) {
        order(id: $id) {
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
            phone
            taxExempt
            taxExemptions
            acceptsMarketing
            metafields(first: 10) {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
          lineItems(first: 10) {
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
            price
          }
        }
      }
    `;

    const variables = { id };

    console.log(`[api.shopify.order.$id] Sending GraphQL request to Shopify`);
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

    console.log(`[api.shopify.order.$id] Response status: ${response.status}`);
    const data = await response.json();

    if (data.errors) {
      console.error(
        `[api.shopify.order.$id] GraphQL errors:`,
        JSON.stringify(data.errors, null, 2),
      );
      return json(
        { error: `GraphQL errors: ${JSON.stringify(data.errors)}` },
        { status: 500 },
      );
    }

    if (!data.data || !data.data.order) {
      console.warn(`[api.shopify.order.$id] Order not found for ID: ${id}`);
      return json({ error: "Order not found" }, { status: 404 });
    }

    const order = data.data.order;
    console.log(
      `[api.shopify.order.$id] Order data fetched:`,
      JSON.stringify(order, null, 2),
    );

    return json({
      id: order.id,
      name: order.name,
      orderDate: order.createdAt,
      totalValue: parseFloat(order.totalPriceSet?.shopMoney?.amount || 0),
      currency: order.totalPriceSet?.shopMoney?.currencyCode || "N/A",
      status: order.displayFinancialStatus || "N/A",
      customer: order.customer
        ? {
            id: order.customer.id,
            firstName: order.customer.firstName || "",
            lastName: order.customer.lastName || "",
            email: order.customer.email || "",
            phone: order.customer.phone || "",
            taxExempt: order.customer.taxExempt || false,
            taxExemptions: order.customer.taxExemptions || [],
            acceptsMarketing: order.customer.acceptsMarketing || false,
            metafields:
              order.customer.metafields?.edges?.map(({ node }) => ({
                key: node.key,
                value: node.value,
              })) || [],
          }
        : null,
      invoiceNumber:
        order.metafields?.edges?.find(
          (edge) => edge.node.key === "invoice_number",
        )?.node.value || "N/A",
      lineItems:
        order.lineItems?.edges?.map(({ node: item }) => ({
          title: item.title || "N/A",
          quantity: item.quantity || 0,
          unitPrice: parseFloat(
            item.originalUnitPriceSet?.shopMoney?.amount || 0,
          ),
        })) || [],
      shippingAddress: order.shippingAddress
        ? {
            address1: order.shippingAddress.address1 || "N/A",
            address2: order.shippingAddress.address2 || "",
            city: order.shippingAddress.city || "N/A",
            province: order.shippingAddress.province || "N/A",
            country: order.shippingAddress.country || "N/A",
            zip: order.shippingAddress.zip || "N/A",
            phone: order.shippingAddress.phone || "N/A",
          }
        : null,
      billingAddress: order.billingAddress
        ? {
            name: order.billingAddress.name || "N/A",
            company: order.billingAddress.company || "N/A",
            address1: order.billingAddress.address1 || "N/A",
            address2: order.billingAddress.address2 || "",
            city: order.billingAddress.city || "N/A",
            province: order.billingAddress.province || "N/A",
            country: order.billingAddress.country || "N/A",
            zip: order.billingAddress.zip || "N/A",
            phone: order.billingAddress.phone || "N/A",
          }
        : null,
      note: order.note || "N/A",
      paymentGatewayNames: order.paymentGatewayNames || [],
      shippingLine: order.shippingLine
        ? {
            title: order.shippingLine.title || "N/A",
            price: parseFloat(order.shippingLine.price || 0),
          }
        : null,
    });
  } catch (error) {
    console.error(`[api.shopify.order.$id] Error: ${error.message}`, error);
    return json(
      { error: `Failed to fetch Shopify order: ${error.message}` },
      { status: 500 },
    );
  }
}
