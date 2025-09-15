import { redirect } from "@remix-run/node";

export const loader = async () => {
  return redirect("/ges-login");
};

export default function GesFaturacaoIndex() {
  return null; // nunca renderiza
}
