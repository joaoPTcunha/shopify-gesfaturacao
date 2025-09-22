// app/routes/clients-ges/create.jsx
import { json, redirect } from "@remix-run/node";
import prisma from "~/prisma/client";

export async function action({ request }) {
  try {
    const formData = await request.formData();
    const name = formData.get("name");
    const country = formData.get("country");

    if (!name || !country) {
      return json({ error: "Name and country are required" }, { status: 400 });
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
    apiUrl += "clients";

    const gesFormData = new FormData();
    for (let [key, value] of formData.entries()) {
      gesFormData.append(key, value);
    }
    if (!gesFormData.has("accountType")) gesFormData.append("accountType", "1");
    if (!gesFormData.has("paymentMethod"))
      gesFormData.append("paymentMethod", "TT");
    if (!gesFormData.has("discount")) gesFormData.append("discount", "0");

    console.log(`[ges.client.create] Creating at: ${apiUrl}`);
    const gesResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: login.token,
      },
      body: gesFormData,
    });

    if (!gesResponse.ok) {
      const text = await gesResponse.text();
      console.error(
        `[ges.client.create] Failed: ${gesResponse.status} - ${text}`,
      );
      return json(
        { error: `Create failed: ${text}` },
        { status: gesResponse.status },
      );
    }

    const data = await gesResponse.json();
    console.log(
      `[ges.client.create] Client created:`,
      JSON.stringify(data, null, 2),
    );
    return json(data);
  } catch (error) {
    console.error("[ges.client.create] Error:", error.message);
    return json({ error: error.message }, { status: 500 });
  }
}
