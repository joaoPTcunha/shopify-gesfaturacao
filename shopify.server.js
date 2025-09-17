// shopify.server.js
import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { shopifyApi } from "@shopify/shopify-api";
import { restResources } from "@shopify/shopify-api/rest/admin/2025-07";

const prisma = new PrismaClient();

// Validate environment variables
const requiredEnvVars = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing environment variable: ${envVar}`);
  }
}

// Initialize Shopify API client
export const shopifyApiClient = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ["read_orders", "write_orders", "read_customers"],
  hostName: "rna-fw-prisoners-speakers.trycloudflare.com",
  isEmbeddedApp: true,
  apiVersion: "2025-07", // Explicitly set to match restResources
  restResources,
});

// Initialize Shopify Remix app
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
export { prisma };
