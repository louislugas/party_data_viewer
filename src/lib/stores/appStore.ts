// Sidebar-visibility state, shared globally across every tab (matches the
// Python app's single BooleanVar driving "Tampilkan Sidebar" everywhere).
// Three independent toggles, driven by the "Tampilan" menu in the page header
// (the web equivalent of the desktop View menu) and by each panel's own ×.
import { writable } from "svelte/store";

export const showSidebar = writable(true);
export const showSummaryPanel = writable(true);
export const showValidationLog = writable(true);
