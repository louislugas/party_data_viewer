import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[\/]/).includes('node_modules') ? undefined : true
			},
			// Fully static site (every page prerendered, no server) - what Netlify serves
			// straight from the `build/` folder. See netlify.toml.
			adapter: adapter({ pages: 'build', assets: 'build', precompress: false, strict: true })
		})
	]
});
