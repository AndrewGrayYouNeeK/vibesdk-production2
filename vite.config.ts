// import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Strip dispatch namespace bindings from generated Worker config. */
function stripDispatchNamespacePlugin() {
	return {
		name: 'strip-dispatch-namespace',
		enforce: 'post' as const,
		closeBundle() {
			const distRoot = join(process.cwd(), 'dist');
			if (!existsSync(distRoot)) return;
			for (const entry of readdirSync(distRoot, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const wranglerPath = join(distRoot, entry.name, 'wrangler.json');
				if (!existsSync(wranglerPath)) continue;
				const config = JSON.parse(readFileSync(wranglerPath, 'utf8')) as {
					dispatch_namespaces?: unknown;
					vars?: Record<string, unknown>;
					unsafe?: Record<string, unknown>;
				};
				let changed = false;
				if ('dispatch_namespaces' in config) {
					delete config.dispatch_namespaces;
					changed = true;
				}
				if (config.vars && 'DISPATCH_NAMESPACE' in config.vars) {
					delete config.vars.DISPATCH_NAMESPACE;
					changed = true;
				}
				const keepBindings = [
					'plain_text',
					'json',
					'secret_text',
					'secret_key',
					'dispatch_namespace',
				];
				const unsafe =
					typeof config.unsafe === 'object' && config.unsafe !== null
						? (config.unsafe as Record<string, unknown>)
						: {};
				const metadata =
					typeof unsafe.metadata === 'object' && unsafe.metadata !== null
						? (unsafe.metadata as Record<string, unknown>)
						: {};
				const existingKeep = Array.isArray(metadata.keep_bindings)
					? metadata.keep_bindings.filter((value): value is string => typeof value === 'string')
					: [];
				const mergedKeep = [...new Set([...existingKeep, ...keepBindings])];
				if (JSON.stringify(existingKeep) !== JSON.stringify(mergedKeep)) {
					metadata.keep_bindings = mergedKeep;
					unsafe.metadata = metadata;
					config.unsafe = unsafe;
					changed = true;
				}
				if (changed) {
					writeFileSync(wranglerPath, `${JSON.stringify(config, null, 2)}\n`);
					console.log(
						`strip-dispatch-namespace: removed DISPATCHER from ${wranglerPath}`,
					);
				}
			}
		},
	};
}

// https://vite.dev/config/
export default defineConfig({
	optimizeDeps: {
		exclude: ['format', 'editor.all'],
		include: ['monaco-editor/editor/editor.api'],
		force: true,
	},

	// build: {
	//     rollupOptions: {
	//       output: {
	//             advancedChunks: {
	//                 groups: [{name: 'vendor', test: /node_modules/}]
	//             }
	//         }
	//     }
	// },
	plugins: [
		react(),
		svgr(),
		cloudflare({
			configPath: 'wrangler.jsonc',
		}),
		stripDispatchNamespacePlugin(),
		tailwindcss(),
		// sentryVitePlugin({
		// 	org: 'cloudflare-0u',
		// 	project: 'javascript-react',
		// }),
	],

	resolve: {
		alias: [
			{ find: 'debug', replacement: 'debug/src/browser' },
			// `agents` lazily `import("mimetext")`, which resolves to mimetext's
			// node build. That build pulls in `safe-buffer` (`require("buffer")`),
			// and the resulting code-split chunk throws at Workers startup because
			// `require` is not exposed there (deploy error 10021). The browser
			// build avoids the `require("buffer")` path. Use an exact-match regex
			// so `mimetext/browser` itself is not re-aliased.
			{ find: /^mimetext$/, replacement: 'mimetext/browser' },
			// `@cloudflare/shell` bundles standard `isomorphic-git`, whose `sha.js`
			// transitive uses `safe-buffer` (`require("buffer")`). That unguarded
			// CJS require lands in a code-split chunk and throws at Workers startup
			// (deploy error 10021). Resolve it to a local ESM shim that statically
			// re-exports `node:buffer`, so the bundler links the runtime-provided
			// buffer module instead of emitting a `require()` call.
			{
				find: /^safe-buffer$/,
				replacement: path.resolve(
					__dirname,
					'./worker/polyfills/safe-buffer.ts',
				),
			},
			// Vendored `artifacts-viewer` (git subtree under packages/). Built
			// from source: map its published subpath specifiers to the vendored
			// TypeScript sources so Vite (frontend) and the Cloudflare plugin
			// (worker) compile them directly — the package's own vite-plus/pnpm
			// build is not used. More specific subpaths must precede the root.
			{
				find: 'artifacts-viewer/server/cache',
				replacement: path.resolve(
					__dirname,
					'./packages/artifacts-viewer/packages/artifacts-viewer/src/server/cache-adapters.ts',
				),
			},
			{
				find: 'artifacts-viewer/styles.css',
				replacement: path.resolve(
					__dirname,
					'./packages/artifacts-viewer/packages/artifacts-viewer/src/styles/viewer.css',
				),
			},
			{
				find: 'artifacts-viewer/client',
				replacement: path.resolve(
					__dirname,
					'./packages/artifacts-viewer/packages/artifacts-viewer/src/client/index.ts',
				),
			},
			{
				find: 'artifacts-viewer/react',
				replacement: path.resolve(
					__dirname,
					'./packages/artifacts-viewer/packages/artifacts-viewer/src/react/index.ts',
				),
			},
			{
				find: /^artifacts-viewer$/,
				replacement: path.resolve(
					__dirname,
					'./packages/artifacts-viewer/packages/artifacts-viewer/src/index.ts',
				),
			},
			{ find: '@', replacement: path.resolve(__dirname, './src') },
			{ find: 'shared', replacement: path.resolve(__dirname, './shared') },
			{ find: 'worker', replacement: path.resolve(__dirname, './worker') },
		],
	},

	// Configure for Prisma + Cloudflare Workers compatibility
	define: {
		// Ensure proper module definitions for Cloudflare Workers context
		'process.env.NODE_ENV': JSON.stringify(
			process.env.NODE_ENV || 'development',
		),
		global: 'globalThis',
		// '__filename': '""',
		// '__dirname': '""',
	},

	worker: {
		// Handle Prisma in worker context for development
		format: 'es',
	},

	server: {
		allowedHosts: true,
	},

	// Clear cache more aggressively
	cacheDir: 'node_modules/.vite',
});
