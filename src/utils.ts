// utils.ts
export const shortAddr = (s: string) => (!s ? 'unknown' : s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);

export function toDOT(raw: any) {
	const s = String(raw ?? '').replace(/\D/g, '');
	if (!s) return '0';
	const PAD = 11;
	const pad = s.padStart(PAD, '0');
	const int = pad.slice(0, -10);
	const frac = pad.slice(-10).replace(/0+$/, '');
	return frac ? `${int}.${frac}` : int;
}

export const voteEmoji = (d: string) => (d === 'aye' ? '🟢' : d === 'nay' ? '🔴' : '🟡');
export const cleanId = (x: unknown) => String(x ?? '').replace(/[^\d-]/g, '');
export const escapeHTML = (s: string) =>
	s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export type Row = Record<string, any>;
