/*
  Warnings:

  - You are about to drop the column `driver` on the `CausalEstimate` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `CausalEstimate` table. All the data in the column will be lost.
  - Added the required column `adjustmentSet` to the `CausalEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bootstrapIters` to the `CausalEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ciLevel` to the `CausalEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `courseId` to the `CausalEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outcome` to the `CausalEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sampleSize` to the `CausalEstimate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `treatment` to the `CausalEstimate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "CourseFeatureSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "meanEngagement" REAL NOT NULL,
    "meanRdi" REAL NOT NULL,
    "meanLoginsPerWeek" REAL NOT NULL,
    "totalActivity" INTEGER NOT NULL,
    "weeksObserved" INTEGER NOT NULL,
    "engagementConsistency" REAL NOT NULL,
    "engagementTrend" REAL NOT NULL,
    "forumParticipation" REAL NOT NULL,
    "quizConsistency" REAL NOT NULL,
    "assessmentTrend" REAL NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseFeatureSummary_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseFeatureSummary_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CausalEstimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "adjustmentSet" TEXT NOT NULL,
    "estimate" REAL NOT NULL,
    "ciLow" REAL NOT NULL,
    "ciHigh" REAL NOT NULL,
    "ciLevel" REAL NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "bootstrapIters" INTEGER NOT NULL,
    "refutationJson" TEXT,
    "notesJson" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CausalEstimate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CausalEstimate" ("ciHigh", "ciLow", "estimate", "generatedAt", "id", "method") SELECT "ciHigh", "ciLow", "estimate", "generatedAt", "id", "method" FROM "CausalEstimate";
DROP TABLE "CausalEstimate";
ALTER TABLE "new_CausalEstimate" RENAME TO "CausalEstimate";
CREATE INDEX "CausalEstimate_treatment_idx" ON "CausalEstimate"("treatment");
CREATE UNIQUE INDEX "CausalEstimate_courseId_treatment_outcome_key" ON "CausalEstimate"("courseId", "treatment", "outcome");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CourseFeatureSummary_courseId_idx" ON "CourseFeatureSummary"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseFeatureSummary_studentId_courseId_key" ON "CourseFeatureSummary"("studentId", "courseId");
