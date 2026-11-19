<script lang="ts">
	// Port of YearTab (dpr_ri_viewer.py lines 851-1204) - reused for all four
	// of Data Pileg 2019/2024 (DataStore) and Data Admin 2019/2024
	// (AdminDataStore), exactly as the Python app reuses YearTab for both.
	import { CHILD_LABEL, DRILL_NEXT, LEVEL_TO_FILEKEY } from "../../../shared/partyConfig";
	import { buildView, fmtCell, formatViewIssuesLine, sortViewRows } from "../../../shared/view";
	import type { HierarchyBundle, StoreBundle, ValidationLine, ViewRow } from "../../../shared/types";
	import DataTable, { type ColumnDef, type RowDef } from "../components/DataTable.svelte";
	import LevelControls from "../components/LevelControls.svelte";
	import SummaryPanel from "../components/SummaryPanel.svelte";
	import ValidationLog from "../components/ValidationLog.svelte";
	import { drillInto, missingSelectionMessage, type Selection } from "../levelNav";
	import { saveCsv } from "../api";
	import { untrack } from "svelte";
	import { showSidebar, showSummaryPanel, showValidationLog } from "../stores/appStore";

	let {
		hierarchy,
		store,
		yearKey,
	}: {
		hierarchy: HierarchyBundle;
		store: StoreBundle;
		yearKey: string;
	} = $props();

	let selection: Selection = $state({ level: "nasional" });
	let sortCol: string | null = $state(null);
	let sortAscending = $state(true);
	let selectedKey: string | null = $state(null);

	let logLines: ValidationLine[] = $state([...store.validationLines]);

	const readyMessage = $derived(missingSelectionMessage(selection));
	const viewResult = $derived(readyMessage ? null : buildView(selection.level, selection, hierarchy, store));
	const sortedRows = $derived(viewResult ? sortViewRows(viewResult.rows, sortCol, sortAscending, store.partyCols) : []);

	// Live per-view validation line, re-appended on every navigation/sort
	// change while the view has rows missing from its source file - matches
	// YearTab._log_view_issues being called from _render() on every _refresh().
	$effect(() => {
		if (!viewResult) return;
		const fileName = store.fileNames[LEVEL_TO_FILEKEY[selection.level]];
		const line = formatViewIssuesLine(selection.level, viewResult.missing, fileName);
		// untrack() when reading logLines here: without it, this effect both
		// reads and writes logLines, which makes its own write re-trigger
		// itself - an infinite loop (Svelte's dev-mode "updated more than 5
		// times in one flush" guard catches it, but it also starves the
		// effect scheduler badly enough to break reactivity app-wide).
		if (line) untrack(() => (logLines = [...logLines, line]));
	});

	const columns = $derived.by((): ColumnDef[] => {
		const cols: ColumnDef[] = [
			{ key: "code", label: "Kode" },
			{ key: "name", label: "Nama" },
		];
		for (const c of store.partyCols) cols.push({ key: c, label: store.partyMap[c] ?? c, align: "right" });
		if (store.showTpsColumn) cols.push({ key: "tps", label: "TPS", align: "right" });
		if (store.showTotalColumn) cols.push({ key: "total", label: "Total", align: "right" });
		cols.push({ key: "status", label: "Status" });
		return cols;
	});

	function rowToRowDef(row: ViewRow): RowDef {
		const cells: Record<string, string> = { code: row.code, name: row.name, status: row.status };
		store.partyCols.forEach((c, i) => {
			const v = row.values[i];
			cells[c] = v === null ? "-" : Math.trunc(v).toLocaleString("en-US");
		});
		if (store.showTpsColumn) cells.tps = (row.tps ?? 0).toLocaleString("en-US");
		if (store.showTotalColumn) cells.total = Math.trunc(row.total).toLocaleString("en-US");
		let className = "";
		if (row.status === "HILANG") className = "row-missing";
		else if (row.status === "DATA KOSONG") className = "row-partial";
		return { key: row.code, cells, className };
	}

	const rows = $derived.by((): RowDef[] => {
		if (!viewResult) return [];
		const defs = sortedRows.map(rowToRowDef);
		if (sortedRows.length) {
			const totalCells: Record<string, string> = {
				code: "",
				name: `TOTAL (${sortedRows.length} ${CHILD_LABEL[selection.level]}, ${viewResult.missing.length} hilang)`,
				status: "",
			};
			store.partyCols.forEach((c, i) => {
				const sum = sortedRows.reduce((s, r) => s + (r.values[i] ?? 0), 0);
				totalCells[c] = Math.trunc(sum).toLocaleString("en-US");
			});
			if (store.showTpsColumn) {
				const sum = sortedRows.reduce((s, r) => s + (r.tps ?? 0), 0);
				totalCells.tps = Math.trunc(sum).toLocaleString("en-US");
			}
			if (store.showTotalColumn) {
				const sum = sortedRows.reduce((s, r) => s + r.total, 0);
				totalCells.total = Math.trunc(sum).toLocaleString("en-US");
			}
			defs.push({ key: "__total__", cells: totalCells, className: "row-total" });
		}
		return defs;
	});

	const selectedRow = $derived(sortedRows.find((r) => r.code === selectedKey) ?? null);

	const infoText = $derived.by(() => {
		if (readyMessage) return readyMessage;
		if (!viewResult) return "";
		const fileName = store.fileNames[LEVEL_TO_FILEKEY[selection.level]];
		return `Menampilkan ${sortedRows.length} ${CHILD_LABEL[selection.level]} dari ${fileName} — ${viewResult.missing.length} baris hilang`;
	});

	const issueSummary = $derived(store.issueCount ? `⚠ ${store.issueCount} isu ditemukan` : "✓ Tidak ada isu ditemukan");

	function onRowSelect(row: RowDef) {
		selectedKey = row.key === "__total__" ? null : row.key;
	}

	function onRowDoubleClick(row: RowDef) {
		if (row.key === "__total__") return;
		selection = drillInto(selection, row.key);
		selectedKey = null;
	}

	function onSummaryDrill(code: string) {
		selection = drillInto(selection, code);
		selectedKey = null;
	}

	// Raw numeric values, not the comma-formatted display strings - matches
	// `export_df.to_csv(path, index=False)` writing current_df's actual
	// numbers (and never includes a TOTAL row: current_df is set from
	// build_view()'s result *before* _render() appends one to the tree).
	async function exportCsv() {
		if (!viewResult || !sortedRows.length) return;
		const headers = columns.map((c) => c.label);
		const dataRows: (string | number | null)[][] = sortedRows.map((row) => {
			const cells: (string | number | null)[] = [row.code, row.name, ...row.values];
			if (store.showTpsColumn) cells.push(row.tps ?? 0);
			if (store.showTotalColumn) cells.push(row.total);
			cells.push(row.status);
			return cells;
		});
		await saveCsv(headers, dataRows, `dpr_ri_export_${yearKey}.csv`);
	}
</script>

<div class="tab-body">
	<LevelControls {hierarchy} bind:selection>
		<button onclick={exportCsv}>Ekspor CSV...</button>
	</LevelControls>
	<div class="info-line">{infoText}</div>
	<div class="body-split">
		<DataTable {columns} {rows} bind:sortCol bind:sortAscending bind:selectedKey onRowClick={onRowSelect} onRowDoubleClick={onRowDoubleClick} onDrill={DRILL_NEXT[selection.level] ? onRowDoubleClick : undefined} />
		{#if $showSidebar && ($showSummaryPanel || $showValidationLog)}
			<div class="sidebar-pane">
				{#if $showSummaryPanel}
					<SummaryPanel {selectedRow} {store} level={selection.level} onDrill={onSummaryDrill} onClose={() => showSummaryPanel.set(false)} />
				{/if}
				{#if $showValidationLog}
					<ValidationLog
						bind:lines={logLines}
						{issueSummary}
						defaultFilename={`dpr_ri_validation_log_${yearKey}.txt`}
						onClose={() => showValidationLog.set(false)}
					/>
				{/if}
			</div>
		{/if}
	</div>
</div>
