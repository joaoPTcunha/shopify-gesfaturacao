import { Form, useActionData } from "@remix-run/react";
import { useEffect } from "react";
import { toast } from "sonner";

export default function LoginForm() {
  const actionData = useActionData();

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error, {
        duration: 5000,
      });
    }
    if (actionData?.success) {
      toast.success(actionData.success, {
        duration: 3000,
      });
    }
  }, [actionData]);

  return (
    <Form method="post" className="p-4 bg-light rounded-3">
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
          autoComplete="url"
          defaultValue="https://development.gesfaturacao.pt/api/v1.0.4"
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
          autoComplete="username"
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
          autoComplete="current-password"
        />
      </div>

      <button type="submit" className="btn btn-primary w-100">
        Iniciar sessão
      </button>
    </Form>
  );
}
