import {
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "@remix-run/react";
import { redirect, json } from "@remix-run/node";
import prisma from "../../prisma/client"; // Ensure this path is correct
import Layout from "../components/Layout";
import LoginForm from "../components/LoginForm";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);

    if (url.searchParams.get("logout") === "true") {
      await prisma.GESlogin.deleteMany({});
      return json({ isAuthenticated: false, logout: true });
    }

    if (url.searchParams.get("check") === "true") {
      const login = await prisma.GESlogin.findFirst({
        orderBy: { date_login: "desc" },
      });

      const isAuthenticated =
        login && login.date_expire && new Date(login.date_expire) > new Date();

      return json({ loggedIn: isAuthenticated });
    }

    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });

    const isAuthenticated =
      login && login.date_expire && new Date(login.date_expire) > new Date();

    return json({ isAuthenticated });
  } catch (error) {
    return json(
      { error: "Erro ao carregar a página de login", isAuthenticated: false },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  try {
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

    try {
      new URL(dom_licenca);
    } catch {
      return json(
        { error: "Domínio da API inválido. Por favor, insira um URL válido." },
        { status: 400 },
      );
    }

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
      let errorText;
      try {
        errorText = await res.text();
        const errorData = JSON.parse(errorText || "{}");
        const errorMessage =
          errorData.errors?.[0]?.message ||
          errorData.message ||
          errorData.error ||
          res.statusText ||
          "Erro desconhecido";
        return json(
          {
            error:
              errorMessage.includes("password") ||
              errorMessage.includes("username")
                ? "Credenciais inválidas. Por favor, verifique o nome de utilizador, palavra-passe ou domínio da API e tente novamente."
                : `Erro na autenticação: ${errorMessage}`,
          },
          { status: res.status },
        );
      } catch {
        return json(
          { error: "Erro ao processar a resposta da API: resposta inválida" },
          { status: res.status },
        );
      }
    }

    const data = await res.json();
    const token = data._token;
    if (!token) {
      return json(
        { error: "Token não retornado pela API. Verifique as credenciais." },
        { status: 400 },
      );
    }

    await prisma.GESlogin.deleteMany({ where: { dom_licenca } });
    await prisma.GESlogin.create({
      data: {
        dom_licenca,
        token,
        id_serie: data.id_serie ?? "",
        id_product_shipping: data.id_product_shipping ?? "",
        id_bank: data.id_bank ?? "",
        id_payment_method: data.id_payment_method ?? "",
        date_login: new Date().toISOString(),
        date_expire:
          data.expire_date ??
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        finalized: true,
        email_auto: true,
      },
    });

    return redirect("/ges-config");
  } catch (error) {
    return json(
      { error: "Erro ao ligar à API. Por favor, tente novamente." },
      { status: 500 },
    );
  }
}

export default function LoginPage() {
  const { isAuthenticated, error, logout } = useLoaderData();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hasShownLogoutToast, setHasShownLogoutToast] = useState(false);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    if (logout && !hasShownLogoutToast) {
      toast.success("Sessão terminada com sucesso!", {
        duration: 3000,
      });
      setHasShownLogoutToast(true);
      setSearchParams({}, { replace: true });
    }
    if (error) {
      toast.error("Erro ao carregar a página de login", {
        description: error,
        duration: 5000,
      });
    }
  }, [logout, error, searchParams, hasShownLogoutToast, setSearchParams]);

  useEffect(() => {
    if (!logout && searchParams.get("logout") !== "true") {
      setHasShownLogoutToast(false);
    }
  }, [logout, searchParams]);

  useEffect(() => {
    if (isAuthenticated && !logout) {
      revalidator.revalidate();
      toast.success("Sessão ativa! Redirecionando para encomendas...", {
        duration: 2000,
      });
      setTimeout(() => {
        window.location.href = "/ges-orders";
      }, 2000);
    }
  }, [isAuthenticated, logout, revalidator]);

  return (
    <Layout>
      <div className="container mt-4">
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center p-3">
                <h1 className="display-6 fw-bold mb-5">
                  Login API GESFaturação
                </h1>
                <LoginForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
