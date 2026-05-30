import { listStudentsForDropdown } from "@/server/queries/students";

import HonestyNote from "@/components/HonestyNote";
import PageHeader from "@/components/PageHeader";
import WhatIfSimulator from "@/components/WhatIfSimulator";

export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  const students = await listStudentsForDropdown();

  return (
    <div className="p-8 space-y-8">
      <PageHeader
        title="What-if simulator"
        subtitle="Apply a hypothetical change to a student's behaviour and see the projected effect on their final grade."
      />

      <HonestyNote>
        These projections use the <strong>cohort-average effect</strong> from the Phase 3
        regression, applied to the chosen student's current feature values. They are{" "}
        <strong>model-based simulations</strong>, not personal causal effects. Headroom limits
        large changes; confidence chips reflect refutation results.
      </HonestyNote>

      <WhatIfSimulator students={students} />
    </div>
  );
}
