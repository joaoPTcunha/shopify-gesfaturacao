import { json, redirect } from "@remix-run/node";
import prisma from "../../prisma/client";
import Layout from "../components/Layout";
import LoginForm from "../components/LoginForm";

export async function loader({ request }) {
  try {
    if (!prisma.GESlogin) {
      throw new Error("Prisma GESlogin model is not available.");
    }

    const url = new URL(request.url);
    if (url.searchParams.get("logout") === "true") {
      await prisma.GESlogin.deleteMany({});
      return json({});
    }

    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });
    if (
      login &&
      login.date_expire &&
      new Date(login.date_expire) > new Date()
    ) {
      return redirect("/ges-config");
    }
    return json({});
  } catch (error) {
    console.error("Erro no loader:", error.message);
    return json({ error: error.message }, { status: 500 });
  }
}

export async function action({ request }) {
  try {
    if (!prisma.GESlogin) {
      throw new Error("Prisma GESlogin model is not available.");
    }

    const formData = await request.formData();
    let dom_licenca = formData.get("dom_licenca")?.trim();
    const username = formData.get("username")?.trim();
    const password = formData.get("password");

    if (!dom_licenca || !username || !password) {
      return json(
        { error: "Todos os campos são obrigatórios" },
        { status: 400 },
      );
    }

    new URL(dom_licenca);

    if (!dom_licenca.endsWith("/")) dom_licenca += "/";

    const res = await fetch(`${dom_licenca}login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ username, password }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Erro na API:", { status: res.status, errorText });
      return json(
        { error: `Credenciais inválidas: ${errorText || res.statusText}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    const token = data._token;
    if (!token) {
      return json({ error: "Token não retornado pela API." }, { status: 400 });
    }

    // Delete existing sessions for the same dom_licenca and username
    await prisma.GESlogin.deleteMany({
      where: {
        dom_licenca,
      },
    });

    // Create new session
    await prisma.GESlogin.create({
      data: {
        dom_licenca,
        token,
        id_serie: data.id_serie ?? "",
        id_product_shipping: data.id_product_shipping ?? "",
        date_login: new Date().toISOString(),
        date_expire:
          data.expire_date ??
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        finalized: false,
        invoice_auto: false,
        email_auto: false,
      },
    });

    return redirect("/ges-config");
  } catch (error) {
    console.error("Erro ao ligar à API:", error.message);
    return json(
      { error: "Erro ao ligar à API: " + error.message },
      { status: 500 },
    );
  }
}

export default function GesLoginPage() {
  return (
    <Layout>
      <div className="container d-flex justify-content-center align-items-center min-vh-100">
        <div className="col-md-6 col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <h1 className="display-6 fw-bold mb-3">
                Iniciar Sessão GESFaturacao
              </h1>
              <p className="text-muted mb-4">
                Acesse a sua conta para gerir as suas faturas
              </p>
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
