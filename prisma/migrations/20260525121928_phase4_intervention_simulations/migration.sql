/*
  Warnings:

  - You are about to drop the column `changeJson` on the `InterventionSimulation` table. All the data in the column will be lost.
  - You are about to drop the column `projectedDelta` on the `InterventionSimulation` table. All the data in the column will be lost.
  - Added the required column `appliedDelta` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `baselineGrade` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `baselineValue` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `confidence` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `courseId` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `estimatedEffect` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `interventionName` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `notesJson` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectedGrade` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectedHigh` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectedLow` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proposedValue` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rankScore` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `treatment` to the `InterventionSimulation` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InterventionSimulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "interventionName" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "baselineValue" REAL NOT NULL,
    "proposedValue" REAL NOT NULL,
    "appliedDelta" REAL NOT NULL,
    "estimatedEffect" REAL NOT NULL,
    "baselineGrade" REAL NOT NULL,
    "projectedGrade" REAL NOT NULL,
    "projectedLow" REAL NOT NULL,
    "projectedHigh" REAL NOT NULL,
    "rankScore" REAL NOT NULL,
    "confidence" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "notesJson" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterventionSimulation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterventionSimulation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InterventionSimulation" ("explanation", "generatedAt", "id", "studentId") SELECT "explanation", "generatedAt", "id", "studentId" FROM "InterventionSimulation";
DROP TABLE "InterventionSimulation";
ALTER TABLE "new_InterventionSimulation" RENAME TO "InterventionSimulation";
CREATE INDEX "InterventionSimulation_courseId_treatment_idx" ON "InterventionSimulation"("courseId", "treatment");
CREATE INDEX "InterventionSimulation_courseId_rankScore_idx" ON "InterventionSimulation"("courseId", "rankScore");
CREATE UNIQUE INDEX "InterventionSimulation_studentId_courseId_interventionName_key" ON "InterventionSimulation"("studentId", "courseId", "interventionName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
