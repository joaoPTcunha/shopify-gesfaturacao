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

  const normalizeName = (name) => {
    if (!name || name === "N/A") return "";
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-zA-Z0-9\s]/g, "") // Remove special characters
      .toLowerCase()
      .trim();
  };

  const formatPhoneNumber = (phone) => {
    if (!phone || phone === "N/A") return "";
    const cleaned = phone.replace(/^\+\d{1,3}\s?/, "").replace(/\D/g, "");
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

  if (customerData.taxId === "N/A" || customerData.name === "N/A") {
    throw new Error("Missing TIN or name for client search");
  }

  // Try searching with normalized name and company name
  const searchNames = [
    customerData.name,
    customerData.company !== "N/A" ? customerData.company : null,
  ].filter(Boolean);

  let clientId = null;
  let clientStatus = "not_found";

  for (const searchName of searchNames) {
    const normalizedSearchName = normalizeName(searchName);
    const searchUrl = `${apiUrl}clients/tin/search/${encodeURIComponent(customerData.taxId)}/${encodeURIComponent(normalizedSearchName)}`;
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
      continue;
    }

    let searchResponseText;
    try {
      searchResponseText = await searchResponse.text();
    } catch (textError) {
      continue;
    }

    let searchResponseBody;
    try {
      searchResponseBody = JSON.parse(searchResponseText);
    } catch (parseError) {
      console.error(
        `[fetchClientDataFromOrder] Failed to parse search response as JSON: ${parseError.message}`,
      );
      searchResponseBody = {};
      continue;
    }

    if (searchResponse.ok) {
      const client = searchResponseBody;
      if (!client.data?.id && !client.id) {
        continue;
      }
      clientId = client.data?.id || client.id;
      clientStatus = "found";
      break;
    }
  }

  if (clientId) {
    return {
      clientId,
      found: true,
      customerData,
      status: clientStatus,
    };
  }

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
    representativeEmail: customerData.email !== "N/A" ? customerData.email : "",
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
  } catch (textError) {
    console.error(
      `[fetchClientDataFromOrder] Failed to read create response text: ${textError.message}`,
    );
    throw new Error(`Failed to read create response: ${textError.message}`);
  }

  if (createResponse.ok) {
    try {
      if (!createResponseText) {
        throw new Error("Empty response from GESfaturacao create");
      }
      const newClient = JSON.parse(createResponseText);

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
    let createResponseBody;
    try {
      createResponseBody = JSON.parse(createResponseText);
    } catch (parseError) {
      console.error(
        `[fetchClientDataFromOrder] Failed to parse create response as JSON: ${parseError.message}`,
      );
      createResponseBody = {};
    }

    if (
      createResponseBody.errors &&
      createResponseBody.errors.some((err) => err.code === "CLV_VAT_10")
    ) {
      for (const searchName of searchNames) {
        const normalizedSearchName = normalizeName(searchName);
        const retrySearchUrl = `${apiUrl}clients/tin/search/${encodeURIComponent(customerData.taxId)}/${encodeURIComponent(normalizedSearchName)}`;

        let retrySearchResponse;
        try {
          retrySearchResponse = await fetch(retrySearchUrl, {
            method: "GET",
            headers: {
              Authorization: login.token,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          });
        } catch (retryError) {
          console.error(
            `[fetchClientDataFromOrder] Retry search fetch failed: ${retryError.message}`,
          );
          continue;
        }

        let retrySearchResponseText;
        try {
          retrySearchResponseText = await retrySearchResponse.text();
        } catch (textError) {
          console.error(
            `[fetchClientDataFromOrder] Failed to read retry search response text: ${textError.message}`,
          );
          continue;
        }

        if (retrySearchResponse.ok) {
          try {
            const client = JSON.parse(retrySearchResponseText);
            if (!client.data?.id && !client.id) {
              continue;
            }
            return {
              clientId: client.data?.id || client.id,
              found: true,
              customerData,
              status: "found",
            };
          } catch (parseError) {
            console.error(
              `[fetchClientDataFromOrder] Failed to parse retry search response as JSON: ${parseError.message}`,
            );
            continue;
          }
        }
      }
      throw new Error(
        `Retry client search failed: Unable to find client with VAT ${customerData.taxId}`,
      );
    }
    throw new Error(
      `Client creation failed: ${createResponseText || "Unknown error"}`,
    );
  }
}
