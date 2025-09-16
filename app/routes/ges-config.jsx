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
    if (!login || !login.token) {
      return redirect("/ges-login");
    }

    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return redirect("/ges-login");
    }

    let seriesData = [];
    try {
      let apiUrl = login.dom_licenca;
      if (!apiUrl.endsWith("/")) apiUrl += "/";
      apiUrl += "series";

      console.log("Fetching series from:", apiUrl);
      const gesResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
        },
      });

      if (!gesResponse.ok) {
        throw new Error(`API request failed: ${await gesResponse.text()}`);
      }

      const fullResponse = await gesResponse.json();
      console.log("API Response:", JSON.stringify(fullResponse, null, 2));
      seriesData = Array.isArray(fullResponse.data) ? fullResponse.data : [];
    } catch (error) {
      console.error("Erro ao buscar séries:", error.message);
    }

    return json({
      series: seriesData,
      currentSerieId: login.id_serie || "",
      finalized: login.finalized || false,
      email_auto: login.email_auto || false,
      error: null,
    });
  } catch (error) {
    console.error("Erro ao carregar configuração:", error.message);
    return json(
      {
        series: [],
        currentSerieId: "",
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
    const finalized = formData.get("finalizeInvoice") === "on";
    const email_auto = formData.get("sendByEmail") === "on";

    if (!id_serie) {
      return json({ error: "Série é obrigatória" }, { status: 400 });
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
      data: { id_serie, finalized, email_auto },
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
