<script lang="ts">
	// Sidebar validation log - port of YearTab/CrossYearAnalysisTab's log
	// section (dpr_ri_viewer.py lines 1031-1064, 1215-1270): colored lines,
	// "Bersihkan" (clear) / "Simpan Log..." (downloads the log as a .txt file).
	import type { ValidationLine } from "../../../shared/types";
	import { saveText } from "../api";
	import PanelHeader from "./PanelHeader.svelte";

	let {
		title = "Log Validasi Data",
		lines = $bindable(),
		issueSummary,
		defaultFilename,
		onClose,
	}: {
		title?: string;
		lines: ValidationLine[];
		issueSummary?: string;
		defaultFilename: string;
		onClose: () => void;
	} = $props();

	function clear() {
		lines = [];
	}

	async function save() {
		const content = lines.map((l) => l.text).join("\n") + "\n";
		await saveText(content, defaultFilename);
	}
</script>

<div class="sidebar-section">
	<PanelHeader {title} {onClose} />
	{#if issueSummary}<div><strong>{issueSummary}</strong></div>{/if}
</div>
<div class="log-panel">
	{#each lines as line, i (i)}
		<div class="log-line {line.tag}">{line.text}</div>
	{/each}
</div>
<div class="log-buttons">
	<button onclick={clear}>Bersihkan</button>
	<button onclick={save}>Simpan Log...</button>
</div>
