// Generic CSV reading helpers used by hierarchy.ts/partyStore.ts/adminStore.ts.
// Runs once at app startup in the main process (mirrors dpr_ri_viewer.py's
// blocking pd.read_csv calls during _load_data).
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import type { LevelTable, NumRow } from "../shared/types";

export function readCsvRows(path: string): Record<string, string>[] {
	const content = readFileSync(path, "utf-8");
	return parse(content, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
}

// Empty cells (missing party votes / admin data) are pandas NaN in the
// Python app - represented here as null, distinct from a real 0 vote count.
export function parseNumOrNull(v: string | undefined): number | null {
	if (v === undefined) return null;
	const trimmed = v.trim();
	if (trimmed === "" || trimmed.toUpperCase() === "NA" || trimmed.toUpperCase() === "NAN") return null;
	const n = Number(trimmed);
	return Number.isNaN(n) ? null : n;
}

export interface IndexedTable {
	// Every row's id in file order, duplicates included - the raw material
	// for validate.ts's duplicate-id detection (df.index.duplicated() in Python).
	ids: string[];
	// Deduplicated lookup, first occurrence wins - matches build_view()'s
	// `row = row.iloc[0]` handling of a duplicate id in the source file.
	table: LevelTable;
}

export function buildIndexedTable(rows: Record<string, string>[], idCol: string, numCols: string[]): IndexedTable {
	const ids: string[] = [];
	const table: LevelTable = {};
	for (const row of rows) {
		const id = row[idCol];
		ids.push(id);
		if (id in table) continue;
		const numRow: NumRow = {};
		for (const c of numCols) numRow[c] = parseNumOrNull(row[c]);
		table[id] = numRow;
	}
	return { ids, table };
}
