import { useLoaderData, useSearchParams, useFetcher } from "@remix-run/react";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import Layout from "./Layout";

export default function OrdersTable() {
  const { orders: initialOrders, error } = useLoaderData();
  const [orders, setOrders] = useState(initialOrders);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [showDevelopmentMessage, setShowDevelopmentMessage] = useState(false);
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const fetcher = useFetcher();
  const prevFetcherDataRef = useRef(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (fetcher.state === "idle") {
      setIsProcessing(false);
    }

    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      fetcher.data !== prevFetcherDataRef.current
    ) {
      prevFetcherDataRef.current = fetcher.data;
      const {
        orderId,
        orderNumber,
        error,
        success,
        invoiceFile,
        invoiceNumber,
        actionType,
      } = fetcher.data;

      if (error) {
        let errorMessage = `Erro ao ${
          actionType === "downloadInvoice"
            ? "baixar"
            : actionType === "sendEmail"
              ? "enviar email"
              : "gerar"
        } fatura para o pedido ${orderNumber}: ${error}`;

        if (isClient) {
          toast.error(errorMessage, { duration: 5000 });
          setMessage(errorMessage);
          setShowDevelopmentMessage(true);
          setTimeout(() => setShowDevelopmentMessage(false), 5000);
        }
        return;
      }

      if (success && actionType === "sendEmail") {
        if (isClient) {
          toast.success(
            `Email enviado com sucesso para o pedido ${orderNumber}!`,
            { duration: 3000 },
          );
        }
      }

      if (
        success &&
        (actionType === "generateInvoice" || actionType === "downloadInvoice")
      ) {
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order.id === orderId ? { ...order, invoiceNumber } : order,
          ),
        );

        if (isClient && invoiceFile) {
          try {
            const { contentType, data, filename } = invoiceFile;
            if (!data || typeof data !== "string") {
              throw new Error("Invalid or missing Base64 data in invoiceFile");
            }

            const byteCharacters = atob(data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: contentType });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success(
              `Fatura ${invoiceNumber} ${
                actionType === "downloadInvoice" ? "baixada" : "gerada"
              } com sucesso para o pedido ${orderNumber}!`,
              { duration: 3000 },
            );
          } catch (err) {
            toast.error(
              `Falha ao carregar o documento PDF para o pedido ${orderNumber}.`,
              { duration: 5000 },
            );
            setMessage(
              `Falha ao carregar o documento PDF para o pedido ${orderNumber}.`,
            );
            setShowDevelopmentMessage(true);
            setTimeout(() => setShowDevelopmentMessage(false), 5000);
          }
        } else if (isClient && actionType === "generateInvoice") {
          toast.success(
            `Fatura ${invoiceNumber} gerada com sucesso para o pedido ${orderNumber}!`,
            { duration: 3000 },
          );
          setMessage(
            `Fatura ${invoiceNumber} gerada com sucesso para o pedido ${orderNumber}!`,
          );
          setShowDevelopmentMessage(true);
          setTimeout(() => setShowDevelopmentMessage(false), 3000);
        }
      }
    }
  }, [fetcher.data, fetcher.state, isClient]);

  const handleShowDetails = (order) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setSelectedOrder(order);
    setShowModal(true);
    setTimeout(() => setIsProcessing(false), 500);
  };

  const handleSendEmail = (orderId, orderNumber, customerEmail) => {
    if (!isClient || isProcessing) return;
    setIsProcessing(true);

    const order = orders.find((o) => o.id === orderId);
    if (!order || !order.invoiceNumber || order.invoiceNumber === "N/A") {
      toast.error(`Fatura não encontrada para o pedido ${orderNumber}.`, {
        duration: 3000,
      });
      setMessage(`Fatura não encontrada para o pedido ${orderNumber}.`);
      setShowDevelopmentMessage(true);
      setTimeout(() => setShowDevelopmentMessage(false), 3000);
      setIsProcessing(false);
      return;
    }

    if (customerEmail === "N/A") {
      toast.error(`Email não disponível para o pedido ${orderNumber}.`, {
        duration: 3000,
      });
      setMessage(`Email não disponível para o pedido ${orderNumber}.`);
      setShowDevelopmentMessage(true);
      setTimeout(() => setShowDevelopmentMessage(false), 3000);
      setIsProcessing(false);
      return;
    }

    const formData = new FormData();
    formData.append("actionType", "sendEmail");
    formData.append("orderId", orderId);
    formData.append("orderNumber", orderNumber);
    formData.append("customerEmail", customerEmail);
    formData.append("invoiceNumber", order.invoiceNumber);

    fetcher.submit(formData, { method: "post", action: "/ges-orders" });
  };

  const handleGenerateInvoice = (orderId, orderNumber, isDownload = false) => {
    if (!isClient || isProcessing) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      toast.error(`Erro: Pedido ${orderNumber} não encontrado`, {
        duration: 3000,
      });
      setMessage(`Erro: Pedido ${orderNumber} não encontrado`);
      setShowDevelopmentMessage(true);
      setTimeout(() => setShowDevelopmentMessage(false), 3000);
      return;
    }
    setIsProcessing(true);
    toast.info(
      `${isDownload ? "Baixando" : "Gerando"} fatura para o pedido ${orderNumber}...`,
      { duration: 2000 },
    );

    const formData = new FormData();
    formData.append(
      "actionType",
      isDownload ? "downloadInvoice" : "generateInvoice",
    );
    formData.append("order", JSON.stringify(order));

    fetcher.submit(formData, { method: "post", action: "/ges-orders" });
  };

  const translateStatus = (status) => (status === "PAID" ? "Pago" : status);

  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 10;

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const lowerTerm = searchTerm.toLowerCase();
    return orders.filter((order) => {
      return (
        order.orderNumber.toLowerCase().includes(lowerTerm) ||
        order.customerName.toLowerCase().includes(lowerTerm) ||
        new Date(order.orderDate)
          .toLocaleString("pt-PT")
          .toLowerCase()
          .includes(lowerTerm) ||
        order.totalValue.toFixed(2).includes(lowerTerm) ||
        (order.invoiceNumber || "").toLowerCase().includes(lowerTerm) ||
        order.shippingAddress?.city?.toLowerCase().includes(lowerTerm) ||
        order.billingAddress?.city?.toLowerCase().includes(lowerTerm)
      );
    });
  }, [orders, searchTerm]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize);

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

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

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setSearchParams({ page: page.toString() });
    }
  };

  return (
    <Layout>
      <div className="container py-5">
        <h1 className="display-6 fw-bold mb-4">Painel de Ordens Pagas</h1>
        <p className="text-muted mb-4">
          Lista de ordens pagas diretamente do Shopify
        </p>

        {error && <div className="alert alert-danger">{error}</div>}
        {showDevelopmentMessage && (
          <div
            className={`alert ${fetcher.data?.success ? "alert-success" : "alert-danger"}`}
          >
            {message}
          </div>
        )}

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
                      <td>
                        {order.invoiceNumber &&
                        order.invoiceNumber !== "N/A" ? (
                          <button
                            className="btn p-0 text-decoration-underline invoice-link"
                            title="Download da Fatura"
                            onClick={() =>
                              handleGenerateInvoice(
                                order.id,
                                order.orderNumber,
                                true,
                              )
                            }
                            disabled={isProcessing}
                          >
                            {order.invoiceNumber}
                          </button>
                        ) : (
                          "-----"
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-info me-2"
                          title="Detalhe Ordem"
                          onClick={() => handleShowDetails(order)}
                          disabled={isProcessing}
                        >
                          <img
                            src="/icons/magnifying-glass.png"
                            alt="Detalhe Ordem"
                            style={{
                              width: "22px",
                              height: "22px",
                              filter: isProcessing ? "grayscale(100%)" : "none",
                            }}
                          />
                        </button>
                        {order.invoiceNumber &&
                        order.invoiceNumber !== "N/A" ? (
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
                            disabled={isProcessing}
                          >
                            <img
                              src="/icons/mail.png"
                              alt="Enviar Email"
                              style={{
                                width: "22px",
                                height: "22px",
                                filter: isProcessing
                                  ? "grayscale(100%)"
                                  : "none",
                              }}
                            />
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            title="Gerar Fatura"
                            onClick={() =>
                              handleGenerateInvoice(order.id, order.orderNumber)
                            }
                            disabled={isProcessing}
                          >
                            <img
                              src="/icons/invoice.png"
                              alt="Gerar Fatura"
                              style={{
                                width: "22px",
                                height: "22px",
                                filter: isProcessing
                                  ? "grayscale(100%)"
                                  : "none",
                              }}
                            />
                          </button>
                        )}
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

        {isClient && selectedOrder && (
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
                          {selectedOrder.invoiceNumber || "-----"}
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
                              <th>Preço c/Iva</th>
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

      <style>{`
        .invoice-link:disabled {
          color: #6c757d;
          cursor: not-allowed;
          text-decoration: none;
        }
        .btn-outline-info:disabled,
        .btn-outline-secondary:disabled,
        .btn-outline-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </Layout>
  );
}
