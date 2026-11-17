export const REVIEW_KEY = 'transferCreditReview';

export type TransferReview = { confirmed: string | null; checkedAt: number | null };

const EMPTY: TransferReview = { confirmed: null, checkedAt: null };

function storage(): chrome.storage.StorageArea | undefined {
	try {
		return typeof chrome === 'undefined' ? undefined : chrome.storage?.local;
	} catch {
		return undefined;
	}
}

export async function readReview(): Promise<TransferReview> {
	try {
		const stored = (await storage()?.get(REVIEW_KEY))?.[REVIEW_KEY] as
			| Record<string, unknown>
			| undefined;
		if (!stored || typeof stored !== 'object') return EMPTY;
		return {
			confirmed: typeof stored.confirmed === 'string' ? stored.confirmed : null,
			checkedAt: typeof stored.checkedAt === 'number' ? stored.checkedAt : null
		};
	} catch (error) {
		console.error('Failed to read the transfer credit review', error);
		return EMPTY;
	}
}

export async function writeReview(review: TransferReview): Promise<void> {
	try {
		await storage()?.set({ [REVIEW_KEY]: review });
	} catch (error) {
		console.error('Failed to save the transfer credit review', error);
	}
}
