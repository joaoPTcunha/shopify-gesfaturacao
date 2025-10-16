import prisma from "../../prisma/client";

export async function fetchClientDataFromOrder(order) {
  if (!order.customer && !order.billingAddress && !order.shippingAddress) {
    throw new Error(
      "Nenhum cliente, endereço de faturação ou endereço de envio encontrado no pedido",
    );
  }

  const normalizeName = (name) => {
    if (!name || name === "N/A") return "";
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
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

  customerData.taxId =
    customerData.taxId === "N/A" ? "999999990" : customerData.taxId;

  const login = await prisma.GESlogin.findFirst({
    orderBy: { date_login: "desc" },
  });

  if (!login || !login.token) {
    throw new Error(
      "Não foi possível gerar a fatura. Por favor, aceda à página de login e introduza as suas credenciais.",
    );
  }

  const expireDate = login.date_expire ? new Date(login.date_expire) : null;
  if (!expireDate || expireDate < new Date()) {
    await prisma.GESlogin.delete({ where: { id: login.id } });
    throw new Error("Sessão GES expirada");
  }

  let apiUrl = login.dom_licenca;
  if (!apiUrl.endsWith("/")) apiUrl += "/";

  if (customerData.name === "N/A") {
    throw new Error("Nome do cliente ausente para a pesquisa");
  }

  const searchNames = [
    customerData.name,
    customerData.company !== "N/A" ? customerData.company : null,
  ].filter(Boolean);

  let clientId = null;
  let clientStatus = "não_encontrado";

  for (const searchName of searchNames) {
    const normalizedSearchName = normalizeName(searchName);
    const searchUrl = `${apiUrl}clients/tin/search/${encodeURIComponent(
      customerData.taxId,
    )}/${encodeURIComponent(normalizedSearchName)}`;
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
    } catch {
      continue;
    }

    if (!searchResponse.ok && searchResponse.status === 401) {
      throw new Error("Sessão expirada. Por favor, faça login novamente.");
    }

    let searchResponseText;
    try {
      searchResponseText = await searchResponse.text();
    } catch {
      continue;
    }

    let searchResponseBody;
    try {
      searchResponseBody = JSON.parse(searchResponseText);
    } catch {
      continue;
    }

    if (searchResponse.ok) {
      const client = searchResponseBody;
      if (!client.data?.id && !client.id) continue;
      clientId = client.data?.id || client.id;
      clientStatus = "encontrado";
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
    vatNumber: customerData.taxId,
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
    throw new Error(`Falha na criação do cliente: ${createError.message}`);
  }

  let createResponseText;
  try {
    createResponseText = await createResponse.text();
  } catch (textError) {
    throw new Error(`Falha ao ler resposta da criação: ${textError.message}`);
  }

  if (createResponse.ok) {
    try {
      if (!createResponseText) {
        throw new Error("Resposta vazia da criação no GESfaturacao");
      }
      const newClient = JSON.parse(createResponseText);
      if (!newClient.data?.id && !newClient.id) {
        throw new Error(
          "ID do cliente ausente na resposta de criação do GESfaturacao",
        );
      }
      return {
        clientId: newClient.data?.id || newClient.id,
        found: true,
        customerData,
        status: "criado",
      };
    } catch (parseError) {
      throw new Error(
        `Resposta JSON inválida da criação no GESfaturacao: ${createResponseText}`,
      );
    }
  } else {
    let createResponseBody;
    try {
      createResponseBody = JSON.parse(createResponseText);
    } catch {
      createResponseBody = {};
    }

    if (
      createResponseBody.errors &&
      createResponseBody.errors.some((err) => err.code === "CLV_VAT_10")
    ) {
      for (const searchName of searchNames) {
        const normalizedSearchName = normalizeName(searchName);
        const retrySearchUrl = `${apiUrl}clients/tin/search/${encodeURIComponent(
          customerData.taxId,
        )}/${encodeURIComponent(normalizedSearchName)}`;

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
        } catch {
          continue;
        }

        let retrySearchResponseText;
        try {
          retrySearchResponseText = await retrySearchResponse.text();
        } catch {
          continue;
        }

        if (retrySearchResponse.ok) {
          try {
            const client = JSON.parse(retrySearchResponseText);
            if (!client.data?.id && !client.id) continue;
            return {
              clientId: client.data?.id || client.id,
              found: true,
              customerData,
              status: "encontrado",
            };
          } catch {
            continue;
          }
        }
      }
      throw new Error(
        `Falha na busca de retry: Não foi possível encontrar cliente com NIF ${customerData.taxId}`,
      );
    }
    throw new Error(
      `Falha na criação do cliente: ${createResponseText || "Erro desconhecido"}`,
    );
  }
}
