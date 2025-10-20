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

  // State for series dropdown
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

  // State for payment mappings, including search and dropdown visibility
  const [paymentMappingsState, setPaymentMappingsState] = useState(
    shopifyPaymentGateways.map((gateway) => {
      const mapping = paymentMappings.find((m) => m.payment_name === gateway);
      const paymentMethod = paymentMethods.find(
        (m) => m.id === mapping?.ges_payment_id,
      );
      const bank = banks.find((b) => b.id === mapping?.ges_bank_id);
      return {
        payment_name: gateway,
        ges_payment_id: mapping?.ges_payment_id || "",
        ges_bank_id: mapping?.ges_bank_id || "",
        paymentSearch: paymentMethod?.name || "",
        bankSearch: bank
          ? bank.name || bank.description || `Banco ${bank.id}`
          : "",
        showPaymentDropdown: false,
        showBankDropdown: false,
      };
    }),
  );

  const [finalizeChecked, setFinalizeChecked] = useState(finalized);
  const [emailAutoChecked, setEmailAutoChecked] = useState(email_auto);

  const servicesRef = useRef(null);
  const seriesRef = useRef(null);
  const paymentRefs = useRef([]);
  const bankRefs = useRef([]);

  useEffect(() => {
    paymentRefs.current = paymentRefs.current.slice(
      0,
      shopifyPaymentGateways.length,
    );
    bankRefs.current = bankRefs.current.slice(0, shopifyPaymentGateways.length);
  }, [shopifyPaymentGateways.length]);

  // Filtered series and services
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

  // Click outside handler for all dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (servicesRef.current && !servicesRef.current.contains(event.target)) {
        setShowServicesDropdown(false);
      }
      if (seriesRef.current && !seriesRef.current.contains(event.target)) {
        setShowSeriesDropdown(false);
      }
      paymentMappingsState.forEach((_, index) => {
        if (
          paymentRefs.current[index] &&
          !paymentRefs.current[index].contains(event.target)
        ) {
          setPaymentMappingsState((prev) =>
            prev.map((m, i) =>
              i === index ? { ...m, showPaymentDropdown: false } : m,
            ),
          );
        }
        if (
          bankRefs.current[index] &&
          !bankRefs.current[index].contains(event.target)
        ) {
          setPaymentMappingsState((prev) =>
            prev.map((m, i) =>
              i === index ? { ...m, showBankDropdown: false } : m,
            ),
          );
        }
      });
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [paymentMappingsState]);

  // Handle errors and success
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

  // Handlers for series and services
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

  // Handlers for payment mappings
  const handlePaymentMappingChange = (index, field, value) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping, i) =>
        i === index ? { ...mapping, [field]: value } : mapping,
      ),
    );
  };

  const handlePaymentSearchChange = (index, value) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping, i) =>
        i === index
          ? {
              ...mapping,
              paymentSearch: value,
              ges_payment_id: "",
              showPaymentDropdown: true,
            }
          : mapping,
      ),
    );
  };

  const handleBankSearchChange = (index, value) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping, i) =>
        i === index
          ? {
              ...mapping,
              bankSearch: value,
              ges_bank_id: "",
              showBankDropdown: true,
            }
          : mapping,
      ),
    );
  };

  const handlePaymentSelect = (index, method) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping, i) =>
        i === index
          ? {
              ...mapping,
              ges_payment_id: method.id,
              paymentSearch: method.name,
              showPaymentDropdown: false,
            }
          : mapping,
      ),
    );
  };

  const handleBankSelect = (index, bank) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping, i) =>
        i === index
          ? {
              ...mapping,
              ges_bank_id: bank.id,
              bankSearch: bank.id
                ? bank.name || bank.description || `Banco ${bank.id}`
                : "",
              showBankDropdown: false,
            }
          : mapping,
      ),
    );
  };

  const clearPayment = (index) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping, i) =>
        i === index
          ? {
              ...mapping,
              ges_payment_id: "",
              paymentSearch: "",
              showPaymentDropdown: true,
            }
          : mapping,
      ),
    );
  };

  const clearBank = (index) => {
    setPaymentMappingsState((prev) =>
      prev.map((mapping, i) =>
        i === index
          ? {
              ...mapping,
              ges_bank_id: "",
              bankSearch: "",
              showBankDropdown: true,
            }
          : mapping,
      ),
    );
  };

  const getFilteredPaymentMethods = (search) =>
    paymentMethods.filter((method) =>
      search ? method.name?.toLowerCase().includes(search.toLowerCase()) : true,
    );

  const getFilteredBanks = (search) =>
    banks.filter((bank) =>
      search
        ? (bank.name || bank.description || `Banco ${bank.id}`)
            .toLowerCase()
            .includes(search.toLowerCase())
        : true,
    );

  const handleSubmit = (event) => {
    const invalidMappings = [];
    const warnings = [];

    const updatedMappings = paymentMappingsState.map((mapping) => {
      const method = paymentMethods.find(
        (m) => m.id === mapping.ges_payment_id,
      );

      if (method?.needsBank === "1" && !mapping.ges_bank_id) {
        invalidMappings.push(mapping.payment_name);
      } else if (method?.needsBank === "0" && mapping.ges_bank_id) {
        warnings.push(
          `Método de pagamento ${mapping.payment_name} não requer banco. O banco selecionado será ignorado e enviado como vazio.`,
        );
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

    warnings.forEach((warning) => {
      toast.warning(warning, { duration: 5000 });
    });

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
          <div className="table">
            <table className="table table-hover table-bordered">
              <thead className="table-light">
                <tr>
                  <th scope="col">Método de Pagamento (Shopify)</th>
                  <th scope="col" style={{ width: "45%" }}>
                    Método de Pagamento (GESFaturação)
                  </th>
                  <th scope="col">Banco (GESFaturação)</th>
                </tr>
              </thead>
              <tbody>
                {paymentMappingsState.map((mapping, index) => (
                  <tr key={mapping.payment_name}>
                    <td className="align-middle">
                      {mapping.payment_name}
                      <input
                        type="hidden"
                        name={`paymentMappings[${index}][payment_name]`}
                        value={mapping.payment_name}
                      />
                    </td>

                    <td className="align-middle">
                      <div
                        className="dropdown position-relative"
                        ref={(el) => (paymentRefs.current[index] = el)}
                      >
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Procurar método de pagamento"
                          value={mapping.paymentSearch}
                          onChange={(e) =>
                            handlePaymentSearchChange(index, e.target.value)
                          }
                          onFocus={() =>
                            setPaymentMappingsState((prev) =>
                              prev.map((m, i) =>
                                i === index
                                  ? { ...m, showPaymentDropdown: true }
                                  : m,
                              ),
                            )
                          }
                          autoComplete="off"
                          required
                        />

                        {mapping.paymentSearch.length > 0 && (
                          <button
                            type="button"
                            className="btn position-absolute top-50 end-0 translate-middle-y me-2"
                            style={{
                              color: "red",
                              fontSize: "1.2rem",
                              padding: "0",
                            }}
                            onClick={() => clearPayment(index)}
                            title="Limpar seleção"
                          >
                            &times;
                          </button>
                        )}

                        <div
                          className={`dropdown-menu ${
                            mapping.showPaymentDropdown ? "show" : ""
                          }`}
                          style={{
                            width: "100%",
                            maxHeight: "100px",
                            overflowY: "auto",
                            overflowX: "hidden",
                          }}
                        >
                          {getFilteredPaymentMethods(mapping.paymentSearch)
                            .length > 0 ? (
                            getFilteredPaymentMethods(
                              mapping.paymentSearch,
                            ).map((method) => (
                              <button
                                key={method.id}
                                type="button"
                                className="dropdown-item"
                                onClick={() =>
                                  handlePaymentSelect(index, method)
                                }
                              >
                                {method.name}
                              </button>
                            ))
                          ) : (
                            <span className="dropdown-item text-danger">
                              Nenhum método encontrado.
                            </span>
                          )}
                        </div>

                        <input
                          type="hidden"
                          name={`paymentMappings[${index}][ges_payment_id]`}
                          value={mapping.ges_payment_id}
                          required
                        />
                      </div>
                    </td>

                    <td className="align-middle">
                      <div
                        className="dropdown position-relative"
                        ref={(el) => (bankRefs.current[index] = el)}
                      >
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Procurar banco"
                          value={mapping.bankSearch}
                          onChange={(e) =>
                            handleBankSearchChange(index, e.target.value)
                          }
                          onFocus={() =>
                            setPaymentMappingsState((prev) =>
                              prev.map((m, i) =>
                                i === index
                                  ? { ...m, showBankDropdown: true }
                                  : m,
                              ),
                            )
                          }
                          autoComplete="off"
                        />

                        {mapping.bankSearch.length > 0 && (
                          <button
                            type="button"
                            className="btn position-absolute top-50 end-0 translate-middle-y me-2"
                            style={{
                              color: "red",
                              fontSize: "1.2rem",
                              padding: "0",
                            }}
                            onClick={() => clearBank(index)}
                            title="Limpar seleção"
                          >
                            &times;
                          </button>
                        )}

                        <div
                          className={`dropdown-menu ${
                            mapping.showBankDropdown ? "show" : ""
                          }`}
                          style={{
                            width: "100%",
                            maxHeight: "200px", // mostra até 5 bancos
                            overflowY: "auto",
                            overflowX: "hidden",
                            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                          }}
                        >
                          <button
                            type="button"
                            className="dropdown-item"
                            onClick={() => handleBankSelect(index, { id: "" })}
                          >
                            Nenhum banco
                          </button>
                          {getFilteredBanks(mapping.bankSearch).length > 0 ? (
                            getFilteredBanks(mapping.bankSearch).map((bank) => (
                              <button
                                key={bank.id}
                                type="button"
                                className="dropdown-item"
                                onClick={() => handleBankSelect(index, bank)}
                              >
                                {bank.name ||
                                  bank.description ||
                                  `Banco ${bank.id}`}
                              </button>
                            ))
                          ) : (
                            <span className="dropdown-item text-danger">
                              Nenhum banco encontrado.
                            </span>
                          )}
                        </div>

                        <input
                          type="hidden"
                          name={`paymentMappings[${index}][ges_bank_id]`}
                          value={mapping.ges_bank_id}
                        />
                      </div>
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
        <label htmlFor="finalizeInvoice" className="form-label fw-medium">
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
