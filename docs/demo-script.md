# EduRAG — Demo Script (2 minutes)

> Status: **Phase 11 — feedback-loop aware.** Each step references the
> live route in the Next.js dashboard; the global header chip always
> shows the active dataset mode, every recommendation card carries
> Accept / Reject / Defer buttons, and the setup itself is a one-command
> bootstrap.

Audience: recruiters, technical interviewers, advisors, lecturers.
Goal: communicate **explainable causal insight**, not grade prediction, in
under two minutes.

**Setup before the demo:**

Two paths, both end at the same dashboard. Pick whichever fits the audience.

*CSV path (simpler, no external system in the story):*

```bash
# Two-command demo (Phase 9):
npm run setup                                               # idempotent bootstrap
npm run demo                                                # setup-if-needed + dev server with URL banner

# Or, step-by-step if you want to narrate each phase:
npm install
npx prisma migrate deploy
npm run db:ingest && npm run causal:estimate && npm run causal:simulate
npm run ml:predict                                          # Phase 8 baseline ML
npm run dev                                                 # opens http://localhost:3000

# Clean slate between recordings:
npm run reset:demo -- --yes
```

*Shell University path (for "integrated platform" framing — Phase 5.5):*

```bash
npm install
npx prisma migrate dev --name init
npm run shell:seed                                          # build the mock LMS store
npm run sync:university                                     # sync into EduRAG (writes a SyncLog row)
npm run causal:estimate && npm run causal:simulate
npm run dev
```

---

## 0:00 — 0:15  Hook (route: `/`)

> *"Most learning analytics tools tell you **who** is at risk. EduRAG
> explains **why**, and shows you **what to change**."*

Open the **Overview** dashboard. Point to the six metric cards across the
top (Students, Courses, Avg final grade, Avg RDI, At-risk count,
Strongest driver) and then the cohort table sorted at-risk-first.

Note the **at-risk badge** on the leftmost column and the **confidence
chip** on the rightmost — both colour-coded.

---

## 0:15 — 0:45  Student profile (route: `/students/STU-XXXX`)

Click into a representative at-risk student. Show five areas:

1. **Top metric strip** — final grade with at-risk emphasis, prior GPA,
   mean engagement, mean RDI (each paired with the cohort average as a
   hint).
2. **Feature strip** — engagement consistency, engagement trend, quiz
   consistency, assessment trend.
3. **Weekly timeline charts** — engagement & RDI on one chart, quiz
   average on the other. Both are custom SVG (zero JS chart library).
4. **Prediction vs Intervention panel** *(Phase 8)* — two columns side-by-side.
   Left: traditional ML prediction (P(at-risk), top predictors, "this is
   probabilistic, not an action"). Right: EduRAG's causal output (top
   intervention with projected gain + CI + confidence chip). The footer
   surfaces 2-4 insights including "Prediction tells you WHO; Intervention
   tells you WHAT TO CHANGE".
5. **Ranked intervention cards** — projected change, improvement range,
   confidence chip, and a sentence explaining the cohort-average effect.

Talking point:

> *"This is the headline answer to 'is this just another grade-prediction
> tool?' — both layers are visible. The left column is a logistic
> regression; useful but it stops at the risk score. The right column
> uses our structural causal model to isolate which behaviours are
> likely driving the outcome, after adjusting for prior GPA and
> engagement. Every projected number is paired with a bootstrap
> confidence range and a refutation-derived confidence chip."*

For the cohort view, jump briefly to `/comparison`:

> *"Same comparison, but every student in the cohort at a glance. The
> 'Agree on lever' / 'Disagree on lever' tiles tell you how often the
> strongest predictor and the top causal target are the same feature.
> They're often not — feature importance and causal effect are
> different things, and we surface that difference instead of hiding
> it."*

---

## 0:45 — 1:15  Causal graph + discovery (route: `/causal-graph`)

Open the **Causal Graph** page. Click the **Compare** view-switcher chip
at the top.

The left pane is the manually-encoded DAG (7 nodes, 10 edges). The right
pane is a **discovered DAG** — produced live by a PC algorithm running
on the same cohort. Emerald edges are shared between the two; amber
dashed edges are discovered-only; slate dotted edges are manual-only.

Below the graphs, the table of estimated effects with bootstrap CIs,
methods (`backdoor_ols` for the TS engine; `dowhy_linear_regression` if
the Python worker is installed and `?engine=advanced`), and confidence
chips.

Talking point:

> *"The manual DAG encodes our domain assumptions. The discovered DAG is
> a data-driven check — a PC algorithm running on the same feature
> table. They mostly agree; the disagreements are visible and labelled,
> not hidden. Every effect estimate is paired with a bootstrap CI and a
> refutation-derived confidence chip. The downloadable Markdown / JSON
> report at the top right captures all of this for offline review."*

Optional aside (only if the audience cares about extensibility):

> *"The same UI works against the in-process TypeScript engine and an
> optional Python worker built on DoWhy + causal-learn. Switching is one
> URL parameter; if Python isn't installed the page falls back to the TS
> engine with a visible warning. No engine code leaks into client
> bundles."*

---

## 1:00 — 1:15  Dataset mode switch (route: `/datasets`) *(Phase 10)*

Click the dataset chip in the top-right of any page header. The
`/datasets` page opens with three mode cards (Synthetic / Shell
University / Uploaded). Pick a card that is *not* currently active and
press **Make active** → optional reason → **Confirm switch**.

Talking point:

> *"Switching is non-destructive — it updates the dashboard's declared
> source, not the database. Every page in the app now flips its
> subtitle ('Generated via Synthetic Demo Dataset' → 'Synced via Shell
> University API Sync') and every report exported from here on stamps
> the mode into its metadata. Hard reset is one CLI away: `npm run
> reset:demo -- --yes`."*

---

## 1:15 — 1:45  What-if simulator (route: `/what-if`)

Open the **What-If** page.

Pick the same at-risk student from the dropdown. Pick *"Increase Forum
Participation"*. Move the slider to `+3.0`. Press **Run simulation**.

The intervention card appears with:

- A projected grade change (e.g. *"+1.27 grade points"*).
- An improvement range (e.g. *"-0.20 to +2.74"*).
- A confidence chip.
- An explanation paragraph that includes *"cohort-average effect applied
  to this student"* and *"model-based simulation"*.
- If applicable, a yellow caveat *"The model cannot rule out no effect"*
  or *"Headroom limited the requested change"*.

Talking point:

> *"This is a counterfactual estimate — the platform is honest about
> uncertainty and never claims a personal guarantee. The simulation
> reuses the same pure function that backs the persisted ranked
> recommendations on the student page; the UI does not duplicate any
> projection math."*

---

## 1:45 — 2:00  Feedback loop *(Phase 11)*

Go back to the same at-risk student profile (`/students/STU-XXXX`).
On any **Recommended interventions** card, click **Accept**. Add a
short advisor note ("Student agreed to diversify resources"). Notice:

- The card flips to a green **Accepted** chip.
- An **Observational follow-up** form appears with a yellow banner
  reading *"Observational follow-up — not proof of causality"*. Add a
  short outcome ("Engagement steady over three weeks") and click
  **Record follow-up**.
- The **Intervention timeline** section below now shows
  `Recommendation → Accepted → Note added → Observational follow-up`
  in chronological order.

Then jump to `/interventions`:

- Metric tiles (Accepted / Rejected / Deferred / Follow-ups recorded).
- "Most active levers" — which intervention advisors accept most.
- Observational insights — *"Accepted interventions most often targeted
  Resource Diversity. This describes advisor behaviour — not a causal
  validation of the underlying β."*
- Recent activity feed with the action you just took.

Talking point:

> *"This is the feedback loop. Every recommendation gets a status,
> every status change is timestamped, every follow-up is recorded as
> observation — never as causal validation. The platform never claims
> that 'X students accepted this lever' proves the model is causally
> correct, and the persistence layer rejects notes that try to. That
> distinction is what makes this honest enough for a real advisory
> workflow."*

---

## After 2:00 — Close

If using the Shell University path, open **Integrations · Shell University** first
to show the live "Shell University API" data source chip, the recent sync row in
the history table, and the endpoint reference linking to live JSON.

Then open the **Upload Data** page (Phase 6 — now functional). Drop a CSV onto
the form, hit **Preview**, point out the validation stats + sample rows +
structured error list, and explain:

> *"Append leaves existing data; Replace wipes the LMS-derived tables but
> preserves the SyncLog audit history. Dry-run validates without writing.
> Commits write a `SyncLog` row with `source: uploaded`, which the
> integrations page picks up instantly — there's no separate codepath."*

Closing line:

> *"EduRAG is a working prototype of explainable Causal AI for education.
> Three data sources — synthetic CSV, mock LMS sync, real CSV upload — all
> flow through the same validator, ingest, and causal engine. Two engine
> abstractions behind stable interfaces: a causal engine (TypeScript
> baseline always on, DoWhy + causal-learn opt-in) and a prediction
> engine (TS logistic baseline always on, sklearn LR / Random Forest
> opt-in via the same Python worker). A Phase-11 feedback loop — every
> recommendation can be accepted, rejected, deferred, completed, and
> followed up observationally without the system ever pretending the
> outcome validates the causal model. One-command demo via `npm run
> setup && npm run demo`; `npm run doctor` for environment diagnosis;
> `npm run reset:demo` for clean recordings. 305 passing unit tests,
> zero new runtime dependencies in TypeScript-land, and a 'Prediction
> vs Intervention' surface that makes the difference between this and
> a black-box risk score obvious in 30 seconds."*

Show the GitHub repo URL and the README.

---

## Backup talking points (if asked)

- **"Is this real data?"** — No. All data is synthetic, generated by a
  deterministic Python script. The Upload page explains the schema and
  the privacy rules a real ingest must follow.
- **"How accurate is the simulator?"** — It uses backdoor-adjusted OLS
  on a documented DAG. Refutation checks (placebo + random common cause)
  are stored with every estimate and surface as a confidence chip in the
  UI.
- **"Why no React Flow / Recharts?"** — Custom SVG covers our needs in
  ~250 LoC, with zero new dependencies and full design control. The
  components are easy to swap if the project grows.
- **"What's the test surface?"** — 13 test files, 140 tests, all
  pure-function. RDI / engagement / row validation / DAG / linear algebra
  / feature table / estimator / refutation / simulator / formatters /
  confidence labels / intervention language / dashboard helpers.
- **"Could this run on Moodle / Canvas data?"** — Yes. The ingestion
  layer maps any LMS export onto the same schema. See
  `docs/data-model.md`.
