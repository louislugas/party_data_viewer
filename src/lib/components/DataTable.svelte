<script lang="ts" module>
	export interface ColumnDef {
		key: string;
		label: string;
		align?: "left" | "right";
	}

	export interface RowDef {
		key: string;
		cells: Record<string, string>;
		className?: string;
	}
</script>

<script lang="ts">
	// Generic sortable table shell - the shared bones of every Treeview in
	// dpr_ri_viewer.py (YearTab/PartyAnalysisTab/AdminAnalysisTab._build_tree
	// + _on_heading_click's click-to-sort headers with a ▲/▼ indicator).
	// Row coloring (HILANG/DATA KOSONG/TOTAL/NC) and the actual sort are the
	// caller's job (via shared/view.ts's sort helpers) - this component only
	// renders whatever it's given and reports header/row clicks back up.
	let {
		columns,
		rows,
		sortCol = $bindable(null),
		sortAscending = $bindable(true),
		selectedKey = $bindable(null),
		onRowClick,
		onRowDoubleClick,
		onDrill,
	}: {
		columns: ColumnDef[];
		rows: RowDef[];
		sortCol?: string | null;
		sortAscending?: boolean;
		selectedKey?: string | null;
		onRowClick?: (row: RowDef) => void;
		onRowDoubleClick?: (row: RowDef) => void;
		// When set, every data row gets a "›" button that drills into it. A
		// touch screen has no reliable double-click, so this is the way in on
		// an iPad (double-click still works with a mouse).
		onDrill?: (row: RowDef) => void;
	} = $props();

	function headerClick(key: string) {
		if (sortCol === key) sortAscending = !sortAscending;
		else {
			sortCol = key;
			sortAscending = true;
		}
	}

	function rowClick(row: RowDef) {
		selectedKey = row.key;
		onRowClick?.(row);
	}
</script>

<div class="table-pane">
	<table class="data-table">
		<thead>
			<tr>
				{#each columns as col (col.key)}
					<th class={col.align === "right" ? "num" : ""} onclick={() => headerClick(col.key)}>
						{col.label}{sortCol === col.key ? (sortAscending ? " ▲" : " ▼") : ""}
					</th>
				{/each}
				{#if onDrill}<th class="drill-col" aria-label="Masuk"></th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.key)}
				<tr
					class="{row.className ?? ''} {selectedKey === row.key ? 'row-selected' : ''}"
					onclick={() => rowClick(row)}
					ondblclick={() => onRowDoubleClick?.(row)}
				>
					{#each columns as col (col.key)}
						<td class={col.align === "right" ? "num" : ""}>{row.cells[col.key] ?? ""}</td>
					{/each}
					{#if onDrill}
						<td class="drill-col">
							{#if row.key !== "__total__"}
								<button
									class="drill-btn"
									aria-label="Masuk ke {row.cells.name ?? row.key}"
									title="Masuk ke level berikutnya"
									onclick={(e) => {
										e.stopPropagation();
										onDrill(row);
									}}>›</button
								>
							{/if}
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
