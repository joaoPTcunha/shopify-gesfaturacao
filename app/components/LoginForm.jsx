import { Form, useActionData, useNavigation } from "@remix-run/react";
import { useEffect } from "react";
import { toast } from "sonner";

export default function LoginForm() {
  const actionData = useActionData();
  const navigation = useNavigation();

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error, { duration: 5000 });
    }
    if (actionData?.success) {
      toast.success(actionData.success, { duration: 3000 });
    }
  }, [actionData]);

  return (
    <div className="card shadow-sm border-0">
      <div className="card-body p-4">
        <Form method="post" noValidate>
          <div className="mb-3">
            <label htmlFor="dom_licenca" className="form-label fw-medium">
              <i className="bi bi-globe me-2"></i> Domínio da API
            </label>
            <input
              type="url"
              className={`form-control ${actionData?.error && !actionData?.success ? "is-invalid" : ""}`}
              id="dom_licenca"
              name="dom_licenca"
              required
              aria-describedby="dom_licenca_help"
              placeholder="Domínio GESFaturação"
              autoComplete="url"
            />

            {actionData?.error && !actionData?.success && (
              <div className="invalid-feedback">{actionData.error}</div>
            )}
          </div>
          <div className="mb-3">
            <label htmlFor="username" className="form-label fw-medium">
              <i className="bi bi-person me-2"></i> Nome de utilizador
            </label>
            <input
              type="text"
              className={`form-control ${actionData?.error && !actionData?.success ? "is-invalid" : ""}`}
              id="username"
              name="username"
              required
              placeholder="Introduza o seu nome de utilizador"
              aria-describedby="username_help"
              autoComplete="username"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="password" className="form-label fw-medium">
              <i className="bi bi-lock me-2"></i> Palavra-passe
            </label>
            <input
              type="password"
              className={`form-control ${actionData?.error && !actionData?.success ? "is-invalid" : ""}`}
              id="password"
              name="password"
              required
              placeholder="Introduza a sua palavra-passe"
              aria-describedby="password_help"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={navigation.state === "submitting"}
          >
            {navigation.state === "submitting" ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                ></span>
                A iniciar sessão...
              </>
            ) : (
              "Iniciar sessão"
            )}
          </button>
        </Form>
      </div>
    </div>
  );
}
