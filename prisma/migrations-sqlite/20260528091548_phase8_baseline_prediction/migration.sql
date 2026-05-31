-- CreateTable
CREATE TABLE "BaselinePrediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "predictedRiskProb" REAL NOT NULL,
    "predictedGrade" REAL,
    "riskClass" TEXT NOT NULL,
    "predictionConfidence" TEXT NOT NULL,
    "threshold" REAL NOT NULL,
    "featureImportanceJson" TEXT NOT NULL,
    "notesJson" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BaselinePrediction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BaselinePrediction_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BaselinePrediction_courseId_modelType_idx" ON "BaselinePrediction"("courseId", "modelType");

-- CreateIndex
CREATE INDEX "BaselinePrediction_courseId_predictedRiskProb_idx" ON "BaselinePrediction"("courseId", "predictedRiskProb");

-- CreateIndex
CREATE UNIQUE INDEX "BaselinePrediction_studentId_courseId_modelType_key" ON "BaselinePrediction"("studentId", "courseId", "modelType");
