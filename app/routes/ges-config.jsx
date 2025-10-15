import { json, redirect } from "@remix-run/node";
import prisma from "../../prisma/client";
import Layout from "../components/Layout";
import ConfigForm from "../components/ConfigForm";

export async function loader({ request }) {
  try {
    // Verifica se o modelo existe
    if (!prisma.GESlogin) {
      throw new Error("Prisma GESlogin model is not available.");
    }

    // Busca o último login
    let login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });

    // Se não houver login, usuário não está autenticado
    const isLoggedIn = !!login && !!login.token;
    if (!isLoggedIn) {
      return json({
        series: [],
        services: [],
        currentSerieId: "",
        currentServiceId: "",
        finalized: true,
        email_auto: true,
        error: null,
        isLoggedIn: false,
      });
    }

    // Verifica se login expirou
    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return redirect("/ges-login");
    }

    // Busca séries e serviços via API
    let seriesData = [];
    let servicesData = [];
    try {
      let apiUrl = login.dom_licenca;
      if (!apiUrl.endsWith("/")) apiUrl += "/";

      // Series
      const seriesResponse = await fetch(`${apiUrl}series`, {
        method: "GET",
        headers: { Authorization: login.token, Accept: "application/json" },
      });
      if (seriesResponse.ok) {
        const data = await seriesResponse.json();
        seriesData = Array.isArray(data?.data) ? data.data : [];
      }

      // Services
      const servicesResponse = await fetch(`${apiUrl}products/type/service`, {
        method: "GET",
        headers: { Authorization: login.token, Accept: "application/json" },
      });
      if (servicesResponse.ok) {
        const data = await servicesResponse.json();
        servicesData = Array.isArray(data?.data) ? data.data : [];
      }
    } catch (error) {
      console.error("Erro ao buscar séries ou serviços:", error.message);
    }

    return json({
      series: seriesData,
      services: servicesData,
      currentSerieId: login.id_serie || "",
      currentServiceId: login.id_product_shipping || "",
      finalized: login.finalized ?? true,
      email_auto: login.email_auto ?? true,
      error: null,
      isLoggedIn: true,
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
        error: "Não foi possível carregar a configuração",
        isLoggedIn: false,
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

    // Valida campos obrigatórios
    if (!id_serie || !id_product_shipping) {
      return json(
        { error: "Série e Portes são obrigatórios" },
        { status: 400 },
      );
    }

    // Busca último login
    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });

    // Se não estiver logado, redireciona para login
    if (!login || !login.token) {
      return redirect("/ges-login");
    }

    // Verifica se login expirou
    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return redirect("/ges-login");
    }

    // Atualiza configuração
    await prisma.GESlogin.update({
      where: { id: login.id },
      data: { id_serie, id_product_shipping, finalized, email_auto },
    });

    return json({ success: true });
  } catch (error) {
    console.error("Erro ao salvar configuração:", error.message);
    return json(
      {
        error:
          "Não foi possível salvar a configuração. Por favor, tente novamente.",
      },
      { status: 500 },
    );
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
