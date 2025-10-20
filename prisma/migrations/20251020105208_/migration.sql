-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GESpaymentMap" (
    "id_map" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id_shop" TEXT NOT NULL,
    "payment_name" TEXT NOT NULL,
    "ges_payment_id" TEXT,
    "ges_bank_id" TEXT
);
INSERT INTO "new_GESpaymentMap" ("ges_bank_id", "ges_payment_id", "id_map", "id_shop", "payment_name") SELECT "ges_bank_id", "ges_payment_id", "id_map", "id_shop", "payment_name" FROM "GESpaymentMap";
DROP TABLE "GESpaymentMap";
ALTER TABLE "new_GESpaymentMap" RENAME TO "GESpaymentMap";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
