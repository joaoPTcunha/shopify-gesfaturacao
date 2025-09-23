import prisma from "../../prisma/client";

export async function fetchClientDataFromOrder(order) {
  console.log(`[fetchClientDataFromOrder] Processing order ID: ${order.id}`);
  console.log(
    `[fetchClientDataFromOrder] Order data:`,
    JSON.stringify(order, null, 2),
  );

  if (!order.customer && !order.billingAddress && !order.shippingAddress) {
    console.error(
      "[fetchClientDataFromOrder] No customer, billing address, or shipping address found in order",
    );
    throw new Error(
      "No customer, billing address, or shipping address found in order",
    );
  }

  // Format phone number to remove country code and ensure 9 digits
  const formatPhoneNumber = (phone) => {
    if (!phone || phone === "N/A") return "";
    // Remove country code (+ followed by 1-3 digits) and non-digits
    const cleaned = phone.replace(/^\+\d{1,3}\s?/, "").replace(/\D/g, "");
    // Take last 9 digits if longer, or return as is if shorter
    return cleaned.length > 9 ? cleaned.slice(-9) : cleaned;
  };

  const customerData = {
    name:
      order.customerName ||
      order.billingAddress?.name ||
      order.shippingAddress?.name ||
      "N/A",
    company:
      order.billingAddress?.company || order.shippingAddress?.company || "N/A",
    email:
      order.customerEmail ||
      order.billingAddress?.email ||
      order.shippingAddress?.email ||
      "N/A",
    phone: order.shippingAddress?.phone || order.billingAddress?.phone || "N/A",
    billingAddress: order.billingAddress
      ? {
          address1: order.billingAddress.address1 || "N/A",
          address2: order.billingAddress.address2 || "",
          city: order.billingAddress.city || "N/A",
          province: order.billingAddress.province || "",
          country: order.billingAddress.country || "PT",
          zip: order.billingAddress.zip || "N/A",
        }
      : null,
    shippingAddress: order.shippingAddress
      ? {
          address1: order.shippingAddress.address1 || "N/A",
          address2: order.shippingAddress.address2 || "",
          city: order.shippingAddress.city || "N/A",
          province: order.shippingAddress.province || "",
          country: order.shippingAddress.country || "PT",
          zip: order.shippingAddress.zip || "N/A",
        }
      : null,
    taxId:
      order.customerMetafields?.find((m) => m.node.key === "vat_number")?.node
        .value || "N/A",
    taxExempt: order.customer?.taxExempt || false,
    acceptsMarketing: order.customer?.acceptsMarketing || false,
  };

  console.log(
    `[fetchClientDataFromOrder] customerMetafields:`,
    JSON.stringify(order.customerMetafields, null, 2),
  );
  console.log(
    `[fetchClientDataFromOrder] Extracted taxId: ${customerData.taxId}, name: ${customerData.name}`,
  );

  customerData.name =
    customerData.company !== "N/A" ? customerData.company : customerData.name;

  // Fetch GESlogin for dom_licenca and token
  const login = await prisma.GESlogin.findFirst({
    orderBy: { date_login: "desc" },
  });
  if (!login || !login.token) {
    console.error("[fetchClientDataFromOrder] No active GES session found");
    throw new Error("No active GES session");
  }

  const expireDate = login.date_expire ? new Date(login.date_expire) : null;
  if (!expireDate || expireDate < new Date()) {
    console.error("[fetchClientDataFromOrder] GES session expired");
    await prisma.GESlogin.delete({ where: { id: login.id } });
    throw new Error("GES session expired");
  }

  let apiUrl = login.dom_licenca;
  if (!apiUrl.endsWith("/")) apiUrl += "/";

  // Check if client exists in GESfaturacao
  if (customerData.taxId === "N/A" || customerData.name === "N/A") {
    console.error(
      `[fetchClientDataFromOrder] Skipping client search for order ${order.orderNumber} due to missing TIN or name`,
    );
    throw new Error("Missing TIN or name for client search");
  }

  const searchUrl = `${apiUrl}clients/tin/search/${encodeURIComponent(customerData.taxId)}/${encodeURIComponent(customerData.name)}`;
  console.log(
    `[fetchClientDataFromOrder] Checking client existence: ${searchUrl}`,
  );

  let searchResponse;
  try {
    searchResponse = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  } catch (fetchError) {
    console.error(
      `[fetchClientDataFromOrder] Fetch failed for search: ${fetchError.message}`,
    );
    throw new Error(`Client search fetch failed: ${fetchError.message}`);
  }

  let searchResponseText;
  try {
    searchResponseText = await searchResponse.text();
    console.log(
      `[fetchClientDataFromOrder] Raw search response text for order ${order.orderNumber}:`,
      searchResponseText,
    );
  } catch (textError) {
    console.error(
      `[fetchClientDataFromOrder] Failed to read search response text: ${textError.message}`,
    );
    throw new Error(`Failed to read search response: ${textError.message}`);
  }

  console.log(
    `[fetchClientDataFromOrder] GESfaturacao search response status: ${searchResponse.status}, headers: ${JSON.stringify([...searchResponse.headers])}, body: ${searchResponseText}`,
  );

  let searchResponseBody;
  try {
    searchResponseBody = JSON.parse(searchResponseText);
  } catch (parseError) {
    console.error(
      `[fetchClientDataFromOrder] Failed to parse search response as JSON: ${parseError.message}`,
    );
    searchResponseBody = {};
  }

  // Handle 404 or CLC_CLIENT_NOT_FOUND explicitly
  if (
    searchResponse.status === 404 ||
    (searchResponseBody.errors &&
      searchResponseBody.errors.code === "CLC_CLIENT_NOT_FOUND")
  ) {
    console.log(
      `[fetchClientDataFromOrder] Client not found for order ${order.orderNumber}, attempting to create`,
    );

    // Double-check to avoid duplicates
    let recheckResponse;
    try {
      recheckResponse = await fetch(searchUrl, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
    } catch (recheckError) {
      console.error(
        `[fetchClientDataFromOrder] Recheck fetch failed: ${recheckError.message}`,
      );
      // Proceed to creation if recheck fails
    }

    if (recheckResponse?.ok) {
      try {
        const client = JSON.parse(await recheckResponse.text());
        console.log(
          `[fetchClientDataFromOrder] Client found on recheck for order ${order.orderNumber}:`,
          JSON.stringify(client, null, 2),
        );
        if (!client.data?.id && !client.id) {
          console.error(
            `[fetchClientDataFromOrder] Client ID missing in recheck response for order ${order.orderNumber}`,
          );
          throw new Error("Client ID missing in GESfaturacao recheck response");
        }
        return {
          clientId: client.data?.id || client.id,
          found: true,
          customerData,
          status: "found",
        };
      } catch (parseError) {
        console.error(
          `[fetchClientDataFromOrder] Failed to parse recheck response: ${parseError.message}`,
        );
        // Proceed to creation if parsing fails
      }
    }

    // Create client using shippingAddress and additional GESfaturacao fields
    const createUrl = `${apiUrl}clients`;
    const formattedPhone = formatPhoneNumber(customerData.phone);
    const clientData = {
      name: customerData.name,
      vatNumber: customerData.taxId !== "N/A" ? customerData.taxId : "",
      country:
        customerData.shippingAddress?.country === "Portugal"
          ? "PT"
          : customerData.shippingAddress?.country ||
            customerData.billingAddress?.country ||
            "PT",
      address:
        customerData.shippingAddress?.address1 ||
        customerData.billingAddress?.address1 ||
        "",
      zipCode:
        customerData.shippingAddress?.zip ||
        customerData.billingAddress?.zip ||
        "",
      city:
        customerData.shippingAddress?.city ||
        customerData.billingAddress?.city ||
        "",
      region:
        customerData.shippingAddress?.province ||
        customerData.billingAddress?.province ||
        "",
      local:
        customerData.shippingAddress?.address2 ||
        customerData.billingAddress?.address2 ||
        "",
      email: customerData.email !== "N/A" ? customerData.email : "",
      mobile: formattedPhone,
      telephone: formattedPhone,
      website: "",
      fax: "",
      representativeName: customerData.name,
      representativeEmail:
        customerData.email !== "N/A" ? customerData.email : "",
      representativeMobile: formattedPhone,
      representativeTelephone: formattedPhone,
      accountType: 0,
      ivaExempted: customerData.taxExempt || false,
      exemptedReason: customerData.taxExempt ? 1 : 0,
      paymentMethod: order.paymentGatewayNames?.includes("manual")
        ? "Manual"
        : "",
      paymentConditions: "",
      discount: 0,
      internalCode: "",
      comments: order.note || "",
    };

    console.log(
      `[fetchClientDataFromOrder] Creating client for order ${order.orderNumber}:`,
      JSON.stringify(clientData, null, 2),
    );

    let createResponse;
    try {
      createResponse = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(clientData),
      });
    } catch (createError) {
      console.error(
        `[fetchClientDataFromOrder] Create fetch failed: ${createError.message}`,
      );
      throw new Error(`Client creation fetch failed: ${createError.message}`);
    }

    let createResponseText;
    try {
      createResponseText = await createResponse.text();
      console.log(
        `[fetchClientDataFromOrder] Raw create response text for order ${order.orderNumber}:`,
        createResponseText,
      );
      console.log(
        `[fetchClientDataFromOrder] GESfaturacao create response headers: ${JSON.stringify([...createResponse.headers])}`,
      );
    } catch (textError) {
      console.error(
        `[fetchClientDataFromOrder] Failed to read create response text: ${textError.message}`,
      );
      throw new Error(`Failed to read create response: ${textError.message}`);
    }

    console.log(
      `[fetchClientDataFromOrder] GESfaturacao create response status: ${createResponse.status}, body: ${createResponseText}`,
    );

    if (createResponse.ok) {
      try {
        if (!createResponseText) {
          console.error(
            `[fetchClientDataFromOrder] Empty create response body for order ${order.orderNumber}`,
          );
          throw new Error("Empty response from GESfaturacao create");
        }
        const newClient = JSON.parse(createResponseText);
        console.log(
          `[fetchClientDataFromOrder] Client created for order ${order.orderNumber}:`,
          JSON.stringify(newClient, null, 2),
        );
        if (!newClient.data?.id && !newClient.id) {
          console.error(
            `[fetchClientDataFromOrder] Client ID missing in create response for order ${order.orderNumber}`,
          );
          throw new Error("Client ID missing in GESfaturacao create response");
        }
        return {
          clientId: newClient.data?.id || newClient.id,
          found: true,
          customerData,
          status: "created",
        };
      } catch (parseError) {
        console.error(
          `[fetchClientDataFromOrder] Failed to parse create response for order ${order.orderNumber}: ${parseError.message}`,
          `Raw response: ${createResponseText}`,
        );
        throw new Error(
          `Invalid JSON response from GESfaturacao create: ${createResponseText}`,
        );
      }
    } else {
      console.error(
        `[fetchClientDataFromOrder] Client creation failed for order ${order.orderNumber}: ${createResponse.status} - ${createResponseText}`,
      );
      throw new Error(
        `Client creation failed: ${createResponseText || "Unknown error"}`,
      );
    }
  }

  if (searchResponse.ok) {
    try {
      const client = JSON.parse(searchResponseText);
      console.log(
        `[fetchClientDataFromOrder] Client found for order ${order.orderNumber}:`,
        JSON.stringify(client, null, 2),
      );
      if (!client.data?.id && !client.id) {
        console.error(
          `[fetchClientDataFromOrder] Client ID missing in search response for order ${order.orderNumber}`,
        );
        throw new Error("Client ID missing in GESfaturacao search response");
      }
      return {
        clientId: client.data?.id || client.id,
        found: true,
        customerData,
        status: "found",
      };
    } catch (parseError) {
      console.error(
        `[fetchClientDataFromOrder] Failed to parse search response as JSON: ${parseError.message}`,
      );
      throw new Error("Invalid JSON response from GESfaturacao search");
    }
  }

  console.error(
    `[fetchClientDataFromOrder] Unexpected search response: ${searchResponse.status} - ${searchResponseText}`,
  );
  throw new Error(
    `Unexpected client search response: ${searchResponseText || "Unknown error"}`,
  );
}
