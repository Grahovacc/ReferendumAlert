export interface Env {
	TELEGRAM_TOKEN: string; // set via `wrangler secret put TELEGRAM_TOKEN`
	WEBHOOK_SECRET: string; // set via `wrangler secret put WEBHOOK_SECRET` (and set same in setWebhook)
	SUBSCAN_API_KEY?: string; // set via `wrangler secret put SUBSCAN_API_KEY`
	DB: D1Database; // D1 binding named "DB" in wrangler.jsonc
}

/* =========================================================================================
   Utility helpers
========================================================================================= */

const BOT_API = (env: Env) => `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}`;
const HEADERS_JSON = { 'content-type': 'application/json' };

const shortAddr = (s: string) => (!s ? 'unknown' : s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);

function toDOT(raw: any) {
	const s = String(raw ?? '').replace(/\D/g, '');
	if (!s) return '0';
	const PAD = 11; // 10 decimal places for DOT
	const pad = s.padStart(PAD, '0');
	const int = pad.slice(0, -10);
	const frac = pad.slice(-10).replace(/0+$/, '');
	return frac ? `${int}.${frac}` : int;
}

const voteEmoji = (d: string) => (d === 'aye' ? '🟢' : d === 'nay' ? '🔴' : '🟡');
const cleanId = (x: unknown) => String(x ?? '').replace(/[^\d-]/g, '');

/* =========================================================================================
   Telegram
========================================================================================= */

async function tgSend(env: Env, chatId: string, text: string) {
	const r = await fetch(`${BOT_API(env)}/sendMessage`, {
		method: 'POST',
		headers: HEADERS_JSON,
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: 'HTML',
			disable_web_page_preview: true,
		}),
	});
	if (!r.ok) console.error('sendMessage failed', r.status, await r.text());
}

/* =========================================================================================
   D1 storage: subscriptions + watermark
========================================================================================= */

type Row = Record<string, any>;

async function ensureSchema(env: Env) {
	// Safe to run on every request—SQLite will no-op if already exists
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS subs (
      chat_id TEXT NOT NULL,
      ref_id  INTEGER NOT NULL,
      PRIMARY KEY (chat_id, ref_id)
    );`
	).run();
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS wm (
      ref_id    INTEGER PRIMARY KEY,
      since_sec INTEGER NOT NULL
    );`
	).run();
}

async function addWatch(env: Env, chatId: string, refId: number) {
	await env.DB.prepare(`INSERT OR IGNORE INTO subs(chat_id, ref_id) VALUES(?,?)`).bind(chatId, refId).run();
}

async function removeWatch(env: Env, chatId: string, refId: number) {
	await env.DB.prepare(`DELETE FROM subs WHERE chat_id=? AND ref_id=?`).bind(chatId, refId).run();
}

async function listWatchesForChat(env: Env, chatId: string): Promise<number[]> {
	const rs = await env.DB.prepare(`SELECT ref_id FROM subs WHERE chat_id=? ORDER BY ref_id`).bind(chatId).all<Row>();
	return (rs.results || []).map((r) => Number(r.ref_id));
}

async function refsToChats(env: Env): Promise<Map<number, string[]>> {
	const rs = await env.DB.prepare(`SELECT ref_id, chat_id FROM subs`).all<Row>();
	const m = new Map<number, string[]>();
	for (const r of rs.results || []) {
		const ref = Number(r.ref_id),
			chat = String(r.chat_id);
		if (!m.has(ref)) m.set(ref, []);
		m.get(ref)!.push(chat);
	}
	return m;
}

async function getSince(env: Env, refId: number): Promise<number> {
	const rs = await env.DB.prepare(`SELECT since_sec FROM wm WHERE ref_id=?`).bind(refId).all<Row>(); // use .all() for widest TS compatibility
	const row = rs.results && rs.results[0];
	return row?.since_sec ? Number(row.since_sec) : 0;
}

async function setSince(env: Env, refId: number, tsSec: number) {
	await env.DB.prepare(
		`INSERT INTO wm(ref_id, since_sec) VALUES(?,?)
     ON CONFLICT(ref_id) DO UPDATE SET since_sec=excluded.since_sec`
	)
		.bind(refId, tsSec)
		.run();
}

/* =========================================================================================
   Data sources: Subscan (primary), Polkassembly (fallback)
========================================================================================= */

async function fetchVotesFromSubscan(refId: number, apiKey?: string) {
	if (!apiKey) return [];
	const resp = await fetch('https://polkadot.api.subscan.io/api/scan/referenda/votes', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
		body: JSON.stringify({ referendum_index: refId, page: 0, row: 50, order: 'desc' }),
	});
	if (!resp.ok) throw new Error(`Subscan ${resp.status}: ${await resp.text()}`);
	const json: any = await resp.json();

	const list: any[] = json?.data?.list ?? [];
	return list
		.map((r) => {
			const st = String(r?.status ?? '').toLowerCase(); // "ayes", "nays", maybe "abstain"
			let dir = '';
			if (st.includes('aye')) dir = 'aye';
			else if (st.includes('nay')) dir = 'nay';
			else if (st.includes('abstain')) dir = 'abstain';

			const addr = r?.account?.address || r?.address || '';
			const amt = r?.amount ?? r?.votes ?? 0; // base amount is fine for DOT display
			const conv = r?.conviction ?? null;
			const ts = r?.voting_time ?? r?.block_timestamp ?? r?.time ?? null; // seconds

			return { dir, addr, amt, conv, ts };
		})
		.filter((v) => v.dir && v.addr && v.ts);
}

async function fetchVotesFromPolkassembly(refId: number) {
	const resp = await fetch('https://polkadot.polkassembly.io/api/v1/votes/history', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'x-network': 'polkadot' },
		body: JSON.stringify({ postId: refId, voteType: 'referendum' }),
	});
	if (!resp.ok) throw new Error(`Polkassembly ${resp.status}`);
	const json: any = await resp.json();
	const rows: any[] = json?.data || json?.votes || [];
	return rows
		.map((r) => {
			const dirRaw = (r?.decision || r?.vote || '').toString().toLowerCase();
			const dir = dirRaw.includes('aye') ? 'aye' : dirRaw.includes('nay') ? 'nay' : dirRaw.includes('abstain') ? 'abstain' : '';
			if (!dir) return null;
			const addr = r?.address || r?.voter || r?.account || '';
			const amt = r?.balance || r?.amount || r?.votedBalance || r?.vote_balance || 0;
			const conv = r?.conviction || r?.lockPeriod || r?.voteConviction || null;
			const ts = r?.created_at || r?.timestamp || r?.block_time || r?.blockTimestamp || Date.now();
			return { dir, addr, amt, conv, ts };
		})
		.filter(Boolean) as { dir: string; addr: string; amt: any; conv: any; ts: any }[];
}

async function getRecentVotes(env: Env, refId: number) {
	try {
		const ss = await fetchVotesFromSubscan(refId, env.SUBSCAN_API_KEY);
		if (ss.length) return ss;
	} catch (e) {
		console.error('Subscan fetch error', e);
	}
	try {
		const pa = await fetchVotesFromPolkassembly(refId);
		if (pa.length) return pa;
	} catch (e) {
		console.error('Polkassembly fetch error', e);
	}
	return [];
}

/* =========================================================================================
   Formatting + notifier
========================================================================================= */

function fmtVote(refId: number, v: { dir: string; addr: string; amt: any; conv: any; ts: any }) {
	const dot = toDOT(v.amt);
	const conv = v.conv ? ` • <i>conviction:</i> ${v.conv}` : '';
	const raw = typeof v.ts === 'number' ? v.ts : Number(v.ts) || 0;
	const tsSec = raw > 2e10 ? Math.floor(raw / 1000) : raw;
	const when = tsSec ? new Date(tsSec * 1000).toISOString().slice(0, 19).replace('T', ' ') : '';
	return `${voteEmoji(v.dir)} <b>${v.dir.toUpperCase()}</b> • <b>${dot} DOT</b>${conv}
<code>${shortAddr(v.addr)}</code> • ref #${refId}${when ? ` • ${when} UTC` : ''}`;
}

async function notifyNewVotes(env: Env) {
	await ensureSchema(env);

	const map = await refsToChats(env);
	for (const [refId, chats] of map.entries()) {
		const last = await getSince(env, refId);
		const votes = await getRecentVotes(env, refId);

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
			const text = fmtVote(refId, v);
			await Promise.all(chats.map((c) => tgSend(env, c, text)));
		}

		const newest = fresh[fresh.length - 1].ts as number;
		await setSince(env, refId, newest);
	}
}

/* =========================================================================================
   Commands (via Telegram webhook)
========================================================================================= */

async function handleCommand(env: Env, update: any) {
	await ensureSchema(env);

	const msg = (update?.message ?? update?.channel_post) as any;
	const chatId = String(msg?.chat?.id ?? '');
	const text: string = String(msg?.text || '').trim();
	const [cmd, argRaw] = text.split(/\s+/, 2);
	const arg = cleanId(argRaw);

	if (!chatId) return;

	try {
		if (/^\/start/.test(cmd)) {
			await tgSend(
				env,
				chatId,
				`👋 I’m your OpenGov vote notifier.
Use:
/watch <id> — start watching referendum
/unwatch <id> — stop watching
/list — list what you watch
/clear — unsubscribe all
/id — show this chat id`
			);
			return;
		}
		if (/^\/help/.test(cmd)) {
			await tgSend(env, chatId, `Commands: /watch <id>, /unwatch <id>, /list, /clear, /id`);
			return;
		}
		if (/^\/id/.test(cmd)) {
			await tgSend(env, chatId, `This chat id: <code>${chatId}</code>`);
			return;
		}

		if (/^\/watch/.test(cmd)) {
			const id = Number(arg);
			if (!id) {
				await tgSend(env, chatId, `Usage: /watch <referendumId>`);
				return;
			}
			await addWatch(env, chatId, id);
			await setSince(env, id, Math.floor(Date.now() / 1000)); // start from “now”
			await tgSend(env, chatId, `✅ Watching referendum #${id}`);
			return;
		}

		if (/^\/unwatch/.test(cmd)) {
			const id = Number(arg);
			if (!id) {
				await tgSend(env, chatId, `Usage: /unwatch <referendumId>`);
				return;
			}
			await removeWatch(env, chatId, id);
			await tgSend(env, chatId, `🗑️ Unwatched #${id}`);
			return;
		}

		if (/^\/list/.test(cmd)) {
			const refs = await listWatchesForChat(env, chatId);
			await tgSend(
				env,
				chatId,
				refs.length ? `👀 Watching: ${refs.map((x) => `#${x}`).join(', ')}` : `You aren't watching any referenda yet. Use /watch <id>.`
			);
			return;
		}

		if (/^\/clear/.test(cmd)) {
			await env.DB.prepare(`DELETE FROM subs WHERE chat_id=?`).bind(chatId).run();
			await tgSend(env, chatId, `🧹 Cleared all subscriptions for this chat.`);
			return;
		}
	} catch (e: any) {
		console.error('command', e);
		await tgSend(env, chatId, `⚠️ Error: ${e?.message || e}`);
	}
}

/* =========================================================================================
   Debug routes (guard with ?key=WEBHOOK_SECRET)
========================================================================================= */

async function debugSubs(env: Env, url: URL) {
	if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
	await ensureSchema(env);
	const rs = await env.DB.prepare(`SELECT chat_id, ref_id FROM subs ORDER BY chat_id, ref_id`).all<Row>();
	return new Response(JSON.stringify(rs.results || [], null, 2), { headers: { 'content-type': 'application/json' } });
}

async function notifyDummy(env: Env, url: URL) {
	if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
	const chat = url.searchParams.get('chat');
	if (!chat) return new Response('chat required', { status: 400 });
	const ref = Number(url.searchParams.get('ref') || '1759');
	const type = (url.searchParams.get('type') || 'aye') as 'aye' | 'nay' | 'abstain';
	const emoji = type === 'aye' ? '🟢' : type === 'nay' ? '🔴' : '🟡';
	const text = `${emoji} <b>${type.toUpperCase()}</b> • <b>12.34 DOT</b>
<code>14abc…ff98</code> • ref #${ref} • ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;
	await tgSend(env, chat, text);
	return new Response('dummy sent');
}

async function diag(env: Env, url: URL) {
	if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
	return new Response(
		JSON.stringify(
			{ hasDB: !!env.DB, hasToken: !!env.TELEGRAM_TOKEN, hasSecret: !!env.WEBHOOK_SECRET, hasSubscanKey: !!env.SUBSCAN_API_KEY },
			null,
			2
		),
		{ headers: { 'content-type': 'application/json' } }
	);
}

// Optional: peek at parsed latest votes vs watermark for a ref
async function peek(env: Env, url: URL) {
	if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
	const ref = Number(url.searchParams.get('ref') || '1759');
	await ensureSchema(env);
	const last = await getSince(env, ref);
	const votes = await getRecentVotes(env, ref);
	const latest = votes.slice(0, 5).map((v) => ({
		dir: v.dir,
		addr: v.addr,
		amt: toDOT(v.amt),
		ts: Number(v.ts || 0),
	}));
	return new Response(JSON.stringify({ ref, watermark_sec: last, watermark_utc: new Date(last * 1000).toISOString(), latest }, null, 2), {
		headers: { 'content-type': 'application/json' },
	});
}

/* =========================================================================================
   Router (Webhook + Poll + Debug)
========================================================================================= */

async function handleWebhook(req: Request, env: Env) {
	if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('unauthorized', { status: 401 });
	const update = await req.json();
	const msg: any = (update as any)?.message ?? (update as any)?.channel_post;
	if (msg?.text) await handleCommand(env, update);
	return new Response('ok');
}

export default {
	async fetch(req: Request, env: Env) {
		const url = new URL(req.url);

		if (req.method === 'POST' && url.pathname === '/tg-webhook') return handleWebhook(req, env);
		if (url.pathname === '/health') return new Response('ok');
		if (url.pathname === '/run') {
			await notifyNewVotes(env);
			return new Response('ran');
		}

		if (url.pathname === '/debug-subs') return debugSubs(env, url);
		if (url.pathname === '/notify_dummy') return notifyDummy(env, url);
		if (url.pathname === '/diag') return diag(env, url);
		if (url.pathname === '/peek') return peek(env, url);

		return new Response('not found', { status: 404 });
	},

	async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(notifyNewVotes(env));
	},
};
