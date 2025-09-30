import type { Env } from './env';
import { tgSend, tgSetMyCommands } from './telegram';
import { fmtVoteText } from './format';
import { ensureSchema, refsToChats, getSince, setSince, Chain } from './db';
import { getRecentVotes } from './sources';
import { Row, toDOT } from './utils';

export async function handleWebhook(req: Request, env: Env) {
	if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('unauthorized', { status: 401 });
	const update = await req.json();
	const msg: any = (update as any)?.message ?? (update as any)?.channel_post;
	if (msg?.text) {
		const { handleCommand } = await import('./commands');
		await handleCommand(env, update);
	}
	return new Response('ok');
}

/* scheduler loop: iterate distinct (ref,chain) */
export async function notifyNewVotes(env: Env) {
	await ensureSchema(env);
	const pairs = await refsToChats(env);
	for (const { ref_id, chain, chats } of pairs) {
		const last = await getSince(env, ref_id, chain);
		const votes = await getRecentVotes(env, chain, ref_id);

		const fresh = votes
			.map((v) => {
				const raw = typeof v.ts === 'number' ? v.ts : Number(v.ts) || 0;
				const tsSec = raw > 2e10 ? Math.floor(raw / 1000) : raw;
				return { ...v, ts: tsSec };
			})
			.sort((a, b) => (a.ts as number) - (b.ts as number))
			.filter((v) => (v.ts as number) > last);

		if (!fresh.length) continue;

		for (const v of fresh) {
			const text = await fmtVoteText(env, ref_id, v);
			await Promise.all(chats.map((c) => tgSend(env, c, text)));
		}

		const newest = fresh[fresh.length - 1].ts as number;
		await setSince(env, ref_id, chain, newest);
	}
}

/* admin routes (guard with key in index.ts) */
export async function debugSubs(env: Env) {
	await ensureSchema(env);
	const rs = await env.DB.prepare(`SELECT chat_id, ref_id, chain FROM subs_v2 ORDER BY chat_id, chain, ref_id`).all<Row>();
	return new Response(JSON.stringify(rs.results || [], null, 2), { headers: { 'content-type': 'application/json' } });
}

export async function notifyDummy(env: Env, url: URL) {
	const chat = url.searchParams.get('chat');
	if (!chat) return new Response('chat required', { status: 400 });

	const ref = Number(url.searchParams.get('ref') || '1759');
	const type = (url.searchParams.get('type') || 'aye') as 'aye' | 'nay' | 'abstain';
	const addr = url.searchParams.get('addr') || '16CwBowmC6fNyvBGwtZwoKFu8PDjTbd1pMovQRx2UyjhJArK';
	const v = { dir: type, addr, amt: '123400000000', conv: 'Locked1x', ts: Math.floor(Date.now() / 1000) };
	const text = await fmtVoteText(env, ref, v);
	await tgSend(env, chat, text);
	return new Response('dummy sent');
}

export function diag(env: Env) {
	return new Response(
		JSON.stringify(
			{ hasDB: !!env.DB, hasToken: !!env.TELEGRAM_TOKEN, hasSecret: !!env.WEBHOOK_SECRET, hasSubscanKey: !!env.SUBSCAN_API_KEY },
			null,
			2
		),
		{ headers: { 'content-type': 'application/json' } }
	);
}

export async function peek(env: Env, url: URL) {
	const ref = Number(url.searchParams.get('ref') || '1759');
	const chain = (url.searchParams.get('chain')?.toLowerCase() === 'ksm' ? 'ksm' : 'dot') as Chain;
	await ensureSchema(env);
	const last = await getSince(env, ref, chain);
	const votes = await getRecentVotes(env, chain, ref);
	const latest = votes.slice(0, 5).map((v) => ({
		dir: v.dir,
		addr: v.addr,
		amt: toDOT(v.amt),
		ts: Number(v.ts || 0),
	}));
	return new Response(
		JSON.stringify(
			{
				ref,
				chain,
				watermark_sec: last,
				watermark_utc: new Date(last * 1000).toISOString(),
				latest,
			},
			null,
			2
		),
		{
			headers: { 'content-type': 'application/json' },
		}
	);
}

export async function setCommands(env: Env) {
	await tgSetMyCommands(env);
	return new Response('commands set');
}

/** Optional: admin identity override */
export async function setIdentityOverride(env: Env, url: URL) {
	const addr = url.searchParams.get('addr');
	const display = url.searchParams.get('display');
	if (!addr || !display) return new Response('addr & display are required', { status: 400 });
	await env.DB.prepare(
		`
    CREATE TABLE IF NOT EXISTS identities_override (
      addr TEXT PRIMARY KEY,
      display TEXT NOT NULL
    );
  `
	).run();
	await env.DB.prepare(
		`
    INSERT INTO identities_override(addr, display) VALUES(?,?)
    ON CONFLICT(addr) DO UPDATE SET display=excluded.display
  `
	)
		.bind(addr, display)
		.run();
	return new Response('ok');
}
