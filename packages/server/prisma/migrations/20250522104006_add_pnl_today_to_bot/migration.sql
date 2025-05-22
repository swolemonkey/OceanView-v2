-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'scalper',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "equity" REAL NOT NULL DEFAULT 10000,
    "pnlToday" REAL NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Bot" ("createdAt", "enabled", "equity", "id", "name", "parentId", "type") SELECT "createdAt", "enabled", "equity", "id", "name", "parentId", "type" FROM "Bot";
DROP TABLE "Bot";
ALTER TABLE "new_Bot" RENAME TO "Bot";
CREATE UNIQUE INDEX "Bot_name_key" ON "Bot"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
