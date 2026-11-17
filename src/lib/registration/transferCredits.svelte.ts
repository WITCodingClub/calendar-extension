import { API } from '../api';
import { Source, errorText } from './source.svelte';
import type { CourseSummary, TransferCredit, TransferKind } from './types';

export const TRANSFER_KINDS: { value: TransferKind; label: string }[] = [
	{ value: 'ap', label: 'AP exam' },
	{ value: 'test', label: 'Test' },
	{ value: 'transfer', label: 'Transfer' }
];

export function kindLabel(kind: TransferKind | null) {
	return TRANSFER_KINDS.find((entry) => entry.value === kind)?.label ?? 'Credit';
}

const byCode = (a: TransferCredit, b: TransferCredit) => a.code.localeCompare(b.code);

export class TransferCredits {
	readonly list: Source<TransferCredit[]>;
	open = $state(false);
	busy = $state<string | null>(null);
	error = $state('');
	readonly #active: () => boolean;
	readonly #changed: () => void;
	readonly #fetch = () => API.getTransferCredits();

	constructor(active: () => boolean, changed: () => void) {
		this.#active = active;
		this.#changed = changed;
		this.list = new Source(active);
	}

	show() {
		this.open = true;
		this.error = '';
		if (!this.list.started || this.list.error) void this.list.load(this.#fetch);
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
