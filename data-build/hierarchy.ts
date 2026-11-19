// Port of load_hierarchy() + the hierarchy-derived structures duplicated in
// both DataStore.load() (lines 216-251) and AdminDataStore.load_from_tps_admin()
// (lines 427-458) in dpr_ri_viewer.py - those two blocks are byte-for-byte
// identical in the Python source, so unlike there, this is built exactly
// once and shared by all four stores (matches the "wilayah hierarchy is
// shared across years" comment on PartyAnalysisTab/AdminAnalysisTab's
// `self._hier = store_2024`).
import { readCsvRows } from "./csv";
import type { HierarchyBundle } from "../shared/types";

export function buildHierarchyBundle(hierarchyCacheCsvPath: string): HierarchyBundle {
	const rows = readCsvRows(hierarchyCacheCsvPath);

	const provName: Record<string, string> = {};
	const dapilName: Record<string, string> = {};
	const kabName: Record<string, string> = {};
	const kecName: Record<string, string> = {};
	const dapilProvCode: Record<string, string> = {};
	const kabDapilId: Record<string, string> = {};

	const dapilByProvSet: Record<string, Set<string>> = {};
	const kabByDapilSet: Record<string, Set<string>> = {};
	const kecByKabSet: Record<string, Set<string>> = {};

	for (const row of rows) {
		const provCode = row.prov_code;
		const prov = row.prov;
		const kabCode = row.kab_code;
		const kabNameVal = row.kab_name;
		const kecCode = row.kec_code;
		const kecNameVal = row.kec_name;
		const dapilId = row.dapil_id;
		// dapil_label = prov + " " + last-2-digits-of-dapil_id, matches
		// `hierarchy["dapil_num"] = hierarchy["dapil_id"].str[-2:]` +
		// `hierarchy["dapil_label"] = hierarchy["prov"] + " " + hierarchy["dapil_num"]`.
		const dapilLabel = `${prov} ${dapilId.slice(-2)}`;

		provName[provCode] = prov;
		dapilName[dapilId] = dapilLabel;
		kabName[kabCode] = kabNameVal;
		kecName[kecCode] = kecNameVal;
		dapilProvCode[dapilId] = provCode;
		kabDapilId[kabCode] = dapilId;

		(dapilByProvSet[provCode] ??= new Set()).add(dapilId);
		(kabByDapilSet[dapilId] ??= new Set()).add(kabCode);
		(kecByKabSet[kabCode] ??= new Set()).add(kecCode);
	}

	const toArrayMap = (s: Record<string, Set<string>>) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, [...v]]));

	return {
		prov: Object.entries(provName)
			.map(([code, name]) => ({ code, name }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		dapil: Object.entries(dapilName)
			.map(([id, label]) => ({ id, label, provCode: dapilProvCode[id] }))
			.sort((a, b) => a.label.localeCompare(b.label)),
		kab: Object.entries(kabName)
			.map(([code, name]) => ({ code, name, dapilId: kabDapilId[code] }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		provName,
		dapilName,
		kabName,
		kecName,
		dapilByProv: toArrayMap(dapilByProvSet),
		kabByDapil: toArrayMap(kabByDapilSet),
		kecByKab: toArrayMap(kecByKabSet),
	};
}

export function loadTpsLookupIds(tpsLookupCacheCsvPath: string): Set<string> {
	const rows = readCsvRows(tpsLookupCacheCsvPath);
	return new Set(rows.map((r) => r.tps_id));
}
