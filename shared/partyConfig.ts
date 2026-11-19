// Direct port of the module-level constants in dpr_ri_viewer.py (lines
// 71-125, 107-125). Keep these in lockstep with the Python source if the
// underlying data ever changes - see SESSION_NOTES_dpr_ri_viewer.txt for the
// provenance of the party matching table.
import type { FileKey, LevelDef, LevelKey } from "./types";

// 2024 party codes as used in party_code.csv / kec_dprRI_party.csv (1-17, 24).
export const PARTY_CODES_2024 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 24];

// Canonical 2019 KPU national party order (party numbers 1-16). Must match
// ahsan/script/build_kec_dprri_party_2019.py's PARTY_ORDER_2019.
export const PARTY_NAMES_2019 = [
	"PKB", "Gerindra", "PDIP", "Golkar", "NasDem", "Garuda", "Berkarya",
	"PKS", "Perindo", "PPP", "PSI", "PAN", "Hanura", "Demokrat", "PBB", "PKPI",
];

// 2019 <-> 2024 party matching, confirmed with the user (abbreviations differ
// slightly for several parties - e.g. "PDIP" (2019) is the same party as
// "PDI-P" (2024) - and several parties changed their KPU party number between
// elections). [displayName, code2019OrNull, code2024OrNull]
export const PARTY_MATCH: [string, number | null, number | null][] = [
	["PKB", 1, 1],
	["Gerindra", 2, 2],
	["PDI-P", 3, 3],
	["Golkar", 4, 4],
	["NasDem", 5, 5],
	["Garuda", 6, 11],
	["PKS", 8, 8],
	["Perindo", 9, 16],
	["PPP", 10, 17],
	["PSI", 11, 15],
	["PAN", 12, 12],
	["Hanura", 13, 10],
	["Demokrat", 14, 14],
	["PBB", 15, 13],
	["Berkarya", 7, null],
	["PKPI", 16, null],
	["Partai Buruh", null, 6],
	["Partai Gelora", null, 7],
	["PKN", null, 9],
	["Partai Ummat", null, 24],
];

export function partyCodesFor(name: string): [number | null, number | null] {
	const entry = PARTY_MATCH.find(([n]) => n === name);
	return entry ? [entry[1], entry[2]] : [null, null];
}

export const LEVELS: LevelDef[] = [
	{ key: "nasional", label: "Nasional" },
	{ key: "provinsi", label: "Provinsi" },
	{ key: "dapil", label: "Dapil" },
	{ key: "kabkota", label: "Kota/Kabupaten" },
];

export const CHILD_LABEL: Record<LevelKey, string> = {
	nasional: "Provinsi",
	provinsi: "Dapil",
	dapil: "Kota/Kabupaten",
	kabkota: "Kecamatan",
};

// Which level-file (by role) supplies the child rows for each selected level.
export const LEVEL_TO_FILEKEY: Record<LevelKey, FileKey> = {
	nasional: "prov",
	provinsi: "dapil",
	dapil: "kab",
	kabkota: "kec",
};

// Level a selected row's own code belongs to, once you drill "into" it - no
// entry for "kabkota" (kecamatan is the deepest level this app shows).
export const DRILL_NEXT: Partial<Record<LevelKey, LevelKey>> = {
	nasional: "provinsi",
	provinsi: "dapil",
	dapil: "kabkota",
};

// Level a "go up" click lands on, keyed by the current level.
export const LEVEL_PARENT: Partial<Record<LevelKey, LevelKey>> = {
	kabkota: "dapil",
	dapil: "provinsi",
	provinsi: "nasional",
};

// Raw column names, as they appear in both admin_tps_dprri_initial.csv (2024)
// and admin_tps_dprri_initial_2019.csv (2019, which only ever has these 5).
export const ADMIN_RAW_COLS = ["pemilih_dpt_j", "suara_sah", "suara_tidak_sah", "suara_total", "pengguna_total_j"] as const;

// Display columns for the admin/turnout tabs - a deliberately small subset.
// "golput" is computed, not read (pemilih_terdaftar - pengguna_hak_pilih).
export const ADMIN_DISPLAY_COLS = [
	"pemilih_terdaftar", "suara_sah", "suara_tidak_sah", "suara_total", "pengguna_hak_pilih", "golput",
] as const;

export const ADMIN_DISPLAY_LABELS: Record<string, string> = {
	pemilih_terdaftar: "Pemilih Terdaftar",
	suara_sah: "Suara Sah",
	suara_tidak_sah: "Suara Tidak Sah",
	suara_total: "Total Suara",
	pengguna_hak_pilih: "Pengguna Hak Pilih",
	golput: "Golput",
};

// Metrics compared side by side in Analisa Data Admin - same fields as the
// Data Admin tabs, plus TPS coverage, in display order.
export const ADMIN_ANALYSIS_METRICS: [string, string][] = [
	["tps", "TPS"],
	...ADMIN_DISPLAY_COLS.map((k): [string, string] => [k, ADMIN_DISPLAY_LABELS[k]]),
];
