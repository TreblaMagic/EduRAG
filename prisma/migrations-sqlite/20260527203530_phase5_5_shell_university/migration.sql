-- AlterTable
ALTER TABLE "Student" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Student" ADD COLUMN "lastName" TEXT;

-- CreateTable
CREATE TABLE "AdvisorNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT,
    "noteText" TEXT NOT NULL,
    "authoredBy" TEXT NOT NULL,
    "authoredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdvisorNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdvisorNote_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "scopeJson" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorNote_externalId_key" ON "AdvisorNote"("externalId");

-- CreateIndex
CREATE INDEX "AdvisorNote_studentId_idx" ON "AdvisorNote"("studentId");

-- CreateIndex
CREATE INDEX "AdvisorNote_courseId_idx" ON "AdvisorNote"("courseId");

-- CreateIndex
CREATE INDEX "AdvisorNote_authoredAt_idx" ON "AdvisorNote"("authoredAt");

-- CreateIndex
CREATE INDEX "SyncLog_source_startedAt_idx" ON "SyncLog"("source", "startedAt");

-- CreateIndex
CREATE INDEX "SyncLog_startedAt_idx" ON "SyncLog"("startedAt");
