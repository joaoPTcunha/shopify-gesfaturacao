import { json, redirect } from "@remix-run/node";
import prisma from "../../prisma/client";
import Layout from "../components/Layout";
import ConfigForm from "../components/ConfigForm";

export async function loader({ request }) {
  try {
    if (!prisma.GESlogin) {
      throw new Error("Prisma GESlogin model is not available.");
    }

    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });

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
      currentServiceId: login.id_product_shipping || "", // Use id_product_shipping
      finalized: login.finalized || false,
      email_auto: login.email_auto || false,
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
        finalized: false,
        email_auto: false,
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
    const finalized = formData.get("finalizeInvoice") === "on";
    const email_auto = formData.get("sendByEmail") === "on";

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

    return redirect("/ges-orders");
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
}

export default function GesConfigPage() {
  return (
    <Layout>
      <div className="container d-flex justify-content-center align-items-center min-vh-100">
        <div className="col-md-6 col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <h1 className="display-6 fw-bold mb-3">
                Configuração GESFaturação
              </h1>
              <p className="text-muted mb-4">
                Configure as opções de faturação
              </p>
              <ConfigForm />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
