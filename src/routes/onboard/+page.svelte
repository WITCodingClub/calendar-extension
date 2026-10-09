<script lang="ts">
	import { Button } from 'm3-svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { AuthError } from '$lib/auth';
	import { getGoogleCalendarState } from '$lib/afterSignIn';
	import { track } from '$lib/telemetry';

	async function checkGcalStatus() {
		try {
			const state = await getGoogleCalendarState();
			if (state === 'connected') {
				goto('/calendar');
			} else if (state === 'needs_reauth') {
				goto('/gcalendar');
			}
		} catch (err) {
			if (err instanceof AuthError) {
				return;
			}
		}
	}

	async function checkBetaAccess() {
		const beta_access = await chrome.storage.local.get('beta_access');
		if (beta_access && (beta_access.beta_access === 'false' || beta_access.beta_access === false)) {
			goto('/beta-access-denied/');
			return Promise.reject(new Error('Beta access denied')) as never;
		}
	}

	async function checkIsOtherCalendar() {
		const stored = browser ? localStorage.getItem('isOtherCalendar') === 'true' : false;
		console.log(stored);
		if (stored === true) {
			goto('/calendar');
		}
	}

	onMount(() => {
		checkIsOtherCalendar();
		checkBetaAccess();
		checkGcalStatus();
	});

	async function selectGoogleCalendar() {
		track('calendar_choice_google');
		goto('/gcalendar');
	}

	async function selectAllOtherCalendars() {
		track('calendar_choice_other');
		if (browser) {
			localStorage.setItem('isOtherCalendar', 'true');
		}
		console.log(true);
		goto('/calendar');
	}
</script>

<div class="flex h-screen flex-col items-center justify-center">
	<h1 class="text-2xl font-bold text-primary mb-5 text-center">
		Please select your preferred calendar!
	</h1>
	<div class="gap-4 peak flex flex-row">
		<Button variant="tonal" square onclick={selectGoogleCalendar}>Google Calendar</Button>
		<Button variant="outlined" square onclick={selectAllOtherCalendars}>All Other Calendars</Button>
	</div>
</div>

<style>
	:global(.peak button) {
		height: 3rem !important;
	}
</style>
