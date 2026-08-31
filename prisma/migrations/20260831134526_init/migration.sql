-- CreateTable
CREATE TABLE "material" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "thicknessMm" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "profile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "powerPercent" REAL NOT NULL,
    "speedMmPerSec" REAL NOT NULL,
    "passes" INTEGER NOT NULL DEFAULT 1,
    "lineSpacingMm" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "profile_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
