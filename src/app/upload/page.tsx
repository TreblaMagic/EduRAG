import HonestyNote from "@/components/HonestyNote";
import PageHeader from "@/components/PageHeader";
import UploadForm from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  return (
    <div className="px-8 py-10 max-w-5xl space-y-8">
      <PageHeader
        title="Upload data"
        subtitle="Import your own LMS-style CSV into EduRAG. Validates client-side rows server-side, previews before commit, and orchestrates the full ingest + derivation + causal pipeline."
      />

      <HonestyNote tone="info" title="Local-first import">
        Uploads are processed entirely server-side on this machine — no cloud storage, no background queue,
        no auth required. Synthetic CSVs (Phase 2) and Shell University sync (Phase 5.5) remain available;
        upload is a third independent data source.
      </HonestyNote>

      <UploadForm />

      {/* ---- Schema reference -------------------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Expected CSV schema</h2>
        <p className="text-sm text-slate-600">
          One event per row. UTF-8 encoded, comma-delimited, ISO-8601 timestamps. All identifiers
          must be synthetic or pre-anonymised.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Column</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Required</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SCHEMA_ROWS.map((row) => (
                <tr key={row.column}>
                  <td className="px-3 py-2 font-mono text-[13px] text-slate-900">{row.column}</td>
                  <td className="px-3 py-2 text-slate-700">{row.type}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.required ? (
                      <span className="text-emerald-700">required</span>
                    ) : (
                      <span className="text-slate-400">optional</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="mt-4 rounded-md border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700">
            Sample row
          </summary>
          <pre className="px-4 py-3 text-xs text-slate-700 font-mono overflow-x-auto whitespace-pre">{SAMPLE_ROW}</pre>
        </details>
      </section>

      {/* ---- Privacy ------------------------------------------------------ */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Privacy & anonymisation rules</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Never upload real student names, emails, or institution identifiers.</li>
          <li>
            <span className="font-mono text-[13px]">student_id</span> must be a synthetic or
            irreversibly-hashed identifier (e.g. <span className="font-mono text-[13px]">STU-0042</span>).
          </li>
          <li>
            Timestamps may be shifted by a per-cohort offset to obscure exact attendance calendars; preserve
            weekly ordering.
          </li>
          <li>
            Free-text fields (forum posts, comments) are <strong>not</strong> ingested today; the schema only
            stores counts and durations.
          </li>
          <li>
            CSV validation is enforced server-side per{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">src/server/ingest/row-schema.ts</code> —
            malformed rows are rejected with structured error messages.
          </li>
        </ul>
      </section>

      {/* ---- Alternatives ------------------------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Other ways to load data</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            Synthetic CSV via CLI:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run data:generate</code> →{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run db:ingest</code>.
          </li>
          <li>
            Shell University mock LMS:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run shell:seed</code> →{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run sync:university</code>.
          </li>
          <li>
            After data is loaded:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run causal:estimate</code> →{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run causal:simulate</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}

interface SchemaRow {
  column: string;
  type: string;
  required: boolean;
  notes: string;
}

const SCHEMA_ROWS: ReadonlyArray<SchemaRow> = [
  { column: "student_id", type: "string", required: true, notes: "Synthetic identifier, e.g. STU-0042." },
  { column: "course_id", type: "string", required: true, notes: "Course code, e.g. CS-201." },
  { column: "week_number", type: "int 1-60", required: true, notes: "1-indexed course week." },
  { column: "resource_id", type: "string", required: true, notes: "Stable resource identifier." },
  { column: "resource_type", type: "enum", required: true, notes: "VIDEO | READING | QUIZ | FORUM | LAB." },
  { column: "activity_type", type: "enum", required: true, notes: "VIEW | SUBMIT | POST | COMMENT | DOWNLOAD." },
  { column: "timestamp", type: "ISO-8601", required: true, notes: "UTC; within the event's week." },
  { column: "duration_seconds", type: "int ≥ 0", required: true, notes: "Per-event duration." },
  { column: "quiz_score", type: "float 0-100", required: false, notes: "Only on QUIZ + SUBMIT rows; empty otherwise." },
  { column: "forum_posts", type: "int ≥ 0", required: true, notes: "1 on FORUM + POST rows, else 0." },
  { column: "prior_gpa", type: "float 0-4", required: true, notes: "Denormalised on every row for the student." },
  { column: "final_grade", type: "float 0-100", required: true, notes: "Denormalised on every row for the student." },
];

const SAMPLE_ROW = `student_id,course_id,week_number,resource_id,resource_type,activity_type,timestamp,duration_seconds,quiz_score,forum_posts,prior_gpa,final_grade
STU-0001,CS-201,1,CS-201-VID-001,VIDEO,VIEW,2026-01-12T10:00:00+00:00,540,,0,3.20,78.50
STU-0001,CS-201,3,CS-201-QUI-002,QUIZ,SUBMIT,2026-01-26T14:30:00+00:00,720,82.5,0,3.20,78.50
STU-0001,CS-201,5,CS-201-FOR-001,FORUM,POST,2026-02-09T09:15:00+00:00,180,,1,3.20,78.50`;
