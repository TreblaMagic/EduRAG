"use client";

import { useMemo, useState, useTransition } from "react";

import { STANDARD_INTERVENTIONS, type SimulatedIntervention } from "@/features/causal-engine";
import type { StudentDropdownEntry } from "@/server/queries/students";
import { runWhatIf } from "@/server/actions/what-if";
import { formatDecimal } from "@/lib/formatters";
import { interventionLabel } from "@/lib/intervention-language";

import InterventionCard, { type InterventionCardData } from "./InterventionCard";

interface WhatIfSimulatorProps {
  students: ReadonlyArray<StudentDropdownEntry>;
}

const FIRST_INTERVENTION = STANDARD_INTERVENTIONS[0]!;

export default function WhatIfSimulator({ students }: WhatIfSimulatorProps) {
  const [studentExternalId, setStudentExternalId] = useState<string>(
    students[0]?.externalId ?? "",
  );
  const [interventionName, setInterventionName] = useState<string>(FIRST_INTERVENTION.name);
  const [delta, setDelta] = useState<number>(FIRST_INTERVENTION.delta);
  const [result, setResult] = useState<SimulatedIntervention | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedIntervention = useMemo(
    () => STANDARD_INTERVENTIONS.find((i) => i.name === interventionName) ?? FIRST_INTERVENTION,
    [interventionName],
  );

  const sliderConfig = sliderConfigFor(selectedIntervention.treatment);

  function handleInterventionChange(name: string): void {
    setInterventionName(name);
    const next = STANDARD_INTERVENTIONS.find((i) => i.name === name);
    if (next) setDelta(next.delta);
    setResult(null);
    setError(null);
  }

  function handleStudentChange(id: string): void {
    setStudentExternalId(id);
    setResult(null);
    setError(null);
  }

  function handleRun(): void {
    setError(null);
    startTransition(async () => {
      const res = await runWhatIf({
        studentExternalId,
        interventionName,
        customDelta: delta,
      });
      if (res.ok) {
        setResult(res.simulation);
      } else {
        setResult(null);
        setError(res.error);
      }
    });
  }

  if (students.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No students loaded yet. Run <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run db:ingest</code> first.
      </div>
    );
  }

  const cardData: InterventionCardData | null = result
    ? {
        // Transient preview — no persisted InterventionSimulation row.
        interventionSimulationId: null,
        interventionName: result.interventionName,
        treatment: result.treatment,
        baselineValue: result.baselineValue,
        proposedValue: result.proposedValue,
        appliedDelta: result.appliedDelta,
        estimatedEffect: result.estimatedEffect,
        baselineGrade: result.baselineGrade,
        projectedGrade: result.projectedGrade,
        projectedLow: result.projectedLow,
        projectedHigh: result.projectedHigh,
        rankScore: result.rankScore,
        confidence: result.confidence,
        explanation: result.explanation,
      }
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          handleRun();
        }}
      >
        <div>
          <label htmlFor="student-select" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Student
          </label>
          <select
            id="student-select"
            value={studentExternalId}
            onChange={(e) => handleStudentChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500"
          >
            {students.map((s) => (
              <option key={s.externalId} value={s.externalId}>
                {s.externalId}
                {s.finalGrade !== null ? ` — grade ${s.finalGrade.toFixed(0)}, GPA ${s.priorGpa.toFixed(2)}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="intervention-select" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Intervention
          </label>
          <select
            id="intervention-select"
            value={interventionName}
            onChange={(e) => handleInterventionChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500"
          >
            {STANDARD_INTERVENTIONS.map((i) => (
              <option key={i.name} value={i.name}>
                {interventionLabel(i.name)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{selectedIntervention.actionHint}</p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="delta-slider" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Proposed change
            </label>
            <span className="text-sm font-semibold text-slate-900">+{formatDecimal(delta, sliderConfig.digits)}</span>
          </div>
          <input
            id="delta-slider"
            type="range"
            min={sliderConfig.min}
            max={sliderConfig.max}
            step={sliderConfig.step}
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
            className="mt-2 w-full accent-indigo-600"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-400">
            <span>+{sliderConfig.min}</span>
            <span>+{sliderConfig.max}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {isPending ? "Simulating…" : "Run simulation"}
        </button>

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
        ) : null}
      </form>

      <div className="min-h-[200px]">
        {cardData ? (
          <InterventionCard intervention={cardData} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
            Pick a student and an intervention, then run the simulation.
          </div>
        )}
      </div>
    </div>
  );
}

interface SliderConfig {
  min: number;
  max: number;
  step: number;
  digits: number;
}

function sliderConfigFor(treatment: string): SliderConfig {
  switch (treatment) {
    case "ResourceDiversityIndex":
    case "QuizConsistency":
    case "AssessmentTrend":
      return { min: 0, max: 0.5, step: 0.01, digits: 2 };
    case "ForumParticipation":
      return { min: 0, max: 10, step: 0.5, digits: 1 };
    default:
      return { min: 0, max: 1, step: 0.05, digits: 2 };
  }
}
