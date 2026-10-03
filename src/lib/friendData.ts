import type {
	FriendIdentity,
	FriendListResponse,
	FriendRequestsResponse,
	FriendRequestCreateResponse,
	FriendRequestAcceptResponse,
	OkResponse,
	isProcessed
} from './types';

function identity(value: unknown): value is FriendIdentity {
	if (!value || typeof value !== 'object') return false;
	const person = value as FriendIdentity;
	return (
		typeof person.id === 'string' &&
		!!person.id.trim() &&
		person.id !== 'you' &&
		typeof person.name === 'string' &&
		!!person.name.trim()
	);
}

export function friendList(value: FriendListResponse): FriendListResponse {
	if (
		!Array.isArray(value?.friends) ||
		!value.friends.every(identity) ||
		new Set(value.friends.map((person) => person.id)).size !== value.friends.length
	)
		throw new Error('Invalid friends list returned. Reload friends to try again.');
	return value;
}

export function friendRequests(value: FriendRequestsResponse): FriendRequestsResponse {
	for (const key of ['incoming', 'outgoing'] as const) {
		const requests = value?.[key];
		if (
			!Array.isArray(requests) ||
			!requests.every(
				(request) =>
					request &&
					typeof request.request_id === 'string' &&
					!!request.request_id.trim() &&
					typeof request.created_at === 'string' &&
					Number.isFinite(Date.parse(request.created_at)) &&
					identity(
						key === 'incoming'
							? (request as { from?: unknown }).from
							: (request as { to?: unknown }).to
					)
			) ||
			new Set(requests.map((request) => request.request_id)).size !== requests.length
		)
			throw new Error('Invalid friend requests returned. Reload requests to try again.');
	}
	return value;
}

export function processedStatus(value: isProcessed): isProcessed {
	if (typeof value?.processed !== 'boolean')
		throw new Error('Invalid schedule status returned. Reload schedules to try again.');
	return value;
}

export function requestInputMessage(value: string): string | undefined {
	if (!value.trim()) return 'Enter an email or user ID.';
	if (
		/\s/.test(value.trim()) ||
		(value.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
	)
		return 'Enter a valid email or user ID without spaces.';
}

export function requestCreated(value: FriendRequestCreateResponse): FriendRequestCreateResponse {
	if (typeof value?.request_id !== 'string' || !value.request_id.trim())
		throw new Error('The request was not confirmed. Reload requests before trying again.');
	return value;
}

export function friendRequestErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : '';
	if (/RecordNotFound|not found/i.test(message))
		return 'No account associated with the email or user ID entered was found.';
	if (/already exists/i.test(message))
		return "You're already friends with this user or have a pending friend request with them.";
	return message || 'Failed to send friend request.';
}

export function requestAccepted(value: FriendRequestAcceptResponse): FriendRequestAcceptResponse {
	if (
		typeof value?.friendship_id !== 'string' ||
		!value.friendship_id.trim() ||
		!identity(value.friend)
	)
		throw new Error('The friendship was not confirmed. Reload friends before trying again.');
	return value;
}

export function mutationResult(value: OkResponse): OkResponse {
	if (value?.ok !== true)
		throw new Error(
			'The action was not confirmed. Reload friends and requests before trying again.'
		);
	return value;
}
