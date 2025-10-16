export async function fetchProductByCode(productCode, apiUrl, token) {
  try {
    const response = await fetch(
      `${apiUrl}products/code/${encodeURIComponent(productCode)}`,
      {
        method: "GET",
        headers: {
          Authorization: token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      return {
        errors: [{ message: "Resposta JSON inválida" }],
        status: response.status,
      };
    }
    return {
      data: responseBody.data,
      errors: responseBody.errors,
      status: response.status,
    };
  } catch (fetchError) {
    return {
      errors: [{ message: `Erro na busca: ${fetchError.message}` }],
      status: 0,
    };
  }
}
