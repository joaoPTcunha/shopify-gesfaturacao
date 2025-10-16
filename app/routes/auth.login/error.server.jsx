import { LoginErrorType } from "@shopify/shopify-app-remix/server";

export function loginErrorMessage(loginErrors) {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return {
      shop: "Por favor, introduza o domínio da sua loja para iniciar sessão.",
    };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return {
      shop: "Por favor, introduza um domínio de loja válido para iniciar sessão.",
    };
  }

  return {};
}
