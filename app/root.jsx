import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import Navbar from "./components/Navbar";
import "bootstrap/dist/css/bootstrap.min.css";
import { json } from "@remix-run/node";
import { prisma } from "./prisma/client.js";
import { useEffect } from "react";

export async function loader() {
  try {
    const login = await prisma.gESlogin.findFirst({
      orderBy: { date_login: "desc" },
      select: { token: true, date_expire: true },
    });
    const isAuthenticated =
      login &&
      login.token &&
      login.date_expire &&
      new Date(login.date_expire) > new Date();
    return json({ isAuthenticated });
  } catch (error) {
    console.error("[Root Loader] Error:", error.message);
    return json({ isAuthenticated: false });
  }
}

export default function App() {
  const { isAuthenticated } = useLoaderData();

  return (
    <html lang="pt-PT">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Navbar isAuthenticated={isAuthenticated} />
        <div className="container mt-5 pt-5">
          <Outlet />
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    console.error("[Root ErrorBoundary] Error occurred:", {
      message: error?.message,
      status: error?.status,
      statusText: error?.statusText,
      stack: error?.stack,
      data: error?.data,
    });
  }, [error]);

  return (
    <html lang="pt-PT">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Navbar isAuthenticated={false} />
        <div className="container mt-5 pt-5">
          <div className="alert alert-danger">
            <h1>Erro</h1>
            <p>
              {error?.message || "Algo correu mal. Tente novamente mais tarde."}
            </p>
            {error?.status && (
              <p>
                <strong>Status:</strong> {error.status}{" "}
                {error.statusText && `(${error.statusText})`}
              </p>
            )}
            {error?.data && (
              <p>
                <strong>Detalhes:</strong> {JSON.stringify(error.data)}
              </p>
            )}
          </div>
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
