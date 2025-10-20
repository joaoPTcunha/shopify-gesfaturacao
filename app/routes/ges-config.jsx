import { json, redirect } from "@remix-run/node";
import prisma from "../../prisma/client";
import Layout from "../components/Layout";
import ConfigForm from "../components/ConfigForm";
import { fetchAllShopifyOrders } from "../utils/fetchAllShopifyOrders";

export async function loader({ request }) {
  try {
    let login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });

    if (!login) {
      login = await prisma.GESlogin.create({
        data: {
          dom_licenca: "",
          token: "",
          date_login: new Date(),
          date_expire: new Date(Date.now() + 24 * 60 * 60 * 1000 * 30),
          id_serie: "",
          id_product_shipping: "",
          finalized: true,
          email_auto: true,
        },
      });
    }

    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return redirect("/ges-login?sessionExpired=true");
    }

    let seriesData = [];
    let servicesData = [];
    let banksData = [];
    let paymentMethodsData = [];
    let shopifyPaymentGateways = [];
    let paymentMappings = [];

    try {
      let apiUrl = login.dom_licenca;
      if (!apiUrl.endsWith("/")) apiUrl += "/";

      const seriesUrl = `${apiUrl}series`;
      const seriesResponse = await fetch(seriesUrl, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
        },
      });
      if (!seriesResponse.ok) {
        throw new Error(
          `Series API request failed: ${await seriesResponse.text()}`,
        );
      }
      const seriesFullResponse = await seriesResponse.json();
      seriesData = Array.isArray(seriesFullResponse.data)
        ? seriesFullResponse.data
        : [];

      const servicesUrl = `${apiUrl}products/type/service`;
      const servicesResponse = await fetch(servicesUrl, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
        },
      });
      if (!servicesResponse.ok) {
        throw new Error(
          `Services API request failed: ${await servicesResponse.text()}`,
        );
      }
      const servicesFullResponse = await servicesResponse.json();
      servicesData = Array.isArray(servicesFullResponse.data)
        ? servicesFullResponse.data
        : [];

      const banksUrl = `${apiUrl}banks`;
      const banksResponse = await fetch(banksUrl, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
        },
      });
      if (!banksResponse.ok) {
        throw new Error(
          `Banks API request failed: ${await banksResponse.text()}`,
        );
      }
      const banksFullResponse = await banksResponse.json();
      banksData = Array.isArray(banksFullResponse.data)
        ? banksFullResponse.data
        : [];

      const paymentMethodsUrl = `${apiUrl}payment-methods`;
      const paymentMethodsResponse = await fetch(paymentMethodsUrl, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
        },
      });
      if (!paymentMethodsResponse.ok) {
        throw new Error(
          `Payment Methods API request failed: ${await paymentMethodsResponse.text()}`,
        );
      }
      const paymentMethodsFullResponse = await paymentMethodsResponse.json();
      paymentMethodsData = Array.isArray(paymentMethodsFullResponse.data)
        ? paymentMethodsFullResponse.data
        : [];

      const shopifyApiUrl =
        process.env.SHOPIFY_API_URL ||
        "https://your-shopify-store.myshopify.com/admin/api/2023-10/graphql.json";
      const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
      const { paymentGatewayNames } = await fetchAllShopifyOrders(
        shopifyApiUrl,
        shopifyAccessToken,
      );
      shopifyPaymentGateways = paymentGatewayNames;

      paymentMappings = await prisma.GESpaymentMap.findMany({
        where: { id_shop: login.id.toString() },
      });
    } catch (error) {
      console.error("Erro ao buscar dados da API:", error.message);
    }

    return json({
      series: seriesData,
      services: servicesData,
      banks: banksData,
      paymentMethods: paymentMethodsData,
      shopifyPaymentGateways,
      paymentMappings,
      currentSerieId: login.id_serie || "",
      currentServiceId: login.id_product_shipping || "",
      finalized: login.finalized ?? true,
      email_auto: login.email_auto ?? true,
      isLoggedIn: !!login.token,
      error:
        shopifyPaymentGateways.length === 0
          ? "Não foi possível carregar métodos de pagamento do Shopify."
          : null,
    });
  } catch (error) {
    console.error("Erro ao carregar configuração:", error.message);
    return json(
      {
        series: [],
        services: [],
        banks: [],
        paymentMethods: [],
        shopifyPaymentGateways: [],
        paymentMappings: [],
        currentSerieId: "",
        currentServiceId: "",
        finalized: true,
        email_auto: true,
        isLoggedIn: false,
        error: "Sessão expirada. Por favor, faça login novamente.",
      },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  try {
    const formData = await request.formData();
    const id_serie = formData.get("id_serie")?.trim();
    const id_product_shipping = formData.get("id_product_shipping")?.trim();
    const finalized = formData.get("finalized") === "on";
    const email_auto = formData.get("email_auto") === "on";
    const paymentMappings = [];

    for (const [key, value] of formData.entries()) {
      if (key.startsWith("paymentMappings")) {
        const match = key.match(/paymentMappings\[(\d+)\]\[(\w+)\]/);
        if (match) {
          const index = parseInt(match[1], 10);
          const field = match[2];
          if (!paymentMappings[index]) {
            paymentMappings[index] = {};
          }
          paymentMappings[index][field] = value;
        }
      }
    }

    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });
    let apiUrl = login.dom_licenca;
    if (!apiUrl.endsWith("/")) apiUrl += "/";
    const paymentMethodsUrl = `${apiUrl}payment-methods`;
    const paymentMethodsResponse = await fetch(paymentMethodsUrl, {
      method: "GET",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
      },
    });
    if (!paymentMethodsResponse.ok) {
      throw new Error(
        `Payment Methods API request failed: ${await paymentMethodsResponse.text()}`,
      );
    }
    const paymentMethodsFullResponse = await paymentMethodsResponse.json();
    const paymentMethodsData = Array.isArray(paymentMethodsFullResponse.data)
      ? paymentMethodsFullResponse.data
      : [];

    const validatedMappings = paymentMappings
      .map((mapping) => {
        if (mapping.payment_name && mapping.ges_payment_id) {
          const method = paymentMethodsData.find(
            (m) => m.id === mapping.ges_payment_id,
          );
          if (method?.needsBank === "0" && mapping.ges_bank_id) {
            return { ...mapping, ges_bank_id: null };
          }
          return mapping;
        }
        return null;
      })
      .filter(Boolean);

    await prisma.GESlogin.update({
      where: { id: login.id },
      data: {
        id_serie,
        id_product_shipping,
        finalized,
        email_auto,
      },
    });

    for (const mapping of validatedMappings) {
      const existingMapping = await prisma.GESpaymentMap.findFirst({
        where: {
          id_shop: login.id.toString(),
          payment_name: mapping.payment_name,
        },
      });

      if (existingMapping) {
        await prisma.GESpaymentMap.update({
          where: {
            id_map: existingMapping.id_map,
          },
          data: {
            ges_payment_id: mapping.ges_payment_id || null,
            ges_bank_id: mapping.ges_bank_id || null,
          },
        });
      } else {
        await prisma.GESpaymentMap.create({
          data: {
            id_shop: login.id.toString(),
            payment_name: mapping.payment_name,
            ges_payment_id: mapping.ges_payment_id || null,
            ges_bank_id: mapping.ges_bank_id || null,
          },
        });
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("Erro ao salvar configuração:", error.message);
    return json(
      { error: "Erro ao salvar configuração: " + error.message },
      { status: 500 },
    );
  }
}

export default function ConfigPage() {
  return (
    <Layout>
      <div className="container mt-4">
        <div className="row justify-content-center">
          <div className="col-md-12 col-lg-10">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center p-3">
                <h1 className="display-6 fw-bold mb-5">
                  Configuração GESFaturação
                </h1>
                <ConfigForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
