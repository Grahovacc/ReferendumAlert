import type { Env } from './env';
import { escapeHTML, voteEmoji } from './utils';
import { resolveIdentityDisplay } from './identity';
import type { Chain } from './db';

function dotToPlancks(x: string): bigint {
	const s = String(x || '0');
	const [i, f = ''] = s.split('.');
	const frac = (f + '0000000000').slice(0, 10);
	const digits = (i.replace(/\D/g, '') || '0') + frac.replace(/\D/g, '');
	return BigInt(digits.replace(/^0+(?=\d)/, '') || '0');
}

function plancksToDot(n: bigint): string {
	const s = n.toString();
	const pad = s.padStart(11, '0');
	const int = pad.slice(0, -10).replace(/^0+(?=\d)/, '') || '0';
	const frac = pad.slice(-10).replace(/0+$/, '');
	return frac ? `${int}.${frac}` : int;
}

function parseConviction(conv: any): { num: bigint; den: bigint; label: string } {
	const t = String(conv ?? '')
		.toLowerCase()
		.trim();
	if (!t || t === 'none' || t === 'no lock' || t === '0' || t.includes('0.1x')) return { num: 1n, den: 10n, label: '0.1x' };
	const m = t.match(/(\d+)\s*x/);
	if (m) {
		const k = BigInt(m[1]);
		const kk = k === 0n ? 1n : k;
		return { num: kk, den: 1n, label: `${kk.toString()}x` };
	}
	const n = Number(t);
	if (!Number.isNaN(n) && n >= 0 && n <= 6) {
		if (n === 0) return { num: 1n, den: 10n, label: '0.1x' };
		const k = BigInt(Math.trunc(n));
		return { num: k, den: 1n, label: `${k.toString()}x` };
	}
	return { num: 1n, den: 1n, label: '1x' };
}

function parseAmtToPlancks(amt: any): bigint {
	if (amt == null) return 0n;
	if (typeof amt === 'bigint') return amt;
	if (typeof amt === 'number') return BigInt(Math.trunc(amt));
	const s = String(amt).trim();
	if (!s) return 0n;
	if (s.includes('.')) return dotToPlancks(s);
	if (/^\d+$/.test(s)) return BigInt(s);
	return dotToPlancks(s.replace(/[^\d.]/g, ''));
}

export async function fmtVoteText(
	env: Env,
	refId: number,
	v: { dir: string; addr: string; amt: any; conv: any; ts: any; delegate?: string },
	chain?: Chain
) {
	const voter = v.delegate || v.addr;
	const display = await resolveIdentityDisplay(env, voter, chain);

	const amtPlancks = parseAmtToPlancks(v.amt);
	const { num, den, label } = parseConviction(v.conv);
	const powerPlancks = (amtPlancks * num) / den;
	const amtDot = plancksToDot(amtPlancks);
	const powerDot = plancksToDot(powerPlancks);

	const conv = v.conv ? `🔒 <i>Conviction:</i> ${escapeHTML(String(v.conv))}\n` : '';
	const raw = typeof v.ts === 'number' ? v.ts : Number(v.ts) || 0;
	const tsSec = raw > 2e10 ? Math.floor(raw / 1000) : raw;
	const when = tsSec ? new Date(tsSec * 1000).toISOString().slice(0, 19).replace('T', ' ') : '';

	const nameLine = display ? `👤 ${escapeHTML(display)}\n` : '';

	return `${voteEmoji(v.dir)} <b>${v.dir.toUpperCase()}</b>
${nameLine}🪪 <i>Address:</i> <code>${voter}</code>
🏷️ <i>Ref:</i> #${refId}
💰 <i>Amount:</i> <b>${amtDot} DOT</b>
${conv}⚖️ <i>Voting power:</i> <b>${powerDot} DOT</b> <i>(${amtDot} × ${label})</i>
${when ? `🕒 <i>${when} UTC</i>` : ''}`.trim();
}
