/**
 * Phase 7 — Markdown causal report.
 *
 * Pure transformer: takes a {@link CausalReport} and returns a single
 * Markdown string. No I/O; the caller is responsible for delivering the
 * bytes (HTTP response body, file write, clipboard, …). Looks intentional
 * enough to drop straight into a research demo or a recruiter packet.
 */

import type { CausalReport, ReportEstimate } from "./types";

export function renderMarkdownReport(report: CausalReport): string {
  const lines: string[] = [];
  lines.push(`# Causal report — ${report.cohort.courseCode}`);
  lines.push("");
  lines.push(`*Generated ${report.generatedAt} by EduRAG (${report.schemaVersion}).*`);
  lines.push("");
  lines.push(
    "> **Honesty note.** Every estimate in this report is *model-based*. ",
  );
  lines.push(
    "> They are derived from a hypothesised DAG and a linear functional form. ",
  );
  lines.push(
    "> Treat them as decision support, not as proof of personal-level causation.",
  );
  lines.push("");

  // ---- Cohort summary ------------------------------------------------------
  lines.push("## 1. Cohort summary");
  lines.push("");
  lines.push(`- **Course:** ${report.cohort.courseCode}`);
  lines.push(`- **Outcome:** ${report.cohort.outcome}`);
  lines.push(`- **Sample size:** ${report.cohort.sampleSize}`);
  lines.push(
    `- **Outcome mean / std:** ${fmt(report.cohort.meanOutcome)} / ${fmt(report.cohort.stdOutcome)}`,
  );
  lines.push(`- **Engine used:** \`${report.engine}\``);
  if (report.datasetMode) {
    const d = report.datasetMode;
    lines.push(
      `- **Dataset mode:** ${d.name} (\`${d.id}\`) — ${d.verb.toLowerCase()} data` +
        (d.lastUpdatedDetail ? `; ${d.lastUpdatedDetail}` : ""),
    );
  }
  lines.push("");

  // ---- Estimates -----------------------------------------------------------
  lines.push("## 2. Estimated effects");
  lines.push("");
  lines.push("| Treatment | β | 95% CI | Confidence | Engine | Method |");
  lines.push("| --- | ---: | --- | --- | --- | --- |");
  for (const e of report.estimates) {
    lines.push(
      `| ${e.treatment} | ${fmt(e.estimate)} | [${fmt(e.ciLow)}, ${fmt(e.ciHigh)}] | ${e.confidence} | ${e.engine} | \`${e.method}\` |`,
    );
  }
  lines.push("");

  // ---- Per-treatment refutation detail ------------------------------------
  lines.push("## 3. Refutation results");
  lines.push("");
  for (const e of report.estimates) {
    lines.push(`### ${e.treatment}`);
    lines.push("");
    lines.push(
      `Adjustment set: ${e.adjustmentSet.length ? e.adjustmentSet.map((a) => `\`${a}\``).join(", ") : "_(none)_"}`,
    );
    lines.push("");
    lines.push("**Baseline checks**");
    lines.push("");
    lines.push(refutationBullets(e));
    lines.push("");
    if (e.extendedRefutations) {
      lines.push("**Extended checks**");
      lines.push("");
      lines.push(extendedBullets(e));
      lines.push("");
    }
    if (e.warnings.length > 0) {
      lines.push("**Warnings**");
      lines.push("");
      for (const w of e.warnings) lines.push(`- ${w}`);
      lines.push("");
    }
  }

  // ---- DAG snapshot --------------------------------------------------------
  lines.push("## 4. DAG snapshot (manually encoded)");
  lines.push("");
  lines.push("| from | to | rationale |");
  lines.push("| --- | --- | --- |");
  for (const edge of report.dag.edges) {
    lines.push(`| ${edge.from} | ${edge.to} | ${edge.rationale} |`);
  }
  lines.push("");

  // ---- Optional sections (numbered dynamically from §5 onward) ------------
  let nextNumber = 5;
  const sectionHeader = (title: string): string => `## ${nextNumber++}. ${title}`;

  // ---- Discovery section ---------------------------------------------------
  if (report.discovery) {
    const d = report.discovery;
    lines.push(sectionHeader("Discovered DAG (experimental)"));
    lines.push("");
    lines.push(`Algorithm: \`${d.algorithm}\` · α = ${d.alpha} · engine: \`${d.engine}\``);
    lines.push("");
    lines.push(
      "> The discovered DAG is a *statistical inference experiment*. It assumes linear, ",
    );
    lines.push(
      "> Gaussian-noise relationships and is sensitive to sample size. It does not replace ",
    );
    lines.push("> the manually-specified DAG.");
    lines.push("");
    lines.push(`- Edges agreeing with the manual DAG: **${d.shared.length}**`);
    lines.push(`- Edges only in the manual DAG: **${d.manualOnly.length}**`);
    lines.push(`- Edges only in the discovered DAG: **${d.discoveredOnly.length}**`);
    if (d.warnings.length > 0) {
      lines.push("");
      lines.push("Discovery warnings:");
      for (const w of d.warnings) lines.push(`- ${w}`);
    }
    lines.push("");
  }

  // ---- Phase 8 — baseline prediction comparison ---------------------------
  if (report.prediction) {
    const p = report.prediction;
    lines.push(sectionHeader("Baseline prediction comparison (Phase 8)"));
    lines.push("");
    lines.push(
      `Model: \`${p.modelType}\` · threshold = ${p.threshold} · train log-loss = ${fmt(p.trainLogLoss)} · train accuracy = ${(p.trainAccuracy * 100).toFixed(1)}%`,
    );
    lines.push("");
    lines.push(
      `Risk distribution: at-risk = **${p.riskDistribution.atRisk}**, borderline = **${p.riskDistribution.borderline}**, on-track = **${p.riskDistribution.onTrack}**.`,
    );
    lines.push("");
    lines.push(
      `Of the ${p.rows.length} students compared, the prediction layer and the causal layer **agree** on the strongest lever for **${p.agreementCount}** and **disagree** for **${p.disagreementCount}**. Disagreement is not a bug — predictive importance and causal effect genuinely differ.`,
    );
    lines.push("");
    lines.push("| Student | P(at-risk) | Class | Top predictor | Top intervention | Projected gain | Agree on lever? |");
    lines.push("| --- | ---: | --- | --- | --- | ---: | :-: |");
    for (const row of p.rows) {
      const predictor = row.topPredictor
        ? `${row.topPredictor.feature} (β=${fmt(row.topPredictor.value)})`
        : "—";
      const intv = row.topIntervention
        ? `${row.topIntervention.treatment} (${row.topIntervention.confidence})`
        : "—";
      const gain = row.topIntervention ? fmt(row.topIntervention.projectedGain) : "—";
      const agree =
        row.agreesOnLever === null ? "—" : row.agreesOnLever ? "✓" : "✗";
      lines.push(
        `| ${row.studentExternalId} | ${(row.predictedRiskProb * 100).toFixed(1)}% | ${row.riskClass} | ${predictor} | ${intv} | ${gain} | ${agree} |`,
      );
    }
    lines.push("");
    if (p.notes.length > 0) {
      lines.push("**Notes**");
      lines.push("");
      for (const n of p.notes) lines.push(`- ${n}`);
      lines.push("");
    }
    if (p.warnings.length > 0) {
      lines.push("**Warnings**");
      lines.push("");
      for (const w of p.warnings) lines.push(`- ${w}`);
      lines.push("");
    }
    lines.push(
      "> **Honesty note.** Predictions are *probabilistic*; feature importance ≠ causal effect. The prediction layer identifies *who* needs attention. The causal layer identifies *what to change*. They answer different questions.",
    );
    lines.push("");
  }

  // ---- Phase 11 — intervention tracking summary ---------------------------
  if (report.tracking) {
    const t = report.tracking;
    lines.push(sectionHeader("Intervention tracking (Phase 11)"));
    lines.push("");
    lines.push(
      `Recorded decisions: **${t.decisionCounts.accepted}** accepted, **${t.decisionCounts.completed}** completed, **${t.decisionCounts.rejected}** rejected, **${t.decisionCounts.deferred}** deferred. Proposed-but-not-yet-decided: **${t.proposedCount}**. Follow-ups recorded: **${t.followUpsRecorded}**.`,
    );
    lines.push("");
    if (t.observationalInsights.length > 0) {
      lines.push("**Observational insights**");
      lines.push("");
      for (const i of t.observationalInsights) lines.push(`- ${i}`);
      lines.push("");
    }
    if (t.recentDecisions.length > 0) {
      lines.push("**Recent decisions**");
      lines.push("");
      lines.push("| Student | Intervention | Treatment | Status | Advisor note | Follow-up | Updated |");
      lines.push("| --- | --- | --- | --- | --- | :-: | --- |");
      for (const row of t.recentDecisions) {
        const note = row.advisorNote
          ? row.advisorNote.replace(/\|/g, "\\|").slice(0, 80)
          : "—";
        const fu = row.followUpObserved ? "✓" : "—";
        lines.push(
          `| ${row.studentExternalId} | ${row.interventionName} | ${row.treatment} | ${row.status} | ${note} | ${fu} | ${row.updatedAt} |`,
        );
      }
      lines.push("");
    }
    if (t.notes.length > 0) {
      lines.push("**Notes**");
      lines.push("");
      for (const n of t.notes) lines.push(`- ${n}`);
      lines.push("");
    }
    lines.push(
      "> **Honesty note.** Decisions describe *what advisors did*. Follow-ups describe *what advisors observed*. Neither validates the causal model nor proves the projected lift materialised.",
    );
    lines.push("");
  }

  // ---- Limitations + warnings ---------------------------------------------
  lines.push(sectionHeader("Limitations"));
  lines.push("");
  for (const l of report.limitations) lines.push(`- ${l}`);
  lines.push("");

  if (report.warnings.length > 0) {
    lines.push(sectionHeader("Run-level warnings"));
    lines.push("");
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Generated by EduRAG. See `docs/causal-methodology.md` for the full method spec.");
  lines.push("");
  return lines.join("\n");
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(3);
}

function tick(pass: boolean): string {
  return pass ? "PASS" : "FAIL";
}

function refutationBullets(e: ReportEstimate): string {
  const r = e.refutations;
  return [
    `- **Placebo (shuffle treatment)** — ${tick(r.placebo.passes)} (ratio ${fmt(r.placebo.ratio)} < ${fmt(r.placebo.threshold)}).`,
    `- **Random common cause** — ${tick(r.randomCommonCause.passes)} (Δβ rel ${fmt(r.randomCommonCause.relativeChange)} < ${fmt(r.randomCommonCause.threshold)}).`,
  ].join("\n");
}

function extendedBullets(e: ReportEstimate): string {
  const x = e.extendedRefutations!;
  return [
    `- **Subset robustness** — ${tick(x.subsetRobustness.passes)} (CV ${fmt(x.subsetRobustness.coefficientOfVariation)} < ${fmt(x.subsetRobustness.threshold)}, ${x.subsetRobustness.iterations} sub-samples).`,
    `- **Bootstrap stability** — ${tick(x.bootstrapStability.passes)} (same-sign fraction ${fmt(x.bootstrapStability.sameSignFraction)} ≥ ${fmt(x.bootstrapStability.threshold)}).`,
    `- **Adjustment-set sensitivity** — ${tick(x.sensitivity.passes)} (max Δβ rel ${fmt(x.sensitivity.maxRelativeChange)} < ${fmt(x.sensitivity.threshold)}).`,
    `- **Outcome permutation** — ${tick(x.outcomePermutation.passes)} (ratio ${fmt(x.outcomePermutation.ratio)} < ${fmt(x.outcomePermutation.threshold)}).`,
  ].join("\n");
}
