import prisma from "../../prisma/client";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchProductDataFromOrder(order, lineItem) {
  if (!lineItem.title || !lineItem.unitPrice || !lineItem.productId) {
    throw new Error(
      "Faltam título do produto, preço unitário ou ID do produto",
    );
  }

  console.log(
    `[GESF] Iniciando sincronização de produto - Código: ${lineItem.sku || lineItem.variant?.sku || "N/A"}, Nome: ${lineItem.title}`,
  );
  // Verificar sessão GES
  const login = await prisma.gESlogin.findFirst({
    where: { dom_licenca: process.env.GES_LICENSE },
    orderBy: { date_login: "desc" },
  });
  if (!login || !login.token) {
    console.error("[GESF] Erro: Nenhuma sessão GES ativa encontrada");
    throw new Error("Nenhuma sessão GES ativa encontrada");
  }

  const expireDate = login.date_expire ? new Date(login.date_expire) : null;
  if (!expireDate || expireDate < new Date()) {
    await prisma.gESlogin.delete({ where: { id: login.id } });
    console.error("[GESF] Erro: Sessão GES expirada");
    throw new Error("Sessão GES expirada");
  }

  let apiUrl = login.dom_licenca;
  if (!apiUrl.endsWith("/")) apiUrl += "/";

  const productId = lineItem.productId.replace("gid://shopify/Product/", "");
  const productCode = (
    lineItem.sku ||
    lineItem.variant?.sku ||
    `sho${productId}`
  )
    .toLowerCase()
    .trim();
  const stockQuantity = lineItem.quantity;
  const isTaxable = lineItem.taxable ?? true;
  const taxRatePercentage = isTaxable ? 0.23 : 0;

  // Função auxiliar para buscar isenção de IVA
  async function getExemptionId(reasonCode) {
    if (!reasonCode) return null;
    try {
      const response = await fetch(`${apiUrl}exemption-reasons`, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Falha ao buscar isenções");
      const data = await response.json();
      const exemptions = data.data || [];
      const exemption = exemptions.find(
        (ex) =>
          ex.code?.toUpperCase() === reasonCode.toUpperCase() ||
          ex.name?.toUpperCase().includes(reasonCode.toUpperCase()),
      );
      return exemption ? parseInt(exemption.id, 10) : null;
    } catch (error) {
      console.error(`[GESF] Erro ao buscar isenções: ${error.message}`);
      return null;
    }
  }

  // Função auxiliar para buscar produto por código
  async function fetchProductByCode(productCode) {
    try {
      const response = await fetch(
        `${apiUrl}products/code/${encodeURIComponent(productCode)}`,
        {
          method: "GET",
          headers: {
            Authorization: login.token,
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

  // Função auxiliar para buscar produto por ID
  async function fetchProductById(productId) {
    try {
      const response = await fetch(
        `${apiUrl}products/${encodeURIComponent(productId)}`,
        {
          method: "GET",
          headers: {
            Authorization: login.token,
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
        errors: [{ message: `Erro na busca por ID: ${fetchError.message}` }],
        status: 0,
      };
    }
  }

  // Validar productCode
  if (!productCode || typeof productCode !== "string") {
    const errorMessage = `Código do produto inválido ou vazio ('${productCode}')`;
    console.error(`[GESF] Erro: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  // Verificar se o produto existe
  const searchResult = await fetchProductByCode(productCode);

  // Produto encontrado
  if (searchResult.status === 200 && searchResult.data?.id) {
    const gesProduct = searchResult.data;
    const productIdGes = gesProduct.id;
    let exemptionId =
      gesProduct.exemptionID ||
      gesProduct.exemptionId ||
      gesProduct.exemption_reason_id
        ? parseInt(
            gesProduct.exemptionID ||
              gesProduct.exemptionId ||
              gesProduct.exemption_reason_id,
            10,
          )
        : null;

    if (
      !isTaxable &&
      (!exemptionId || exemptionId === 0) &&
      gesProduct.exemption_reason
    ) {
      exemptionId = await getExemptionId(gesProduct.exemption_reason);
    }

    if (!isTaxable && (!exemptionId || exemptionId === 0)) {
      const errorMessage = `Não é possível gerar fatura: O produto ${lineItem.title} deve ser criado no GESfaturacao com um motivo de isenção de IVA válido.`;
      console.error(`[GESF] Erro: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    return {
      productId: productIdGes,
      exemptionID: exemptionId,
      found: true,
      status: "found",
      productCode,
      productData: {
        ...lineItem,
        gesProduct: { ...gesProduct, exemptionID: exemptionId },
      },
    };
  }

  // Lidar com produto não encontrado (incluindo status 400)
  const errors = searchResult.errors
    ? Array.isArray(searchResult.errors)
      ? searchResult.errors
      : [searchResult.errors]
    : [];

  if (
    searchResult.status === 404 ||
    searchResult.status === 400 ||
    errors.some(
      (err) =>
        err.code === "PC_PRODUCT_NOT_FOUND" ||
        err.code === "PRODUCT_NOT_FOUND" ||
        err.code === "PV_CODE_11",
    )
  ) {
    // Validar IVA 0% antes de criar
    if (!isTaxable) {
      const errorMessage = `Não é possível gerar fatura: O produto ${lineItem.title} deve ser criado no GESfaturacao com um motivo de isenção de IVA válido.`;
      console.error(`[GESF] Erro: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Buscar categorias
    let categoryId = 45;
    try {
      const categoriesResponse = await fetch(`${apiUrl}categories`, {
        method: "GET",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        if (categoriesData.data?.length > 0) {
          categoryId = parseInt(categoriesData.data[0].id, 10);
        }
      }
    } catch {}

    const createUrl = `${apiUrl}products`;
    const unitPriceExcludingVat = lineItem.unitPrice / (1 + taxRatePercentage);
    const roundedUnitPrice = parseFloat(unitPriceExcludingVat.toFixed(3));

    const productData = {
      name: lineItem.title,
      code: productCode,
      type: "P",
      unit: 1,
      pvp: parseFloat(lineItem.unitPrice.toFixed(4)),
      tax: isTaxable ? 1 : 4,
      price: roundedUnitPrice,
      stock: stockQuantity,
      initial_stock: stockQuantity,
      minimum_stock: 0,
      serial_number: "",
      currency: order.currency || "EUR",
      description: lineItem.title,
      category: categoryId,
      exemption_reason: isTaxable ? "" : "M01",
      observations: "",
      image: "",
    };

    // Tentar criar com JSON
    let createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: login.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productData),
    });

    let createResponseText = await createResponse.text();

    // Tentar com form-urlencoded se JSON falhar
    if (!createResponse.ok) {
      console.log("[GESF] JSON falhou, tentando form-urlencoded");
      createResponse = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: login.token,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(productData).toString(),
      });
      createResponseText = await createResponse.text();
    }

    if (!createResponse.ok) {
      let createResponseBody;
      try {
        createResponseBody = JSON.parse(createResponseText);
      } catch {
        throw new Error(`Falha na criação do produto: ${createResponseText}`);
      }

      // Tratar PV_CODE_10: buscar produto existente por código
      if (createResponseBody.errors?.some((err) => err.code === "PV_CODE_10")) {
        console.log(
          `[GESF] Produto ${productCode} já existe, tentando buscar novamente`,
        );
        await delay(1000); // Atraso para consistência eventual
        const retrySearchResult = await fetchProductByCode(productCode);
        if (retrySearchResult.status === 200 && retrySearchResult.data?.id) {
          const gesProduct = retrySearchResult.data;
          const productIdGes = gesProduct.id;
          let exemptionId =
            gesProduct.exemptionID ||
            gesProduct.exemptionId ||
            gesProduct.exemption_reason_id
              ? parseInt(
                  gesProduct.exemptionID ||
                    gesProduct.exemptionId ||
                    gesProduct.exemption_reason_id,
                  10,
                )
              : null;

          if (
            !isTaxable &&
            (!exemptionId || exemptionId === 0) &&
            gesProduct.exemption_reason
          ) {
            exemptionId = await getExemptionId(gesProduct.exemption_reason);
          }

          if (!isTaxable && (!exemptionId || exemptionId === 0)) {
            const errorMessage = `Não é possível gerar fatura: O produto ${lineItem.title} deve ser criado no GESfaturacao com um motivo de isenção de IVA válido.`;
            console.error(`[GESF] Erro: ${errorMessage}`);
            throw new Error(errorMessage);
          }

          return {
            productId: productIdGes,
            exemptionID: exemptionId,
            found: true,
            status: "found",
            productCode,
            productData: {
              ...lineItem,
              gesProduct: { ...gesProduct, exemptionID: exemptionId },
            },
          };
        }

        // Tentar buscar por ID, se disponível
        if (createResponseBody.data?.id) {
          console.log(
            `[GESF] Tentando buscar produto por ID: ${createResponseBody.data.id}`,
          );
          const idSearchResult = await fetchProductById(
            createResponseBody.data.id,
          );
          if (idSearchResult.status === 200 && idSearchResult.data?.id) {
            const gesProduct = idSearchResult.data;
            const productIdGes = gesProduct.id;
            let exemptionId =
              gesProduct.exemptionID ||
              gesProduct.exemptionId ||
              gesProduct.exemption_reason_id
                ? parseInt(
                    gesProduct.exemptionID ||
                      gesProduct.exemptionId ||
                      gesProduct.exemption_reason_id,
                    10,
                  )
                : null;

            if (
              !isTaxable &&
              (!exemptionId || exemptionId === 0) &&
              gesProduct.exemption_reason
            ) {
              exemptionId = await getExemptionId(gesProduct.exemption_reason);
            }

            if (!isTaxable && (!exemptionId || exemptionId === 0)) {
              const errorMessage = `Não é possível gerar fatura: O produto ${lineItem.title} deve ser criado no GESfaturacao com um motivo de isenção de IVA válido.`;
              console.error(`[GESF] Erro: ${errorMessage}`);
              throw new Error(errorMessage);
            }

            return {
              productId: productIdGes,
              exemptionID: exemptionId,
              found: true,
              status: "found_by_id",
              productCode,
              productData: {
                ...lineItem,
                gesProduct: { ...gesProduct, exemptionID: exemptionId },
              },
            };
          }
        }

        const errorMessage =
          createResponseBody.errors
            ?.map((err) => `${err.code}: ${err.message}`)
            .join("; ") || `Falha na criação do produto: ${createResponseText}`;
        console.error(`[GESF] Erro: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      const errorMessage =
        createResponseBody.errors
          ?.map(
            (err) =>
              `${err.code || "Erro desconhecido"}: ${err.message || "Sem mensagem"}`,
          )
          .join("; ") || `Falha na criação do produto: ${createResponseText}`;
      console.error(`[GESF] Erro: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    let newProduct;
    try {
      newProduct = JSON.parse(createResponseText);
    } catch {
      throw new Error(
        `Falha ao analisar resposta de criação: ${createResponseText}`,
      );
    }

    const productIdGes = newProduct.data?.id || newProduct.id;
    let exemptionId =
      newProduct.data?.exemptionID ||
      newProduct.data?.exemptionId ||
      newProduct.data?.exemption_reason_id
        ? parseInt(
            newProduct.data?.exemptionID ||
              newProduct.data?.exemptionId ||
              newProduct.data?.exemption_reason_id,
            10,
          )
        : null;

    if (!productIdGes) {
      const errorMessage = `Criação do produto bem-sucedida, mas nenhum ID retornado: ${createResponseText}`;
      console.error(`[GESF] Erro: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    return {
      productId: productIdGes,
      exemptionID: exemptionId,
      found: true,
      status: "created",
      productCode,
      productData: {
        ...lineItem,
        gesProduct: { ...newProduct.data, exemptionID: exemptionId },
      },
      createdProduct: newProduct,
    };
  }

  const errorMessage =
    errors
      .map(
        (err) =>
          `${err.code || "Erro desconhecido"}: ${err.message || "Sem mensagem"}`,
      )
      .join("; ") || `Status de resposta inesperado: ${searchResult.status}`;
  console.error(`[GESF] Erro: ${errorMessage}`);
  throw new Error(`Falha na busca do produto: ${errorMessage}`);
}
