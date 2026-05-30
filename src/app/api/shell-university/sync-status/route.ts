import { NextResponse } from "next/server";

import {
  ShellStoreNotSeededError,
  readShellSyncStatus,
} from "@/features/shell-university/data-store";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(readShellSyncStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ShellStoreNotSeededError) {
      return NextResponse.json(
        {
          error: err.message,
          hint: "Run `npm run shell:seed` to populate the mock store.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
