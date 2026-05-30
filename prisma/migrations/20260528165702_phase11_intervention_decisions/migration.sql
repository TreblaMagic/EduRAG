-- CreateTable
CREATE TABLE "InterventionDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "interventionSimulationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "advisorNote" TEXT,
    "followUpOutcome" TEXT,
    "followUpObserved" BOOLEAN NOT NULL DEFAULT false,
    "followUpRecordedAt" DATETIME,
    "notesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InterventionDecision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterventionDecision_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterventionDecision_interventionSimulationId_fkey" FOREIGN KEY ("interventionSimulationId") REFERENCES "InterventionSimulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InterventionDecision_interventionSimulationId_key" ON "InterventionDecision"("interventionSimulationId");

-- CreateIndex
CREATE INDEX "InterventionDecision_studentId_idx" ON "InterventionDecision"("studentId");

-- CreateIndex
CREATE INDEX "InterventionDecision_courseId_status_idx" ON "InterventionDecision"("courseId", "status");

-- CreateIndex
CREATE INDEX "InterventionDecision_updatedAt_idx" ON "InterventionDecision"("updatedAt");
