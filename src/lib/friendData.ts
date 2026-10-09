import type {
	FriendIdentity,
	FriendListResponse,
	FriendRequestsResponse,
	FriendRequestCreateResponse,
	FriendRequestAcceptResponse,
	OkResponse,
	isProcessed,
	FriendExpiryResponse,
	MeetingLinkResponse,
	MeetingLinkCreateResponse,
	MeetingLinksResponse,
	SharingLevel,
	FriendVisibility,
	FriendVisibilityResponse
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

function optionalExpiry(value: { expires_at?: unknown }): boolean {
	return (
		value.expires_at === undefined ||
		value.expires_at === null ||
		(typeof value.expires_at === 'string' && Number.isFinite(Date.parse(value.expires_at)))
	);
}

export function sharingLevel(value: unknown): value is SharingLevel {
	return value === 'full' || value === 'availability_only';
}

function visibility(value: unknown): value is FriendVisibility {
	return record(value) && sharingLevel(value.mine) && sharingLevel(value.theirs);
}

export function sharingLabel(
	value?: SharingLevel
): 'Full schedule' | 'Availability only' | 'Sharing unavailable' {
	return value === 'full'
		? 'Full schedule'
		: value === 'availability_only'
			? 'Availability only'
			: 'Sharing unavailable';
}

export function friendVisibility(value: unknown): FriendVisibilityResponse {
	return checked(
		value,
		record(value) && text(value.friend_id) && visibility(value),
		'friend sharing'
	);
}

export function friendList(value: FriendListResponse): FriendListResponse {
	if (
		!Array.isArray(value?.friends) ||
		!value.friends.every(identity) ||
		!value.friends.every(optionalExpiry) ||
		!value.friends.every(
			(person) =>
				person.visibility === undefined ||
				person.visibility === null ||
				visibility(person.visibility)
		) ||
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
					optionalExpiry(request) &&
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
	if (typeof value?.request_id !== 'string' || !value.request_id.trim() || !optionalExpiry(value))
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
		!optionalExpiry(value) ||
		!identity(value.friend)
	)
		throw new Error('The friendship was not confirmed. Reload friends before trying again.');
	return value;
}

export function mutationResult(value: unknown): OkResponse {
	if (!value || typeof value !== 'object' || !('ok' in value) || value.ok !== true)
		throw new Error(
			'The action was not confirmed. Reload friends and requests before trying again.'
		);
	return value as OkResponse;
}

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): value is string {
	return typeof value === 'string' && !!value.trim();
}

function nullableText(value: unknown): boolean {
	return value === null || typeof value === 'string';
}

function timestamp(value: unknown): boolean {
	return (
		text(value) &&
		/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

function date(value: unknown): value is string {
	return (
		text(value) &&
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		Number.isFinite(Date.parse(value)) &&
		new Date(value).toISOString().slice(0, 10) === value
	);
}

function checked<T>(value: unknown, valid: boolean, kind: string): T {
	if (!valid) throw new Error(`Invalid ${kind} returned.`);
	return value as T;
}

export function friendExpiry(value: unknown): FriendExpiryResponse {
	return checked(
		value,
		record(value) &&
			text(value.friendship_id) &&
			(value.status === 'pending' || value.status === 'accepted') &&
			(value.expires_at === null || timestamp(value.expires_at)) &&
			['shortened', 'proposed', 'unchanged'].includes(value.expiry_change as string) &&
			identity(value.friend),
		'friendship expiry'
	);
}

function link(value: unknown): boolean {
	if (!record(value)) return false;
	const booking = value.booking;
	return (
		text(value.id) &&
		nullableText(value.title) &&
		date(value.starts_on) &&
		date(value.ends_on) &&
		value.starts_on <= value.ends_on &&
		[15, 30, 45, 60, 90, 120].includes(value.duration_minutes as number) &&
		timestamp(value.expires_at) &&
		['active', 'used', 'revoked', 'expired'].includes(value.status as string) &&
		timestamp(value.created_at) &&
		(booking === null ||
			(record(booking) &&
				text(booking.meeting_id) &&
				timestamp(booking.start_time) &&
				timestamp(booking.end_time) &&
				nullableText(booking.guest_name) &&
				nullableText(booking.guest_email)))
	);
}

export function meetingLink(value: unknown): MeetingLinkResponse {
	return checked(value, record(value) && link(value.meeting_link), 'meeting link');
}

export function meetingLinkCreated(value: unknown): MeetingLinkCreateResponse {
	const response = meetingLink(value);
	const item = record(value) ? value.meeting_link : undefined;
	return checked(response, record(item) && text(item.url), 'new meeting link URL');
}

export function meetingLinks(value: unknown): MeetingLinksResponse {
	return checked(
		value,
		record(value) &&
			Array.isArray(value.meeting_links) &&
			value.meeting_links.every(link) &&
			new Set(value.meeting_links.map((item) => item.id)).size === value.meeting_links.length,
		'meeting links'
	);
}
