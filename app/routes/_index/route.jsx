import { redirect } from "@remix-run/node";

export const loader = async () => {
  return redirect("/gesfaturacao/ges-login.jsx");
};

export default function GesFaturacaoIndex() {
  return null; // nunca renderiza
}
