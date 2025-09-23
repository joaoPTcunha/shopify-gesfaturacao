import { useLoaderData, useSearchParams, useFetcher } from "@remix-run/react";
import { useState, useMemo, useEffect } from "react";
import Layout from "./Layout";

export default function OrdersTable() {
  const { orders: allOrders, error } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const fetcher = useFetcher();

  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 10;

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return allOrders;
    const lowerTerm = searchTerm.toLowerCase();
    return allOrders.filter((order) => {
      return (
        order.orderNumber.toLowerCase().includes(lowerTerm) ||
        order.customerName.toLowerCase().includes(lowerTerm) ||
        new Date(order.orderDate)
          .toLocaleString("pt-PT")
          .toLowerCase()
          .includes(lowerTerm) ||
        order.totalValue.toFixed(2).includes(lowerTerm) ||
        order.invoiceNumber.toLowerCase().includes(lowerTerm) ||
        order.shippingAddress?.city?.toLowerCase().includes(lowerTerm) ||
        order.billingAddress?.city?.toLowerCase().includes(lowerTerm)
      );
    });
  }, [allOrders, searchTerm]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize);

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleShowDetails = (order) => {
    setSelectedOrder(order);
    setShowModal(true);
  };

  const handleSendEmail = (orderId, orderNumber, customerEmail) => {
    alert(
      customerEmail !== "N/A"
        ? `Email para o pedido ${orderNumber} será enviado para ${customerEmail} (funcionalidade em desenvolvimento).`
        : `Email para o pedido ${orderNumber} não pode ser enviado (email do cliente não disponível).`,
    );
  };

  const handleGenerateInvoice = (orderId, orderNumber) => {
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) {
      console.error(`[OrdersTable] Order not found for ID: ${orderId}`);
      alert(`Erro: Pedido ${orderNumber} não encontrado`);
      return;
    }

    console.log(
      `[OrdersTable] Tentativa de verificar cliente em GESfaturacao para o pedido ${orderNumber} (ID: ${orderId})`,
    );
    console.log(
      `[OrdersTable] Order data to send:`,
      JSON.stringify(order, null, 2),
    );

    const formData = new FormData();
    formData.append("order", JSON.stringify(order));
    console.log(`[OrdersTable] FormData order value:`, formData.get("order"));

    fetcher.submit(formData, { method: "post", action: "/ges-orders" });
  };

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const {
        orderId = "unknown",
        orderNumber = "unknown",
        error,
        clientId,
        found,
        status,
      } = fetcher.data;
      console.log(
        `[OrdersTable] Fetcher data for order ${orderNumber} (ID: ${orderId}):`,
        JSON.stringify(fetcher.data, null, 2),
      );
      if (error) {
        console.error(
          `[OrdersTable] Error checking/creating client for order ${orderNumber} (ID: ${orderId}):`,
          error,
        );
        alert(
          `Erro ao verificar/criar cliente do pedido ${orderNumber}: ${error}`,
        );
      } else {
        console.log(
          `[OrdersTable] Client check for order ${orderNumber} (ID: ${orderId}): ${found ? `${status === "created" ? "Created" : "Found"}, clientId=${clientId}` : "Not found"}`,
        );
        alert(
          found
            ? status === "created"
              ? `Cliente do pedido ${orderNumber} criado com sucesso (ID: ${clientId})!`
              : `Cliente do pedido ${orderNumber} encontrado com sucesso (ID: ${clientId})!`
            : `Cliente do pedido ${orderNumber} não encontrado em GESfaturacao.`,
        );
      }
    }
  }, [fetcher.data, fetcher.state]);
  const translateStatus = (status) => (status === "PAID" ? "Pago" : status);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setSearchParams({ page: page.toString() });
    }
  };

  const generatePagination = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    pages.push(
      <li
        key="prev"
        className={`page-item ${currentPage === 1 ? "disabled" : ""}`}
      >
        <button
          className="page-link"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          Anterior
        </button>
      </li>,
    );

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <li
          key={i}
          className={`page-item ${i === currentPage ? "active" : ""}`}
        >
          <button className="page-link" onClick={() => goToPage(i)}>
            {i}
          </button>
        </li>,
      );
    }

    pages.push(
      <li
        key="next"
        className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}
      >
        <button
          className="page-link"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Próximo
        </button>
      </li>,
    );

    return pages;
  };

  const calculateOrderSummary = (lineItems) => {
    const totalItems = lineItems.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    );
    const subtotal = lineItems.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
      0,
    );
    return { totalItems, subtotal };
  };

  const formatAddress = (address) => {
    if (!address) return "N/A";
    const parts = [
      address.address1,
      address.address2,
      address.city,
      address.province,
      address.zip,
      address.country,
      address.phone ? `Tel: ${address.phone}` : "",
    ].filter(Boolean);
    return parts.join(", ") || "N/A";
  };

  return (
    <Layout>
      <div className="container py-5">
        <h1 className="display-6 fw-bold mb-4">Painel de Ordens Pagas</h1>
        <p className="text-muted mb-4">
          Lista de ordens pagas diretamente do Shopify
        </p>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="mb-4">
          <input
            type="text"
            className="form-control"
            placeholder="Pesquisar por N.º Encomenda, Cliente, Data, Valor com IVA, N.º Fatura ou Cidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="card border-0 shadow-sm">
          <div className="card-body table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>N.º Encomenda</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Valor com IVA</th>
                  <th>Estado</th>
                  <th>N.º Fatura</th>
                  <th>Opções</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.length > 0 ? (
                  paginatedOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNumber}</td>
                      <td>
                        {order.customerName}{" "}
                        {order.customerName === "N/A" && (
                          <span className="text-muted">
                            (Sem cliente registrado)
                          </span>
                        )}
                      </td>
                      <td>
                        {new Date(order.orderDate).toLocaleString("pt-PT")}
                      </td>
                      <td>{order.totalValue.toFixed(2)}</td>
                      <td>{translateStatus(order.status)}</td>
                      <td>{order.invoiceNumber || "N/A"}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-info me-2"
                          title="Detalhe Ordem"
                          onClick={() => handleShowDetails(order)}
                        >
                          <img
                            src="/icons/magnifying-glass.png"
                            alt="Detalhe Ordem"
                            style={{ width: "22px", height: "22px" }}
                          />
                        </button>
                        {order.invoiceNumber && (
                          <button
                            className="btn btn-sm btn-outline-secondary me-2"
                            title="Enviar Email"
                            onClick={() =>
                              handleSendEmail(
                                order.id,
                                order.orderNumber,
                                order.customerEmail,
                              )
                            }
                          >
                            <img
                              src="/icons/mail.png"
                              alt="Enviar Email"
                              style={{ width: "22px", height: "22px" }}
                            />
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title="Verificar Cliente"
                          onClick={() =>
                            handleGenerateInvoice(order.id, order.orderNumber)
                          }
                          disabled={fetcher.state !== "idle"}
                        >
                          <img
                            src="/icons/invoice.png"
                            alt="Verificar Cliente"
                            style={{ width: "22px", height: "22px" }}
                          />
                        </button>
                      </td>
                    </tr>
                  ))
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

        {totalPages > 1 && (
          <nav aria-label="Paginação de pedidos">
            <ul className="pagination justify-content-center mt-4">
              {generatePagination()}
            </ul>
          </nav>
        )}

        {selectedOrder && (
          <div
            className={`modal fade ${showModal ? "show d-block" : ""}`}
            tabIndex="-1"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Detalhes do Pedido {selectedOrder.orderNumber}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowModal(false)}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="card mb-3 shadow-sm">
                    <div className="card-header bg-light">
                      <strong>Informações do Cliente</strong>
                    </div>
                    <div className="card-body">
                      <p>
                        <strong>Nome:</strong>{" "}
                        {selectedOrder.customerName || "N/A"}
                      </p>
                      <p>
                        <strong>Email:</strong>{" "}
                        {selectedOrder.customerEmail || "N/A"}
                      </p>
                      <p>
                        <strong>NIF / VAT:</strong>{" "}
                        {selectedOrder.customerMetafields?.find(
                          (m) => m.node.key === "vat_number",
                        )?.node.value || "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="card mb-3 shadow-sm">
                    <div className="card-header bg-light">
                      <strong>Informações do Pedido</strong>
                    </div>
                    <div className="card-body row">
                      <div className="col-md-6 mb-2">
                        <p>
                          <strong>N.º Encomenda:</strong>{" "}
                          {selectedOrder.orderNumber}
                        </p>
                        <p>
                          <strong>Data:</strong>{" "}
                          {new Date(selectedOrder.orderDate).toLocaleString(
                            "pt-PT",
                          )}
                        </p>
                        <p>
                          <strong>Valor Total:</strong>{" "}
                          {selectedOrder.totalValue.toFixed(2)}{" "}
                          {selectedOrder.currency}
                        </p>
                        <p>
                          <strong>Estado:</strong>{" "}
                          {translateStatus(selectedOrder.status)}
                        </p>
                      </div>
                      <div className="col-md-6 mb-2">
                        <p>
                          <strong>N.º Fatura:</strong>{" "}
                          {selectedOrder.invoiceNumber || "N/A"}
                        </p>
                        <p>
                          <strong>Total de Itens:</strong>{" "}
                          {
                            calculateOrderSummary(selectedOrder.lineItems)
                              .totalItems
                          }
                        </p>
                        <p>
                          <strong>Subtotal:</strong>{" "}
                          {calculateOrderSummary(
                            selectedOrder.lineItems,
                          ).subtotal.toFixed(2)}{" "}
                          {selectedOrder.currency}
                        </p>
                        <p>
                          <strong>Método de Pagamento:</strong>{" "}
                          {selectedOrder.paymentGatewayNames?.join(", ") ||
                            "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card mb-3 shadow-sm">
                    <div className="card-header bg-light">
                      <strong>Endereço & Envio</strong>
                    </div>
                    <div className="card-body row">
                      <div className="col-md-6 mb-2">
                        <p>
                          <strong>Endereço de Envio:</strong>{" "}
                          {formatAddress(selectedOrder.shippingAddress)}
                        </p>
                        <p>
                          <strong>Método de Envio:</strong>{" "}
                          {selectedOrder.shippingLine?.title || "N/A"}
                        </p>
                        <p>
                          <strong>Custo de Envio:</strong>{" "}
                          {selectedOrder.shippingLine?.price?.toFixed(2) ||
                            "N/A"}{" "}
                          {selectedOrder.currency}
                        </p>
                      </div>
                      <div className="col-md-6 mb-2">
                        <p>
                          <strong>Endereço de Faturamento:</strong>{" "}
                          {formatAddress(selectedOrder.billingAddress)}
                        </p>
                        <p>
                          <strong>Status da Entrega:</strong>{" "}
                          {selectedOrder.fulfillmentStatus || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card mb-3 shadow-sm">
                    <div className="card-header bg-light">
                      <strong>Itens do Pedido</strong>
                    </div>
                    <div className="card-body table-responsive">
                      {selectedOrder.lineItems?.length > 0 ? (
                        <table className="table table-bordered table-sm">
                          <thead className="table-light">
                            <tr>
                              <th>Produto</th>
                              <th>Quantidade</th>
                              <th>Preço Unitário</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedOrder.lineItems.map((item, index) => {
                              const quantity = item.quantity || 0;
                              const unitPrice = item.unitPrice || 0;
                              return (
                                <tr key={index}>
                                  <td>{item.title || "N/A"}</td>
                                  <td>{quantity}</td>
                                  <td>
                                    {unitPrice.toFixed(2)}{" "}
                                    {selectedOrder.currency}
                                  </td>
                                  <td>
                                    {(quantity * unitPrice).toFixed(2)}{" "}
                                    {selectedOrder.currency}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <p>Nenhum item encontrado.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowModal(false)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
