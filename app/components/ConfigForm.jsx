import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

export default function ConfigForm() {
  const {
    series,
    services,
    banks,
    paymentMethods,
    shopifyPaymentGateways,
    paymentMappings,
    currentSerieId,
    currentServiceId,
    finalized = true,
    email_auto = true,
    isLoggedIn = false,
    error: loaderError,
  } = useLoaderData();

  const actionData = useActionData();
  const navigate = useNavigate();

  const [servicesSearch, setServicesSearch] = useState(
    services?.find((s) => s.id === currentServiceId)?.description || "",
  );
  const [selectedServiceId, setSelectedServiceId] = useState(
    currentServiceId || "",
  );
  const [showServicesDropdown, setShowServicesDropdown] = useState(false);

  const [seriesSearch, setSeriesSearch] = useState(
    series?.find((s) => s.id === currentSerieId)?.name || "",
  );
  const [selectedSerieId, setSelectedSerieId] = useState(currentSerieId || "");
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false);

  const [paymentMappingsState, setPaymentMappingsState] = useState(
    shopifyPaymentGateways.map((gateway) => {
      const mapping = paymentMappings.find((m) => m.payment_name === gateway);
      return {
        payment_name: gateway,
        ges_payment_id: mapping?.ges_payment_id || "",
        ges_bank_id: mapping?.ges_bank_id || "",
      };
    }),
  );

  const [finalizeChecked, setFinalizeChecked] = useState(finalized);
  const [emailAutoChecked, setEmailAutoChecked] = useState(email_auto);

  const servicesRef = useRef(null);
  const seriesRef = useRef(null);

  const filteredServices =
    services?.filter((service) =>
      servicesSearch
        ? service.description
            ?.toLowerCase()
            .includes(servicesSearch.toLowerCase())
        : true,
    ) || [];

  const filteredSeries =
    series?.filter((serie) =>
      seriesSearch
        ? serie.name?.toLowerCase().includes(seriesSearch.toLowerCase())
        : true,
    ) || [];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (servicesRef.current && !servicesRef.current.contains(event.target)) {
        setShowServicesDropdown(false);
      }
      if (seriesRef.current && !seriesRef.current.contains(event.target)) {
        setShowSeriesDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let errorMessage = null;

    if (!isLoggedIn) {
      errorMessage = "Sessão expirada. Por favor, faça login novamente.";
      navigate("/ges-login?sessionExpired=true");
    } else if (loaderError) {
      errorMessage = loaderError;
    } else if (actionData?.error) {
      errorMessage = actionData.error;
    }

    if (errorMessage) {
      toast.error(errorMessage, { duration: 5000 });
    }

    if (actionData?.success) {
      toast.success("Configuração guardada com sucesso!", { duration: 3000 });
      navigate("/ges-orders?configSaved=true");
    }
  }, [loaderError, actionData, navigate, isLoggedIn]);

  const handleServicesSelect = (service) => {
    setSelectedServiceId(service.id);
    setServicesSearch(service.description);
    setShowServicesDropdown(false);
  };

  const handleSeriesSelect = (serie) => {
    setSelectedSerieId(serie.id);
    setSeriesSearch(serie.name);
    setShowSeriesDropdown(false);
  };

  const clearServices = () => {
    setSelectedServiceId("");
    setServicesSearch("");
    setShowServicesDropdown(true);
  };

  const clearSeries = () => {
    setSelectedSerieId("");
    setSeriesSearch("");
    setShowSeriesDropdown(true);
  };

  const handlePaymentMappingChange = (paymentName, field, value) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping) =>
        mapping.payment_name === paymentName
          ? { ...mapping, [field]: value }
          : mapping,
      ),
    );
  };

  const handleSubmit = (event) => {
    // Validate payment mappings and show warnings for unnecessary banks
    const invalidMappings = [];
    const warnings = [];

    const updatedMappings = paymentMappingsState.map((mapping) => {
      const method = paymentMethods.find(
        (m) => m.id === mapping.ges_payment_id,
      );

      // Check for invalid configurations
      if (method?.needsBank === "1" && !mapping.ges_bank_id) {
        invalidMappings.push(mapping.payment_name);
      } else if (method?.needsBank === "0" && mapping.ges_bank_id) {
        warnings.push(
          `Método de pagamento ${mapping.payment_name} não requer banco. O banco selecionado será ignorado e enviado como vazio.`,
        );
        // Clear ges_bank_id for submission
        return { ...mapping, ges_bank_id: "" };
      }
      return mapping;
    });

    if (invalidMappings.length > 0) {
      event.preventDefault();
      toast.error(
        `Configuração inválida: Os métodos de pagamento [${invalidMappings.join(
          ", ",
        )}] requerem um banco selecionado.`,
        { duration: 5000 },
      );
      return;
    }

    // Show warnings for unnecessary banks
    warnings.forEach((warning) => {
      toast.warning(warning, { duration: 5000 });
    });

    // Update state to clear ges_bank_id for methods that don't need it
    setPaymentMappingsState(updatedMappings);
  };

  return (
    <Form method="post" className="p-2" lang="pt-PT" onSubmit={handleSubmit}>
      <div className="mb-4" ref={seriesRef}>
        <label htmlFor="seriesSearch" className="form-label fw-bold">
          Selecionar Série
        </label>
        <div className="dropdown position-relative">
          <input
            type="text"
            id="seriesSearch"
            className="form-control"
            placeholder="Introduza o nome da série para filtrar"
            value={seriesSearch}
            onChange={(e) => {
              setSeriesSearch(e.target.value);
              setSelectedSerieId("");
              setShowSeriesDropdown(true);
            }}
            onFocus={() => setShowSeriesDropdown(true)}
            autoComplete="off"
            required
          />
          {seriesSearch.length > 0 && (
            <button
              type="button"
              className="btn position-absolute top-50 end-0 translate-middle-y me-2"
              style={{ color: "red", fontSize: "1.2rem", padding: "0" }}
              onClick={clearSeries}
              title="Limpar seleção"
            >
              &times;
            </button>
          )}
          <div
            className={`dropdown-menu ${showSeriesDropdown ? "show" : ""}`}
            style={{ maxHeight: "200px", overflowY: "auto", width: "100%" }}
          >
            {filteredSeries.length > 0 ? (
              filteredSeries.map((serie) => (
                <button
                  key={serie.id}
                  type="button"
                  className="dropdown-item"
                  onClick={() => handleSeriesSelect(serie)}
                >
                  {serie.name}
                </button>
              ))
            ) : (
              <span className="dropdown-item text-danger">
                Nenhuma série encontrada.
              </span>
            )}
          </div>
        </div>
        <input type="hidden" name="id_serie" value={selectedSerieId} required />
      </div>

      <div className="mb-4" ref={servicesRef}>
        <label htmlFor="servicesSearch" className="form-label fw-bold">
          Selecionar Portes
        </label>
        <div className="dropdown position-relative">
          <input
            type="text"
            id="servicesSearch"
            className="form-control"
            placeholder="Introduza o nome dos Portes para filtrar"
            value={servicesSearch}
            onChange={(e) => {
              setServicesSearch(e.target.value);
              setSelectedServiceId("");
              setShowServicesDropdown(true);
            }}
            onFocus={() => setShowServicesDropdown(true)}
            autoComplete="off"
            required
          />
          {servicesSearch.length > 0 && (
            <button
              type="button"
              className="btn position-absolute top-50 end-0 translate-middle-y me-2"
              style={{ color: "red", fontSize: "1.2rem", padding: "0" }}
              onClick={clearServices}
              title="Limpar seleção"
            >
              &times;
            </button>
          )}
          <div
            className={`dropdown-menu ${showServicesDropdown ? "show" : ""}`}
            style={{ maxHeight: "200px", overflowY: "auto", width: "100%" }}
          >
            {filteredServices.length > 0 ? (
              filteredServices.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className="dropdown-item"
                  onClick={() => handleServicesSelect(service)}
                >
                  {service.description}
                </button>
              ))
            ) : (
              <span className="dropdown-item text-danger">
                Nenhum serviço encontrado.
              </span>
            )}
          </div>
        </div>
        <input
          type="hidden"
          name="id_product_shipping"
          value={selectedServiceId}
          required
        />
      </div>

      <div className="mb-4">
        <label className="form-label fw-bold">
          Mapear Métodos de Pagamento do Shopify
        </label>
        {shopifyPaymentGateways.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover table-bordered">
              <thead className="table-light">
                <tr>
                  <th scope="col">Método de Pagamento (Shopify)</th>
                  <th scope="col">Método de Pagamento (GESFaturação)</th>
                  <th scope="col">Banco (GESFaturação)</th>
                </tr>
              </thead>
              <tbody>
                {paymentMappingsState.map((mapping, index) => (
                  <tr key={mapping.payment_name}>
                    <td>
                      {mapping.payment_name}
                      <input
                        type="hidden"
                        name={`paymentMappings[${index}][payment_name]`}
                        value={mapping.payment_name}
                      />
                    </td>
                    <td>
                      <select
                        name={`paymentMappings[${index}][ges_payment_id]`}
                        className="form-select"
                        value={mapping.ges_payment_id}
                        onChange={(e) =>
                          handlePaymentMappingChange(
                            mapping.payment_name,
                            "ges_payment_id",
                            e.target.value,
                          )
                        }
                        required
                      >
                        <option value="">Selecione um método</option>
                        {paymentMethods.map((method) => (
                          <option key={method.id} value={method.id}>
                            {method.name} ({method.description})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        name={`paymentMappings[${index}][ges_bank_id]`}
                        className="form-select"
                        value={mapping.ges_bank_id}
                        onChange={(e) =>
                          handlePaymentMappingChange(
                            mapping.payment_name,
                            "ges_bank_id",
                            e.target.value,
                          )
                        }
                      >
                        <option value="">Nenhum banco</option>
                        {banks.map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            {bank.name ||
                              bank.description ||
                              `Banco ${bank.id}`}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="alert alert-warning" role="alert">
            Nenhum método de pagamento do Shopify disponível. Verifique as
            credenciais da API do Shopify.
          </div>
        )}
      </div>

      <div className="mb-4 form-check form-switch">
        <input
          type="checkbox"
          id="finalizeInvoice"
          name="finalized"
          className="form-check-input"
          style={{ transform: "scale(1.3)", cursor: "pointer" }}
          checked={finalizeChecked}
          onChange={(e) => setFinalizeChecked(e.target.checked)}
          role="switch"
        />
        <label htmlFor="finalizeInvoice" className="form-check-label fw-medium">
          Finalizar Fatura
        </label>
      </div>

      <div className="mb-4 form-check form-switch">
        <input
          type="checkbox"
          id="sendByEmail"
          name="email_auto"
          className="form-check-input"
          style={{ transform: "scale(1.3)", cursor: "pointer" }}
          checked={emailAutoChecked}
          onChange={(e) => setEmailAutoChecked(e.target.checked)}
          role="switch"
        />
        <label htmlFor="sendByEmail" className="form-check-label fw-semibold">
          Enviar automaticamente a fatura por email após criação
        </label>
        <div>
          <small className="text-secondary">
            Atenção: Não é possível enviar faturas em estado "Rascunho" por
            email.
          </small>
        </div>
      </div>

      <button
        type="submit"
        className="mb-4 btn btn-primary w-100"
        disabled={!isLoggedIn}
      >
        Guardar Configuração
      </button>
    </Form>
  );
}
