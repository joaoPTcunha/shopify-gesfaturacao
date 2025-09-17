import { useLoaderData } from "@remix-run/react";
import Layout from "./Layout"; // Ajuste o caminho conforme sua estrutura

export default function OrdersTable() {
  const { orders, error } = useLoaderData();

  return (
    <Layout>
      <div className="container py-5">
        <h1 className="display-6 fw-bold mb-4">Painel de Ordens Pagas</h1>
        <p className="text-muted mb-4">
          Lista de ordens pagas diretamente do Shopify
        </p>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="card border-0 shadow-sm">
          <div className="card-body table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>N.º Encomenda</th>
                  <th>ID do Cliente</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>N.º Fatura</th>
                </tr>
              </thead>
              <tbody>
                {orders.length > 0 ? (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNumber}</td>
                      <td>{order.customerId}</td>
                      <td>
                        {new Date(order.orderDate).toLocaleString("pt-PT")}
                      </td>
                      <td>
                        {order.totalValue.toFixed(2)} {order.currency}
                      </td>
                      <td>{order.status}</td>
                      <td>{order.invoiceNumber}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center">
                      Nenhuma ordem paga encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
