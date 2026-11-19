<script lang="ts">
	// Port of PartyAnalysisTab (dpr_ri_viewer.py lines 1308-1729) - compares a
	// single party's votes between 2019 and 2024, level by level.
	import { CHILD_LABEL, DRILL_NEXT, PARTY_MATCH, partyCodesFor } from "../../../shared/partyConfig";
	import {
		buildArrowEntries,
		buildView,
		childView,
		computeDelta,
		fmtCell,
		fmtPct,
		formatMissingSample,
		indexViewRows,
		isNumber,
		partyCellValue,
		sortByNumericField,
	} from "../../../shared/view";
	import type { CellValue, HierarchyBundle, StoreBundle, ValidationLine } from "../../../shared/types";
	import ArrowChart from "../components/ArrowChart.svelte";
	import DataTable, { type ColumnDef, type RowDef } from "../components/DataTable.svelte";
	import LevelControls from "../components/LevelControls.svelte";
	import PanelHeader from "../components/PanelHeader.svelte";
	import ValidationLog from "../components/ValidationLog.svelte";
	import { drillInto, missingSelectionMessage, type Selection } from "../levelNav";
	import { saveCsv } from "../api";
	import { untrack } from "svelte";
	import { showSidebar, showSummaryPanel, showValidationLog } from "../stores/appStore";

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
	let partyName = $state("");
	let sortCol: string | null = $state(null);
	let sortAscending = $state(true);
	let selectedKey: string | null = $state(null);
	let logLines: ValidationLine[] = $state([]);

	const readyMessage = $derived(!partyName ? "Pilih partai untuk memulai perbandingan." : missingSelectionMessage(selection));
	const [code19, code24] = $derived(partyCodesFor(partyName));
	const col19 = $derived(code19 !== null ? `jml_suara_total_${code19}` : null);
	const col24 = $derived(code24 !== null ? `jml_suara_total_${code24}` : null);

	const df19 = $derived(readyMessage ? null : buildView(selection.level, selection, hierarchy, store2019));
	const df24 = $derived(readyMessage ? null : buildView(selection.level, selection, hierarchy, store2024));

	interface CompareRow {
		code: string;
		name: string;
		v19: CellValue;
		v24: CellValue;
		selisih: number | null;
		persen: number | null;
	}

	const compareRows = $derived.by((): CompareRow[] => {
		if (!df19 || !df24) return [];
		const idx19 = indexViewRows(df19);
		const idx24 = indexViewRows(df24);
		return df24.rows.map((row24) => {
			const v19 = partyCellValue(idx19, row24.code, col19, store2019.partyCols);
			const v24 = partyCellValue(idx24, row24.code, col24, store2024.partyCols);
			const { delta, pct } = computeDelta(v19, v24);
			return { code: row24.code, name: row24.name, v19, v24, selisih: delta, persen: pct };
		});
	});

	const sortedRows = $derived.by(() => {
		if (!sortCol) return compareRows;
		if (sortCol === "code") return [...compareRows].sort((a, b) => (sortAscending ? Number(a.code) - Number(b.code) : Number(b.code) - Number(a.code)));
		if (sortCol === "name") return [...compareRows].sort((a, b) => (sortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
		const field = { suara_2019: "v19", suara_2024: "v24", selisih: "selisih", persen: "persen" }[sortCol] as keyof CompareRow | undefined;
		if (!field) return compareRows;
		return sortByNumericField(compareRows, sortAscending, (r) => (isNumber(r[field] as CellValue | number | null) ? (r[field] as number) : null));
	});

	$effect(() => {
		if (!df19 || !df24 || !partyName) return;
		const noteBits: string[] = [];
		if (code19 === null) noteBits.push(`${partyName} tidak bertarung di 2019 (NC)`);
		else if (df19.missing.length) noteBits.push(`${df19.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2019`);
		if (code24 === null) noteBits.push(`${partyName} tidak bertarung di 2024 (NC)`);
		else if (df24.missing.length) noteBits.push(`${df24.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2024`);
		const note = noteBits.length ? noteBits.join(" — ") : "Data lengkap di kedua tahun untuk cakupan ini.";
		const lines: ValidationLine[] = [{ tag: noteBits.length ? "warn" : "ok", text: `[${CHILD_LABEL[selection.level]}] ${partyName}: ${note}` }];
		if (code19 !== null && df19.missing.length) {
			lines.push({ tag: "warn", text: `   2019 hilang: ${formatMissingSample(df19.missing)}` });
		}
		if (code24 !== null && df24.missing.length) {
			lines.push({ tag: "warn", text: `   2024 hilang: ${formatMissingSample(df24.missing)}` });
		}
		// untrack() when reading logLines: without it, this effect both reads
		// and writes logLines, which makes its own write re-trigger itself -
		// see the identical fix + comment in YearView.svelte.
		untrack(() => (logLines = [...logLines, ...lines]));
	});

	const columns: ColumnDef[] = [
		{ key: "code", label: "Kode" },
		{ key: "name", label: "Nama" },
		{ key: "suara_2019", label: "Suara 2019", align: "right" },
		{ key: "suara_2024", label: "Suara 2024", align: "right" },
		{ key: "selisih", label: "Selisih (2024-2019)", align: "right" },
		{ key: "persen", label: "% Perubahan", align: "right" },
	];

	function toRowDef(r: CompareRow): RowDef {
		return {
			key: r.code,
			cells: {
				code: r.code,
				name: r.name,
				suara_2019: fmtCell(r.v19),
				suara_2024: fmtCell(r.v24),
				selisih: fmtCell(r.selisih),
				persen: fmtPct(r.persen),
			},
			className: r.v19 === "NC" || r.v24 === "NC" ? "row-nc" : "",
		};
	}

	function totalCell(values: CellValue[], colExists: boolean): CellValue {
		const nums = values.filter(isNumber);
		if (nums.length) return nums.reduce((a, b) => a + b, 0);
		return colExists ? null : "NC";
	}

	const rows = $derived.by((): RowDef[] => {
		const defs = sortedRows.map(toRowDef);
		if (sortedRows.length) {
			const t19 = totalCell(sortedRows.map((r) => r.v19), col19 !== null);
			const t24 = totalCell(sortedRows.map((r) => r.v24), col24 !== null);
			const { delta, pct } = computeDelta(t19, t24);
			defs.push({
				key: "__total__",
				cells: {
					code: "",
					name: `TOTAL (${sortedRows.length} ${CHILD_LABEL[selection.level]})`,
					suara_2019: fmtCell(t19),
					suara_2024: fmtCell(t24),
					selisih: fmtCell(delta),
					persen: fmtPct(pct),
				},
				className: "row-total",
			});
		}
		return defs;
	});

	const infoText = $derived.by(() => {
		if (readyMessage) return readyMessage;
		if (!df19 || !df24) return "";
		const noteBits: string[] = [];
		if (code19 === null) noteBits.push(`${partyName} tidak bertarung di 2019 (NC)`);
		else if (df19.missing.length) noteBits.push(`${df19.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2019`);
		if (code24 === null) noteBits.push(`${partyName} tidak bertarung di 2024 (NC)`);
		else if (df24.missing.length) noteBits.push(`${df24.missing.length} ${CHILD_LABEL[selection.level]} tanpa data 2024`);
		const note = noteBits.length ? noteBits.join(" — ") : "Data lengkap di kedua tahun untuk cakupan ini.";
		return `Partai: ${partyName} — ${note}`;
	});

	const selectedRow = $derived(compareRows.find((r) => r.code === selectedKey) ?? null);
	const nextLevel = $derived(DRILL_NEXT[selection.level]);

	const arrowEntries = $derived.by(() => {
		if (!selectedRow) return [];
		const child19 = childView(selection.level, selectedRow.code, hierarchy, store2019);
		const child24 = childView(selection.level, selectedRow.code, hierarchy, store2024);
		return buildArrowEntries(child19, child24, col19, col24, store2019.partyCols, store2024.partyCols);
	});

	function onRowSelect(row: RowDef) {
		selectedKey = row.key === "__total__" ? null : row.key;
	}

	function onRowDoubleClick(row: RowDef) {
		if (row.key === "__total__") return;
		selection = drillInto(selection, row.key);
		selectedKey = null;
	}

	function onDrill() {
		if (selectedRow) {
			selection = drillInto(selection, selectedRow.code);
			selectedKey = null;
		}
	}

	async function exportCsv() {
		if (!compareRows.length) return;
		const headers = columns.map((c) => c.label);
		const dataRows: (string | number | null)[][] = compareRows.map((r) => [
			r.code,
			r.name,
			r.v19 === "NC" ? "NC" : r.v19,
			r.v24 === "NC" ? "NC" : r.v24,
			r.selisih,
			r.persen,
		]);
		await saveCsv(headers, dataRows, `dpr_ri_analisa_${partyName || "partai"}.csv`);
	}
</script>

<div class="tab-body">
	<LevelControls {hierarchy} bind:selection>
		<label>
			Partai:
			<select bind:value={partyName}>
				<option value="">-</option>
				{#each PARTY_MATCH as [name] (name)}
					<option value={name}>{name}</option>
				{/each}
			</select>
		</label>
		<button onclick={exportCsv}>Ekspor CSV...</button>
	</LevelControls>
	<div class="info-line">{infoText}</div>
	<div class="body-split">
		<DataTable {columns} {rows} bind:sortCol bind:sortAscending bind:selectedKey onRowClick={onRowSelect} onRowDoubleClick={onRowDoubleClick} onDrill={nextLevel ? onRowDoubleClick : undefined} />
		{#if $showSidebar && ($showSummaryPanel || $showValidationLog)}
			<div class="sidebar-pane">
				{#if $showSummaryPanel}
					<div class="sidebar-section">
						<PanelHeader title="Ringkasan Daerah Terpilih" onClose={() => showSummaryPanel.set(false)} />
						<div>
							<strong>
								{selectedRow ? `${selectedRow.code} — ${selectedRow.name}` : "Tidak ada daerah yang dipilih"}
								{#if selectedRow && partyName}<br />Partai: {partyName}{/if}
							</strong>
						</div>
					</div>
					<ArrowChart entries={arrowEntries} />
					{#if selectedRow && nextLevel}
						<div class="sidebar-section">
							<button onclick={onDrill}>Masuk ke {CHILD_LABEL[nextLevel]} ▸</button>
						</div>
					{/if}
				{/if}
				{#if $showValidationLog}
					<ValidationLog bind:lines={logLines} defaultFilename="dpr_ri_analisa_partai_log.txt" onClose={() => showValidationLog.set(false)} />
				{/if}
			</div>
		{/if}
	</div>
</div>
