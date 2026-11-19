<script lang="ts">
	// Level -> Provinsi -> Dapil -> Kota/Kabupaten cascading controls, shared
	// by every view. Port of LevelControls (dpr_ri_viewer.py lines 581-848).
	import { LEVELS } from "../../../shared/partyConfig";
	import type { HierarchyBundle, LevelKey } from "../../../shared/types";
	import { goUpLevel, setDapil, setKab, setLevel, setProv, type Selection } from "../levelNav";
	import type { Snippet } from "svelte";

	let {
		hierarchy,
		selection = $bindable(),
		children,
	}: { hierarchy: HierarchyBundle; selection: Selection; children?: Snippet } = $props();

	const showProv = $derived(selection.level !== "nasional");
	const showDapil = $derived(selection.level === "dapil" || selection.level === "kabkota");
	const showKab = $derived(selection.level === "kabkota");

	const dapilOptions = $derived(hierarchy.dapil.filter((d) => !selection.provCode || d.provCode === selection.provCode));
	const kabOptions = $derived(hierarchy.kab.filter((k) => !selection.dapilId || k.dapilId === selection.dapilId));
</script>

<div class="controls-bar">
	<label>
		Level:
		<select
			value={selection.level}
			onchange={(e) => (selection = setLevel(selection, e.currentTarget.value as LevelKey))}
		>
			{#each LEVELS as l (l.key)}
				<option value={l.key}>{l.label}</option>
			{/each}
		</select>
	</label>

	<button disabled={selection.level === "nasional"} onclick={() => (selection = goUpLevel(selection))}>
		↑ Naik 1 Level
	</button>

	{#if showProv}
		<label>
			Provinsi:
			<select
				value={selection.provCode ?? ""}
				onchange={(e) => (selection = setProv(selection, e.currentTarget.value || undefined))}
			>
				<option value="">-</option>
				{#each hierarchy.prov as p (p.code)}
					<option value={p.code}>{p.name} ({p.code})</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if showDapil}
		<label>
			Dapil:
			<select
				value={selection.dapilId ?? ""}
				onchange={(e) => (selection = setDapil(selection, e.currentTarget.value || undefined))}
			>
				<option value="">-</option>
				{#each dapilOptions as d (d.id)}
					<option value={d.id}>{d.label}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if showKab}
		<label>
			Kota/Kabupaten:
			<select
				value={selection.kabCode ?? ""}
				onchange={(e) => (selection = setKab(selection, e.currentTarget.value || undefined))}
			>
				<option value="">-</option>
				{#each kabOptions as k (k.code)}
					<option value={k.code}>{k.name} ({k.code})</option>
				{/each}
			</select>
		</label>
	{/if}

	{@render children?.()}
</div>
