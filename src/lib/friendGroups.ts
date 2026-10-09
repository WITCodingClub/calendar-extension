import type { FriendGroup } from './components/friends/types';

function parseGroup(value: unknown): FriendGroup {
	if (!value || typeof value !== 'object') throw new Error('Invalid friend group returned.');
	const group = value as Record<string, unknown>;
	if (
		typeof group.id !== 'string' ||
		!group.id.trim() ||
		typeof group.name !== 'string' ||
		!group.name.trim() ||
		!Array.isArray(group.members) ||
		!group.members.every(
			(member) =>
				member &&
				typeof member.id === 'string' &&
				!!member.id.trim() &&
				member.id !== 'you' &&
				typeof member.name === 'string' &&
				!!member.name.trim()
		)
	)
		throw new Error('Invalid friend group returned.');
	const members = group.members.map((member) => member.id as string);
	if (new Set(members).size !== members.length) throw new Error('Invalid friend group returned.');
	return { id: group.id, name: group.name, members };
}

export function friendGroup(value: unknown): FriendGroup {
	return parseGroup((value as { group?: unknown } | null)?.group);
}

export function friendGroups(value: unknown): FriendGroup[] {
	const groups = (value as { groups?: unknown } | null)?.groups;
	if (!Array.isArray(groups)) throw new Error('Invalid friend groups returned.');
	const parsed = groups.map(parseGroup);
	if (new Set(parsed.map((group) => group.id)).size !== parsed.length)
		throw new Error('Invalid friend groups returned.');
	return parsed;
}
