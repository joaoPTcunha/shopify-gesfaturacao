-- CreateTable
CREATE TABLE "GesFaturacaoLogin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dom_licenca" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "id_serie" TEXT NOT NULL,
    "id_product_shipping" TEXT NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "email_auto" BOOLEAN NOT NULL DEFAULT false,
    "invoice_auto" BOOLEAN NOT NULL DEFAULT false,
    "date_login" TEXT NOT NULL,
    "date_expire" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "GesFaturacaoInvoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" TEXT NOT NULL,
    "order_total" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_total" TEXT NOT NULL,
    "invoice_date" DATETIME,
    "invoice_status" INTEGER NOT NULL
);
