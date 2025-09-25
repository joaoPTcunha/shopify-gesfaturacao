export async function downloadInvoicePDF(apiUrl, token, invoiceId) {
  if (!apiUrl || !token || !invoiceId) {
    console.error("[downloadInvoicePDF] Missing apiUrl, token, or invoiceId");
    throw new Error("Missing apiUrl, token, or invoiceId");
  }

  const downloadEndpoint = `${apiUrl}sales/documents/${invoiceId}/type/FR`;
  console.log(`[downloadInvoicePDF] Fetching PDF from: ${downloadEndpoint}`);
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
      console.warn(
        `[downloadInvoicePDF] Failed to download invoice PDF: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
      );
      throw new Error(
        `Failed to download invoice PDF: ${downloadResponse.statusText} (Status: ${downloadResponse.status})`,
      );
    }

    let pdfData;
    try {
      pdfData = JSON.parse(downloadResponseText || "{}");
    } catch {
      console.error(
        `[downloadInvoicePDF] Failed to parse PDF response: ${downloadResponseText}`,
      );
      throw new Error(`Failed to parse PDF response: ${downloadResponseText}`);
    }

    const pdfBase64 = pdfData.data?.document;
    if (!pdfBase64) {
      console.error(
        `[downloadInvoicePDF] PDF document missing in response: ${JSON.stringify(pdfData, null, 2)}`,
      );
      throw new Error("PDF document missing in GESfaturacao response");
    }

    const pdfContent = Buffer.from(pdfBase64, "base64");
    const contentLength = pdfContent.length;

    // Validate PDF content
    const pdfHeader = pdfContent.toString("ascii", 0, 4);
    if (pdfHeader !== "%PDF") {
      console.error(
        `[downloadInvoicePDF] Invalid PDF content, missing %PDF header`,
      );
      throw new Error("Invalid PDF content: missing %PDF header");
    }

    return {
      contentType: "application/pdf",
      data: pdfBase64,
      filename: `fatura_${invoiceId}.pdf`,
      size: contentLength,
    };
  } catch (err) {
    console.warn(`[downloadInvoicePDF] Error downloading PDF: ${err.message}`);
    throw err;
  }
}
