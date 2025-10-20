-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "GESlogin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dom_licenca" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "id_serie" TEXT NOT NULL,
    "id_product_shipping" TEXT NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT true,
    "email_auto" BOOLEAN NOT NULL DEFAULT true,
    "date_login" TEXT NOT NULL,
    "date_expire" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "GESinvoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" TEXT NOT NULL,
    "order_total" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_total" TEXT NOT NULL,
    "invoice_date" DATETIME,
    "invoice_status" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "GESpaymentMap" (
    "id_map" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id_shop" INTEGER NOT NULL,
    "payment_name" TEXT NOT NULL,
    "ges_payment_id" TEXT,
    "ges_bank_id" TEXT
);
