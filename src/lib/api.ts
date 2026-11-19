// Browser-side replacements for what the desktop apps get from the OS:
// loading the data (one pre-built JSON file instead of ~60MB of CSV read from
// disk), saving files (a browser download instead of a native "save as"
// dialog) and the clipboard. Works in desktop Safari/Chrome/Firefox and iPadOS
// Safari.
import { base } from "$app/paths";
import type { AppDataBundle } from "../../shared/types";

export async function loadAppData(): Promise<AppDataBundle> {
	const res = await fetch(`${base}/data/app-data.json`);
	if (!res.ok) throw new Error(`Gagal mengunduh data (HTTP ${res.status}). Coba muat ulang halaman.`);
	return (await res.json()) as AppDataBundle;
}

function csvField(v: string | number | null): string {
	if (v === null || v === undefined) return "";
	const s = String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
	const lines = [headers.map(csvField).join(",")];
	for (const row of rows) lines.push(row.map(csvField).join(","));
	return lines.join("\r\n") + "\r\n";
}

function download(content: string, filename: string, mime: string) {
	const url = URL.createObjectURL(new Blob([content], { type: mime }));
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// "Ekspor CSV..." - the BOM makes Excel read the file as UTF-8 (otherwise
// non-ASCII characters such as the breadcrumb separator come out garbled).
export function saveCsv(headers: string[], rows: (string | number | null)[][], filename: string) {
	download("﻿" + toCsv(headers, rows), filename, "text/csv;charset=utf-8");
}

// "Simpan Log..."
export function saveText(content: string, filename: string) {
	download(content, filename, "text/plain;charset=utf-8");
}

// Copies text to the clipboard. Must be called from a user gesture (a click) -
// Safari refuses otherwise. Falls back to the old execCommand route for
// contexts where navigator.clipboard isn't available (e.g. plain http).
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.setAttribute("readonly", "");
		ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
		document.body.appendChild(ta);
		ta.select();
		let ok = false;
		try {
			ok = document.execCommand("copy");
		} catch {
			ok = false;
		}
		ta.remove();
		return ok;
	}
}
