// commands.ts
import type { Env } from './env';
import { tgSend } from './telegram';
import { cleanId } from './utils';
import { ensureSchema, addWatch, removeWatch, listWatchesForChat, setSince, Chain, clearChat } from './db';

const CHAIN_HINT = `<i>Chain:</i> <code>dot</code> = Polkadot, <code>ksm</code> = Kusama.`;
const EXAMPLES = `Examples:
• <code>/watch 1759</code> (defaults to dot)
• <code>/watch 321 ksm</code>
• <code>/watch dot:1759</code> or <code>/watch ksm:321</code>
• <code>/watchdot 1759</code> or <code>/watchksm 321</code>`;

export const HELP_TEXT = `👋 <b>Referendum Alert — OpenGov vote notifier</b>

<b>Commands</b>
/watch <i>&lt;id&gt;</i> [dot|ksm] — start watching (default dot)
/watchdot <i>&lt;id&gt;</i> — start watching on Polkadot
/watchksm <i>&lt;id&gt;</i> — start watching on Kusama
/unwatch <i>&lt;id&gt;</i> [dot|ksm] — stop watching (no chain = both)
/list — list what you watch (with chain)
/clear — unsubscribe all (both chains)
/id — show this chat id
/help — show this message

${CHAIN_HINT}
${EXAMPLES}
`;

function normChain(x?: string | null): Chain | null {
	if (!x) return null;
	const t = x.toLowerCase();
	if (t === 'dot' || t === 'polkadot') return 'dot';
	if (t === 'ksm' || t === 'kusama') return 'ksm';
	return null;
}

function parseWatchArgs(raw: string): { id: number; chain: Chain } | null {
	const s = raw.trim();
	if (!s) return null;
	const colon = s.match(/^(dot|ksm)\s*:\s*(\d+)$/i);
	if (colon) {
		const chain = normChain(colon[1])!;
		const id = Number(colon[2]);
		if (!id) return null;
		return { id, chain };
	}
	const parts = s.split(/\s+/);
	const id = Number(parts[0]);
	if (!id) return null;
	const chain = normChain(parts[1]) || 'dot';
	return { id, chain };
}

export async function handleCommand(env: Env, update: any) {
	await ensureSchema(env);
	const msg = (update?.message ?? update?.channel_post) as any;
	const chatId = String(msg?.chat?.id ?? '');
	const rawText = String(msg?.text || '').trim();
	if (!chatId || !rawText) return;
	const [rawCmd, ...rest] = rawText.split(/\s+/);
	const cmdOnly = rawCmd.replace(/@.+$/, '').toLowerCase();
	const argRaw = rest.join(' ').trim();
	const argClean = cleanId(argRaw);
	try {
		if (cmdOnly === '/start' || cmdOnly === '/help' || cmdOnly === '/commands') {
			await tgSend(env, chatId, HELP_TEXT);
			return;
		}
		if (cmdOnly === '/id') {
			await tgSend(env, chatId, `This chat id: <code>${chatId}</code>`);
			return;
		}
		if (cmdOnly === '/watch' || cmdOnly === '/watchdot' || cmdOnly === '/watchksm') {
			let parsed = parseWatchArgs(argRaw);
			if (cmdOnly === '/watchdot') {
				const id = Number(argClean);
				parsed = id ? { id, chain: 'dot' } : null;
			}
			if (cmdOnly === '/watchksm') {
				const id = Number(argClean);
				parsed = id ? { id, chain: 'ksm' } : null;
			}
			if (!parsed) {
				await tgSend(env, chatId, `Usage: <code>/watch &lt;id&gt; [dot|ksm]</code>\n${EXAMPLES}`);
				return;
			}
			const { id, chain } = parsed;
			await addWatch(env, chatId, id, chain);
			await setSince(env, id, chain, Math.floor(Date.now() / 1000));
			await tgSend(env, chatId, `✅ Watching #${id} (${chain})`);
			return;
		}
		if (cmdOnly === '/unwatch') {
			const parts = argRaw.trim().split(/\s+/).filter(Boolean);
			const id = Number(parts[0]);
			const chain = normChain(parts[1] || null);
			if (!id) {
				await tgSend(env, chatId, `Usage: <code>/unwatch &lt;id&gt; [dot|ksm]</code>`);
				return;
			}
			await removeWatch(env, chatId, id, chain ?? undefined);
			await tgSend(env, chatId, chain ? `🗑️ Unwatched #${id} (${chain})` : `🗑️ Unwatched #${id} (dot & ksm)`);
			return;
		}
		if (cmdOnly === '/list') {
			const refs = await listWatchesForChat(env, chatId);
			if (!refs.length) {
				await tgSend(env, chatId, `You aren’t watching any referenda yet. Use <code>/watch &lt;id&gt; [dot|ksm]</code>.`);
				return;
			}
			const text = '👀 Watching: ' + refs.map((r) => `#${r.ref_id} (${r.chain})`).join(', ');
			await tgSend(env, chatId, text);
			return;
		}
		if (cmdOnly === '/clear') {
			await clearChat(env, chatId);
			await tgSend(env, chatId, `🧹 Cleared all subscriptions for this chat (dot & ksm).`);
			return;
		}
		if (cmdOnly.startsWith('/')) {
			await tgSend(env, chatId, `🤖 Unknown command: <code>${rawCmd}</code>\n\n${HELP_TEXT}`);
		}
	} catch (e: any) {
		console.error('command', e);
		await tgSend(env, chatId, `⚠️ Error: ${e?.message || e}`);
	}
}
