import type { Env } from './env';
import type { Row } from './utils';

export type Chain = 'dot' | 'ksm';

async function tableExists(env: Env, name: string): Promise<boolean> {
	const rs = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).all<Row>();
	return !!(rs.results && rs.results[0]);
}

export async function ensureSchema(env: Env) {
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS subs_v2 (
      chat_id TEXT NOT NULL,
      ref_id  INTEGER NOT NULL,
      chain   TEXT NOT NULL CHECK (chain IN ('dot','ksm')),
      PRIMARY KEY (chat_id, ref_id, chain)
    );`
	).run();

	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS wm_v2 (
      ref_id    INTEGER NOT NULL,
      chain     TEXT NOT NULL CHECK (chain IN ('dot','ksm')),
      since_sec INTEGER NOT NULL,
      PRIMARY KEY (ref_id, chain)
    );`
	).run();

	if (await tableExists(env, 'subs')) {
		await env.DB.prepare(
			`INSERT OR IGNORE INTO subs_v2(chat_id, ref_id, chain)
       SELECT chat_id, ref_id, 'dot' FROM subs`
		).run();
		await env.DB.prepare(`DROP TABLE IF EXISTS subs`).run();
	}

	if (await tableExists(env, 'wm')) {
		await env.DB.prepare(
			`INSERT OR IGNORE INTO wm_v2(ref_id, chain, since_sec)
       SELECT ref_id, 'dot', since_sec FROM wm`
		).run();
		await env.DB.prepare(`DROP TABLE IF EXISTS wm`).run();
	}

	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS identities (
      addr    TEXT PRIMARY KEY,
      display TEXT,
      ts_sec  INTEGER NOT NULL
    );`
	).run();
}

export async function addWatch(env: Env, chatId: string, refId: number, chain: Chain) {
	await env.DB.prepare(`INSERT OR IGNORE INTO subs_v2(chat_id, ref_id, chain) VALUES(?,?,?)`).bind(chatId, refId, chain).run();
}

export async function removeWatch(env: Env, chatId: string, refId: number, chain?: Chain) {
	if (chain) {
		await env.DB.prepare(`DELETE FROM subs_v2 WHERE chat_id=? AND ref_id=? AND chain=?`).bind(chatId, refId, chain).run();
	} else {
		await env.DB.prepare(`DELETE FROM subs_v2 WHERE chat_id=? AND ref_id=?`).bind(chatId, refId).run();
	}
	if (await tableExists(env, 'subs')) {
		await env.DB.prepare(`DELETE FROM subs WHERE chat_id=? AND ref_id=?`).bind(chatId, refId).run();
	}
}

export async function clearChat(env: Env, chatId: string) {
	await env.DB.prepare(`DELETE FROM subs_v2 WHERE chat_id=?`).bind(chatId).run();
	if (await tableExists(env, 'subs')) {
		await env.DB.prepare(`DELETE FROM subs WHERE chat_id=?`).bind(chatId).run();
	}
}

export async function listWatchesForChat(env: Env, chatId: string): Promise<Array<{ ref_id: number; chain: Chain }>> {
	const rs = await env.DB.prepare(`SELECT ref_id, chain FROM subs_v2 WHERE chat_id=? ORDER BY chain, ref_id`).bind(chatId).all<Row>();
	return (rs.results || []).map((r) => ({ ref_id: Number(r.ref_id), chain: (r.chain as Chain) || 'dot' }));
}

export async function refsToChats(env: Env): Promise<Array<{ ref_id: number; chain: Chain; chats: string[] }>> {
	const rs = await env.DB.prepare(`SELECT ref_id, chain, chat_id FROM subs_v2`).all<Row>();
	const map = new Map<string, { ref_id: number; chain: Chain; chats: string[] }>();
	for (const r of rs.results || []) {
		const ref = Number(r.ref_id);
		const chain = (r.chain as Chain) || 'dot';
		const key = `${chain}:${ref}`;
		if (!map.has(key)) map.set(key, { ref_id: ref, chain, chats: [] });
		map.get(key)!.chats.push(String(r.chat_id));
	}
	return [...map.values()];
}

export async function getSince(env: Env, refId: number, chain: Chain): Promise<number> {
	const rs = await env.DB.prepare(`SELECT since_sec FROM wm_v2 WHERE ref_id=? AND chain=?`).bind(refId, chain).all<Row>();
	const row = rs.results && rs.results[0];
	return row?.since_sec ? Number(row.since_sec) : 0;
}

export async function setSince(env: Env, refId: number, chain: Chain, tsSec: number) {
	await env.DB.prepare(
		`INSERT INTO wm_v2(ref_id, chain, since_sec) VALUES(?,?,?)
     ON CONFLICT(ref_id, chain) DO UPDATE SET since_sec=excluded.since_sec`
	)
		.bind(refId, chain, tsSec)
		.run();
}

export async function getCachedIdentity(env: Env, addr: string) {
	const rs = await env.DB.prepare(`SELECT display, ts_sec FROM identities WHERE addr=?`).bind(addr).all<Row>();
	const row = rs.results && rs.results[0];
	if (!row) return null;
	return { display: (row.display as string) ?? null, ts: Number(row.ts_sec) || 0 };
}

export async function putCachedIdentity(env: Env, addr: string, display: string | null) {
	const now = Math.floor(Date.now() / 1000);
	await env.DB.prepare(
		`INSERT INTO identities(addr, display, ts_sec) VALUES(?,?,?)
     ON CONFLICT(addr) DO UPDATE SET display=excluded.display, ts_sec=excluded.ts_sec`
	)
		.bind(addr, display, now)
		.run();
}

/** NEW: allow purging the cache for one address for debugging. */
export async function deleteCachedIdentity(env: Env, addr: string) {
	await env.DB.prepare(`DELETE FROM identities WHERE addr=?`).bind(addr).run();
}
