// routes/ges-config.jsx
import { json, redirect } from "@remix-run/node";
import prisma from "../../prisma/client";
import Layout from "../components/Layout";
import ConfigForm from "../components/ConfigForm";

export async function loader({ request }) {
  try {
    if (!prisma.GESlogin) {
      throw new Error("Prisma GESlogin model is not available.");
    }

    let login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });

    if (!login) {
      // Create a default login record if none exists
      login = await prisma.GESlogin.create({
        data: {
          dom_licenca: process.env.GES_LICENSE,
          token: "", // Placeholder; actual token would come from login flow
          date_login: new Date(),
          date_expire: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          id_serie: "",
          id_product_shipping: "",
          finalized: true, // Default to true
          email_auto: true, // Default to true
        },
      });
    }

    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return redirect("/ges-login");
    }

    let seriesData = [];
    let servicesData = [];
    try {
      let apiUrl = login.dom_licenca;
      if (!apiUrl.endsWith("/")) apiUrl += "/";

      // Fetch series
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

      // Fetch services (portes)
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
    } catch (error) {
      console.error("Erro ao buscar séries ou serviços:", error.message);
    }

    return json({
      series: seriesData,
      services: servicesData,
      currentSerieId: login.id_serie || "",
      currentServiceId: login.id_product_shipping || "",
      finalized: login.finalized ?? true, // Default to true if null
      email_auto: login.email_auto ?? true, // Default to true if null
      error: null,
    });
  } catch (error) {
    console.error("Erro ao carregar configuração:", error.message);
    return json(
      {
        series: [],
        services: [],
        currentSerieId: "",
        currentServiceId: "",
        finalized: true,
        email_auto: true,
        error: error.message,
      },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  try {
    if (!prisma.GESlogin) {
      throw new Error("Prisma GESlogin model is not available.");
    }

    const formData = await request.formData();
    const id_serie = formData.get("id_serie")?.trim();
    const id_product_shipping = formData.get("id_product_shipping")?.trim();
    const finalized = formData.get("finalized") === "on";
    const email_auto = formData.get("email_auto") === "on";

    if (!id_serie || !id_product_shipping) {
      return json(
        { error: "Série e Portes são obrigatórios" },
        { status: 400 },
      );
    }

    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });
    if (!login || !login.token) {
      return redirect("/ges-login");
    }

    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return redirect("/ges-login");
    }

    await prisma.GESlogin.update({
      where: { id: login.id },
      data: { id_serie, id_product_shipping, finalized, email_auto },
    });

    return json({ success: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
}

export default function ConfigPage() {
  return (
    <Layout>
      <div className="container mt-4">
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6">
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
