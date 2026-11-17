import { readStudentPage } from './academicProfile';
import type { TransferKind } from '../registration/types';

export const TRANSCRIPT_URL =
	'https://selfservice.wit.edu/StudentSelfService/ssb/academicTranscript';

export type TranscriptPage = { navigation: unknown; transfer: unknown };

export type FoundCredit = {
	code: string;
	title: string | null;
	credits: number | null;
	kind: TransferKind;
	source: string | null;
	countable: boolean;
};

export async function lookupTranscriptPage(): Promise<
	TranscriptPage | { error: string; loginRequired?: boolean }
> {
	let loginRequired = false;
	try {
		const token = document.querySelector('meta[name="synchronizerToken"]')?.getAttribute('content');
		const response = await fetch(
			'/StudentSelfService/ssb/academicTranscript/academicTranscriptPageData?level=UG&type=WEB',
			{
				credentials: 'include',
				signal: AbortSignal.timeout(20_000),
				headers: {
					Accept: 'application/json',
					'X-Requested-With': 'XMLHttpRequest',
					...(token ? { 'X-Synchronizer-Token': token } : {})
				}
			}
		);
		if (
			response.status === 401 ||
			response.status === 403 ||
			response.redirected ||
			!response.headers.get('content-type')?.includes('application/json')
		) {
			loginRequired = true;
			throw new Error('Please log in to LeopardWeb and try checking your transcript again.');
		}
		if (!response.ok)
			throw new Error(
				`LeopardWeb returned ${response.status} while loading your transcript. Try again.`
			);
		const body = (await response.json()) as Record<string, unknown> | null;
		if (!body || typeof body !== 'object' || body.hasError === true)
			throw new Error('LeopardWeb could not load your transcript. Try again.');
		return { navigation: body.listOfNavigationItem, transfer: body.viewtransferCreditData };
	} catch (error) {
		return {
			...(loginRequired ? { loginRequired } : {}),
			error:
				error instanceof Error && error.name === 'Error'
					? error.message
					: 'Could not load your transcript from LeopardWeb. Check that you are logged in and try again.'
		};
	}
}

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clean(value: unknown) {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function kindOf(source: string): TransferKind {
	if (/advanced placement/i.test(source)) return 'ap';
	if (/\b(clep|dsst|ib|international baccalaureate|exam|test)\b/i.test(source)) return 'test';
	return 'transfer';
}

function invalid(): never {
	throw new Error('LeopardWeb returned transfer credit that could not be read. Try again.');
}

export function transcriptCredits(page: TranscriptPage): FoundCredit[] {
	const sections = Array.isArray(page.navigation)
		? page.navigation.map((item) => (record(item) ? item.code : null))
		: invalid();
	const groups = record(page.transfer) ? page.transfer.transferCreditList : undefined;
	if (groups == null && !sections.includes('transferCredit')) return [];
	if (!Array.isArray(groups)) invalid();
	const found: FoundCredit[] = [];
	for (const group of groups) {
		if (!record(group) || !Array.isArray(group.transferCreditInfo)) invalid();
		const source = clean(group.collegeName) || null;
		for (const row of group.transferCreditInfo) {
			if (!record(row)) invalid();
			const subject = clean(row.subject).toUpperCase();
			const number = clean(row.course).toUpperCase();
			if (!subject || !number) invalid();
			const code = `${subject} ${number}`;
			const hours = Number(clean(row.creditHours));
			const credits = clean(row.creditHours) && Number.isFinite(hours) ? Math.round(hours) : null;
			const countable = /^[A-Z]{2,4} \d{4}$/.test(code);
			if (countable && found.some((other) => other.code === code)) continue;
			found.push({
				code,
				title: clean(row.title) || null,
				credits,
				kind: kindOf(source ?? ''),
				source,
				countable
			});
		}
	}
	return found.sort((a, b) => a.code.localeCompare(b.code));
}

export function signatureOf(found: FoundCredit[]) {
	return found
		.map((credit) => `${credit.code}:${credit.credits ?? ''}:${credit.kind}`)
		.sort()
		.join('|');
}

export async function fetchTranscriptCredits(
	active: () => boolean
): Promise<FoundCredit[] | undefined> {
	const page = await readStudentPage(TRANSCRIPT_URL, lookupTranscriptPage, active);
	return page ? transcriptCredits(page) : undefined;
}
