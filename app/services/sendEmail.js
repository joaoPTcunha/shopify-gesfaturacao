// services/sendEmail.js
import { URLSearchParams } from "url";

export async function sendEmail({ id, type, email, expired, apiUrl, token }) {
  if (!id || !type || !email || expired === undefined) {
    throw new Error(
      `Parâmetros obrigatórios em falta: id=${id}, tipo=${type}, email=${email}, expirado=${expired}`,
    );
  }

  if (!apiUrl || !token) {
    throw new Error("Falta o URL da API ou o token para enviar o email");
  }

  const invoiceDetailsEndpoint = `${apiUrl}sales/receipt-invoices/${id}`;
  try {
    const statusResponse = await fetch(invoiceDetailsEndpoint, {
      method: "GET",
      headers: {
        Authorization: token,
        Accept: "application/json",
      },
    });

    if (!statusResponse.ok) {
      throw new Error(
        `Falha ao obter detalhes da fatura: ${statusResponse.statusText}`,
      );
    }

    const statusData = await statusResponse.json();
    const invoiceStatus = statusData.data?.status?.id;

    if (invoiceStatus === 5) {
      throw new Error(
        "Não é possível enviar a fatura por email, uma vez que a mesma já se encontra anulada.",
      );
    }
  } catch (err) {
    if (err.message.includes("anulada")) {
      throw err;
    }
    throw new Error(`Erro ao verificar o estado da fatura: ${err.message}`);
  }

  const endpoint = `${apiUrl}sales/documents/send-email`;
  const formData = new URLSearchParams();
  formData.append("id", id.toString());
  formData.append("type", type);
  formData.append("email", email);
  formData.append("expired", expired.toString());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: formData,
    });

    const responseText = await response.text();

    let result;
    try {
      result = JSON.parse(responseText || "{}");
    } catch {
      throw new Error(`Falha ao processar a resposta da API: ${responseText}`);
    }

    if (!response.ok) {
      const errorMsg =
        result.message ||
        result.error ||
        (result.errors ? JSON.stringify(result.errors) : null) ||
        response.statusText ||
        "Erro desconhecido";
      throw new Error(
        `Falha ao enviar o email: ${errorMsg} (Estado: ${response.status})`,
      );
    }

    return result;
  } catch (err) {
    throw new Error(
      `Erro ao enviar o email para a fatura ID ${id}: ${err.message}`,
    );
  }
}
