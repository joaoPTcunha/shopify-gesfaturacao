// app/routes/ges-logout.jsx
import { redirect } from "@remix-run/node";
import prisma from "../../prisma/client";

export async function loader() {
  await prisma.GESlogin.deleteMany({});
  return redirect("/ges-login");
}
