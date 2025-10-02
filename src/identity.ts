import type { Env } from './env';
import { ensureSchema, getCachedIdentity, putCachedIdentity } from './db';

type MaybeStr = string | null;

const HOSTS_BY_CHAIN = {
	dot: ['https://polkadot.api.subscan.io', 'https://people-polkadot.api.subscan.io'],
	ksm: ['https://kusama.api.subscan.io', 'https://people-kusama.api.subscan.io'],
} as const;

const FALLBACK_HOSTS = [
	'https://polkadot.api.subscan.io',
	'https://kusama.api.subscan.io',
	'https://people-polkadot.api.subscan.io',
	'https://people-kusama.api.subscan.io',
];

const IDENTITY_TTL_SEC = 7 * 24 * 60 * 60;

function extractDisplayFlexible(json: any): MaybeStr {
	const d = json?.data ?? {};
	const acct = d?.account ?? {};
	const idRaw = d?.identity ?? acct?.identity ?? d?.account_identity ?? null;

	const directDisplay = idRaw?.display ?? d?.account_display ?? d?.display ?? acct?.display ?? null;

	const info = idRaw?.info ?? idRaw?.identity ?? {};
	const dispNode = info?.display ?? info?.display_name ?? {};
	const displayFromInfo =
		typeof (dispNode as any)?.Raw === 'string' && (dispNode as any).Raw.trim()
			? (dispNode as any).Raw
			: typeof dispNode === 'string' && dispNode.trim()
			? dispNode
			: null;

	const parentNode = info?.parent ?? info?.parent_display ?? {};
	const parentStr =
		typeof (parentNode as any)?.Raw === 'string' && (parentNode as any).Raw.trim()
			? (parentNode as any).Raw
			: typeof parentNode === 'string' && parentNode.trim()
			? parentNode
			: idRaw?.display_parent ?? idRaw?.displayParent ?? null;

	const display = (directDisplay || displayFromInfo || null) as MaybeStr;

	if (parentStr && display && parentStr !== display) return `${parentStr} / ${display}`;
	return display;
}

async function fetchIdentityFromHost(host: string, apiKey: string, addr: string) {
	const url = `${host}/api/scan/account`;
	try {
		const resp = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
			body: JSON.stringify({ address: addr }),
		});
		if (!resp.ok) {
			return { ok: false, code: resp.status, parsed: null as MaybeStr, snippet: await resp.text() };
		}
		const json: any = await resp.json(); // <-- type it
		const parsed = extractDisplayFlexible(json);

		// Build tiny “shape” snippet safely
		const data: any = json?.data ?? {};
		const account: any = data?.account ?? {};
		const ident: any = account?.identity ?? data?.identity ?? {};
		const snippet = JSON.stringify(
			{
				dataKeys: Object.keys(data),
				accountKeys: Object.keys(account),
				identityKeys: Object.keys(ident),
			},
			null,
			2
		);

		return { ok: true, code: 200, parsed, snippet };
	} catch (e: any) {
		return { ok: false, code: 0, parsed: null as MaybeStr, snippet: String(e?.message || e) };
	}
}

function buildHostList(chainHint?: 'dot' | 'ksm') {
	const tryHosts: string[] = [];
	if (chainHint && HOSTS_BY_CHAIN[chainHint]) tryHosts.push(...HOSTS_BY_CHAIN[chainHint]);
	for (const h of FALLBACK_HOSTS) if (!tryHosts.includes(h)) tryHosts.push(h);
	return tryHosts;
}

async function fetchIdentityDisplay(env: Env, addr: string, chainHint?: 'dot' | 'ksm'): Promise<MaybeStr> {
	if (!env.SUBSCAN_API_KEY) return null;
	const tryHosts = buildHostList(chainHint);
	for (const host of tryHosts) {
		const r = await fetchIdentityFromHost(host, env.SUBSCAN_API_KEY, addr);
		if (r.ok && r.parsed) return r.parsed;
	}
	return null;
}

async function getLocalOverride(env: Env, addr: string): Promise<MaybeStr> {
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS identities_override (
      addr TEXT PRIMARY KEY,
      display TEXT NOT NULL
    );`
	).run();
	const rs = await env.DB.prepare(`SELECT display FROM identities_override WHERE addr=?`).bind(addr).all();
	const row = rs.results && rs.results[0];
	const v = row?.display;
	return typeof v === 'string' && v.trim() ? v : null;
}

export async function resolveIdentityDisplay(env: Env, addr: string, chainHint?: 'dot' | 'ksm'): Promise<MaybeStr> {
	await ensureSchema(env);

	const manual = await getLocalOverride(env, addr);
	if (manual) return manual;

	const cached = await getCachedIdentity(env, addr);
	const now = Math.floor(Date.now() / 1000);
	if (cached && now - (cached.ts || 0) < IDENTITY_TTL_SEC) {
		const val = cached.display;
		return typeof val === 'string' && val.trim() ? val : null;
	}

	const fresh = await fetchIdentityDisplay(env, addr, chainHint);
	await putCachedIdentity(env, addr, fresh ?? null);
	return fresh;
}

export async function debugIdentityLookup(env: Env, addr: string, chainHint?: 'dot' | 'ksm') {
	const hosts = buildHostList(chainHint);
	const out: Array<{ host: string; ok: boolean; code: number; parsed: MaybeStr; snippet: string }> = [];
	if (!env.SUBSCAN_API_KEY) {
		return { error: 'Missing SUBSCAN_API_KEY', hosts: [] as any[] };
	}
	for (const h of hosts) {
		const r = await fetchIdentityFromHost(h, env.SUBSCAN_API_KEY, addr);
		out.push({ host: h, ok: r.ok, code: r.code, parsed: r.parsed, snippet: r.snippet });
	}
	return { hosts: out };
}
