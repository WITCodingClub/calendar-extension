import { API } from '../api';
import type { Backfills } from '../panel/backfills';
import { StudentPageAuthError } from '../calendar/academicProfile';
import { fetchTranscriptCredits, signatureOf, type FoundCredit } from '../calendar/transferCredits';
import { Source, errorText } from './source.svelte';
import { readReview, writeReview } from './transferReview';
import type { CourseSummary, TransferCredit, TransferKind } from './types';

export const TRANSFER_KINDS: { value: TransferKind; label: string }[] = [
	{ value: 'ap', label: 'AP exam' },
	{ value: 'test', label: 'Test' },
	{ value: 'transfer', label: 'Transfer' }
];

export function kindLabel(kind: TransferKind | null) {
	return TRANSFER_KINDS.find((entry) => entry.value === kind)?.label ?? 'Credit';
}

const CHECK_EVERY = 24 * 60 * 60 * 1000;
const byCode = (a: TransferCredit, b: TransferCredit) => a.code.localeCompare(b.code);
const sameCodes = (a: string[], b: string[]) => [...a].sort().join('|') === [...b].sort().join('|');

export class TransferCredits {
	readonly list = new Source<TransferCredit[]>(() => this.#active());
	open = $state(false);
	busy = $state<string | null>(null);
	error = $state('');
	found = $state.raw<FoundCredit[] | null>(null);
	selected = $state<string[]>([]);
	reading = $state(false);
	readError = $state('');
	loginUrl = $state<string>();
	confirmed = $state<string | null>(null);
	skipped = $state.raw<{ code: string; reason: string }[]>([]);
	readonly #active: () => boolean;
	readonly #changed: () => void;
	readonly #backfills: Backfills | undefined;
	#serverReviewed = false;
	readonly #fetch = () => API.getTransferCredits();

	constructor(active: () => boolean, changed: () => void, backfills?: Backfills) {
		this.#active = active;
		this.#changed = changed;
		this.#backfills = backfills;
	}

	countable = $derived((this.found ?? []).filter((credit) => credit.countable));
	other = $derived((this.found ?? []).filter((credit) => !credit.countable));
	savedFromTranscript = $derived(
		(this.list.data ?? [])
			.filter((credit) => credit.source === 'transcript')
			.map((credit) => credit.code)
	);
	needsReview = $derived(this.found !== null && signatureOf(this.found) !== this.confirmed);
	canConfirm = $derived(
		this.found !== null &&
			this.list.data !== undefined &&
			(this.needsReview || !sameCodes(this.selected, this.savedFromTranscript))
	);

	show() {
		this.open = true;
		this.error = '';
		if (!this.list.started || this.list.error) void this.list.load(this.#fetch);
	}

	async autoCheck() {
		const [review, server] = await Promise.all([
			readReview(),
			this.#backfills?.load().catch(() => undefined)
		]);
		if (!this.#active()) return;
		this.confirmed = review.confirmed;
		this.#serverReviewed = server?.transfer_credits?.completed ?? false;
		if (review.checkedAt && Date.now() - review.checkedAt < CHECK_EVERY) return;
		await writeReview({ ...review, checkedAt: Date.now() });
		if ((await this.check()) && this.#active() && this.needsReview && this.found?.length)
			this.show();
	}

	async check(): Promise<boolean> {
		if (this.reading) return false;
		this.reading = true;
		this.readError = '';
		this.loginUrl = undefined;
		try {
			const found = await fetchTranscriptCredits(this.#active);
			if (!found || !this.#active()) return false;
			const saved = this.list.data ?? (await this.list.load(this.#fetch));
			if (!this.#active()) return false;
			this.found = found;
			if (this.confirmed === null && this.#serverReviewed) {
				this.confirmed = signatureOf(found);
				await writeReview({ confirmed: this.confirmed, checkedAt: Date.now() });
				if (!this.#active()) return false;
			}
			const codes = found.filter((credit) => credit.countable).map((credit) => credit.code);
			this.selected =
				signatureOf(found) === this.confirmed && saved
					? codes.filter((code) =>
							saved.some((credit) => credit.code === code && credit.source === 'transcript')
						)
					: codes;
			return true;
		} catch (error) {
			if (!this.#active()) return false;
			this.readError = errorText(error);
			if (error instanceof StudentPageAuthError) this.loginUrl = error.url;
			return false;
		} finally {
			if (this.#active()) this.reading = false;
		}
	}

	toggle(code: string, on: boolean) {
		this.selected = on
			? [...this.selected.filter((entry) => entry !== code), code]
			: this.selected.filter((entry) => entry !== code);
	}

	async confirm(): Promise<boolean> {
		const found = this.found;
		if (!found || this.busy) return false;
		const chosen = found.filter(
			(credit) => credit.countable && this.selected.includes(credit.code)
		);
		this.busy = 'confirm';
		this.error = '';
		this.skipped = [];
		try {
			const result = await API.replaceTranscriptCredits(
				chosen.map(({ code, title, credits, kind }) => ({ code, title, credits, kind }))
			);
			if (!this.#active()) return false;
			this.list.set(result.credits.sort(byCode), this.#fetch);
			this.skipped = result.skipped;
			this.confirmed = signatureOf(found);
			this.#serverReviewed = true;
			await writeReview({ confirmed: this.confirmed, checkedAt: Date.now() });
			this.#changed();
			void API.completeTransferCreditReview().catch((error) =>
				console.error('Failed to record the transfer credit review', error)
			);
			return true;
		} catch (error) {
			if (this.#active()) this.error = errorText(error);
			return false;
		} finally {
			if (this.#active()) this.busy = null;
		}
	}

	has(code: string) {
		return (this.list.data ?? []).some((credit) => credit.code === code);
	}

	async add(course: CourseSummary, kind: TransferKind): Promise<boolean> {
		return this.#run(course.code, async () => {
			const credit = await API.addTransferCredit(course.code, kind);
			return [...(this.list.data ?? []).filter((entry) => entry.code !== credit.code), credit];
		});
	}

	async remove(code: string): Promise<boolean> {
		return this.#run(code, async () => {
			await API.removeTransferCredit(code);
			return (this.list.data ?? []).filter((entry) => entry.code !== code);
		});
	}

	async #run(code: string, change: () => Promise<TransferCredit[]>): Promise<boolean> {
		if (this.busy) return false;
		this.busy = code;
		this.error = '';
		try {
			const next = await change();
			if (!this.#active()) return false;
			this.list.set(next.sort(byCode), this.#fetch);
			this.#changed();
			return true;
		} catch (error) {
			if (this.#active()) this.error = errorText(error);
			return false;
		} finally {
			if (this.#active()) this.busy = null;
		}
	}
}
