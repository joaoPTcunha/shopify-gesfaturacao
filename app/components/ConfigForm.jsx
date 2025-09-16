import { Form, useActionData, useLoaderData } from "@remix-run/react";

export default function ConfigForm() {
  const { series, currentSerieId, finalized, email_auto, error } =
    useLoaderData();
  const actionData = useActionData();

  return (
    <Form method="post" className="p-4">
      <div className="mb-3">
        <label htmlFor="serie" className="form-label">
          Selecionar Série
        </label>
        <select
          id="serie"
          name="id_serie"
          className="form-select"
          defaultValue={currentSerieId}
          required
        >
          <option value="" disabled>
            Escolha uma série
          </option>
          {series && series.length > 0 ? (
            series.map((serie) => (
              <option key={serie.id} value={serie.id}>
                {serie.name}
              </option>
            ))
          ) : (
            <option value="" disabled>
              Nenhuma série disponível
            </option>
          )}
        </select>
      </div>

      <div className="mb-3 form-check">
        <input
          type="checkbox"
          id="finalizeInvoice"
          name="finalizeInvoice"
          className="form-check-input"
          defaultChecked={finalized}
        />
        <label htmlFor="finalizeInvoice" className="form-check-label">
          Finaliza Fatura
        </label>
      </div>

      <div className="mb-3 form-check">
        <input
          type="checkbox"
          id="sendByEmail"
          name="sendByEmail"
          className="form-check-input"
          defaultChecked={email_auto}
        />
        <label htmlFor="sendByEmail" className="form-check-label">
          Envia por Email
        </label>
      </div>

      {(actionData?.error || error) && (
        <div className="alert alert-danger">{actionData?.error || error}</div>
      )}

      <button type="submit" className="btn btn-primary">
        Guardar Configuração
      </button>
    </Form>
  );
}
