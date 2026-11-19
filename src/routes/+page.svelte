<script lang="ts">
	// Root tab shell - port of App (dpr_ri_viewer.py): a loading screen while the
	// data downloads, then seven tabs. Sidebar visibility (Tampilkan Sidebar /
	// Ringkasan Daerah Terpilih / Log Validasi Data) lives in the "Tampilan"
	// menu - the web equivalent of the desktop View menu - see appStore.ts.
	import { loadAppData } from "$lib/api";
	import { showSidebar, showSummaryPanel, showValidationLog } from "$lib/stores/appStore";
	import AdminAnalysisView from "$lib/views/AdminAnalysisView.svelte";
	import PartyAnalysisView from "$lib/views/PartyAnalysisView.svelte";
	import RankingView from "$lib/views/RankingView.svelte";
	import YearView from "$lib/views/YearView.svelte";
	import type { AppDataBundle } from "../../shared/types";

	let data: AppDataBundle | null = $state(null);
	let loadError: string | null = $state(null);
	let activeTab = $state(0);
	let viewMenu: HTMLDetailsElement | undefined = $state();

	loadAppData()
		.then((d) => (data = d))
		.catch((err) => (loadError = err instanceof Error ? err.message : String(err)));

	const tabs = [
		"Data Pileg 2019",
		"Data Pileg 2024",
		"Data Admin Pileg 2019",
		"Data Admin Pileg 2024",
		"Analisa Partai",
		"Analisa Data Admin",
		"Analisis Ranking Partai",
	];

	const updated = $derived.by(() => {
		const iso = data?.meta?.generatedAt;
		return iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";
	});

	// <details> doesn't close on an outside tap by itself.
	function closeMenuOnOutside(e: Event) {
		if (viewMenu?.open && !viewMenu.contains(e.target as Node)) viewMenu.open = false;
	}
</script>

<svelte:head>
	<title>DPR RI Data Viewer</title>
</svelte:head>

<svelte:window onclick={closeMenuOnOutside} />

{#if loadError}
	<div class="error-screen">
		<h2>Gagal memuat data</h2>
		<p>{loadError}</p>
		<button onclick={() => location.reload()}>Muat ulang</button>
	</div>
{:else if !data}
	<div class="loading-screen">Memuat data DPR RI...</div>
{:else}
	<div class="app-shell">
		<div class="tab-bar">
			<div class="tab-strip" role="tablist">
				{#each tabs as label, i (label)}
					<button role="tab" aria-selected={activeTab === i} class:active={activeTab === i} onclick={() => (activeTab = i)}>{label}</button>
				{/each}
			</div>
			<details class="view-menu" bind:this={viewMenu}>
				<summary>Tampilan</summary>
				<div class="view-menu-pop">
					<label><input type="checkbox" bind:checked={$showSidebar} /> Tampilkan Sidebar</label>
					<label><input type="checkbox" bind:checked={$showSummaryPanel} /> Ringkasan Daerah Terpilih</label>
					<label><input type="checkbox" bind:checked={$showValidationLog} /> Log Validasi Data</label>
					{#if updated}<div class="view-menu-note">Data diperbarui: {updated}</div>{/if}
				</div>
			</details>
		</div>
		<!--
			Every tab stays mounted (display:none when inactive) rather than
			being conditionally rendered - a {#if} would destroy and recreate
			each tab's component on every switch, resetting its drill-down
			position/sort/log every time. ttk.Notebook keeps all tab frames
			alive and just swaps visibility, and this matches that.
		-->
		<div class="tab-panel" class:tab-panel-hidden={activeTab !== 0}>
			<YearView hierarchy={data.hierarchy} store={data.stores.party2019} yearKey="2019" />
		</div>
		<div class="tab-panel" class:tab-panel-hidden={activeTab !== 1}>
			<YearView hierarchy={data.hierarchy} store={data.stores.party2024} yearKey="2024" />
		</div>
		<div class="tab-panel" class:tab-panel-hidden={activeTab !== 2}>
			<YearView hierarchy={data.hierarchy} store={data.stores.admin2019} yearKey="admin2019" />
		</div>
		<div class="tab-panel" class:tab-panel-hidden={activeTab !== 3}>
			<YearView hierarchy={data.hierarchy} store={data.stores.admin2024} yearKey="admin2024" />
		</div>
		<div class="tab-panel" class:tab-panel-hidden={activeTab !== 4}>
			<PartyAnalysisView hierarchy={data.hierarchy} store2019={data.stores.party2019} store2024={data.stores.party2024} />
		</div>
		<div class="tab-panel" class:tab-panel-hidden={activeTab !== 5}>
			<AdminAnalysisView hierarchy={data.hierarchy} store2019={data.stores.admin2019} store2024={data.stores.admin2024} />
		</div>
		<div class="tab-panel" class:tab-panel-hidden={activeTab !== 6}>
			<RankingView hierarchy={data.hierarchy} store={data.stores.party2024} />
		</div>
	</div>
{/if}
