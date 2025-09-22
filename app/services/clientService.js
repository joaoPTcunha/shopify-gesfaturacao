// app/services/clientService.js
async function fetchOrderFromShopify(orderId) {
  console.log(
    `[fetchOrderFromShopify] Starting fetch for order ID: ${orderId}`,
  );

  try {
    const encodedOrderId = encodeURIComponent(orderId);
    console.log(
      `[fetchOrderFromShopify] Sending request to /api/shopify.order/${encodedOrderId}`,
    );
    const response = await fetch(`/api/shopify.order/${encodedOrderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(`[fetchOrderFromShopify] Response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[fetchOrderFromShopify] Failed to fetch order: ${errorText}`,
      );
      throw new Error(`Failed to fetch order from Shopify: ${errorText}`);
    }

    const order = await response.json();
    console.log(
      `[fetchOrderFromShopify] Order data received:`,
      JSON.stringify(order, null, 2),
    );

    if (order.error) {
      console.error(
        `[fetchOrderFromShopify] Server returned error: ${order.error}`,
      );
      throw new Error(order.error);
    }

    if (!order.customer && !order.billingAddress) {
      console.warn(
        `[fetchOrderFromShopify] No customer or billing address found for order ID: ${orderId}`,
      );
      throw new Error("No customer or billing address found");
    }

    return order;
  } catch (error) {
    console.error(`[fetchOrderFromShopify] Error: ${error.message}`, error);
    throw new Error(`Error fetching Shopify order: ${error.message}`);
  }
}

async function processClientFromOrder(fullOrder) {
  console.log(
    `[processClientFromOrder] Processing client for order: ${fullOrder.name || "unknown"}`,
  );

  try {
    const customerData = {
      name: fullOrder.customer?.firstName
        ? `${fullOrder.customer.firstName} ${fullOrder.customer.lastName || ""}`.trim()
        : fullOrder.billingAddress?.name || "N/A",
      company: fullOrder.billingAddress?.company || "N/A",
      email:
        fullOrder.customer?.email || fullOrder.billingAddress?.email || "N/A",
      phone:
        fullOrder.customer?.phone || fullOrder.billingAddress?.phone || "N/A",
      billingAddress: fullOrder.billingAddress
        ? {
            address1: fullOrder.billingAddress.address1 || "N/A",
            address2: fullOrder.billingAddress.address2 || "N/A",
            city: fullOrder.billingAddress.city || "N/A",
            province: fullOrder.billingAddress.province || "N/A",
            country: fullOrder.billingAddress.country || "PT",
            zip: fullOrder.billingAddress.zip || "N/A",
            phone: fullOrder.billingAddress.phone || "N/A",
          }
        : null,
      taxId:
        fullOrder.customer?.metafields?.find((m) => m.key === "nif")?.value ||
        "N/A",
      taxExempt: fullOrder.customer?.taxExempt || false,
      acceptsMarketing: fullOrder.customer?.acceptsMarketing || false,
    };

    customerData.name =
      customerData.company !== "N/A" ? customerData.company : customerData.name;

    console.log(
      `[processClientFromOrder] Extracted customer data:`,
      JSON.stringify(customerData, null, 2),
    );

    if (customerData.email === "N/A") {
      console.error(
        `[processClientFromOrder] Customer email is not available for order: ${fullOrder.name}`,
      );
      throw new Error("Customer email is not available");
    }

    let clientId;
    let created = false;

    if (customerData.taxId !== "N/A") {
      console.log(
        `[processClientFromOrder] Searching for client in GESfaturacao by TIN: ${customerData.taxId} and Name: ${customerData.name}`,
      );

      const encodedTin = encodeURIComponent(customerData.taxId);
      const encodedName = encodeURIComponent(customerData.name);
      const checkClientResponse = await fetch(
        `/clients-ges/search?tin=${encodedTin}&name=${encodedName}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      console.log(
        `[processClientFromOrder] Check client response status: ${checkClientResponse.status}`,
      );

      if (checkClientResponse.status === 200) {
        const client = await checkClientResponse.json();
        clientId = client.id;
        created = false;
        console.log(`[processClientFromOrder] Client found: ${clientId}`);
      } else if (checkClientResponse.status !== 404) {
        const errorText = await checkClientResponse.text();
        console.error(
          `[processClientFromOrder] Failed to search client: ${errorText}`,
        );
        throw new Error(
          `Failed to search client in GESfaturacao: ${errorText}`,
        );
      }
    } else {
      console.log(
        `[processClientFromOrder] No TIN available, creating new client directly`,
      );
    }

    if (!clientId) {
      console.log(
        `[processClientFromOrder] Creating new client in GESfaturacao`,
      );
      const createFormData = new FormData();
      createFormData.append("name", customerData.name);
      createFormData.append("vatNumber", customerData.taxId);
      createFormData.append("country", customerData.billingAddress.country);
      createFormData.append(
        "address",
        [
          customerData.billingAddress.address1,
          customerData.billingAddress.address2,
        ]
          .filter(Boolean)
          .join(" ") || "N/A",
      );
      createFormData.append("zipCode", customerData.billingAddress.zip);
      createFormData.append("region", customerData.billingAddress.province);
      createFormData.append("city", customerData.billingAddress.city);
      createFormData.append("email", customerData.email);
      createFormData.append("mobile", customerData.phone);
      createFormData.append("telephone", customerData.phone);
      createFormData.append("ivaExempted", customerData.taxExempt.toString());
      if (customerData.taxExempt) {
        createFormData.append("exemptedReason", "1");
      }
      createFormData.append("accountType", "1");
      createFormData.append("paymentMethod", "TT");
      createFormData.append(
        "internalCode",
        customerData.company !== "N/A" ? customerData.company : "",
      );

      const createClientResponse = await fetch(`/clients-ges/create`, {
        method: "POST",
        body: createFormData,
      });

      console.log(
        `[processClientFromOrder] Create client response status: ${createClientResponse.status}`,
      );
      if (!createClientResponse.ok) {
        const errorText = await createClientResponse.text();
        console.error(
          `[processClientFromOrder] Failed to create client: ${errorText}`,
        );
        throw new Error(
          `Failed to create client in GESfaturacao: ${errorText}`,
        );
      }

      const newClient = await createClientResponse.json();
      clientId = newClient.id;
      created = true;
      console.log(`[processClientFromOrder] New client created: ${clientId}`);
    }

    console.log(
      `[processClientFromOrder] Returning client data: ID=${clientId}, Created=${created}`,
    );
    return { clientId, created, customerData };
  } catch (error) {
    console.error(`[processClientFromOrder] Error: ${error.message}`, error);
    throw new Error(`Error processing client: ${error.message}`);
  }
}

export { fetchOrderFromShopify, processClientFromOrder };
