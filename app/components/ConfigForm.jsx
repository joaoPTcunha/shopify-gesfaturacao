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
    currentSerieId,
    currentServiceId,
    finalized = true,
    email_auto = true,
    error: loaderError,
  } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();

  const [servicesSearch, setServicesSearch] = useState(
    services?.find((service) => service.id === currentServiceId)?.description ||
      "",
  );
  const [selectedServiceId, setSelectedServiceId] = useState(
    currentServiceId || "",
  );
  const [showServicesDropdown, setShowServicesDropdown] = useState(false);

  const [seriesSearch, setSeriesSearch] = useState(
    series?.find((serie) => serie.id === currentSerieId)?.name || "",
  );
  const [selectedSerieId, setSelectedSerieId] = useState(currentSerieId || "");

  const [finalizeChecked, setFinalizeChecked] = useState(finalized);
  const [emailAutoChecked, setEmailAutoChecked] = useState(email_auto);
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false);

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
    if (loaderError || actionData?.error) {
      toast.error(loaderError || actionData?.error, { duration: 5000 });
    }
    if (actionData?.success) {
      navigate("/ges-orders?configSaved=true");
    }
  }, [loaderError, actionData, navigate]);

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

  return (
    <Form method="post" className="p-2" lang="pt-PT">
      {(actionData?.error || loaderError) && (
        <div className="alert alert-danger">
          Ocorreu um erro. Por favor, verifique os dados e tente iniciar sessão
          novamente.
        </div>
      )}
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
              <span className="dropdown-item text-muted">
                Nenhuma série encontrada
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
              <span className="dropdown-item text-muted">
                Nenhum porte encontrado
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

      <div className="mb-4 form-check form-switch">
        <input
          type="checkbox"
          id="finalizeInvoice"
          name="finalized"
          className="form-check-input"
          checked={finalizeChecked}
          onChange={(e) => setFinalizeChecked(e.target.checked)}
          role="switch"
        />
        <div className="d-flex flex-column">
          <label
            htmlFor="finalizeInvoice"
            className="form-check-label fw-medium"
          >
            Finalizar Fatura
          </label>
        </div>
      </div>

      <div className="mb-4 form-check form-switch">
        <input
          type="checkbox"
          id="sendByEmail"
          name="email_auto"
          className="form-check-input"
          checked={emailAutoChecked}
          onChange={(e) => setEmailAutoChecked(e.target.checked)}
          role="switch"
        />
        <div className="d-flex flex-column">
          <label htmlFor="sendByEmail" className="form-check-label fw-semibold">
            Enviar automaticamente a fatura por email após criação
          </label>
          <small className="text-secondary">
            ⚠ Atenção: Não é possível enviar faturas em estado "Rascunho" por
            email.
          </small>
        </div>
      </div>

      <button type="submit" className="mb-4 btn btn-primary w-100">
        Guardar Configuração
      </button>
    </Form>
  );
}
