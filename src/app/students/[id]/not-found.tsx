import Link from "next/link";

import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function StudentNotFound() {
  return (
    <div className="p-8 space-y-8">
      <PageHeader title="Student not found" />
      <EmptyState
        title="No student with that ID."
        description="Check the cohort table on the overview page for valid identifiers (e.g. STU-0042)."
        action={
          <Link
            href="/"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
