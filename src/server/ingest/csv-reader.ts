import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

import {
  validateRow,
  type RawCsvRow,
  type ValidatedRow,
  type ValidationError,
} from "./row-schema";

export interface CsvReadResult {
  rows: ValidatedRow[];
  errors: ValidationError[];
}

/**
 * Parse and validate a CSV from an in-memory buffer (or string).
 *
 * Phase 6's upload pipeline calls this directly with the uploaded file's
 * contents. The path-based variant {@link readAndValidateCsv} is a thin
 * wrapper that adds a filesystem read.
 */
export function parseAndValidateCsv(source: Buffer | string): CsvReadResult {
  const records = parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as RawCsvRow[];

  const rows: ValidatedRow[] = [];
  const errors: ValidationError[] = [];

  records.forEach((raw, i) => {
    // +2 = 1-based row numbering + 1 header line.
    const outcome = validateRow(raw, i + 2);
    if (outcome.ok) rows.push(outcome.row);
    else errors.push(...outcome.errors);
  });

  return { rows, errors };
}

/**
 * Read and validate the CSV at `csvPath`.
 *
 * Loads the file into memory — fine at our scale (~50k rows / ~5 MB). For
 * 10M+ row imports, switch to a streaming parse via `csv-parse` and yield
 * validated rows lazily.
 */
export function readAndValidateCsv(csvPath: string): CsvReadResult {
  return parseAndValidateCsv(readFileSync(csvPath));
}
