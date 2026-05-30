import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description ? (
        <div className="mt-2 text-sm text-slate-500 max-w-md mx-auto">{description}</div>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
