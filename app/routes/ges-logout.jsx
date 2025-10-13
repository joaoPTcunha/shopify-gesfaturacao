import { redirect } from "@remix-run/node";
import prisma from "../../prisma/client";

export async function loader() {
  try {
    await prisma.GESlogin.deleteMany({});
    return redirect("/ges-login", {
      headers: {
        "X-Remix-Revalidate": "1",
      },
    });
  } catch (error) {
    console.error("[ges-logout] Error:", error.message);
    return redirect("/ges-login", {
      headers: {
        "X-Remix-Revalidate": "1",
      },
    });
  }
}
