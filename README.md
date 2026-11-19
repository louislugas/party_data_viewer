# DPR RI Data Viewer — online version

Web port of `dpr_ri_viewer.py` (Pileg DPR RI 2019 & 2024). A fully static site
(SvelteKit + `@sveltejs/adapter-static`), made to be hosted on Netlify from a
GitHub repo. Works on Mac (Safari/Chrome/Firefox) and iPad (Safari); on iPad
"Share → Add to Home Screen" opens it like an app.

Tabs (same as the desktop app): Data Pileg 2019 · Data Pileg 2024 · Data Admin
Pileg 2019 · Data Admin Pileg 2024 · Analisa Partai · Analisa Data Admin ·
**Analisis Ranking Partai**. The desktop "View" menu is the **Tampilan** menu
at the top right.

On a touch screen there is no double-click, so every row has a **›** button to
drill into the next level; the sidebar moves below the table on narrow screens.

## Deploy (Netlify via GitHub)

1. Put **this folder** in a GitHub repo (it is self-contained; `node_modules/`,
   `build/` and `.svelte-kit/` are git-ignored). **Commit
   `static/data/app-data.json`** — Netlify has no access to your source CSVs, so
   this pre-built data file must be in the repo.
2. Netlify → *Add new site → Import an existing project* → pick the repo.
   Settings are read from `netlify.toml` (build `npm run build`, publish `build`,
   Node 22); nothing to fill in.
3. Every push to the default branch redeploys.

> A Netlify site is public to anyone with the link. If the data shouldn't be
> public, add protection (Netlify site password on paid plans, or Cloudflare
> Access in front).

## Updating the data

The desktop app reads ~60 MB of CSV (incl. the 143 MB `dpr_ri_out.csv`); the
browser shouldn't. `npm run build-data` does that loading, roll-up and
validation once, offline — with the same logic as `dpr_ri_viewer.py` — and
writes the result to `static/data/app-data.json` (~6.5 MB, ~1 MB over the wire).

```bash
npm install            # first time only
npm run build-data     # reads the parent folder (A:\WORK\2026\pilkada)
# or: npm run build-data -- --source "A:\WORK\2026\pilkada"
git add static/data/app-data.json && git commit -m "Update data" && git push
```

Source files it reads (relative to the source folder): `party_code.csv`,
`dpr_ri/_hierarchy_cache.csv`, `dpr_ri/_tps_lookup_cache.csv` (both written by
`dpr_ri_viewer.py` from `dpr_ri_out.csv`), and under `dpr_ri/read/`:
`2019/{prov,dapil,kab,kec}_dprRI_party_2019.csv`,
`2019/admin/admin_desa_dprri_initial_2019.csv`,
`2024/{prov,dapil,kab,kec}_dprRI_party.csv`,
`2024/admin/admin_tps_dprri_initial.csv`.
Run the desktop viewer once first if you changed `dpr_ri_out.csv`, so the two
cache files are refreshed.

## Develop locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → build/
npm run preview    # serve the production build (restart it after each rebuild)
npm run check      # type-check
```

## Layout

| Path | What |
|---|---|
| `src/routes/+page.svelte` | tab shell, "Tampilan" menu |
| `src/lib/views/` | one view per tab (`RankingView.svelte` = Analisis Ranking Partai) |
| `src/lib/components/` | table, level controls, sidebar panels, arrow chart |
| `src/lib/api.ts` | browser replacements for the desktop OS bits: data fetch, CSV/log download, clipboard |
| `shared/` | pure logic ported from the Python app (view building, validation, party matching) |
| `data-build/`, `scripts/build-data.ts` | offline data builder |
| `static/` | PWA manifest/icons, Netlify `_headers`, `data/app-data.json` |
