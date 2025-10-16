import { redirect } from "@remix-run/node";
import prisma from "../../../prisma/client";

export const loader = async () => {
  try {
    if (!prisma.GESlogin) {
      return redirect("/ges-login");
    }

    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });

    const isLoggedIn = !!login && !!login.token;
    if (!isLoggedIn) {
      return redirect("/ges-login");
    }

    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return redirect("/ges-login");
    }

    return redirect("/ges-orders");
  } catch (error) {
    console.error("Erro ao verificar login:", error.message);
    return redirect("/ges-login");
  }
};

export default function GesFaturacaoIndex() {
  return null;
}
