import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import { restResources } from "@shopify/shopify-api/rest/admin/2025-07";
import { Session } from "@shopify/shopify-api";

const prisma = new PrismaClient();

const shopifyApiClient = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ["read_orders", "write_orders", "read_customers"],
  hostName: "rna-fw-prisoners-speakers.trycloudflare.com",
  isEmbeddedApp: true,
  apiVersion: LATEST_API_VERSION,
  restResources,
});

export const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  appUrl:
    process.env.SHOPIFY_APP_URL ||
    "http://rna-fw-prisoners-speakers.trycloudflare.com",
  scopes: ["read_orders", "write_orders", "read_customers"],
  apiVersion: "2025-07",
  restResources,
  sessionStorage: new PrismaSessionStorage(prisma),
});

export const authenticate = shopify.authenticate;

export const getShopifyClient = () => {
  const session = new Session({
    id: `offline_gesfaturacao-joaocunha.myshopify.com`,
    shop: "gesfaturacao-joaocunha.myshopify.com",
    state: "state",
    isOnline: false,
    accessToken: process.env.SHOPIFY_API_TOKEN,
    scope: "read_orders,write_orders,read_customers",
  });

  return new shopifyApiClient.clients.Graphql({ session });
};
