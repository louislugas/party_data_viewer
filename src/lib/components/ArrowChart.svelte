<script lang="ts">
	// PartyAnalysisTab sidebar chart - port of PartyAnalysisTab._draw_arrow_chart
	// (dpr_ri_viewer.py), same geometry: one row per child region - area name on
	// the left, then a small per-row axis (dashed gridlines every 10%, dashed
	// centerline) with a dot at the 2019 position, a chevron arrowhead at the
	// 2024 position and a connecting line: green/pointing right for a gain,
	// red/pointing left for a loss. Modeled on svelte.dev/playground/
	// 1ba019b1c3fb4b8f8bf12b9b31864588 ("arrow chart").
	//
	// Values are raw vote counts, so x positions are min-max normalized against
	// the combined range of every value in the list. No dot/arrow/line is drawn
	// when either year's value is missing/NC (pct is null) - the row still
	// shows its name and gridlines. Labels: the "before" value sits left of
	// whichever point is leftmost and "after (%change)" right of whichever is
	// rightmost - except on a loss, where the 2019 number stays next to its own
	// dot (now on the right) and the percentage stays on the right-hand label.
	import { computeDelta, fmtCell, fmtPct, isNumber, type ArrowEntry } from "../../../shared/view";

	let { entries }: { entries: ArrowEntry[] } = $props();

	const ROW_H = 26;
	const NAME_W = 76;
	const LEFT_MARGIN = 48; // room for the left value label (browser digits are wider than Tk's)
	const RIGHT_MARGIN = 92;
	const NAME_MAX_CHARS = 13; // ~NAME_W px at 11px Segoe UI; longer names are cut with an ellipsis (full name in the tooltip)

	// Measured width of the container. Measured by hand (not bind:clientWidth)
	// because this component is mounted while its tab is display:none, where
	// clientWidth is 0: re-measure whenever the entries change (which only
	// happens while visible) and on resize. Until measured, draw at a sane width.
	let wrap: HTMLDivElement | undefined = $state();
	let measured = $state(0);
	const width = $derived(measured > 1 ? measured : 340);

	function measure() {
		if (wrap && wrap.clientWidth > 1) measured = wrap.clientWidth;
	}

	$effect(() => {
		void entries;
		measure();
	});

	$effect(() => {
		if (!wrap) return;
		const ro = new ResizeObserver(measure);
		ro.observe(wrap);
		return () => ro.disconnect();
	});

	const chart = $derived.by(() => {
		const x0 = NAME_W + LEFT_MARGIN;
		const x1 = Math.max(x0 + 20, width - RIGHT_MARGIN);
		const axisW = x1 - x0;
		const nums = entries.flatMap((e) => [e.v19, e.v24]).filter(isNumber);
		const vmin = nums.length ? Math.min(...nums) : 0;
		const vmax = nums.length ? Math.max(...nums) : 1;
		const span = vmax - vmin || 1;
		const normX = (v: number) => x0 + ((v - vmin) / span) * axisW;

		const rows = entries.map((e, i) => {
			const top = i * ROW_H;
			const cy = top + ROW_H / 2;
			const { pct } = computeDelta(e.v19, e.v24);
			const row = { e, top, cy, pct, mark: null as null | {
				x19: number; x24: number; kind: "flat" | "gain" | "loss"; dx: number; dy: number;
				leftX: number; rightX: number; leftText: string; rightText: string;
			} };
			if (pct !== null && isNumber(e.v19) && isNumber(e.v24)) {
				const x19 = normX(e.v19);
				const x24 = normX(e.v24);
				const kind = e.v24 === e.v19 ? "flat" : e.v24 > e.v19 ? "gain" : "loss";
				let leftText = fmtCell(e.v19);
				let rightText = `${fmtCell(e.v24)} (${fmtPct(pct)})`;
				if (kind === "loss") {
					leftText = fmtCell(e.v24);
					rightText = `${fmtCell(e.v19)} (${fmtPct(pct)})`;
				}
				row.mark = {
					x19, x24, kind,
					dx: kind === "gain" ? 5 : -5,
					dy: ROW_H * 0.18,
					leftX: Math.min(x19, x24),
					rightX: Math.max(x19, x24),
					leftText,
					rightText,
				};
			}
			return row;
		});
		return { x0, x1, axisW, rows };
	});

	const shortName = (n: string) => (n.length > NAME_MAX_CHARS ? n.slice(0, NAME_MAX_CHARS - 1) + "…" : n);
</script>

<div class="arrow-wrap" bind:this={wrap}>
	{#if !entries.length}
		<p class="arrow-empty">Tidak ada data daerah di bawahnya.</p>
	{:else}
		<svg {width} height={ROW_H * entries.length} role="img" aria-label="Perbandingan 2019 dan 2024 per daerah">
			{#each chart.rows as r (r.e.code)}
				<g>
					<text class="arrow-name" x={NAME_W} y={r.cy} text-anchor="end" dominant-baseline="central">
						<title>{r.e.name}</title>{shortName(r.e.name)}
					</text>
					{#each Array(11) as _, g}
						{@const gx = chart.x0 + (chart.axisW * g) / 10}
						<line class="arrow-grid" x1={gx} x2={gx} y1={r.top} y2={r.top + ROW_H} stroke-dasharray={g === 0 || g === 5 || g === 10 ? undefined : "2 2"} />
					{/each}
					<line class="arrow-grid" x1={chart.x0} x2={chart.x1} y1={r.cy} y2={r.cy} stroke-dasharray="2 2" />
					{#if r.mark}
						{@const m = r.mark}
						{#if m.kind === "flat"}
							<circle cx={m.x19} cy={r.cy} r="3" class="flat" />
						{:else}
							<line class={m.kind} x1={m.x19} y1={r.cy} x2={m.x24} y2={r.cy} stroke-width="2" stroke-linecap="round" />
							<circle cx={m.x19} cy={r.cy} r="3" class="dot {m.kind}" />
							<line class="head-top {m.kind}" x1={m.x24 - m.dx} y1={r.cy - m.dy} x2={m.x24} y2={r.cy} stroke-width="2" stroke-linecap="round" />
							<line class={m.kind} x1={m.x24 - m.dx} y1={r.cy + m.dy} x2={m.x24} y2={r.cy} stroke-width="2" stroke-linecap="round" />
						{/if}
						<text class="arrow-value" x={m.leftX - 5} y={r.cy} text-anchor="end" dominant-baseline="central">{m.leftText}</text>
						<text class="arrow-value" x={m.rightX + 7} y={r.cy} text-anchor="start" dominant-baseline="central">{m.rightText}</text>
					{/if}
				</g>
			{/each}
		</svg>
	{/if}
</div>

<style>
	.arrow-wrap {
		flex: none;
		margin: 0 6px;
		max-height: 208px; /* 8 rows, like the desktop canvas - scrolls beyond that */
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--chart-bg);
		border: 1px solid var(--border);
	}
	svg {
		display: block;
	}
	.arrow-empty {
		margin: 0;
		padding: 6px;
		font-style: italic;
		color: var(--text-dim);
		text-align: center;
	}
	.arrow-grid {
		stroke: var(--chart-grid);
		stroke-width: 1;
	}
	.arrow-name {
		font-size: 10.5px;
		fill: var(--chart-text);
	}
	.arrow-value {
		font-size: 10.5px;
		fill: var(--chart-text-dim);
	}
	line.gain {
		stroke: #40c057;
	}
	line.head-top.gain {
		stroke: #2f9e44;
	}
	line.loss {
		stroke: #e03131;
	}
	circle.dot.gain {
		fill: #40c057;
	}
	circle.dot.loss {
		fill: #e03131;
	}
	circle.flat {
		fill: #868e96;
	}
</style>
