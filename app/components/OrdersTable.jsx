import { useLoaderData } from "@remix-run/react";
import Layout from "./Layout";

export default function OrdersTable() {
  const { orders, gesOrders, error } = useLoaderData();

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
                    <th scope="col">Email</th>
                    <th scope="col">Telefone</th>
                    <th scope="col">Data</th>
                    <th scope="col">Valor</th>
                    <th scope="col">Estado</th>
                    <th scope="col">N.º Fatura</th>
                    <th scope="col">Itens</th>
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
                          <td>{order.email || "N/A"}</td>
                          <td>{order.customer?.phone || "N/A"}</td>
                          <td>
                            {new Date(order.orderDate).toLocaleDateString(
                              "pt-PT",
                            )}
                          </td>
                          <td>{order.totalValue.toFixed(2)} €</td>
                          <td>{order.status}</td>
                          <td>{order.invoiceNumber || "N/A"}</td>
                          <td>
                            {order.items && order.items.length > 0 ? (
                              <ul>
                                {order.items.map((item, index) => (
                                  <li key={index}>
                                    {item.title} (Qtd: {item.quantity},{" "}
                                    {item.unitPrice.toFixed(2)} €)
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              "N/A"
                            )}
                          </td>
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
                      <td colSpan={10} className="text-center">
                        Nenhuma ordem paga encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {gesOrders && (
          <div className="mt-5">
            <h2>Encomendas GesFaturacao</h2>
            <ul>
              {gesOrders.map((order) => (
                <li key={order.id}>
                  Encomenda {order.name || order.id} - {order.status || "N/A"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Layout>
  );
}
