// identity.ts
import type { Env } from './env';
import { ensureSchema, getCachedIdentity, putCachedIdentity } from './db';

const SUBSCAN_HOSTS = [
	'https://polkadot.api.subscan.io',
	'https://kusama.api.subscan.io',
	'https://people-polkadot.api.subscan.io',
	'https://people-kusama.api.subscan.io',
];

const IDENTITY_TTL_SEC = 7 * 24 * 60 * 60;

function extractDisplay(json: any): string | null {
	const d = json?.data || {};
	const i = d?.identity || d?.account?.identity || {};
	const display = i?.display ?? d?.display ?? d?.account?.display ?? d?.account_display ?? null;
	return typeof display === 'string' && display.trim() ? display : null;
}

async function fetchIdentityFromHost(host: string, apiKey: string, addr: string): Promise<string | null> {
	try {
		const resp = await fetch(`${host}/api/scan/account`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
			body: JSON.stringify({ address: addr }),
		});
		if (!resp.ok) return null;
		const json = await resp.json();
		return extractDisplay(json);
	} catch {
		return null;
	}
}

async function fetchIdentityDisplay(env: Env, addr: string): Promise<string | null> {
	if (!env.SUBSCAN_API_KEY) return null;
	for (const host of SUBSCAN_HOSTS) {
		const name = await fetchIdentityFromHost(host, env.SUBSCAN_API_KEY, addr);
		if (name) return name;
	}
	return null;
}

async function getLocalOverride(env: Env, addr: string): Promise<string | null> {
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS identities_override (
      addr TEXT PRIMARY KEY,
      display TEXT NOT NULL
    );`
	).run();
	const rs = await env.DB.prepare(`SELECT display FROM identities_override WHERE addr=?`).bind(addr).all();
	const row = rs.results && rs.results[0];
	return row?.display ? String(row.display) : null;
}

export async function resolveIdentityDisplay(env: Env, addr: string): Promise<string | null> {
	await ensureSchema(env);
	const manual = await getLocalOverride(env, addr);
	if (manual) return manual;
	const cached = await getCachedIdentity(env, addr);
	const now = Math.floor(Date.now() / 1000);
	if (cached && now - cached.ts < IDENTITY_TTL_SEC) return cached.display || null;
	const fresh = await fetchIdentityDisplay(env, addr);
	await putCachedIdentity(env, addr, fresh);
	return fresh;
}
