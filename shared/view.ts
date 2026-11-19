// Port of DataStore.build_view()/AdminDataStore.build_view()/LevelControls._child_view()
// (dpr_ri_viewer.py lines 368-402, 536-540, 833-848) plus the sort/format/delta
// helpers shared across YearTab/PartyAnalysisTab/AdminAnalysisTab. Pure
// functions over the in-memory tables an AppDataBundle already carries - no
// I/O, runs in the renderer on every dropdown change / column-header click.
import { CHILD_LABEL, DRILL_NEXT } from "./partyConfig";
import type {
	BuildViewResult,
	CellValue,
	HierarchyBundle,
	LevelKey,
	LevelSelection,
	MissingEntry,
	StoreBundle,
	ValidationLine,
	ViewRow,
} from "./types";

export function buildView(level: LevelKey, selection: LevelSelection, hierarchy: HierarchyBundle, store: StoreBundle): BuildViewResult {
	let ids: string[];
	let table: Record<string, Record<string, number | null>>;
	let nameMap: Record<string, string>;

	switch (level) {
		case "nasional":
			ids = Object.keys(hierarchy.provName).sort();
			table = store.tables.prov;
			nameMap = hierarchy.provName;
			break;
		case "provinsi":
			ids = [...(hierarchy.dapilByProv[selection.provCode ?? ""] ?? [])].sort();
			table = store.tables.dapil;
			nameMap = hierarchy.dapilName;
			break;
		case "dapil":
			ids = [...(hierarchy.kabByDapil[selection.dapilId ?? ""] ?? [])].sort();
			table = store.tables.kab;
			nameMap = hierarchy.kabName;
			break;
		case "kabkota":
			ids = [...(hierarchy.kecByKab[selection.kabCode ?? ""] ?? [])].sort();
			table = store.tables.kec;
			nameMap = hierarchy.kecName;
			break;
	}

	const rows: ViewRow[] = [];
	const missing: BuildViewResult["missing"] = [];
	const tpsCounts = store.showTpsColumn ? store.tpsCountByLevel?.[level] : undefined;

	for (const id of ids) {
		const row = table[id];
		let values: (number | null)[];
		let status: ViewRow["status"];
		if (row) {
			values = store.partyCols.map((c) => (c in row ? row[c] : null));
			status = values.some((v) => v === null) ? "DATA KOSONG" : "OK";
		} else {
			values = store.partyCols.map(() => null);
			status = "HILANG";
			missing.push({ code: id, name: nameMap[id] ?? id });
		}
		// Mirrors `sum(v for v in values if pd.notna(v))` - always a real
		// number, 0 (not null) when every value is missing.
		const total = values.reduce<number>((s, v) => (v !== null ? s + v : s), 0);
		const viewRow: ViewRow = { code: id, name: nameMap[id] ?? id, values, total, status };
		if (tpsCounts) viewRow.tps = tpsCounts[id] ?? 0;
		rows.push(viewRow);
	}

	return { rows, missing };
}

// Port of YearTab._log_view_issues - a live validation-log line appended
// every time the current view has rows missing from its source file (the
// Python app re-appends this on every _refresh(), including re-sorts of the
// same view - callers replicate that by calling this inside whatever
// reactive block already recomputes on selection/sort changes).
export function formatMissingSample(missing: MissingEntry[], limit = 10): string {
	const limited = missing
		.slice(0, limit)
		.map((m) => `${m.code} (${m.name})`)
		.join(", ");
	return missing.length > limit ? `${limited} ... (+${missing.length - limit} lainnya)` : limited;
}

export function formatViewIssuesLine(level: LevelKey, missing: MissingEntry[], fileName: string): ValidationLine | null {
	if (!missing.length) return null;
	const label = CHILD_LABEL[level];
	return { tag: "warn", text: `[${label}] ${missing.length} baris hilang dari ${fileName}: ${formatMissingSample(missing)}` };
}

// The build_view() one level below `level`, scoped to `code` - used by the
// sidebar summary to show what's "below" the selected row. Returns null at
// the deepest level (kabkota has no entry in DRILL_NEXT).
export function childView(level: LevelKey, code: string, hierarchy: HierarchyBundle, store: StoreBundle): BuildViewResult | null {
	const nextLevel = DRILL_NEXT[level];
	if (!nextLevel) return null;
	const selection: LevelSelection = {};
	if (nextLevel === "provinsi") selection.provCode = code;
	else if (nextLevel === "dapil") selection.dapilId = code;
	else if (nextLevel === "kabkota") selection.kabCode = code;
	return buildView(nextLevel, selection, hierarchy, store);
}

// ------------------------------------------------------------------
// Sorting - numeric columns always trail null/NC values at the end,
// regardless of direction (mirrors pandas' na_position="last" in
// YearTab._sort_df, and the numeric/other split in PartyAnalysisTab/
// AdminAnalysisTab._sort_rows).
// ------------------------------------------------------------------
export function sortByNumericField<T>(rows: T[], ascending: boolean, getVal: (row: T) => number | null): T[] {
	const withVal = rows.map((r) => ({ r, v: getVal(r) }));
	const numeric = withVal.filter((x) => x.v !== null) as { r: T; v: number }[];
	const other = withVal.filter((x) => x.v === null);
	numeric.sort((a, b) => (ascending ? a.v - b.v : b.v - a.v));
	return [...numeric, ...other].map((x) => x.r);
}

export function sortViewRows(rows: ViewRow[], sortCol: string | null, ascending: boolean, partyCols: string[]): ViewRow[] {
	if (!sortCol) return rows;
	if (sortCol === "code") {
		return [...rows].sort((a, b) => (ascending ? Number(a.code) - Number(b.code) : Number(b.code) - Number(a.code)));
	}
	if (sortCol === "name") {
		return [...rows].sort((a, b) => (ascending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
	}
	if (sortCol === "status") {
		return [...rows].sort((a, b) => (ascending ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status)));
	}
	if (sortCol === "total") return sortByNumericField(rows, ascending, (r) => r.total);
	if (sortCol === "tps") return sortByNumericField(rows, ascending, (r) => r.tps ?? null);
	const idx = partyCols.indexOf(sortCol);
	if (idx < 0) return rows;
	return sortByNumericField(rows, ascending, (r) => r.values[idx]);
}

// ------------------------------------------------------------------
// Cross-year formatting/delta helpers - direct port of
// CrossYearAnalysisTab._is_number/_fmt/_fmt_pct/_delta.
// ------------------------------------------------------------------
export function isNumber(v: CellValue): v is number {
	return typeof v === "number";
}

export function fmtCell(v: CellValue): string {
	if (v === "NC") return "NC";
	if (v === null) return "-";
	return Math.trunc(v).toLocaleString("en-US");
}

export function fmtPct(v: number | null): string {
	if (v === null) return "-";
	return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function computeDelta(v19: CellValue, v24: CellValue): { delta: number | null; pct: number | null } {
	if (!isNumber(v19) || !isNumber(v24)) return { delta: null, pct: null };
	const delta = v24 - v19;
	const pct = v19 !== 0 ? (delta / v19) * 100 : null;
	return { delta, pct };
}

// ------------------------------------------------------------------
// Cell lookups against an already-built view (the code -> ViewRow index of a
// buildView()/childView() result) - mirrors PartyAnalysisTab/AdminAnalysisTab
// doing `df.set_index("code")` then `.loc[code, col]` on the *rendered*
// dataframe, never the raw store table.
// ------------------------------------------------------------------
export function indexViewRows(result: BuildViewResult): Map<string, ViewRow> {
	return new Map(result.rows.map((r) => [r.code, r]));
}

// Party-analysis cell value: col === null means the party didn't compete
// that year at all (NC), distinct from a region simply missing data (null).
export function partyCellValue(index: Map<string, ViewRow>, code: string, col: string | null, partyCols: string[]): CellValue {
	if (col === null) return "NC";
	const row = index.get(code);
	if (!row) return null;
	const idx = partyCols.indexOf(col);
	return idx >= 0 ? row.values[idx] : null;
}

// Admin-analysis metric value: "tps" reads the row's TPS-coverage count,
// every other key is looked up in partyCols (== ADMIN_DISPLAY_COLS there).
export function metricValue(index: Map<string, ViewRow>, code: string, key: string, partyCols: string[]): number | null {
	const row = index.get(code);
	if (!row) return null;
	if (key === "tps") return row.tps ?? null;
	const idx = partyCols.indexOf(key);
	return idx >= 0 ? row.values[idx] : null;
}

// ------------------------------------------------------------------
// PartyAnalysisTab sidebar arrow-chart entries - port of _build_arrow_entries.
// One (code, name, v19, v24) tuple per child region, sorted by biggest 2024
// value first; NC/missing 2024 values trail at the end.
// ------------------------------------------------------------------
export interface ArrowEntry {
	code: string;
	name: string;
	v19: CellValue;
	v24: CellValue;
}

export function buildArrowEntries(
	df19: BuildViewResult | null,
	df24: BuildViewResult | null,
	col19: string | null,
	col24: string | null,
	partyCols19: string[],
	partyCols24: string[],
): ArrowEntry[] {
	if (!df19 || !df24) return [];
	const index19 = indexViewRows(df19);
	const index24 = indexViewRows(df24);
	const entries: ArrowEntry[] = df24.rows.map((row24) => ({
		code: row24.code,
		name: row24.name,
		v19: partyCellValue(index19, row24.code, col19, partyCols19),
		v24: partyCellValue(index24, row24.code, col24, partyCols24),
	}));
	const numeric = entries.filter((e) => isNumber(e.v24));
	const other = entries.filter((e) => !isNumber(e.v24));
	numeric.sort((a, b) => (b.v24 as number) - (a.v24 as number));
	return [...numeric, ...other];
}
