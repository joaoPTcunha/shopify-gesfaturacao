import { Form, useActionData } from "@remix-run/react";

export default function LoginForm() {
  const actionData = useActionData();

  return (
    <Form method="post" className="p-4 bg-light rounded-3">
      {actionData?.error && (
        <div
          className="alert alert-danger d-flex align-items-center"
          role="alert"
        >
          <i className="bi bi-exclamation-circle-fill me-2"></i>
          {actionData.error}
        </div>
      )}
      {actionData?.success && (
        <div
          className="alert alert-success d-flex align-items-center"
          role="alert"
        >
          <i className="bi bi-check-circle-fill me-2"></i>
          {actionData.success}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="dom_licenca" className="form-label fw-medium">
          <i className="bi bi-globe me-2"></i> Domínio da API
        </label>
        <input
          type="url"
          className="form-control"
          id="dom_licenca"
          name="dom_licenca"
          required
          aria-describedby="dom_licenca_help"
          placeholder="Introduza o Link da API GESFaturação"
        />
      </div>

      <div className="mb-3">
        <label htmlFor="username" className="form-label fw-medium">
          <i className="bi bi-person me-2"></i> Nome de utilizador
        </label>
        <input
          type="text"
          className="form-control"
          id="username"
          name="username"
          required
          placeholder="Introduza o seu nome de utilizador"
          aria-describedby="username_help"
        />
      </div>

      <div className="mb-3">
        <label htmlFor="password" className="form-label fw-medium">
          <i className="bi bi-lock me-2"></i> Palavra-passe
        </label>
        <input
          type="password"
          className="form-control"
          id="password"
          name="password"
          required
          placeholder="Introduza a sua palavra-passe"
          aria-describedby="password_help"
        />
      </div>

      <button type="submit" className="btn btn-primary w-100">
        Iniciar sessão
      </button>
    </Form>
  );
}
