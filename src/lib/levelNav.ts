// Cascading Level/Provinsi/Dapil/Kab selection state - the renderer-side
// equivalent of LevelControls' combobox-cascading logic (dpr_ri_viewer.py
// lines 581-848). Simpler than the Python source because a Svelte <select>
// can bind directly to a code/id value; Python's Tk comboboxes are keyed by
// formatted display text, so it needs prov_display_to_code-style translation
// maps this port doesn't.
import { LEVEL_PARENT } from "../../shared/partyConfig";
import type { LevelKey } from "../../shared/types";

export interface Selection {
	level: LevelKey;
	provCode?: string;
	dapilId?: string;
	kabCode?: string;
}

// A field stays set as long as it's still shown at the target level -
// matches LevelControls._on_level_change's preserve=True behavior for the
// level dropdown / "up 1 level" button (as opposed to _on_prov_change/
// _on_dapil_change, which always clear descendants - see setProv/setDapil).
export function setLevel(current: Selection, newLevel: LevelKey): Selection {
	const next: Selection = { level: newLevel, provCode: current.provCode, dapilId: current.dapilId, kabCode: current.kabCode };
	if (newLevel === "nasional") next.provCode = undefined;
	if (newLevel !== "dapil" && newLevel !== "kabkota") next.dapilId = undefined;
	if (newLevel !== "kabkota") next.kabCode = undefined;
	return next;
}

export function goUpLevel(current: Selection): Selection {
	const parent = LEVEL_PARENT[current.level];
	return parent ? setLevel(current, parent) : current;
}

export function setProv(current: Selection, provCode: string | undefined): Selection {
	return { ...current, provCode, dapilId: undefined, kabCode: undefined };
}

export function setDapil(current: Selection, dapilId: string | undefined): Selection {
	return { ...current, dapilId, kabCode: undefined };
}

export function setKab(current: Selection, kabCode: string | undefined): Selection {
	return { ...current, kabCode };
}

// Drill "into" a selected row's code - one level deeper than `current.level`.
// No case for "kabkota": kecamatan is the deepest level this app shows.
export function drillInto(current: Selection, code: string): Selection {
	switch (current.level) {
		case "nasional":
			return { level: "provinsi", provCode: code };
		case "provinsi":
			return { level: "dapil", provCode: current.provCode, dapilId: code };
		case "dapil":
			return { level: "kabkota", provCode: current.provCode, dapilId: current.dapilId, kabCode: code };
		default:
			return current;
	}
}

const FIELD_LABELS: Record<string, string> = { provCode: "provinsi", dapilId: "dapil", kabCode: "kota/kabupaten" };

// null once every field the current level needs is filled in; otherwise a
// "Pilih provinsi / dapil / ..." message naming what's still missing -
// matches YearTab._refresh()'s `_render_empty` message construction.
export function missingSelectionMessage(selection: Selection): string | null {
	const requiredKeys: (keyof Selection)[] =
		selection.level === "nasional"
			? []
			: selection.level === "provinsi"
				? ["provCode"]
				: selection.level === "dapil"
					? ["provCode", "dapilId"]
					: ["provCode", "dapilId", "kabCode"];
	const missing = requiredKeys.filter((k) => !selection[k]);
	if (!missing.length) return null;
	return `Pilih ${missing.map((k) => FIELD_LABELS[k]).join(" / ")}`;
}
