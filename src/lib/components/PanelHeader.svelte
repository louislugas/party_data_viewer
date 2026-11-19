<script lang="ts">
	// Shared header row for sidebar sub-panels (Ringkasan Daerah Terpilih,
	// Log Validasi Data) - a title plus each panel's own close button, per
	// the "each sub-sidebar has their own close button" requirement. Closing
	// just hides that one panel (via the corresponding appStore boolean),
	// same as unchecking its View-menu item.
	let { title, onClose }: { title: string; onClose: () => void } = $props();
</script>

<div class="panel-header">
	<h3>{title}</h3>
	<button class="panel-close" onclick={onClose} aria-label="Tutup {title}" title="Tutup">×</button>
</div>
