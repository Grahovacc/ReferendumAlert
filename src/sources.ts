import type { Env } from './env';
import type { Chain } from './db';

export type VoteRow = { dir: 'aye' | 'nay' | 'abstain'; addr: string; amt: any; conv: any; ts: number; delegate?: string };

function pickStr(...xs: any[]): string | undefined {
	for (const x of xs) {
		const s = typeof x === 'string' ? x : x?.address || x?.account || x?.voter || x?.who || x?.target;
		if (typeof s === 'string' && s.trim()) return s;
	}
	return undefined;
}

async function fetchVotesFromSubscan(chain: Chain, refId: number, apiKey?: string): Promise<VoteRow[]> {
	if (!apiKey) return [];
	const host = chain === 'dot' ? 'https://polkadot.api.subscan.io' : 'https://kusama.api.subscan.io';
	const resp = await fetch(`${host}/api/scan/referenda/votes`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
		body: JSON.stringify({ referendum_index: refId, page: 0, row: 100, order: 'desc' }),
	});
	if (!resp.ok) throw new Error(`Subscan ${chain} ${resp.status}: ${await resp.text()}`);
	const json: any = await resp.json();
	const list: any[] = json?.data?.list ?? [];
	return list
		.map((r) => {
			const st = String(r?.status ?? r?.vote ?? '').toLowerCase();
			let dir: VoteRow['dir'] | '' = '';
			if (st.includes('aye')) dir = 'aye';
			else if (st.includes('nay')) dir = 'nay';
			else if (st.includes('abstain')) dir = 'abstain';
			const addr = pickStr(r?.account, r?.address, r?.voter, r?.who) || '';
			const amt = r?.amount ?? r?.votes ?? r?.balance ?? 0;
			const conv = r?.conviction ?? r?.lock_period ?? null;
			const ts = Number(r?.voting_time ?? r?.block_timestamp ?? r?.time ?? 0);
			const delegate =
				pickStr(r?.delegate_account, r?.delegatee, r?.delegate, r?.delegated_to, r?.proxy, r?.target, r?.account?.delegated_to) ||
				undefined;
			return dir && addr && ts ? ({ dir, addr, amt, conv, ts, delegate } as VoteRow) : null;
		})
		.filter(Boolean) as VoteRow[];
}

async function fetchVotesFromPolkassembly(chain: Chain, refId: number): Promise<VoteRow[]> {
	const host = chain === 'dot' ? 'https://polkadot.polkassembly.io' : 'https://kusama.polkassembly.io';
	const resp = await fetch(`${host}/api/v1/votes/history`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'x-network': chain === 'dot' ? 'polkadot' : 'kusama' },
		body: JSON.stringify({ postId: refId, voteType: 'referendum' }),
	});
	if (!resp.ok) throw new Error(`Polkassembly ${chain} ${resp.status}`);
	const json: any = await resp.json();
	const rows: any[] = json?.data || json?.votes || [];
	return rows
		.map((r) => {
			const dirRaw = (r?.decision || r?.vote || '').toString().toLowerCase();
			const dir: VoteRow['dir'] | '' = dirRaw.includes('aye')
				? 'aye'
				: dirRaw.includes('nay')
				? 'nay'
				: dirRaw.includes('abstain')
				? 'abstain'
				: '';
			if (!dir) return null;
			const addr = pickStr(r?.address, r?.voter, r?.account, r?.who) || '';
			const amt = r?.balance || r?.amount || r?.votedBalance || r?.vote_balance || 0;
			const conv = r?.conviction || r?.lockPeriod || r?.voteConviction || null;
			const tsRaw = r?.created_at || r?.timestamp || r?.block_time || r?.blockTimestamp || Date.now();
			const ts = Number(tsRaw);
			const delegate =
				pickStr(
					r?.delegateAddress,
					r?.delegate,
					r?.delegatee,
					r?.delegated_to,
					r?.proxy,
					r?.target,
					r?.meta?.delegate,
					r?.meta?.delegateAddress
				) || (r?.isDelegatedVote ? addr : undefined);
			return { dir, addr, amt, conv, ts, delegate } as VoteRow;
		})
		.filter(Boolean) as VoteRow[];
}

export async function getRecentVotes(env: Env, chain: Chain, refId: number): Promise<VoteRow[]> {
	try {
		const ss = await fetchVotesFromSubscan(chain, refId, env.SUBSCAN_API_KEY);
		if (ss.length) return ss;
	} catch {}
	try {
		const pa = await fetchVotesFromPolkassembly(chain, refId);
		if (pa.length) return pa;
	} catch {}
	return [];
}
