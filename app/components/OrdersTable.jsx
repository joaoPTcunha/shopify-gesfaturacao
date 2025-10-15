import { useLoaderData, useSearchParams, useFetcher } from "@remix-run/react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import Layout from "./Layout";

export default function OrdersTable({ isAuthenticated }) {
  const { orders: initialOrders, error } = useLoaderData();
  const [orders, setOrders] = useState(initialOrders);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fetcher = useFetcher();
  const [pageSize, setPageSize] = useState(
    parseInt(searchParams.get("pageSize")) || 10,
  );
  const [orderErrors, setOrderErrors] = useState({});

  // Function to check if an error is session-related
  const isSessionError = (errorMessage) => {
    const sessionErrors = [
      "Nenhuma sessão GES ativa encontrada",
      "Sessão GES expirada",
      "Login ou configurações do GESFaturação em falta",
    ];
    return sessionErrors.some((err) => errorMessage.includes(err));
  };

  useEffect(() => {
    setIsClient(true);

    if (fetcher.state === "idle") {
      setIsProcessing(false);
    }

    if (fetcher.state === "idle" && fetcher.data) {
      const {
        orderId,
        orderNumber,
        error,
        success,
        invoiceFile,
        invoiceNumber,
        actionType,
        emailSent,
        isFinalized,
      } = fetcher.data;

      if (success && actionType === "sendEmail" && isClient) {
        toast.success(`Email enviado com sucesso!`, {
          description: `Fatura: ${invoiceNumber}, Encomenda: ${orderNumber}`,
          duration: 3000,
        });
      }

      if (error && actionType === "sendEmail" && isClient) {
        toast.error(error, { duration: 3000 });
      }

      if (error && actionType === "generateInvoice" && isClient) {
        toast.error(error, { duration: 5000 });
      }

      if (error && actionType === "downloadInvoice" && isClient) {
        // Only store non-session-related errors in orderErrors
        if (!isSessionError(error)) {
          setOrderErrors((prev) => ({
            ...prev,
            [orderId]: error,
          }));
        }
        toast.error(error, {
          description: `Encomenda: ${orderNumber}`,
          duration: 5000,
        });
      }

      if (success && actionType === "downloadInvoice") {
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order.id === orderId ? { ...order, invoiceNumber } : order,
          ),
        );
        setOrderErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[orderId];
          return newErrors;
        });

        if (isClient && invoiceFile) {
          try {
            const { contentType, data, filename } = invoiceFile;
            if (!data || typeof data !== "string")
              throw new Error("Invalid Base64 data");

            toast.success("Download da fatura iniciado!", {
              description: `Fatura: ${invoiceNumber}, Encomenda: ${orderNumber}`,
              duration: 3000,
            });

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
          } catch (err) {
            console.error("[OrdersTable] Download error:", err);
            setOrderErrors((prev) => ({
              ...prev,
              [orderId]: `Falha ao carregar o documento PDF: ${err.message}`,
            }));
            toast.error(
              `Falha ao carregar o documento PDF para o pedido ${orderNumber}.`,
              {
                description: `Erro: ${err.message}`,
                duration: 5000,
              },
            );
          }
        } else if (isClient) {
          console.error(
            "[OrdersTable] No invoiceFile in downloadInvoice response:",
            fetcher.data,
          );
          setOrderErrors((prev) => ({
            ...prev,
            [orderId]: "Nenhum arquivo de fatura retornado pelo servidor.",
          }));
          toast.error(
            `Falha ao baixar a fatura para o pedido ${orderNumber}.`,
            {
              description: "Nenhum arquivo de fatura retornado pelo servidor.",
              duration: 5000,
            },
          );
        }
      }

      if (success && actionType === "generateInvoice") {
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order.id === orderId ? { ...order, invoiceNumber } : order,
          ),
        );
        setOrderErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[orderId];
          return newErrors;
        });

        if (isClient) {
          if (emailSent) {
            toast.success("Fatura enviada por email com sucesso!", {
              description: `Fatura: ${invoiceNumber}, Encomenda: ${orderNumber}`,
              duration: 3000,
            });
          } else if (isFinalized) {
            toast.success(`Fatura gerada com sucesso!`, {
              description: `Fatura: ${invoiceNumber}, Encomenda: ${orderNumber}`,
              duration: 3000,
            });
          } else {
            toast.success(`Fatura rascunho gerada com sucesso!`, {
              description: `Encomenda: ${orderNumber}${
                invoiceFile ? ", download iniciado" : ""
              }`,
              duration: 3000,
            });

            if (invoiceFile) {
              try {
                const { contentType, data, filename } = invoiceFile;
                if (!data || typeof data !== "string")
                  throw new Error("Invalid Base64 data");

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
              } catch (err) {
                console.error("[OrdersTable] Download error:", err);
                setOrderErrors((prev) => ({
                  ...prev,
                  [orderId]: `Falha ao carregar o documento PDF: ${err.message}`,
                }));
                toast.error(
                  `Falha ao carregar o documento PDF para o pedido ${orderNumber}.`,
                  {
                    description: `Erro: ${err.message}`,
                    duration: 5000,
                  },
                );
              }
            }
          }
        }
      }
    }
  }, [fetcher.data, fetcher.state, isClient]);

  const handleShowDetails = (order) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const orderId = order.id.replace("gid://shopify/Order/", "");
    const shopifyUrl = `https://admin.shopify.com/store/gesfaturacao-dev-teste/orders/${orderId}`;
    window.open(shopifyUrl, "_blank");
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
      setIsProcessing(false);
      return;
    }

    if (customerEmail === "N/A") {
      toast.error(`Email não disponível para o pedido ${orderNumber}.`, {
        duration: 3000,
      });
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
      return;
    }
    setIsProcessing(true);

    const formData = new FormData();
    formData.append(
      "actionType",
      isDownload ? "downloadInvoice" : "generateInvoice",
    );
    formData.append("orderId", orderId);
    formData.append("orderNumber", orderNumber);
    formData.append("order", JSON.stringify(order));

    fetcher.submit(formData, { method: "post", action: "/ges-orders" });
  };

  const translateStatus = (status) =>
    status === "PAID" ? "Pagamento aceite" : status;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    }
  };

  const handlePageSizeChange = (event) => {
    const newPageSize = parseInt(event.target.value, 10);
    setPageSize(newPageSize);
    setSearchParams({ page: "1", pageSize: newPageSize.toString() });
  };

  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const lowerTerm = searchTerm.toLowerCase();
    return orders.filter((order) =>
      [
        order.orderNumber,
        order.customerName,
        formatDate(order.orderDate),
        order.totalValue.toFixed(2),
        order.invoiceNumber || "",
        order.shippingAddress?.city || "",
        order.billingAddress?.city || "",
      ].some((field) => field.toLowerCase().includes(lowerTerm)),
    );
  }, [orders, searchTerm]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize);

  const paginatedOrders = useMemo(
    () =>
      filteredOrders.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      ),
    [filteredOrders, currentPage, pageSize],
  );

  const generatePagination = () => {
    const pages = [];
    const maxVisiblePages = 3;
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

  return (
    <Layout isAuthenticated={isAuthenticated}>
      <div className="container py-3">
        <h1 className="display-6 fw-bold mb-3">Encomendas Pagas</h1>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="mb-3 d-flex flex-column flex-md-row align-items-md-center">
          <div className="me-md-2 mb-2 mb-md-0 flex-grow-1">
            <input
              type="text"
              id="search"
              name="search"
              className="form-control"
              placeholder="Pesquisar por Encomenda, Cliente, Data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="d-flex align-items-center">
            <label htmlFor="pageSize" className="me-2">
              Encomendas por página:
            </label>
            <select
              id="pageSize"
              name="pageSize"
              className="form-select"
              style={{ width: "80px" }}
              value={pageSize}
              onChange={handlePageSizeChange}
              autoComplete="off"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>

        {/* Desktop Table Layout */}
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>N.º Encomenda</th>
                <th>Cliente</th>
                <th>Data</th>
                <th>Valor</th>
                <th>Estado</th>
                <th>Fatura</th>
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
                        <span className="text-muted">(Sem cliente)</span>
                      )}
                    </td>
                    <td>{formatDate(order.orderDate)}</td>
                    <td>{order.totalValue.toFixed(2)} €</td>
                    <td>{translateStatus(order.status)}</td>
                    <td>
                      {orderErrors[order.id] ? (
                        <span className="text-danger">
                          Erro: {orderErrors[order.id]}
                        </span>
                      ) : order.invoiceNumber &&
                        order.invoiceNumber !== "N/A" ? (
                        <button
                          className="btn p-0 text-decoration-underline invoice-link"
                          title="Download da Fatura"
                          onClick={() => {
                            handleGenerateInvoice(
                              order.id,
                              order.orderNumber,
                              true,
                            );
                          }}
                          disabled={isProcessing}
                          aria-label={`Download fatura ${order.invoiceNumber}`}
                        >
                          {order.invoiceNumber}
                        </button>
                      ) : (
                        "-----"
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-info me-1"
                        title="Ver Detalhes no Shopify"
                        onClick={() => handleShowDetails(order)}
                        disabled={isProcessing}
                        aria-label={`Ver detalhes do pedido ${order.orderNumber}`}
                      >
                        <picture>
                          <source
                            srcSet="/icons/magnifying-glass.webp"
                            type="image/webp"
                          />
                          <img
                            src="/icons/magnifying-glass.png"
                            alt="Ver Detalhes no Shopify"
                            width="22"
                            height="22"
                            style={{
                              filter: isProcessing ? "grayscale(100%)" : "none",
                            }}
                          />
                        </picture>
                      </button>
                      {order.invoiceNumber && order.invoiceNumber !== "N/A" ? (
                        <button
                          className="btn btn-sm btn-outline-secondary me-1"
                          title="Enviar Email"
                          onClick={() =>
                            handleSendEmail(
                              order.id,
                              order.orderNumber,
                              order.customerEmail,
                            )
                          }
                          disabled={isProcessing}
                          aria-label={`Enviar fatura do pedido ${order.orderNumber}`}
                        >
                          <picture>
                            <source
                              srcSet="/icons/mail.webp"
                              type="image/webp"
                            />
                            <img
                              src="/icons/mail.png"
                              alt="Enviar Email"
                              width="22"
                              height="22"
                              style={{
                                filter: isProcessing
                                  ? "grayscale(100%)"
                                  : "none",
                              }}
                            />
                          </picture>
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title="Gerar Fatura"
                          onClick={() =>
                            handleGenerateInvoice(order.id, order.orderNumber)
                          }
                          disabled={isProcessing}
                          aria-label={`Gerar fatura para o pedido ${order.orderNumber}`}
                        >
                          <picture>
                            <source
                              srcSet="/icons/invoice.webp"
                              type="image/webp"
                            />
                            <img
                              src="/icons/invoice.png"
                              alt="Gerar Fatura"
                              width="22"
                              height="22"
                              style={{
                                filter: isProcessing
                                  ? "grayscale(100%)"
                                  : "none",
                              }}
                            />
                          </picture>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center">
                    Nenhuma encomenda encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card Layout */}
        <div className="orders-container">
          {paginatedOrders.length > 0 ? (
            paginatedOrders.map((order) => (
              <div key={order.id} className="order-card card mb-2">
                <div className="card-body">
                  <div className="order-row">
                    <span className="order-label">N.º Encomenda:</span>
                    <span>{order.orderNumber}</span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">Cliente:</span>
                    <span>
                      {order.customerName}{" "}
                      {order.customerName === "N/A" && (
                        <span className="text-muted">(Sem cliente)</span>
                      )}
                    </span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">Data:</span>
                    <span>{formatDate(order.orderDate)}</span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">Valor:</span>
                    <span>{order.totalValue.toFixed(2)} €</span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">Estado:</span>
                    <span>{translateStatus(order.status)}</span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">Fatura:</span>
                    <span>
                      {orderErrors[order.id] ? (
                        <span className="text-danger">
                          Erro: {orderErrors[order.id]}
                        </span>
                      ) : order.invoiceNumber &&
                        order.invoiceNumber !== "N/A" ? (
                        <button
                          className="btn p-0 text-decoration-underline invoice-link"
                          title="Download da Fatura"
                          onClick={() => {
                            handleGenerateInvoice(
                              order.id,
                              order.orderNumber,
                              true,
                            );
                          }}
                          disabled={isProcessing}
                          aria-label={`Download fatura ${order.invoiceNumber}`}
                        >
                          {order.invoiceNumber}
                        </button>
                      ) : (
                        "-----"
                      )}
                    </span>
                  </div>
                  <div className="order-row order-actions">
                    <span className="order-label">Opções:</span>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-outline-info"
                        title="Ver Detalhes no Shopify"
                        onClick={() => handleShowDetails(order)}
                        disabled={isProcessing}
                        aria-label={`Ver detalhes do pedido ${order.orderNumber}`}
                      >
                        <picture>
                          <source
                            srcSet="/icons/magnifying-glass.webp"
                            type="image/webp"
                          />
                          <img
                            src="/icons/magnifying-glass.png"
                            alt="Ver Detalhes no Shopify"
                            width="22"
                            height="22"
                            style={{
                              filter: isProcessing ? "grayscale(100%)" : "none",
                            }}
                          />
                        </picture>
                      </button>
                      {order.invoiceNumber && order.invoiceNumber !== "N/A" ? (
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          title="Enviar Email"
                          onClick={() =>
                            handleSendEmail(
                              order.id,
                              order.orderNumber,
                              order.customerEmail,
                            )
                          }
                          disabled={isProcessing}
                          aria-label={`Enviar fatura do pedido ${order.orderNumber}`}
                        >
                          <picture>
                            <source
                              srcSet="/icons/mail.webp"
                              type="image/webp"
                            />
                            <img
                              src="/icons/mail.png"
                              alt="Enviar Email"
                              width="22"
                              height="22"
                              style={{
                                filter: isProcessing
                                  ? "grayscale(100%)"
                                  : "none",
                              }}
                            />
                          </picture>
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          title="Gerar Fatura"
                          onClick={() =>
                            handleGenerateInvoice(order.id, order.orderNumber)
                          }
                          disabled={isProcessing}
                          aria-label={`Gerar fatura para o pedido ${order.orderNumber}`}
                        >
                          <picture>
                            <source
                              srcSet="/icons/invoice.webp"
                              type="image/webp"
                            />
                            <img
                              src="/icons/invoice.png"
                              alt="Gerar Fatura"
                              width="22"
                              height="22"
                              style={{
                                filter: isProcessing
                                  ? "grayscale(100%)"
                                  : "none",
                              }}
                            />
                          </picture>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center p-3">Nenhuma encomenda encontrada.</div>
          )}
        </div>

        {totalPages > 1 && (
          <nav aria-label="Paginação de pedidos">
            <ul className="pagination justify-content-center mt-3">
              {generatePagination()}
            </ul>
          </nav>
        )}
      </div>

      <style>{`
        .container {
          min-height: 100vh;
          transform: translateY(0);
          transition: transform 0.3s ease;
        }
        .invoice-link:disabled {
          color: #6c757d;
          cursor: not-allowed;
          text-decoration: none;
        }
        .btn-outline-info:disabled,
        .btn-outline-secondary:disabled,
        .btn-outline-primary:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .table th,
        .table td {
          vertical-align: middle;
          padding: 0.5rem;
        }
        .order-row {
          display: flex;
          justify-content: space-between;
          padding: 0.4rem 0;
          font-size: 0.9rem;
        }
        .order-label {
          font-weight: 500;
          color: #495057;
          flex: 0 0 38%;
        }
        .order-card {
          border: 1px solid #dee2e6;
          border-radius: 0.25rem;
          margin-bottom: 0.75rem;
        }
        .order-row {
          border-bottom: 1px solid #e9ecef;
        }
        .order-row:last-child {
          border-bottom: none;
        }
        .order-actions {
          align-items: center;
        }
        @media (min-width: 768px) {
          .orders-container {
            display: none;
          }
          .table-responsive {
            display: block;
          }
        }
        @media (max-width: 767.98px) {
          .table-responsive {
            display: none;
          }
          .orders-container {
            display: block;
            min-height: calc(100vh - 200px);
          }
          .btn-sm {
            padding: 0.4rem 0.7rem;
            min-width: 44px;
            min-height: 44px;
          }
          .form-control,
          .form-select,
          .page-link {
            font-size: 0.85rem;
            padding: 0.35rem 0.5rem;
          }
          .pagination {
            font-size: 0.85rem;
          }
          .page-link {
            padding: 0.3rem 0.6rem;
          }
        }
      `}</style>
    </Layout>
  );
}
