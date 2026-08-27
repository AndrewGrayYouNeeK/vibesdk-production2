#!/usr/bin/env node
/**
 * Strip bindings that `wrangler versions upload` sends to the Cloudflare API
 * even when empty. An empty `dispatch_namespaces: []` still requires Workers
 * for Platforms (API 10121) on accounts that do not have it.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distRoot = join(process.cwd(), 'dist');
if (!existsSync(distRoot)) {
	console.warn('sanitize-deploy-wrangler: dist/ missing, skipping');
	process.exit(0);
}

const wranglerFiles = readdirSync(distRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => join(distRoot, entry.name, 'wrangler.json'))
	.filter((path) => existsSync(path));

if (wranglerFiles.length === 0) {
	console.warn('sanitize-deploy-wrangler: no generated wrangler.json found');
	process.exit(0);
}

for (const path of wranglerFiles) {
	const config = JSON.parse(readFileSync(path, 'utf8'));
	let changed = false;

	if ('dispatch_namespaces' in config) {
		delete config.dispatch_namespaces;
		changed = true;
	}

	if (config.vars && 'DISPATCH_NAMESPACE' in config.vars) {
		delete config.vars.DISPATCH_NAMESPACE;
		changed = true;
	}

	if (changed) {
		writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
		console.log(`SANITIZE_DISPATCH: removed DISPATCHER from ${path}`);
	}

	const verify = JSON.parse(readFileSync(path, 'utf8'));
	if (
		(Array.isArray(verify.dispatch_namespaces) &&
			verify.dispatch_namespaces.length > 0) ||
		verify.vars?.DISPATCH_NAMESPACE
	) {
		throw new Error(
			`SANITIZE_DISPATCH: ${path} still contains a dispatch namespace; refusing to produce a deploy config that would hit API 10121`,
		);
	}
}
