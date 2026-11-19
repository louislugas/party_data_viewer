// Port of DataStore.load() (dpr_ri_viewer.py lines 212-265) - loads one
// election year's pre-aggregated party-vote CSVs (prov/dapil/kab/kec) and
// validates them against the shared wilayah hierarchy.
import { join } from "node:path";
import { validateStore, formatGlobalReport } from "../shared/validate";
import type { FileKey, HierarchyBundle, StoreBundle } from "../shared/types";
import { buildIndexedTable, readCsvRows } from "./csv";

export interface YearConfig {
	key: string;
	label: string;
	readDir: string;
	suffix: string; // "_2019" or "" for 2024
	partyMap: Record<string, string>; // party column -> display name
}

export function loadPartyStore(cfg: YearConfig, hierarchy: HierarchyBundle): StoreBundle {
	const fileNames: Record<FileKey, string> = {
		prov: `prov_dprRI_party${cfg.suffix}.csv`,
		dapil: `dapil_dprRI_party${cfg.suffix}.csv`,
		kab: `kab_dprRI_party${cfg.suffix}.csv`,
		kec: `kec_dprRI_party${cfg.suffix}.csv`,
	};

	const provRows = readCsvRows(join(cfg.readDir, fileNames.prov));
	// party_cols = columns starting with "jml_suara_total_" - the 2024 files
	// also carry "jml_suara_partai_*" columns the app never reads.
	const partyCols = Object.keys(provRows[0] ?? {}).filter((c) => c.startsWith("jml_suara_total_"));

	const provRaw = buildIndexedTable(provRows, "prov_id", partyCols);
	const dapilRaw = buildIndexedTable(readCsvRows(join(cfg.readDir, fileNames.dapil)), "dapil_id", partyCols);
	const kabRaw = buildIndexedTable(readCsvRows(join(cfg.readDir, fileNames.kab)), "kab_id", partyCols);
	const kecRaw = buildIndexedTable(readCsvRows(join(cfg.readDir, fileNames.kec)), "kec_id", partyCols);

	const validation = validateStore(
		hierarchy,
		fileNames,
		{ prov: provRaw, dapil: dapilRaw, kab: kabRaw, kec: kecRaw },
		partyCols,
		partyCols, // every party column already starts with "jml_suara" - see validate.ts
	);
	const { lines, issueCount } = formatGlobalReport(cfg.label, fileNames, validation);

	return {
		key: cfg.key,
		label: cfg.label,
		partyCols,
		partyMap: cfg.partyMap,
		fileNames,
		showTotalColumn: true,
		showTpsColumn: false,
		tables: { prov: provRaw.table, dapil: dapilRaw.table, kab: kabRaw.table, kec: kecRaw.table },
		validationLines: lines,
		issueCount,
	};
}
