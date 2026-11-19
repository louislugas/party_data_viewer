<script lang="ts">
	// Sidebar "Ringkasan Daerah Terpilih" - port of YearTab._build_summary_section/
	// _on_row_select (dpr_ri_viewer.py lines 945-1020): the selected row's
	// party/metric breakdown sorted biggest-first, with a "Masuk ke <level> ▸"
	// drill button (hidden at the deepest level, kabkota).
	import { CHILD_LABEL, DRILL_NEXT } from "../../../shared/partyConfig";
	import type { LevelKey, StoreBundle, ViewRow } from "../../../shared/types";
	import PanelHeader from "./PanelHeader.svelte";

	let {
		selectedRow,
		store,
		level,
		onDrill,
		onClose,
	}: {
		selectedRow: ViewRow | null;
		store: StoreBundle;
		level: LevelKey;
		onDrill: (code: string) => void;
		onClose: () => void;
	} = $props();

	const entries = $derived.by(() => {
		if (!selectedRow) return [] as { name: string; value: number }[];
		const list = store.partyCols
			.map((c, i) => ({ name: store.partyMap[c] ?? c, value: selectedRow.values[i] }))
			.filter((e): e is { name: string; value: number } => e.value !== null);
		list.sort((a, b) => b.value - a.value);
		return list;
	});

	const nextLevel = $derived(DRILL_NEXT[level]);
</script>

<div class="sidebar-section">
	<PanelHeader title="Ringkasan Daerah Terpilih" {onClose} />
	<div>
		<strong>{selectedRow ? `${selectedRow.code} — ${selectedRow.name}` : "Tidak ada daerah yang dipilih"}</strong>
	</div>
</div>
{#if selectedRow}
	<div class="sidebar-scroll" style="flex: none; max-height: 220px;">
		<table class="summary-table">
			<tbody>
				{#each entries as e (e.name)}
					<tr>
						<td>{e.name}</td>
						<td class="num">{e.value.toLocaleString("en-US")}</td>
						<td class="num">{selectedRow.total ? `${((e.value / selectedRow.total) * 100).toFixed(1)}%` : "-"}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
{#if selectedRow && nextLevel}
	<div class="sidebar-section">
		<button onclick={() => onDrill(selectedRow!.code)}>Masuk ke {CHILD_LABEL[nextLevel]} ▸</button>
	</div>
{/if}
