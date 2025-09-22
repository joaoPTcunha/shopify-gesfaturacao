// app/routes/clients-ges/search.jsx
import { json, redirect } from "@remix-run/node";
import prisma from "~/prisma/client"; // Adjust path as needed

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const tin = url.searchParams.get("tin");
    const name = url.searchParams.get("name");

    if (!tin || !name) {
      return json({ error: "TIN and name are required" }, { status: 400 });
    }

    const login = await prisma.GESlogin.findFirst({
      orderBy: { date_login: "desc" },
    });
    if (!login || !login.token) {
      return json({ error: "No active GES session" }, { status: 401 });
    }

    const expireDate = login.date_expire ? new Date(login.date_expire) : null;
    if (!expireDate || expireDate < new Date()) {
      await prisma.GESlogin.delete({ where: { id: login.id } });
      return json({ error: "GES session expired" }, { status: 401 });
    }

    let apiUrl = login.dom_licenca;
    if (!apiUrl.endsWith("/")) apiUrl += "/";
    apiUrl += `clients/tin/search/${encodeURIComponent(tin)}/${encodeURIComponent(name)}`;

    console.log(`[ges.client.search] Fetching from: ${apiUrl}`);
    const gesResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
      },
    });

    if (gesResponse.ok) {
      const data = await gesResponse.json();
      console.log(
        `[ges.client.search] Client found:`,
        JSON.stringify(data, null, 2),
      );
      return json(data);
    } else {
      const status = gesResponse.status;
      const text = await gesResponse.text();
      console.error(`[ges.client.search] Failed: ${status} - ${text}`);
      if (status === 404) {
        return json({ error: "Client not found" }, { status: 404 });
      }
      return json({ error: `Search failed: ${text}` }, { status });
    }
  } catch (error) {
    console.error("[ges.client.search] Error:", error.message);
    return json({ error: error.message }, { status: 500 });
  }
}
