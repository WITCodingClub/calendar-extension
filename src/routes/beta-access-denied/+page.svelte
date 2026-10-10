<script lang="ts">
	import AccessDenied from '$lib/components/ui/AccessDenied.svelte';
</script>

<AccessDenied
	title="Beta Access Required"
	message="This feature is currently in beta testing."
	onretry={() => chrome.storage.local.remove('beta_access')}
/>
