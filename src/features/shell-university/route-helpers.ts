import { NextResponse } from "next/server";

import {
  ShellStoreNotSeededError,
  buildEnvelope,
} from "./data-store";
import type { ShellEntity } from "./types";

/** Build a Next.js route handler that serves the standard envelope for one entity. */
export function serveEntity(entity: ShellEntity) {
  return async function GET(): Promise<NextResponse> {
    try {
      const body = buildEnvelope(entity);
      return NextResponse.json(body, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (err) {
      if (err instanceof ShellStoreNotSeededError) {
        return NextResponse.json(
          { error: err.message, hint: "Run `npm run shell:seed` to populate the mock store." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        { status: 500 },
      );
    }
  };
}
