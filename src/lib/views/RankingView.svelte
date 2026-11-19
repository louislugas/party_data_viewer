<script lang="ts">
	// Port of PartyRankingTab (dpr_ri_viewer.py): pick a dapil and a party, get
	// one top-5 table for the whole dapil, one for every kota/kabupaten under it
	// and one for every kecamatan under those, each titled with a breadcrumb
	// ("BALI 01 › TABANAN › KEDIRI"). Each table shows the party's suara and its
	// share of that region's total suara (the sum of every party's votes =
	// suara sah partai) and - when the chosen party isn't in the top 5 - an extra
	// highlighted row with its rank (ties share a rank).
	//
	// Copying: real <table>s, so selecting cells and pressing Ctrl/Cmd+C pastes
	// into Excel / Numbers / Google Sheets as cells (see onCopy, which also
	// drops the thousands commas); each card has a "Salin" button (works on
	// iPad, where there's no right-click) plus "Salin semua" and "Ekspor CSV".
	import { buildView } from "../../../shared/view";
	import type { HierarchyBundle, StoreBundle } from "../../../shared/types";
	import { copyText, saveCsv } from "../api";

	let { hierarchy, store }: { hierarchy: HierarchyBundle; store: StoreBundle } = $props();

	const TOP_N = 5;
	const SEP = " › ";
	const HEADER = ["Peringkat", "Partai", "Suara 2024", "% Total Suara"];
	const LONG_COLUMNS = ["level", "wilayah", "dapil", "kota_kabupaten", "kecamatan", "kode", "peringkat", "partai", "suara_2024", "persen_total", "total_suara"];

	type Level = "Dapil" | "Kota/Kabupaten" | "Kecamatan";
	interface RankRow {
		rank: number;
		party: string;
		votes: number;
		pct: number;
	}
	interface RankTable {
		level: Level;
		path: string[];
		code: string;
		total: number | null; // null = no 2024 data for this region at all
		rows: RankRow[]; // the top 5 (+ the selected party when it's outside them)
		gap: boolean; // a "⋯" row goes between the top 5 and the selected party
		summary: string;
	}
	interface KabGroup {
		table: RankTable;
		kecs: RankTable[];
	}

	let dapilId = $state("");
	let partyName = $state("");
	let notice = $state("");
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	const parties = $derived(store.partyCols.map((c) => store.partyMap[c] ?? c));

	// Ranks one region's values (aligned with store.partyCols). Parties with no
	// data are left out; ties share a rank, then alphabetical.
	function rankRegion(values: (number | null)[]) {
		const votes = values.map((v, i) => ({ party: parties[i], v })).filter((x): x is { party: string; v: number } => x.v !== null);
		const total = votes.reduce((s, x) => s + x.v, 0);
		votes.sort((a, b) => b.v - a.v || a.party.localeCompare(b.party));
		const ranked: RankRow[] = [];
		let prevVotes: number | null = null;
		let prevRank = 0;
		votes.forEach((x, i) => {
			const rank = x.v === prevVotes ? prevRank : i + 1;
			prevVotes = x.v;
			prevRank = rank;
			ranked.push({ rank, party: x.party, votes: x.v, pct: total ? (x.v / total) * 100 : 0 });
		});
		return { ranked, total, complete: votes.length === parties.length };
	}

	function makeTable(level: Level, path: string[], code: string, values: (number | null)[] | undefined, party: string): RankTable {
		const t: RankTable = { level, path, code, total: null, rows: [], gap: false, summary: "" };
		if (!values || values.every((v) => v === null)) return t;
		const { ranked, total, complete } = rankRegion(values);
		const mine = ranked.find((r) => r.party === party);
		const top = ranked.slice(0, TOP_N);
		const extra = mine && !top.includes(mine) ? mine : undefined;
		t.total = total;
		t.rows = extra ? [...top, extra] : top;
		t.gap = extra !== undefined && ranked.indexOf(extra) > TOP_N;
		let summary = `Total suara: ${Math.trunc(total).toLocaleString("en-US")}`;
		if (party) summary += mine ? `   |   ${party}: peringkat ${mine.rank} dari ${ranked.length} partai` : `   |   ${party}: tidak ada data`;
		if (!complete) summary += "   |   (data sebagian partai kosong)";
		t.summary = summary;
		return t;
	}

	const plan = $derived.by(() => {
		const dapil = hierarchy.dapil.find((d) => d.id === dapilId);
		if (!dapil) return null;
		const label = dapil.label;
		const dapilRow = buildView("provinsi", { provCode: dapil.provCode }, hierarchy, store).rows.find((r) => r.code === dapilId);
		const dapilTable = makeTable("Dapil", [label], dapilId, dapilRow?.values, partyName);
		const kabs: KabGroup[] = buildView("dapil", { dapilId }, hierarchy, store).rows.map((kab) => ({
			table: makeTable("Kota/Kabupaten", [label, kab.name], kab.code, kab.values, partyName),
			kecs: buildView("kabkota", { kabCode: kab.code }, hierarchy, store).rows.map((kec) =>
				makeTable("Kecamatan", [label, kab.name, kec.name], kec.code, kec.values, partyName),
			),
		}));
		const all = [dapilTable, ...kabs.flatMap((k) => [k.table, ...k.kecs])];
		return { label, dapilTable, kabs, all, nKec: kabs.reduce((s, k) => s + k.kecs.length, 0) };
	});

	const infoText = $derived.by(() => {
		if (!plan) return "Pilih dapil untuk menampilkan peringkat partai.";
		const hint = partyName ? "" : " — pilih partai untuk melihat peringkatnya.";
		return `${plan.label}: ${plan.kabs.length} kota/kabupaten, ${plan.nKec} kecamatan; top ${TOP_N} partai per wilayah (persen dari total suara partai di wilayah itu).${hint}`;
	});

	// ---- copy / export -------------------------------------------------
	function tsv(rows: (string | number)[][]): string {
		return rows.map((r) => r.join("\t")).join("\n");
	}

	// Plain integers (a thousands comma would be read as a decimal mark by an
	// Indonesian-locale sheet) and shares as "NN.NN%".
	function tableText(t: RankTable): string {
		const title = t.path.join(SEP);
		if (t.total === null) return tsv([[title], ["Data suara 2024 tidak tersedia"]]);
		return tsv([
			[title],
			HEADER,
			...t.rows.map((r) => [r.rank, r.party, Math.trunc(r.votes), `${r.pct.toFixed(2)}%`]),
			["", "Total suara", Math.trunc(t.total), "100.00%"],
		]);
	}

	// One row per displayed party per table, breadcrumb split into columns -
	// the shape used by "Salin semua" and the CSV export.
	function longRows(): (string | number)[][] {
		const out: (string | number)[][] = [];
		for (const t of plan?.all ?? []) {
			const path = [...t.path, "", "", ""].slice(0, 3);
			const head = [t.level, t.path.join(SEP), ...path, t.code];
			if (t.total === null) out.push([...head, "", "", "", "", ""]);
			for (const r of t.rows) out.push([...head, r.rank, r.party, Math.trunc(r.votes), `${r.pct.toFixed(2)}%`, Math.trunc(t.total ?? 0)]);
		}
		return out;
	}

	function flash(msg: string) {
		notice = msg;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = ""), 5000);
	}

	async function copyAndTell(text: string, what: string) {
		const ok = await copyText(text);
		flash(ok ? `${what} disalin (${text.split("\n").length} baris) — tempel ke Excel/Sheets dengan Ctrl/Cmd+V.` : "Gagal menyalin — pilih teks tabel lalu salin manual.");
	}

	const copyTable = (t: RankTable) => copyAndTell(tableText(t), `Tabel ${t.path.join(SEP)}`);
	const copyAll = () => plan && copyAndTell(tsv([LONG_COLUMNS, ...longRows()]), "Semua tabel");

	function exportCsv() {
		if (!plan) return;
		saveCsv(LONG_COLUMNS, longRows(), "dpr_ri_ranking_partai.csv");
	}

	// Ctrl/Cmd+C over selected table text: browsers already copy table cells
	// as tab-separated text; this only strips the thousands commas from the
	// vote cells so they paste as numbers.
	const THOUSANDS = /^\d{1,3}(,\d{3})+$/;
	function onCopy(e: ClipboardEvent) {
		const sel = window.getSelection()?.toString();
		if (!sel || !e.clipboardData) return;
		const cleaned = sel
			.split("\n")
			.map((line) => line.split("\t").map((c) => (THOUSANDS.test(c.trim()) ? c.trim().replace(/,/g, "") : c)).join("\t"))
			.join("\n");
		e.clipboardData.setData("text/plain", cleaned);
		e.preventDefault();
	}
</script>

{#snippet card(t: RankTable)}
	<article class="rank-card level-{t.level === 'Dapil' ? 'dapil' : t.level === 'Kecamatan' ? 'kec' : 'kab'}">
		<header>
			<h4 class="crumb">
				{#each t.path as seg, i}{#if i}<span class="sep">{SEP}</span>{/if}<span class:last={i === t.path.length - 1}>{seg}</span>{/each}
			</h4>
			{#if t.total !== null}
				<button class="copy-btn" onclick={() => copyTable(t)} title="Salin tabel ini (tempel ke Excel/Sheets)">Salin</button>
			{/if}
		</header>
		{#if t.total === null}
			<p class="missing">Data suara 2024 tidak tersedia untuk wilayah ini.</p>
		{:else}
			<p class="summary">{t.summary}</p>
			<table class="rank-table">
				<thead>
					<tr>
						<th class="c">Peringkat</th>
						<th>Partai</th>
						<th class="num">Suara 2024</th>
						<th class="num">% Total Suara</th>
					</tr>
				</thead>
				<tbody>
					{#each t.rows as r, i (r.party)}
						{#if t.gap && i === TOP_N}
							<tr class="gap"><td colspan="4">⋯</td></tr>
						{/if}
						<tr class:sel={r.party === partyName}>
							<td class="c">{r.rank}</td>
							<td>{r.party}</td>
							<td class="num">{Math.trunc(r.votes).toLocaleString("en-US")}</td>
							<td class="num">{r.pct.toFixed(2)}%</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</article>
{/snippet}

<div class="tab-body">
	<div class="controls-bar">
		<label>
			Dapil:
			<select bind:value={dapilId}>
				<option value="">-</option>
				{#each hierarchy.dapil as d (d.id)}
					<option value={d.id}>{d.label}</option>
				{/each}
			</select>
		</label>
		<label>
			Partai:
			<select bind:value={partyName}>
				<option value="">-</option>
				{#each parties as p (p)}
					<option value={p}>{p}</option>
				{/each}
			</select>
		</label>
		<button onclick={copyAll} disabled={!plan}>Salin semua</button>
		<button onclick={exportCsv} disabled={!plan}>Ekspor CSV...</button>
	</div>
	<div class="info-line">{notice || infoText}</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="rank-scroll" oncopy={onCopy}>
		{#if plan}
			<div class="rank-top">{@render card(plan.dapilTable)}</div>
			{#each plan.kabs as g (g.table.code)}
				<section class="kab-group">
					{@render card(g.table)}
					<div class="kec-grid">
						{#each g.kecs as k (k.code)}
							{@render card(k)}
						{/each}
					</div>
				</section>
			{/each}
		{/if}
	</div>
</div>

<style>
	.rank-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		margin: 4px 10px 10px;
		padding: 8px;
		border: 1px solid var(--border);
		background: var(--panel-bg);
		-webkit-overflow-scrolling: touch;
	}
	.kab-group {
		margin-top: 14px;
	}
	.kec-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 8px;
		margin: 8px 0 0 14px;
	}
	.rank-top {
		margin-bottom: 2px;
	}
	.rank-card {
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--sidebar-bg);
		padding: 0 0 6px;
		min-width: 0;
	}
	.rank-card > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 5px 8px;
		background: var(--tab-bg);
		border-bottom: 1px solid var(--border);
		border-radius: 4px 4px 0 0;
	}
	.level-dapil > header {
		background: var(--rank-dapil-bg);
	}
	.level-kab > header {
		background: var(--rank-kab-bg);
	}
	.crumb {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}
	.level-dapil .crumb {
		font-size: 15px;
	}
	.crumb .last {
		color: var(--text);
	}
	.crumb .sep {
		opacity: 0.6;
		white-space: pre;
	}
	.copy-btn {
		flex: none;
		padding: 2px 10px;
		user-select: none;
		-webkit-user-select: none;
	}
	.summary {
		margin: 6px 8px 4px;
		font-size: 12px;
		font-style: italic;
		color: var(--text-dim);
	}
	.missing {
		margin: 8px;
		color: var(--log-error);
	}
	.rank-table {
		width: calc(100% - 16px);
		margin: 0 8px;
		border-collapse: collapse;
	}
	.rank-table th {
		background: var(--tab-bg);
		padding: 3px 4px;
		text-align: left;
		font-weight: 600;
		font-size: 12px;
		border-bottom: 1px solid var(--border);
	}
	.rank-table td {
		padding: 3px 4px;
		border-bottom: 1px solid var(--row-border);
	}
	.rank-table td:nth-child(2) {
		white-space: nowrap; /* keep "Partai Demokrat" on one line */
	}
	.rank-table .num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.rank-table .c {
		text-align: center;
		width: 4em;
	}
	.rank-table tr.sel td {
		background: var(--rank-sel-bg);
		font-weight: 700;
	}
	.rank-table tr.gap td {
		text-align: center;
		color: var(--text-dim);
		padding: 0 6px;
		line-height: 1;
		user-select: none;
		-webkit-user-select: none;
	}
</style>
