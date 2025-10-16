export async function downloadInvoicePDF(invoiceId, type, apiUrl, token) {
  if (!apiUrl || !token || !invoiceId) {
    throw new Error("Faltam apiUrl, token ou invoiceId");
  }

  let cleanApiUrl = apiUrl.replace(/\/+$/, "");
  cleanApiUrl = `${cleanApiUrl}/`;

  const downloadEndpoint = `${cleanApiUrl}sales/documents/${invoiceId}/type/${type}`;

  try {
    const downloadResponse = await fetch(downloadEndpoint, {
      method: "GET",
      headers: {
        Authorization: token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const downloadResponseText = await downloadResponse.text();

    if (!downloadResponse.ok) {
      throw new Error("Sessão expirada. Por favor, faça login novamente.");
    }

    let pdfData;
    try {
      pdfData = JSON.parse(downloadResponseText || "{}");
    } catch (err) {
      throw new Error(
        `Falha ao analisar a resposta do PDF: ${downloadResponseText}`,
      );
    }

    const pdfBase64 = pdfData.data?.document;
    if (!pdfBase64) {
      throw new Error("Documento PDF ausente na resposta do GESfaturacao");
    }

    const pdfContent = Buffer.from(pdfBase64, "base64");
    const contentLength = pdfContent.length;

    const pdfHeader = pdfContent.toString("ascii", 0, 4);
    if (pdfHeader !== "%PDF") {
      throw new Error("Conteúdo PDF inválido: falta o cabeçalho %PDF");
    }

    return {
      contentType: "application/pdf",
      data: pdfBase64,
      filename: `fatura_${invoiceId}.pdf`,
      size: contentLength,
    };
  } catch (err) {
    throw err;
  }
}
