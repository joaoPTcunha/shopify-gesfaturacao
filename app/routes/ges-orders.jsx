import pkg from "@remix-run/node";
const { json, redirect } = pkg;
import { useLoaderData } from "@remix-run/react";
import prisma from "../../prisma/client";
import Layout from "../components/Layout";

export async function loader({ request }) {
  try {
    // Verifica autenticação
    const login = await prisma.gesFaturacaoLogin.findFirst({
      orderBy: { date_login: "desc" },
    });
    if (!login || !login.token) {
      return redirect("/ges-login");
    }

    // Buscar ordens pagas do Prisma
    const orders = await prisma.order.findMany({
      where: { status: "Paga" },
      orderBy: { orderDate: "desc" },
    });

    return json({ orders });
  } catch (error) {
    console.error("Erro ao carregar ordens:", error);
    return json({ error: "Erro ao carregar ordens" }, { status: 500 });
  }
}

export default function GesOrdersPage() {
  const { orders, error } = useLoaderData();

  return (
    <Layout>
      <div className="container py-5">
        <h1 className="display-6 fw-bold mb-4">Painel de Ordens Pagas</h1>
        <p className="text-muted mb-4">
          Lista de ordens pagas registadas no sistema
        </p>

        {error && (
          <div
            className="alert alert-danger d-flex align-items-center"
            role="alert"
          >
            <i className="bi bi-exclamation-circle-fill me-2"></i>
            {error}
          </div>
        )}

        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th scope="col">N.º Encomenda</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Data</th>
                    <th scope="col">Valor</th>
                    <th scope="col">Estado</th>
                    <th scope="col">N.º Fatura</th>
                    <th scope="col">Opções</th>
                  </tr>
                </thead>
                <tbody>
                  {orders && orders.length > 0 ? (
                    orders.map((order) => {
                      const orderLink = `/ordem/${order.orderNumber}`;
                      return (
                        <tr key={order.id}>
                          <td>{order.orderNumber}</td>
                          <td>{order.customerName}</td>
                          <td>
                            {new Date(order.orderDate).toLocaleDateString(
                              "pt-PT",
                            )}
                          </td>
                          <td>{order.totalValue.toFixed(2)} €</td>
                          <td>{order.status}</td>
                          <td>{order.invoiceNumber || "N/A"}</td>
                          <td>
                            <div className="btn-group" role="group">
                              <a
                                href={orderLink}
                                className="btn btn-outline-primary btn-sm"
                                title="Detalhe da Ordem"
                              >
                                <i className="bi bi-eye"></i>
                              </a>
                              <button
                                className="btn btn-outline-secondary btn-sm"
                                title="Enviar Email"
                                onClick={() =>
                                  alert(
                                    "Função de envio de email não implementada",
                                  )
                                }
                              >
                                <i className="bi bi-envelope"></i>
                              </button>
                              <button
                                className="btn btn-outline-success btn-sm"
                                title="Descarregar Fatura"
                                onClick={() =>
                                  alert(
                                    "Função de download de fatura não implementada",
                                  )
                                }
                              >
                                <i className="bi bi-download"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center">
                        Nenhuma ordem paga encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
