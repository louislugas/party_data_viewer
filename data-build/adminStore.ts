// Port of AdminDataStore (dpr_ri_viewer.py): rolls voter-administration/
// turnout data up to prov/dapil/kab/kec.
//
//  - 2024 is TPS-level (load_from_tps_admin): tps_id is digit-sliced
//    (prov[:2] + kab[:4] + kec[:6]), "tps" = number of TPS rows with real data.
//  - 2019 is KELURAHAN-level (load_from_desa_admin): desa_code is digit-sliced
//    the same way, "tps" = the per-kelurahan TPS count read from the file,
//    summed over the group. (Changed 2026-08-14 in the Python app; see
//    build_admin_desa_2019.py.)
//
// prov/kab/kec are always sliced from the id's own digit structure, never
// joined against a lookup table - a left-join FROM a lookup silently drops any
// real row whose id isn't in it, undercounting every affected region.
// dapil_id still needs a kab_code -> dapil_id lookup (a kab never splits
// across dapil).
import { ADMIN_DISPLAY_COLS, ADMIN_DISPLAY_LABELS } from "../shared/partyConfig";
import { formatGlobalReport, validateStore } from "../shared/validate";
import type { FileKey, HierarchyBundle, LevelTable, StoreBundle, TpsCountByLevel, TpsCountTable } from "../shared/types";
import { readCsvRows, parseNumOrNull } from "./csv";

interface AdminRawRow {
	id: string; // tps_id (2024) or desa_code (2019)
	pemilih_terdaftar: number | null;
	suara_sah: number | null;
	suara_tidak_sah: number | null;
	suara_total: number | null;
	pengguna_hak_pilih: number | null;
	golput: number | null;
	hasData: boolean;
	units: number; // this row's contribution to the "tps" column
	prov_code: string;
	kab_code: string;
	kec_code: string;
	dapil_id: string | null;
}

function getField(row: AdminRawRow, col: string): number | null {
	switch (col) {
		case "pemilih_terdaftar":
			return row.pemilih_terdaftar;
		case "suara_sah":
			return row.suara_sah;
		case "suara_tidak_sah":
			return row.suara_tidak_sah;
		case "suara_total":
			return row.suara_total;
		case "pengguna_hak_pilih":
			return row.pengguna_hak_pilih;
		case "golput":
			return row.golput;
		default:
			return null;
	}
}

function rollup(
	rows: AdminRawRow[],
	groupKeyOf: (r: AdminRawRow) => string | null,
): { table: LevelTable; partialIds: string[]; tpsCountTable: TpsCountTable } {
	const sums: Record<string, Record<string, number>> = {};
	const anyReal: Record<string, boolean> = {};
	const allReal: Record<string, boolean> = {};
	const units: Record<string, number> = {};
	const groups = new Set<string>();

	for (const row of rows) {
		const key = groupKeyOf(row);
		if (key === null) continue; // dropped, matches pandas groupby dropping NaN group keys
		groups.add(key);
		const acc = (sums[key] ??= Object.fromEntries(ADMIN_DISPLAY_COLS.map((c) => [c, 0])));
		for (const c of ADMIN_DISPLAY_COLS) acc[c] += getField(row, c) ?? 0;
		allReal[key] = (allReal[key] ?? true) && row.hasData;
		if (row.hasData) anyReal[key] = true;
		units[key] = (units[key] ?? 0) + row.units;
	}

	const table: LevelTable = {};
	const tpsCountTable: TpsCountTable = {};
	const partialIds: string[] = [];
	for (const key of groups) {
		if (!anyReal[key]) continue; // group where NOT ONE underlying row has real data
		table[key] = sums[key];
		tpsCountTable[key] = units[key] ?? 0;
		if (!allReal[key]) partialIds.push(key);
	}
	partialIds.sort();
	return { table, partialIds, tpsCountTable };
}

function toRow(
	id: string,
	r: Record<string, string>,
	kabToDapil: Record<string, string>,
	unitsOf: (hasData: boolean) => number,
): AdminRawRow {
	const pemilihTerdaftar = parseNumOrNull(r.pemilih_dpt_j);
	const suaraSah = parseNumOrNull(r.suara_sah);
	const suaraTidakSah = parseNumOrNull(r.suara_tidak_sah);
	const suaraTotal = parseNumOrNull(r.suara_total);
	const penggunaHakPilih = parseNumOrNull(r.pengguna_total_j);
	// Golput is always computed here, never read from source, so both years
	// use the exact same formula.
	const golput = pemilihTerdaftar !== null && penggunaHakPilih !== null ? pemilihTerdaftar - penggunaHakPilih : null;
	const hasData = [pemilihTerdaftar, suaraSah, suaraTidakSah, suaraTotal, penggunaHakPilih, golput].some((v) => v !== null);
	const kabCode = id.slice(0, 4);
	return {
		id,
		pemilih_terdaftar: pemilihTerdaftar,
		suara_sah: suaraSah,
		suara_tidak_sah: suaraTidakSah,
		suara_total: suaraTotal,
		pengguna_hak_pilih: penggunaHakPilih,
		golput,
		hasData,
		units: unitsOf(hasData),
		prov_code: id.slice(0, 2),
		kab_code: kabCode,
		kec_code: id.slice(0, 6),
		dapil_id: kabToDapil[kabCode] ?? null,
	};
}

function finishStore(
	label: string,
	fileLabel: string,
	unit: string,
	rows: AdminRawRow[],
	unmatched: string[],
	hierarchy: HierarchyBundle,
): StoreBundle {
	// A row that exists in the file but has NA admin data - distinct from a
	// row that's absent from the file entirely.
	const naRows = rows
		.filter((r) => ADMIN_DISPLAY_COLS.some((c) => getField(r, c) === null))
		.map((r) => r.id)
		.sort();
	const unknownKab = rows
		.filter((r) => r.dapil_id === null)
		.map((r) => r.id)
		.sort();

	const provRollup = rollup(rows, (r) => r.prov_code);
	const dapilRollup = rollup(rows, (r) => r.dapil_id);
	const kabRollup = rollup(rows, (r) => r.kab_code);
	const kecRollup = rollup(rows, (r) => r.kec_code);

	const tpsCountByLevel: TpsCountByLevel = {
		nasional: provRollup.tpsCountTable,
		provinsi: dapilRollup.tpsCountTable,
		dapil: kabRollup.tpsCountTable,
		kabkota: kecRollup.tpsCountTable,
	};

	const fileNames: Record<FileKey, string> = {
		prov: `${fileLabel} (agregat provinsi)`,
		dapil: `${fileLabel} (agregat dapil)`,
		kab: `${fileLabel} (agregat kab/kota)`,
		kec: `${fileLabel} (agregat kecamatan)`,
	};

	const partyCols = [...ADMIN_DISPLAY_COLS];
	const validation = validateStore(
		hierarchy,
		fileNames,
		{
			prov: { ids: Object.keys(provRollup.table), table: provRollup.table },
			dapil: { ids: Object.keys(dapilRollup.table), table: dapilRollup.table },
			kab: { ids: Object.keys(kabRollup.table), table: kabRollup.table },
			kec: { ids: Object.keys(kecRollup.table), table: kecRollup.table },
		},
		partyCols,
		[], // ADMIN_DISPLAY_COLS never start with "jml_suara" - see validate.ts
	);

	const { lines, issueCount } = formatGlobalReport(label, fileNames, validation, {
		unit,
		naRows,
		unmatched,
		unknownKab,
		partialByLevel: [
			{ levelLabel: "Provinsi", ids: provRollup.partialIds, nameMap: hierarchy.provName },
			{ levelLabel: "Dapil", ids: dapilRollup.partialIds, nameMap: hierarchy.dapilName },
			{ levelLabel: "Kota/Kabupaten", ids: kabRollup.partialIds, nameMap: hierarchy.kabName },
			{ levelLabel: "Kecamatan", ids: kecRollup.partialIds, nameMap: hierarchy.kecName },
		],
	});

	return {
		key: label,
		label,
		partyCols,
		partyMap: ADMIN_DISPLAY_LABELS,
		fileNames,
		showTotalColumn: false, // summing votes+voters+golput together is meaningless
		showTpsColumn: true,
		tables: { prov: provRollup.table, dapil: dapilRollup.table, kab: kabRollup.table, kec: kecRollup.table },
		tpsCountByLevel,
		validationLines: lines,
		issueCount,
	};
}

function kabToDapilMap(hierarchy: HierarchyBundle): Record<string, string> {
	const m: Record<string, string> = {};
	for (const k of hierarchy.kab) m[k.code] = k.dapilId;
	return m;
}

// 2024: admin_tps_dprri_initial.csv - one row per TPS.
export function loadAdminStoreTps(
	label: string,
	adminCsvPath: string,
	fileLabel: string,
	tpsLookupIds: Set<string>,
	hierarchy: HierarchyBundle,
): StoreBundle {
	const kabToDapil = kabToDapilMap(hierarchy);
	const rows = readCsvRows(adminCsvPath).map((r) => toRow(r.tps_id, r, kabToDapil, (hasData) => (hasData ? 1 : 0)));
	// Informational only - tps_lookup is dpr_ri_out.csv's own (2024-era) TPS
	// master list; a TPS legitimately renumbered/added between elections would
	// otherwise have its real votes silently dropped if this were a hard join
	// requirement, so it's never used to place TPS into the hierarchy.
	const unmatched = [...new Set(rows.map((r) => r.id))].filter((id) => !tpsLookupIds.has(id)).sort();
	return finishStore(label, fileLabel, "TPS", rows, unmatched, hierarchy);
}

// 2019: admin_desa_dprri_initial_2019.csv - one row per kelurahan/desa, with a
// plain per-kelurahan TPS count in the "tps" column.
export function loadAdminStoreDesa(
	label: string,
	adminCsvPath: string,
	fileLabel: string,
	hierarchy: HierarchyBundle,
): StoreBundle {
	const kabToDapil = kabToDapilMap(hierarchy);
	const rows = readCsvRows(adminCsvPath).map((r) => toRow(r.desa_code, r, kabToDapil, () => parseNumOrNull(r.tps) ?? 0));
	return finishStore(label, fileLabel, "kelurahan", rows, [], hierarchy);
}
