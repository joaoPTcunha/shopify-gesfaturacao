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
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "email_auto" BOOLEAN NOT NULL DEFAULT false,
    "invoice_auto" BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE "SHOorder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT,
    "orderDate" TEXT NOT NULL,
    "totalValue" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "customerId" INTEGER,
    CONSTRAINT "SHOorder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "SHOcustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SHOorderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    CONSTRAINT "SHOorderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SHOorder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SHOcustomer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "SHOorder_orderNumber_key" ON "SHOorder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SHOcustomer_customerId_key" ON "SHOcustomer"("customerId");
