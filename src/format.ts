// format.ts
import type { Env } from './env';
import { escapeHTML, shortAddr, toDOT, voteEmoji } from './utils';
import { resolveIdentityDisplay } from './identity';

export async function fmtVoteText(env: Env, refId: number, v: { dir: string; addr: string; amt: any; conv: any; ts: any }) {
	const dot = toDOT(v.amt);
	const conv = v.conv ? `🔒 <i>Conviction:</i> ${escapeHTML(String(v.conv))}\n` : '';
	const raw = typeof v.ts === 'number' ? v.ts : Number(v.ts) || 0;
	const tsSec = raw > 2e10 ? Math.floor(raw / 1000) : raw;
	const when = tsSec ? new Date(tsSec * 1000).toISOString().slice(0, 19).replace('T', ' ') : '';
	const display = await resolveIdentityDisplay(env, v.addr);
	const who = display ? `👤 ${escapeHTML(display)}` : `👤 <code>${shortAddr(v.addr)}</code>`;
	return `${voteEmoji(v.dir)} <b>${v.dir.toUpperCase()}</b>
${who}
🏷️ <i>Ref:</i> #${refId}
💰 <i>Amount:</i> <b>${dot} DOT</b>
${conv}${when ? `🕒 <i>${when} UTC</i>` : ''}`.trim();
}
