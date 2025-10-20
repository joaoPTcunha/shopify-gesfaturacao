export async function fetchAllShopifyOrders() {
  try {
    const shopifyApiUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.API_VERSION}/graphql.json`;
    const shopifyAccessToken = process.env.SHOPIFY_API_TOKEN;

    if (!shopifyApiUrl || !shopifyAccessToken) {
      throw new Error("Shopify API URL or access token is not configured.");
    }

    const paymentGatewayNames = new Set();
    let after = null;
    let hasNextPage = true;

    const query = `
      query($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true, query: $query) {
          edges {
            node {
              paymentGatewayNames
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasNextPage) {
      const variables = {
        first: 250,
        after,
        query: "financial_status:PAID",
      };

      const response = await fetch(shopifyApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shopifyAccessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API request failed: ${errorText}`);
      }

      const data = await response.json();
      if (data.errors) {
        throw new Error(
          `Shopify GraphQL errors: ${JSON.stringify(data.errors)}`,
        );
      }

      const orders = data.data.orders;
      orders.edges.forEach((edge) => {
        edge.node.paymentGatewayNames.forEach((name) => {
          paymentGatewayNames.add(name);
        });
      });

      hasNextPage = orders.pageInfo.hasNextPage;
      after = orders.pageInfo.endCursor;
    }

    const result = Array.from(paymentGatewayNames);
    return { paymentGatewayNames: result };
  } catch (error) {
    return { paymentGatewayNames: [] };
  }
}
