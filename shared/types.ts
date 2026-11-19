// Pure TS domain types shared by the data builder (data-build/, scripts/) and
// the SvelteKit app (src/lib/). No Node or DOM APIs here.

export type LevelKey = "nasional" | "provinsi" | "dapil" | "kabkota";
export type FileKey = "prov" | "dapil" | "kab" | "kec";
export type RowStatus = "OK" | "DATA KOSONG" | "HILANG";
export type LogTag = "header" | "ok" | "warn" | "error";

export interface LevelDef {
	key: LevelKey;
	label: string;
}

export interface LevelSelection {
	provCode?: string;
	dapilId?: string;
	kabCode?: string;
}

export interface ValidationLine {
	tag: LogTag;
	text: string;
}

// A single loaded per-level party/admin CSV, indexed by id (prov_code /
// dapil_id / kab_code / kec_code) - the TS equivalent of a pandas frame
// after `.set_index(id_col)`. Values are numeric columns only; null stands
// in for pandas NaN (missing).
export type NumRow = Record<string, number | null>;
export type LevelTable = Record<string, NumRow>;

export interface StoreTables {
	prov: LevelTable;
	dapil: LevelTable;
	kab: LevelTable;
	kec: LevelTable;
}

// TPS-coverage count per region id, one map per level - only populated for
// admin stores (AdminDataStore.build_view()'s "tps" column).
export type TpsCountTable = Record<string, number>;
export interface TpsCountByLevel {
	nasional: TpsCountTable;
	provinsi: TpsCountTable;
	dapil: TpsCountTable;
	kabkota: TpsCountTable;
}

export interface StoreBundle {
	key: string; // "2019" | "2024" | "admin2019" | "admin2024"
	label: string;
	partyCols: string[]; // ordered columns to display (party columns, or ADMIN_DISPLAY_COLS)
	partyMap: Record<string, string>; // column -> display label
	fileNames: Record<FileKey, string>;
	showTotalColumn: boolean;
	showTpsColumn: boolean;
	tables: StoreTables;
	tpsCountByLevel?: TpsCountByLevel;
	validationLines: ValidationLine[];
	issueCount: number;
}

export interface HierarchyBundle {
	prov: { code: string; name: string }[]; // sorted by name
	dapil: { id: string; label: string; provCode: string }[]; // sorted by label
	kab: { code: string; name: string; dapilId: string }[]; // sorted by name
	provName: Record<string, string>;
	dapilName: Record<string, string>;
	kabName: Record<string, string>;
	kecName: Record<string, string>;
	dapilByProv: Record<string, string[]>;
	kabByDapil: Record<string, string[]>;
	kecByKab: Record<string, string[]>;
}

export interface AppDataBundle {
	hierarchy: HierarchyBundle;
	stores: {
		party2019: StoreBundle;
		party2024: StoreBundle;
		admin2019: StoreBundle;
		admin2024: StoreBundle;
	};
	// Written by scripts/build-data.ts.
	meta?: { generatedAt: string };
}

// ---- build_view() result shape ----

export interface ViewRow {
	code: string;
	name: string;
	values: (number | null)[]; // aligned with StoreBundle.partyCols
	tps?: number;
	total: number; // build_view() always sums to a real number (0 when all missing) - see shared/view.ts
	status: RowStatus;
}

export interface MissingEntry {
	code: string;
	name: string;
}

export interface BuildViewResult {
	rows: ViewRow[];
	missing: MissingEntry[];
}

// ---- cross-year analysis shared cell shape ----

// A party's vote count for a region in one year: a real number, null (region
// missing/empty that year), or "NC" (party did not compete that year at all).
export type CellValue = number | null | "NC";
