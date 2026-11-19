<script lang="ts">
	// Port of AdminAnalysisTab (dpr_ri_viewer.py lines 1731-1967) - compares
	// every admin/turnout metric (+ TPS coverage) between 2019 and 2024, level
	// by level. Same shape as PartyAnalysisView, but with no party selector -
	// every metric is shown side by side instead of picking one to focus on,
	// with a per-metric toggle button to hide groups you're not looking at.
	import { ADMIN_ANALYSIS_METRICS, CHILD_LABEL, DRILL_NEXT } from "../../../shared/partyConfig";
	import { buildView, computeDelta, fmtCell, fmtPct, formatMissingSample, indexViewRows, isNumber, metricValue, sortByNumericField } from "../../../shared/view";
	import type { HierarchyBundle, StoreBundle, ValidationLine } from "../../../shared/types";
	import DataTable, { type ColumnDef, type RowDef } from "../components/DataTable.svelte";
	import LevelControls from "../components/LevelControls.svelte";
	import ValidationLog from "../components/ValidationLog.svelte";
	import { drillInto, missingSelectionMessage, type Selection } from "../levelNav";
	import { saveCsv } from "../api";
	import { untrack } from "svelte";
	import { showSidebar, showValidationLog } from "../stores/appStore";

	let {
		hierarchy,
		store2019,
		store2024,
	}: {
		hierarchy: HierarchyBundle;
		store2019: StoreBundle;
		store2024: StoreBundle;
	} = $props();

	let selection: Selection = $state({ level: "nasional" });
	let sortCol: string | null = $state(null);
	let sortAscending = $state(true);
	let logLines: ValidationLine[] = $state([]);
	let groupVisible: Record<string, boolean> = $state(Object.fromEntries(ADMIN_ANALYSIS_METRICS.map(([key]) => [key, true])));

	const readyMessage = $derived(missingSelectionMessage(selection));
	const df19 = $derived(readyMessage ? null : buildView(selection.level, selection, hierarchy, store2019));
	const df24 = $derived(readyMessage ? null : buildView(selection.level, selection, hierarchy, store2024));

	interface MetricCell {
		v19: number | null;
		v24: number | null;
		selisih: number | null;
		persen: number | null;
	}
	interface MetricRow {
		code: string;
		name: string;
		metrics: Record<string, MetricCell>;
	}

	const compareRows = $derived.by((): MetricRow[] => {
		if (!df19 || !df24) return [];
		const idx19 = indexViewRows(df19);
		const idx24 = indexViewRows(df24);
		return df24.rows.map((row24) => {
			const metrics: Record<string, MetricCell> = {};
			for (const [key] of ADMIN_ANALYSIS_METRICS) {
				const v19 = metricValue(idx19, row24.code, key, store2019.partyCols);
				const v24 = metricValue(idx24, row24.code, key, store2024.partyCols);
				const { delta, pct } = computeDelta(v19, v24);
				metrics[key] = { v19, v24, selisih: delta, persen: pct };
			}
			return { code: row24.code, name: row24.name, metrics };
		});
	});

	const sortedRows = $derived.by(() => {
		if (!sortCol) return compareRows;
		if (sortCol === "code") return [...compareRows].sort((a, b) => (sortAscending ? Number(a.code) - Number(b.code) : Number(b.code) - Number(a.code)));
		if (sortCol === "name") return [...compareRows].sort((a, b) => (sortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
		const m = sortCol.match(/^(.+)_(2019|2024|selisih|persen)$/);
		if (!m) return compareRows;
		const [, key, suffix] = m;
		const field = suffix === "2019" ? "v19" : suffix === "2024" ? "v24" : (suffix as "selisih" | "persen");
		return sortByNumericField(compareRows, sortAscending, (r) => r.metrics[key]?.[field] ?? null);
	});

	$effect(() => {
		if (!df19 || !df24) return;
		const noteBits: string[] = [];
		if (df19.missing.length) noteBits.push(`${df19.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2019`);
		if (df24.missing.length) noteBits.push(`${df24.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2024`);
		const note = noteBits.length ? noteBits.join(" — ") : "Data lengkap di kedua tahun untuk cakupan ini.";
		const lines: ValidationLine[] = [{ tag: noteBits.length ? "warn" : "ok", text: `[${CHILD_LABEL[selection.level]}] ${note}` }];
		if (df19.missing.length) lines.push({ tag: "warn", text: `   2019 hilang: ${formatMissingSample(df19.missing)}` });
		if (df24.missing.length) lines.push({ tag: "warn", text: `   2024 hilang: ${formatMissingSample(df24.missing)}` });
		// untrack() when reading logLines: without it, this effect both reads
		// and writes logLines, which makes its own write re-trigger itself -
		// see the identical fix + comment in YearView.svelte.
		untrack(() => (logLines = [...logLines, ...lines]));
	});

	const allColumns = $derived.by((): ColumnDef[] => {
		const cols: ColumnDef[] = [
			{ key: "code", label: "Kode" },
			{ key: "name", label: "Nama" },
		];
		for (const [key, label] of ADMIN_ANALYSIS_METRICS) {
			cols.push(
				{ key: `${key}_2019`, label: `${label} 2019`, align: "right" },
				{ key: `${key}_2024`, label: `${label} 2024`, align: "right" },
				{ key: `${key}_selisih`, label: `Selisih ${label}`, align: "right" },
				{ key: `${key}_persen`, label: `% ${label}`, align: "right" },
			);
		}
		return cols;
	});

	const columns = $derived(allColumns.filter((c) => c.key === "code" || c.key === "name" || groupVisible[c.key.replace(/_(2019|2024|selisih|persen)$/, "")]));

	function toRowDef(r: MetricRow): RowDef {
		const cells: Record<string, string> = { code: r.code, name: r.name };
		for (const [key] of ADMIN_ANALYSIS_METRICS) {
			const m = r.metrics[key];
			cells[`${key}_2019`] = fmtCell(m.v19);
			cells[`${key}_2024`] = fmtCell(m.v24);
			cells[`${key}_selisih`] = fmtCell(m.selisih);
			cells[`${key}_persen`] = fmtPct(m.persen);
		}
		return { key: r.code, cells };
	}

	const rows = $derived.by((): RowDef[] => {
		const defs = sortedRows.map(toRowDef);
		if (sortedRows.length) {
			const cells: Record<string, string> = { code: "", name: `TOTAL (${sortedRows.length} ${CHILD_LABEL[selection.level]})` };
			for (const [key] of ADMIN_ANALYSIS_METRICS) {
				const nums19 = sortedRows.map((r) => r.metrics[key].v19).filter(isNumber);
				const nums24 = sortedRows.map((r) => r.metrics[key].v24).filter(isNumber);
				const t19 = nums19.length ? nums19.reduce((a, b) => a + b, 0) : null;
				const t24 = nums24.length ? nums24.reduce((a, b) => a + b, 0) : null;
				const { delta, pct } = computeDelta(t19, t24);
				cells[`${key}_2019`] = fmtCell(t19);
				cells[`${key}_2024`] = fmtCell(t24);
				cells[`${key}_selisih`] = fmtCell(delta);
				cells[`${key}_persen`] = fmtPct(pct);
			}
			defs.push({ key: "__total__", cells, className: "row-total" });
		}
		return defs;
	});

	const infoText = $derived.by(() => {
		if (readyMessage) return readyMessage;
		if (!df19 || !df24) return "";
		const noteBits: string[] = [];
		if (df19.missing.length) noteBits.push(`${df19.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2019`);
		if (df24.missing.length) noteBits.push(`${df24.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2024`);
		return noteBits.length ? noteBits.join(" — ") : "Data lengkap di kedua tahun untuk cakupan ini.";
	});

	function onRowDoubleClick(row: RowDef) {
		if (row.key === "__total__") return;
		selection = drillInto(selection, row.key);
	}

	async function exportCsv() {
		if (!compareRows.length) return;
		const headers = allColumns.map((c) => c.label);
		const dataRows: (string | number | null)[][] = compareRows.map((r) => {
			const cells: (string | number | null)[] = [r.code, r.name];
			for (const [key] of ADMIN_ANALYSIS_METRICS) {
				const m = r.metrics[key];
				cells.push(m.v19, m.v24, m.selisih, m.persen);
			}
			return cells;
		});
		await saveCsv(headers, dataRows, "dpr_ri_analisa_data_admin.csv");
	}
</script>

<div class="tab-body">
	<LevelControls {hierarchy} bind:selection>
		<button onclick={exportCsv}>Ekspor CSV...</button>
	</LevelControls>
	<div class="column-group-bar">
		<span>Kelompok kolom:</span>
		{#each ADMIN_ANALYSIS_METRICS as [key, label] (key)}
			<button class:toggle-active={groupVisible[key]} onclick={() => (groupVisible[key] = !groupVisible[key])}>{label}</button>
		{/each}
	</div>
	<div class="info-line">{infoText}</div>
	<div class="body-split">
		<DataTable {columns} {rows} bind:sortCol bind:sortAscending onRowDoubleClick={onRowDoubleClick} onDrill={DRILL_NEXT[selection.level] ? onRowDoubleClick : undefined} />
		{#if $showSidebar && $showValidationLog}
			<div class="sidebar-pane">
				<ValidationLog bind:lines={logLines} defaultFilename="dpr_ri_analisa_data_admin_log.txt" onClose={() => showValidationLog.set(false)} />
			</div>
		{/if}
	</div>
</div>
