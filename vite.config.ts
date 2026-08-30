import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const clientPolyfills: Plugin[] = nodePolyfills({
  globals: { Buffer: true, global: true },
  protocolImports: true,
  exclude: ["module"],
}).map((plugin) => ({
  ...plugin,
  applyToEnvironment: (env) => env.name === "client",
}));

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), wasm(), ...clientPolyfills],
});
