// OrderCard.jsx
import React from "react";

export default function OrderCard({
  order,
  isProcessing,
  handleShowDetails,
  handleSendEmail,
  handleGenerateInvoice,
  translateStatus,
  formatDate,
}) {
  return (
    <div className="order-card card mb-3">
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
              <span className="text-muted">(Sem cliente registrado)</span>
            )}
          </span>
        </div>
        <div className="order-row">
          <span className="order-label">Data:</span>
          <span>{formatDate(order.orderDate)}</span>
        </div>
        <div className="order-row">
          <span className="order-label">Valor com IVA:</span>
          <span>{order.totalValue.toFixed(2)} €</span>
        </div>
        <div className="order-row">
          <span className="order-label">Estado:</span>
          <span>{translateStatus(order.status)}</span>
        </div>
        <div className="order-row">
          <span className="order-label">N.º Fatura:</span>
          <span>
            {order.invoiceNumber && order.invoiceNumber !== "N/A" ? (
              <button
                className="btn p-0 text-decoration-underline invoice-link"
                title="Download da Fatura"
                onClick={() =>
                  handleGenerateInvoice(order.id, order.orderNumber, true)
                }
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
              aria-label={`Ver detalhes do pedido ${order.orderNumber} no Shopify`}
            >
              <img
                src="/icons/magnifying-glass.png"
                alt="Ver Detalhes no Shopify"
                width="22"
                height="22"
                style={{ filter: isProcessing ? "grayscale(100%)" : "none" }}
              />
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
                aria-label={`Enviar email com fatura para o pedido ${order.orderNumber}`}
              >
                <img
                  src="/icons/mail.png"
                  alt="Enviar Email"
                  width="22"
                  height="22"
                  style={{ filter: isProcessing ? "grayscale(100%)" : "none" }}
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
                aria-label={`Gerar fatura para o pedido ${order.orderNumber}`}
              >
                <img
                  src="/icons/invoice.png"
                  alt="Gerar Fatura"
                  width="22"
                  height="22"
                  style={{ filter: isProcessing ? "grayscale(100%)" : "none" }}
                />
              </button>
            )}
          </div>
        </div>
      </div>
      <style jsx>{`
        .order-card {
          border: 1px solid #dee2e6;
          border-radius: 0.25rem;
        }
        .order-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #e9ecef;
        }
        .order-row:last-child {
          border-bottom: none;
        }
        .order-label {
          font-weight: 500;
          color: #495057;
          flex: 0 0 40%;
        }
        .order-actions {
          align-items: center;
        }
      `}</style>
    </div>
  );
}
