// Port of DataStore._check_file/_validate/format_global_report and
// AdminDataStore's format_global_report override (dpr_ri_viewer.py lines
// 195-200, 267-363, 542-578). TS doesn't need the subclass-override dance -
// admin-only diagnostics are just an optional extra section, spliced in at
// the same point the Python override does it (after the cross-check, before
// the final total-issues line).
import type { HierarchyBundle, LevelTable, LogTag, ValidationLine } from "./types";

export function joinList(items: (string | number)[], limit = 15): string {
	const text = items.slice(0, limit).map(String).join(", ");
	return items.length > limit ? `${text} ... (+${items.length - limit} lainnya)` : text;
}

export interface FileCheckResult {
	level: string;
	file: string;
	expected: number;
	present: number;
	missing: string[];
	orphan: string[];
	duplicate: string[];
	nan: string[];
	negative: string[];
}

// Raw per-level data as loaded from a CSV, before build_view() ever runs:
// `ids` is every row's id in file order (may contain duplicates), `table` is
// the deduplicated (first-occurrence-wins) lookup also shipped in StoreBundle.
export interface RawLevelData {
	ids: string[];
	table: LevelTable;
}

export function checkFile(levelLabel: string, fileName: string, expectedIds: Set<string>, raw: RawLevelData, nanNegativeCols: string[]): FileCheckResult {
	const fileIds = new Set(raw.ids);
	const seen = new Set<string>();
	const duplicate = new Set<string>();
	for (const id of raw.ids) {
		if (seen.has(id)) duplicate.add(id);
		seen.add(id);
	}

	// Only meaningful for party-vote columns ("jml_suara_total_*") - matches
	// Python's `c.startswith("jml_suara")` filter, which is why this is
	// always a no-op (empty nanNegativeCols) for admin/turnout stores.
	const nan: string[] = [];
	const negative: string[] = [];
	if (nanNegativeCols.length > 0) {
		for (const id of fileIds) {
			const row = raw.table[id];
			if (!row) continue;
			if (nanNegativeCols.some((c) => row[c] === null)) nan.push(id);
			if (nanNegativeCols.some((c) => (row[c] ?? 0) < 0)) negative.push(id);
		}
	}

	return {
		level: levelLabel,
		file: fileName,
		expected: expectedIds.size,
		present: fileIds.size,
		missing: [...expectedIds].filter((id) => !fileIds.has(id)).sort(),
		orphan: [...fileIds].filter((id) => !expectedIds.has(id)).sort(),
		duplicate: [...duplicate].sort(),
		nan: nan.sort(),
		negative: negative.sort(),
	};
}

export interface KabMissingDetail {
	kabCode: string;
	name: string;
	expectedKec: number;
	presentKec: number;
}

export interface RawStoreData {
	prov: RawLevelData;
	dapil: RawLevelData;
	kab: RawLevelData;
	kec: RawLevelData;
}

export interface LevelValidation {
	prov: FileCheckResult;
	dapil: FileCheckResult;
	kab: FileCheckResult;
	kec: FileCheckResult;
	kabMissingDetail: KabMissingDetail[];
	provDapilSumMismatch: string[];
}

export function validateStore(
	hierarchy: HierarchyBundle,
	fileNames: Record<"prov" | "dapil" | "kab" | "kec", string>,
	raw: RawStoreData,
	partyCols: string[],
	nanNegativeCols: string[],
): LevelValidation {
	const prov = checkFile("Provinsi", fileNames.prov, new Set(Object.keys(hierarchy.provName)), raw.prov, nanNegativeCols);
	const dapil = checkFile("Dapil", fileNames.dapil, new Set(Object.keys(hierarchy.dapilName)), raw.dapil, nanNegativeCols);
	const kab = checkFile("Kota/Kabupaten", fileNames.kab, new Set(Object.keys(hierarchy.kabName)), raw.kab, nanNegativeCols);
	const kec = checkFile("Kecamatan", fileNames.kec, new Set(Object.keys(hierarchy.kecName)), raw.kec, nanNegativeCols);

	// For every kab missing from the kab-level file, how much of its
	// underlying kecamatan-level data is actually available.
	const kecPresent = new Set(Object.keys(raw.kec.table));
	const kabMissingDetail: KabMissingDetail[] = kab.missing.map((kabCode) => {
		const expected = new Set(hierarchy.kecByKab[kabCode] ?? []);
		const present = [...expected].filter((k) => kecPresent.has(k));
		return { kabCode, name: hierarchy.kabName[kabCode] ?? kabCode, expectedKec: expected.size, presentKec: present.length };
	});

	// Cross-check: sum of a province's dapils should equal the province's own row.
	const provOfDapil: Record<string, string> = {};
	for (const d of hierarchy.dapil) provOfDapil[d.id] = d.provCode;
	const summedByProv: Record<string, Record<string, number>> = {};
	for (const [dapilId, row] of Object.entries(raw.dapil.table)) {
		const prov = provOfDapil[dapilId];
		if (!prov) continue;
		const acc = (summedByProv[prov] ??= Object.fromEntries(partyCols.map((c) => [c, 0])));
		for (const c of partyCols) acc[c] += row[c] ?? 0;
	}
	const provDapilSumMismatch: string[] = [];
	for (const [prov, summed] of Object.entries(summedByProv)) {
		const provRow = raw.prov.table[prov];
		if (!provRow) continue;
		let diff = 0;
		for (const c of partyCols) diff += Math.abs(summed[c] - (provRow[c] ?? 0));
		if (diff > 1e-6) provDapilSumMismatch.push(prov);
	}
	provDapilSumMismatch.sort();

	return { prov, dapil, kab, kec, kabMissingDetail, provDapilSumMismatch };
}

export interface AdminDiagnostics {
	// What one source row is: "TPS" (2024, per-TPS source) or "kelurahan"
	// (2019, per-kelurahan source) - Python's AdminDataStore._unit_label.
	unit: string;
	naRows: string[];
	// Only ever populated for the TPS-level source (TPS ids missing from
	// dpr_ri_out.csv's own TPS list); always empty for kelurahan-level.
	unmatched: string[];
	unknownKab: string[];
	partialByLevel: { levelLabel: string; ids: string[]; nameMap: Record<string, string> }[];
}

function capitalizeUnit(unit: string): string {
	return unit === unit.toUpperCase() ? unit : unit.charAt(0).toUpperCase() + unit.slice(1);
}

export function formatGlobalReport(
	label: string,
	fileNames: Record<"prov" | "dapil" | "kab" | "kec", string>,
	validation: LevelValidation,
	adminDiagnostics?: AdminDiagnostics,
): { lines: ValidationLine[]; issueCount: number } {
	const lines: ValidationLine[] = [{ tag: "header", text: `=== Validasi Data ${label} (dpr_ri/read) ===` }];
	let totalIssues = 0;

	for (const key of ["prov", "dapil", "kab", "kec"] as const) {
		const v = validation[key];
		const counts = {
			missing: v.missing.length,
			orphan: v.orphan.length,
			duplicate: v.duplicate.length,
			nan: v.nan.length,
			negative: v.negative.length,
		};
		const levelIssues = Object.values(counts).reduce((a, b) => a + b, 0);
		totalIssues += levelIssues;
		const tag: LogTag = levelIssues === 0 ? "ok" : "warn";
		lines.push({ tag, text: `[${v.level}] ${v.file}: ${v.present}/${v.expected} baris` });
		if (counts.missing) lines.push({ tag: "error", text: `   - ${counts.missing} kode hilang: ${joinList(v.missing)}` });
		if (counts.orphan) lines.push({ tag: "error", text: `   - ${counts.orphan} kode tak dikenal (tidak ada di wilayah): ${joinList(v.orphan)}` });
		if (counts.duplicate) lines.push({ tag: "error", text: `   - ${counts.duplicate} kode duplikat: ${joinList(v.duplicate)}` });
		if (counts.nan) lines.push({ tag: "warn", text: `   - ${counts.nan} baris punya nilai kosong (NaN): ${joinList(v.nan)}` });
		if (counts.negative) lines.push({ tag: "error", text: `   - ${counts.negative} baris punya nilai suara negatif: ${joinList(v.negative)}` });
	}

	if (validation.kabMissingDetail.length) {
		lines.push({ tag: "header", text: `--- Detail kab/kota yang hilang dari ${fileNames.kab} ---` });
		for (const d of validation.kabMissingDetail) {
			if (d.expectedKec && d.presentKec === d.expectedKec) {
				lines.push({ tag: "warn", text: `   ${d.kabCode} ${d.name}: baris kab hilang, tapi semua ${d.expectedKec} kecamatan tersedia` });
			} else if (d.presentKec) {
				lines.push({ tag: "warn", text: `   ${d.kabCode} ${d.name}: baris kab hilang, ${d.presentKec}/${d.expectedKec} kecamatan tersedia` });
			} else {
				lines.push({ tag: "error", text: `   ${d.kabCode} ${d.name}: tidak ada data sama sekali (${d.expectedKec} kecamatan diharapkan)` });
			}
		}
	}

	lines.push({ tag: "header", text: "--- Cek silang: total provinsi vs jumlah dapil-nya ---" });
	if (validation.provDapilSumMismatch.length) {
		totalIssues += validation.provDapilSumMismatch.length;
		lines.push({ tag: "error", text: `   ${validation.provDapilSumMismatch.length} provinsi tidak cocok: ${joinList(validation.provDapilSumMismatch)}` });
	} else {
		lines.push({ tag: "ok", text: "   Semua provinsi cocok dengan jumlah dapil-nya." });
	}

	if (adminDiagnostics) {
		const { unit, naRows, unmatched, unknownKab, partialByLevel } = adminDiagnostics;
		const Unit = capitalizeUnit(unit);
		if (naRows.length) {
			totalIssues += naRows.length;
			lines.push({ tag: "header", text: `--- ${Unit} dengan data kosong (NA) di sumber admin ---` });
			lines.push({ tag: "error", text: `   ${naRows.length} ${unit}: ${joinList(naRows)}` });
		}
		if (unmatched.length) {
			lines.push({ tag: "header", text: "--- TPS tanpa padanan di daftar TPS dpr_ri_out.csv (tetap dihitung) ---" });
			lines.push({ tag: "warn", text: `   ${unmatched.length} TPS: ${joinList(unmatched)}` });
		}
		if (unknownKab.length) {
			totalIssues += unknownKab.length;
			lines.push({ tag: "header", text: `--- ${Unit} dengan kab_code tak dikenal (tidak masuk hitungan Dapil) ---` });
			lines.push({ tag: "error", text: `   ${unknownKab.length} ${unit}: ${joinList(unknownKab)}` });
		}
		if (partialByLevel.some((p) => p.ids.length)) {
			lines.push({ tag: "header", text: `--- Wilayah dengan sebagian ${unit} tanpa data (dijumlahkan, NA dianggap 0) ---` });
			for (const p of partialByLevel) {
				if (!p.ids.length) continue;
				const named = p.ids.map((i) => `${i} (${p.nameMap[i] ?? i})`);
				lines.push({ tag: "warn", text: `   [${p.levelLabel}] ${p.ids.length} wilayah: ${joinList(named)}` });
			}
		}
	}

	lines.push({ tag: "header", text: `=== Total isu ditemukan: ${totalIssues} ===` });
	return { lines, issueCount: totalIssues };
}
