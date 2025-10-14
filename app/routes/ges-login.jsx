import {
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "@remix-run/react";
import { redirect, json } from "@remix-run/node";
import prisma from "../../prisma/client";
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
    console.error("Erro no loader:", error.message);
    return json(
      { error: error.message, isAuthenticated: false },
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

    await prisma.GESlogin.deleteMany({ where: { dom_licenca } });
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
        finalized: true,
        email_auto: true,
      },
    });

    return redirect("/ges-config", {});
  } catch (error) {
    console.error("Erro ao ligar à API:", error.message);
    return json(
      { error: "Erro ao ligar à API: " + error.message },
      { status: 500 },
    );
  }
}

export default function GesLoginPage() {
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
    }
  }, [isAuthenticated, logout, revalidator]);

  return (
    <Layout>
      <div className="container d-flex justify-content-center align-items-center min-vh-100">
        <div className="col-md-6 col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <h1 className="display-6 fw-bold mb-3">Login API GESFaturação</h1>
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
