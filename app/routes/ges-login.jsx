import pkg from "@remix-run/node";
const { json, redirect } = pkg;
import prisma from "../../prisma/client";
import Layout from "../components/Layout";
import LoginForm from "../components/LoginForm";

export async function action({ request }) {
  const formData = await request.formData();
  let dom_licenca = formData.get("dom_licenca")?.trim();
  const username = formData.get("username")?.trim();
  const password = formData.get("password");

  if (!dom_licenca || !username || !password) {
    return json({ error: "Todos os campos são obrigatórios" }, { status: 400 });
  }

  // Valida se dom_licenca é uma URL válida
  try {
    new URL(dom_licenca);
  } catch {
    return json({ error: "Domínio da API inválido" }, { status: 400 });
  }

  // Garante que dom_licenca termina com /api/v1.0.4
  if (!dom_licenca.endsWith("/api/v1.0.4")) {
    dom_licenca = dom_licenca.replace(/\/+$/, "") + "/api/v1.0.4";
  }

  try {
    // Chama a API GesFaturacao
    const res = await fetch(`${dom_licenca}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    console.log("Resposta da API:", data); // Debug

    // Valida a presença do token
    const token = data._token;
    if (!token) {
      return json(
        { error: "Token não retornado pela API. Verifique a resposta da API." },
        { status: 400 },
      );
    }

    // Salva no Prisma
    await prisma.gesFaturacaoLogin.create({
      data: {
        dom_licenca,
        token,
        id_serie: data.id_serie ?? "",
        id_product_shipping: data.id_product_shipping ?? "",
        date_login: new Date().toISOString(),
        date_expire: data.expire_date ?? "",
      },
    });

    return redirect("/ges-orders");
  } catch (error) {
    console.error("Erro ao ligar à API:", error);
    return json(
      { error: "Erro ao ligar à API: " + error.message },
      { status: 500 },
    );
  }
}

export default function GesFaturacaoLoginPage() {
  return (
    <Layout>
      <div className="container d-flex justify-content-center align-items-center min-vh-100">
        <div className="col-md-6 col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <h1 className="display-6 fw-bold mb-3">
                Iniciar Sessão GesFaturacao
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
