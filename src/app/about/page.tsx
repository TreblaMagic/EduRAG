/**
 * Phase 9 — /about onboarding page.
 *
 * The single page a first-time reviewer should be able to read in two
 * minutes and walk away with: what EduRAG is, how the causal layer
 * differs from prediction, how to read the confidence ranges, and where
 * the demo data comes from.
 *
 * No data fetching — purely static content. Server-rendered.
 */

import Link from "next/link";

import PageHeader from "@/components/PageHeader";

// Phase 12A (CI fix): the global <AppShell> renders the <DatasetModeBanner>
// which calls Prisma. Even though /about itself has no Prisma calls, the
// layout it inherits does — so this page must be dynamic to avoid hitting
// the database during the static prerender pass.
export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <div className="p-8 max-w-4xl space-y-10">
      <PageHeader
        title="About EduRAG"
        subtitle="What this dashboard is, how it works, and how to read it."
      />

      <Section title="What EduRAG is">
        <p>
          EduRAG is a working prototype of <strong>explainable Causal AI for
          student success</strong>. It ingests LMS-style behavioural data
          (engagement, resource use, forum posts, quiz attempts, …) and answers
          two questions an advisor actually needs:
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>
            <strong>Who</strong> in this cohort is likely to struggle? — that's
            the prediction layer.
          </li>
          <li>
            <strong>What</strong> should change about a specific student&apos;s
            behaviour to lift the outcome? — that&apos;s the causal layer.
          </li>
        </ul>
        <p className="mt-2">
          The two layers are explicitly separate. Most "AI risk score" tools stop
          at the first question; EduRAG keeps both visible so you can compare
          them yourself.
        </p>
      </Section>

      <Section title="Prediction vs Intervention — the headline distinction">
        <div className="grid md:grid-cols-2 gap-4">
          <Panel tone="slate" title="Traditional Prediction">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Logistic regression on standardised LMS features.</li>
              <li>Output: probability the student is at risk.</li>
              <li>
                Feature importance ranks which features the model leaned on most
                — <em>not</em> what to change.
              </li>
              <li>Tells you the <strong>WHO</strong>.</li>
            </ul>
          </Panel>
          <Panel tone="emerald" title="EduRAG Causal Output">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Backdoor-adjusted OLS on a hypothesised DAG.</li>
              <li>
                Output: a per-student counterfactual — &quot;if we moved forum
                participation up by Δ, the projected grade lift is ±X with a Y
                confidence range.&quot;
              </li>
              <li>
                Confidence chip reflects refutation checks (placebo, random
                common cause, optional extended set).
              </li>
              <li>Tells you the <strong>WHAT TO CHANGE</strong>.</li>
            </ul>
          </Panel>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          See <ALink href="/comparison">/comparison</ALink> for the cohort-wide
          side-by-side, or any{" "}
          <ALink href="/students/STU-0042">student profile</ALink> for the panel
          embedded in the student page.
        </p>
      </Section>

      <Section title="How to read confidence ranges and chips">
        <p>
          Every projected grade is paired with a <strong>bootstrap confidence
          interval</strong> — the low and high values come from re-fitting the
          model on 500 resamples of the cohort and taking percentiles.
          Realistic interpretation: <em>the range the cohort effect plausibly
          sits in, given the data we have</em> — not a guarantee for any
          individual student.
        </p>
        <p className="mt-2">
          The colour chip on each estimate summarises how many{" "}
          <strong>refutation checks</strong> passed:
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-1">
          <li>
            <span className="font-semibold text-emerald-700">High</span> — both
            baseline checks pass (placebo + random common cause).
          </li>
          <li>
            <span className="font-semibold text-amber-700">Medium</span> —
            exactly one passes.
          </li>
          <li>
            <span className="font-semibold text-rose-700">Low</span> — neither
            passes. We <em>still surface the estimate</em> so you can judge,
            never hide it.
          </li>
        </ul>
      </Section>

      <Section title="Where the demo data comes from">
        <p>The dashboard renders one of three sources at any time:</p>
        <ol className="list-decimal pl-6 space-y-1 mt-2">
          <li>
            <strong>Synthetic CSV</strong> generated by{" "}
            <Code>scripts/generate_synthetic_dataset.py</Code> — deterministic,
            5 behaviour groups, fully anonymous.
          </li>
          <li>
            <strong>Shell University mock LMS</strong> — a fake external
            university exposed at <Code>/api/shell-university/*</Code> that
            EduRAG syncs from via a typed connector. The sync layer is the
            shape a real Moodle / Canvas adapter would target.
          </li>
          <li>
            <strong>Real CSV upload</strong> at <ALink href="/upload">/upload</ALink>
            — drop any LMS-shaped CSV, preview it, pick append/replace/dry-run,
            and the full ingest → derive → estimate → simulate → predict
            pipeline re-runs in place.
          </li>
        </ol>
        <p className="text-xs text-slate-500 mt-2">
          See <ALink href="/integrations/shell-university">/integrations/shell-university</ALink>
          {" "}for the current sync status.
        </p>
      </Section>

      <Section title="Honesty constraints (binding)">
        <ul className="list-disc pl-6 space-y-1">
          <li>
            Causal estimates are <strong>model-based</strong>, not proof of real-world
            causation. The DAG is a hypothesis encoded by the project author.
          </li>
          <li>
            Per-student interventions apply a <strong>cohort-average effect</strong>{" "}
            to the individual student — never a personal guarantee.
          </li>
          <li>
            Feature importance from the prediction layer is{" "}
            <strong>not the same thing as a causal effect</strong>. The
            strongest predictor and the strongest causal lever can legitimately
            differ.
          </li>
          <li>
            Forbidden everywhere in code, copy, and docs: <em>guaranteed</em>,
            {" "}<em>proven cause</em>, <em>will definitely improve</em>. Asserted
            by the test suite.
          </li>
        </ul>
      </Section>

      <Section title="How to use the dashboard">
        <div className="grid md:grid-cols-2 gap-4">
          <RouteCard
            href="/"
            title="Overview"
            description="Cohort-level metrics, strongest causal driver, sortable student table."
          />
          <RouteCard
            href="/students/STU-0042"
            title="Student profile"
            description="Timeline charts, Prediction vs Intervention panel, ranked counterfactual cards."
          />
          <RouteCard
            href="/causal-graph?view=compare"
            title="Causal graph"
            description="Manually-encoded DAG side-by-side with a data-driven discovery experiment. Downloadable Markdown/JSON report."
          />
          <RouteCard
            href="/what-if"
            title="What-If simulator"
            description="Pick a student + intervention + delta; see the projected lift with a confidence range."
          />
          <RouteCard
            href="/comparison"
            title="Prediction vs Intervention"
            description="Cohort-wide table. 'Agree on lever' / 'Disagree on lever' tiles. Comparison report download."
          />
          <RouteCard
            href="/upload"
            title="Upload data"
            description="Drop your own LMS CSV; preview, pick a mode, commit."
          />
        </div>
      </Section>

      <Section title="One-command setup (for git-clone reviewers)">
        <pre className="rounded-md bg-slate-900 text-slate-100 text-xs p-4 overflow-x-auto">
{`# from a fresh git clone:
npm run setup          # idempotent — installs deps, migrates, seeds, runs the pipeline
npm run demo           # setup-if-needed + dev server with helpful URLs

# diagnostics:
npm run doctor         # full environment + data + feature check
npm run status         # concise row-count snapshot

# clean-slate for recordings:
npm run reset:demo -- --yes   # wipe + re-run setup`}
        </pre>
      </Section>

      <Section title="Limitations">
        <ul className="list-disc pl-6 space-y-1">
          <li>Synthetic data only; effect sizes are illustrative, not externally validated.</li>
          <li>Single-institution schema in the MVP; multi-tenant model is a future concern.</li>
          <li>Linear functional form throughout — non-linear and interaction effects are not captured.</li>
          <li>No authentication / auth-z — local-first prototype, not production.</li>
          <li>Heterogeneous treatment effects (CATE) are not modelled — every β is a cohort-average.</li>
        </ul>
      </Section>

      <p className="text-xs text-slate-400 pt-6 border-t border-slate-200">
        EduRAG — Causal AI for Student Success. Source:{" "}
        <ALink href="https://github.com/">GitHub</ALink>. Demo data is generated;
        no real student records are stored anywhere in this prototype.
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

function Panel({
  tone,
  title,
  children,
}: {
  tone: "slate" | "emerald";
  title: string;
  children: React.ReactNode;
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/40"
      : "border-slate-200 bg-white";
  return (
    <div className={`rounded-lg border ${classes} p-4`}>
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}

function RouteCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <p className="mt-2 font-mono text-[11px] text-indigo-700">{href}</p>
    </Link>
  );
}

function ALink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-indigo-700 hover:underline">
      {children}
    </Link>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-mono text-slate-700">
      {children}
    </code>
  );
}
