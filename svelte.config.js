import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Deploy as a SPA to Cloudflare Workers with Static Assets.
		// The fallback page is served for all routes so client-side
		// routing handles /campaign, /claim, /create, etc.
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
