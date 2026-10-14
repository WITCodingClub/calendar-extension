import type {
	Friend,
	FriendRequestIncoming,
	FriendRequestOutgoing,
	SharingLevel
} from '$lib/types';
import type { FriendGroup } from '$lib/friends/types';

export type ManagementState = {
	friends: Friend[];
	groups: FriendGroup[];
	incomingRequests: FriendRequestIncoming[];
	outgoingRequests: FriendRequestOutgoing[];
	friendsLoading: boolean;
	groupsLoading: boolean;
	requestsLoading: boolean;
	friendError: string;
	friendNotice: string;
	friendsError: string;
	groupsError: string;
	requestsError: string;
	actionLoadingId: string;
	groupLoadingId: string;
	sendFriendIdInput: string;
	sendFriendVisibility: SharingLevel;
	sendFriendExpiry: string;
	acceptFriendVisibility: Record<string, SharingLevel>;
	friendActions: {
		reload: () => Promise<void>;
		send: () => Promise<void>;
		accept: (id: string, sharing?: SharingLevel) => Promise<void>;
		decline: (id: string) => Promise<void>;
		cancel: (id: string) => Promise<void>;
		remove: (id: string) => Promise<void>;
		setSharing: (id: string, sharing: SharingLevel) => Promise<void>;
		setExpiry: (id: string, value: string | null) => Promise<void>;
	};
	groupActions: {
		reload: () => Promise<void>;
		save: (
			name: string,
			members: string[],
			id?: string,
			expiry?: string | null
		) => Promise<boolean>;
		remove: (id: string) => Promise<boolean>;
	};
};
