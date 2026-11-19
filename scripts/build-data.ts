// Builds static/data/app-data.json - the ONE file the website downloads.
//
// The desktop viewers read ~60MB of CSV at startup (incl. dpr_ri_out.csv, 143MB,
// and a 37MB TPS lookup). A browser shouldn't have to, so this script does the
// loading/rolling-up/validation once, offline, with the same logic as
// dpr_ri_viewer.py, and writes the finished AppDataBundle as JSON (~a few MB,
// ~1MB over the wire since Netlify serves it brotli/gzip-compressed).
//
// Re-run whenever the source data changes, then commit static/data/app-data.json:
//
//     npm run build-data                       (source = the parent folder)
//     npm run build-data -- --source "A:\WORK\2026\pilkada"
//
// Source files (relative to --source), same ones dpr_ri_viewer.py reads:
//   dpr_ri/_hierarchy_cache.csv   (written by dpr_ri_viewer.py from dpr_ri_out.csv)
//   dpr_ri/_tps_lookup_cache.csv  (same - only used for one informational log line)
//   party_code.csv
//   dpr_ri/read/2019/{prov,dapil,kab,kec}_dprRI_party_2019.csv
//   dpr_ri/read/2019/admin/admin_desa_dprri_initial_2019.csv
//   dpr_ri/read/2024/{prov,dapil,kab,kec}_dprRI_party.csv
//   dpr_ri/read/2024/admin/admin_tps_dprri_initial.csv
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdminStoreDesa, loadAdminStoreTps } from "../data-build/adminStore";
import { readCsvRows } from "../data-build/csv";
import { buildHierarchyBundle, loadTpsLookupIds } from "../data-build/hierarchy";
import { loadPartyStore, type YearConfig } from "../data-build/partyStore";
import { PARTY_NAMES_2019 } from "../shared/partyConfig";
import type { AppDataBundle } from "../shared/types";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const argIdx = process.argv.indexOf("--source");
const sourceRoot = resolve(argIdx >= 0 ? process.argv[argIdx + 1] : join(projectRoot, ".."));

const p = {
	partyCodeCsv: join(sourceRoot, "party_code.csv"),
	hierarchyCacheCsv: join(sourceRoot, "dpr_ri", "_hierarchy_cache.csv"),
	tpsLookupCacheCsv: join(sourceRoot, "dpr_ri", "_tps_lookup_cache.csv"),
	readDir2019: join(sourceRoot, "dpr_ri", "read", "2019"),
	readDir2024: join(sourceRoot, "dpr_ri", "read", "2024"),
	adminCsv2019: join(sourceRoot, "dpr_ri", "read", "2019", "admin", "admin_desa_dprri_initial_2019.csv"),
	adminCsv2024: join(sourceRoot, "dpr_ri", "read", "2024", "admin", "admin_tps_dprri_initial.csv"),
};

const required = [p.partyCodeCsv, p.hierarchyCacheCsv, p.tpsLookupCacheCsv, p.adminCsv2019, p.adminCsv2024];
const missing = required.filter((f) => !existsSync(f));
if (missing.length) {
	console.error(`Missing source files (is --source right? currently ${sourceRoot}):\n  ${missing.join("\n  ")}`);
	process.exit(1);
}

const t0 = Date.now();
console.log(`Source: ${sourceRoot}`);

const hierarchy = buildHierarchyBundle(p.hierarchyCacheCsv);

// 2024 party columns come from party_code.csv (code -> party), 2019 from the
// canonical KPU order (party number = position).
const partyMap2024: Record<string, string> = {};
for (const row of readCsvRows(p.partyCodeCsv)) partyMap2024[`jml_suara_total_${row.code}`] = row.party;
const partyMap2019: Record<string, string> = {};
PARTY_NAMES_2019.forEach((name, i) => (partyMap2019[`jml_suara_total_${i + 1}`] = name));

const yearConfigs: YearConfig[] = [
	{ key: "2019", label: "Data Pileg 2019", readDir: p.readDir2019, suffix: "_2019", partyMap: partyMap2019 },
	{ key: "2024", label: "Data Pileg 2024", readDir: p.readDir2024, suffix: "", partyMap: partyMap2024 },
];

const tpsLookupIds = loadTpsLookupIds(p.tpsLookupCacheCsv);

const bundle: AppDataBundle = {
	hierarchy,
	stores: {
		party2019: loadPartyStore(yearConfigs[0], hierarchy),
		party2024: loadPartyStore(yearConfigs[1], hierarchy),
		admin2019: loadAdminStoreDesa("Data Admin Pileg 2019", p.adminCsv2019, "admin_desa_dprri_initial_2019.csv", hierarchy),
		admin2024: loadAdminStoreTps("Data Admin Pileg 2024", p.adminCsv2024, "admin_tps_dprri_initial.csv", tpsLookupIds, hierarchy),
	},
	meta: { generatedAt: new Date().toISOString() },
};

const outDir = join(projectRoot, "static", "data");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "app-data.json");
writeFileSync(outFile, JSON.stringify(bundle));

const kb = (statSync(outFile).size / 1024).toFixed(0);
const issues = Object.entries(bundle.stores).map(([k, s]) => `${k}: ${s.issueCount} isu`).join(", ");
console.log(`Wrote ${outFile} (${kb} KB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`Validation - ${issues}`);
