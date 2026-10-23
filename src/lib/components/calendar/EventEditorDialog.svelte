<script module lang="ts">
	import type { ReminderSettings } from '$lib/types';

	export type EventPreferenceChanges = Partial<{
		title_template: string;
		description_template: string;
		location_template: string;
		reminder_settings: ReminderSettings[];
		color_id: string;
		notifications_disabled: boolean;
	}>;
</script>

<script lang="ts">
	import {
		Button,
		Chip,
		ConnectedButtons,
		Dialog,
		TextFieldOutlined,
		TextFieldOutlinedMultiline
	} from 'm3-svelte';
	import SelectOutlined from '$lib/components/ui/SelectOutlined.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import { toDropdownColor } from '$lib/calendar/colors';
	import {
		DESCRIPTION_TEMPLATES,
		LOCATION_TEMPLATES,
		TITLE_TEMPLATES,
		isPresetSelected,
		parseTemplate
	} from '$lib/calendar/templates';
	import type {
		Course,
		GetPreferencesResponse,
		MeetingTime,
		NotificationMethod,
		NotificationSetting
	} from '$lib/types';

	let {
		course,
		meeting,
		prefs,
		visible,
		advancedEditing,
		labColor,
		lectureColor,
		onclose,
		onsave
	}: {
		course: Course;
		meeting: MeetingTime;
		prefs: GetPreferencesResponse | undefined;
		visible: boolean;
		advancedEditing: boolean;
		labColor: string;
		lectureColor: string;
		onclose: () => void;
		onsave: (changes: EventPreferenceChanges) => void;
	} = $props();

	const templates = $derived(prefs?.templates);
	const resolved = $derived(prefs?.resolved);
	let editMode = $state(false);
	let notificationsDisabled = $state(false);
	let notifications = $state<NotificationSetting[]>([]);
	let courseColor = $state('#d50000');
	let editTitle = $state('');
	let editDescription = $state('');
	let editLocation = $state('');
	let editTitleManual = $state('');
	let editDescriptionManual = $state('');
	let editLocationManual = $state('');

	const defaultEventColor = $derived.by(() => {
		const isLab = (course.schedule_type ?? '').toLowerCase() === 'laboratory';
		return toDropdownColor(isLab ? labColor : lectureColor, isLab ? '#f6bf26' : '#039be5');
	});
	const resolvedEventColor = $derived(
		toDropdownColor(resolved?.color_id || meeting.color, defaultEventColor)
	);
	const derivedTemplates = $derived({
		titleTemplates: TITLE_TEMPLATES.map((template) => parseTemplate(template, templates)),
		descriptionTemplates: DESCRIPTION_TEMPLATES.map((template) =>
			parseTemplate(template, templates)
		),
		locationTemplates: LOCATION_TEMPLATES.map((template) => parseTemplate(template, templates))
	});

	$effect(() => {
		if (prefs) {
			editTitle = (resolved?.title_template ?? TITLE_TEMPLATES[0]) || '';
			editDescription = (resolved?.description_template ?? DESCRIPTION_TEMPLATES[0]) || '';
			editLocation = (resolved?.location_template ?? LOCATION_TEMPLATES[0]) || '';
			editTitleManual = prefs.preview?.title ?? '';
			editDescriptionManual = prefs.preview?.description ?? '';
			editLocationManual = prefs.preview?.location ?? '';
			courseColor = resolvedEventColor;
			notificationsDisabled = prefs.notifications_disabled ?? false;

			if (resolved?.reminder_settings && resolved.reminder_settings.length > 0) {
				notifications = resolved.reminder_settings.map((r) => ({
					time: String(r.time),
					type: r.type,
					method: r.method as NotificationMethod
				}));
			} else {
				notifications = [];
			}
		}
	});

	function save() {
		const event_preference: EventPreferenceChanges = {};

		const titleChanged = editTitle !== (resolved?.title_template ?? TITLE_TEMPLATES[0]);
		const titleManualChanged = editTitleManual !== prefs?.preview?.title;
		if (titleChanged || titleManualChanged) {
			event_preference.title_template = titleChanged ? editTitle : editTitleManual;
		}

		const descriptionChanged =
			editDescription !== (resolved?.description_template ?? DESCRIPTION_TEMPLATES[0]);
		const descriptionManualChanged = editDescriptionManual !== prefs?.preview?.description;
		if (descriptionChanged || descriptionManualChanged) {
			event_preference.description_template = descriptionChanged
				? editDescription
				: editDescriptionManual;
		}

		const locationChanged = editLocation !== (resolved?.location_template ?? LOCATION_TEMPLATES[0]);
		const locationManualChanged = editLocationManual !== prefs?.preview?.location;
		if (locationChanged || locationManualChanged) {
			event_preference.location_template = locationChanged ? editLocation : editLocationManual;
		}

		const colorChanged = courseColor !== resolvedEventColor;
		if (colorChanged) {
			event_preference.color_id = courseColor;
		}

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		//@ts-expect-error
		const convertedNotifications: ReminderSettings[] = notifications.map((n) => ({
			time: n.time.toString(),
			type: n.type,
			method: n.method
		}));

		const notificationsChanged =
			JSON.stringify(convertedNotifications) !== JSON.stringify(resolved?.reminder_settings);
		if (notificationsChanged) {
			event_preference.reminder_settings = convertedNotifications;
		}

		event_preference.notifications_disabled = notificationsDisabled;

		onsave(event_preference);
	}
</script>

{#if visible && prefs}
	<div class="event-editor">
		<Dialog
			headline=""
			role="dialog"
			aria-labelledby="edit-event-title"
			bind:open={
				() => visible,
				(open) => {
					if (!open) onclose();
				}
			}
		>
			{#snippet buttons()}
				<Button variant="text" onclick={onclose}>Cancel</Button>
				<Button variant="filled" onclick={save}>Save changes</Button>
			{/snippet}
			<header class="gap-3 mb-3 flex items-start justify-between">
				<div class="min-w-0">
					<h1 id="edit-event-title" class="m3-font-headline-small m-0 text-on-surface">
						Edit Calendar Event
					</h1>
					<p class="m-0 mt-1 text-sm text-on-surface-variant truncate">{course.title}</p>
				</div>
				<div class="gap-2 flex shrink-0 items-center">
					<Button variant="text" iconType="full" aria-label="Close" onclick={onclose}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="22"
							height="22"
							viewBox="0 0 24 24"
							aria-hidden="true"
							><path
								fill="currentColor"
								d="m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z"
							/></svg
						>
					</Button>
				</div>
			</header>

			<div class="gap-4 flex flex-col">
				<section class="editor-section gap-3 flex flex-col">
					<div role="group" aria-label="Edit mode">
						<ConnectedButtons>
							<Button
								variant={!editMode ? 'filled' : 'tonal'}
								aria-pressed={!editMode}
								onclick={() => (editMode = false)}>Presets</Button
							>
							<Button
								variant={editMode ? 'filled' : 'tonal'}
								aria-pressed={editMode}
								onclick={() => (editMode = true)}>{advancedEditing ? 'Templates' : 'Manual'}</Button
							>
						</ConnectedButtons>
					</div>
					{#if editMode && !advancedEditing}
						<div class="gap-3 grid grid-cols-1">
							<TextFieldOutlined label="Course Title" bind:value={editTitleManual} />
							<TextFieldOutlinedMultiline
								label="Course Description"
								bind:value={editDescriptionManual}
								rows={2}
							/>
							<TextFieldOutlined label="Course Location" bind:value={editLocationManual} />
						</div>
					{:else if editMode && advancedEditing}
						<div class="gap-3 grid grid-cols-1">
							<TextFieldOutlined label="Course Title" bind:value={editTitle} />
							<TextFieldOutlinedMultiline
								label="Course Description"
								bind:value={editDescription}
								rows={2}
							/>
							<TextFieldOutlined label="Course Location" bind:value={editLocation} />
						</div>
					{:else}
						<div class="gap-3 flex flex-col">
							<div class="preset-row gap-2 grid">
								<h3 class="m3-font-title-small m-0 text-on-surface">Title</h3>
								<div class="min-w-0 gap-2 flex flex-wrap">
									{#each derivedTemplates.titleTemplates as template, i (TITLE_TEMPLATES[i])}
										{@const selected = isPresetSelected(
											editTitle || resolved?.title_template || '',
											TITLE_TEMPLATES,
											i,
											templates
										)}
										<Chip
											{selected}
											variant="input"
											onclick={() => {
												editTitle = TITLE_TEMPLATES[i];
											}}>{template.join('')}</Chip
										>
									{/each}
								</div>
							</div>
							<div class="preset-row gap-2 grid">
								<h3 class="m3-font-title-small m-0 text-on-surface">Description</h3>
								<div class="desc-chips min-w-0 gap-2 flex flex-wrap">
									{#each derivedTemplates.descriptionTemplates as template, i (DESCRIPTION_TEMPLATES[i])}
										{@const selected =
											editDescription && DESCRIPTION_TEMPLATES.includes(editDescription)
												? editDescription === DESCRIPTION_TEMPLATES[i]
												: resolved?.description_template === DESCRIPTION_TEMPLATES[i]}
										<Chip
											{selected}
											variant="input"
											onclick={() => {
												editDescription = DESCRIPTION_TEMPLATES[i];
											}}>{template.join('')}</Chip
										>
									{/each}
								</div>
							</div>
							<div class="preset-row gap-2 grid">
								<h3 class="m3-font-title-small m-0 text-on-surface">Location</h3>
								<div class="min-w-0 gap-2 flex flex-wrap">
									{#each derivedTemplates.locationTemplates as template, i (LOCATION_TEMPLATES[i])}
										{@const selected =
											editLocation && LOCATION_TEMPLATES.includes(editLocation)
												? editLocation === LOCATION_TEMPLATES[i]
												: resolved?.location_template === LOCATION_TEMPLATES[i]}
										<Chip
											{selected}
											variant="input"
											onclick={() => {
												editLocation = LOCATION_TEMPLATES[i];
											}}>{template.join('')}</Chip
										>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</section>

				<section class="editor-section gap-3 flex flex-col">
					<div class="gap-3 flex flex-wrap items-center justify-between">
						<div>
							<h2 class="m3-font-title-medium m-0 text-on-surface">Reminders</h2>
						</div>
						<Button
							variant="tonal"
							onclick={() => {
								notifications = [
									...notifications,
									{ time: '30', type: 'minutes', method: 'notification' }
								];
							}}
							disabled={notificationsDisabled}
						>
							<span class="gap-2 flex items-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									aria-hidden="true"
									><path
										fill="currentColor"
										d="M12 21q-.425 0-.712-.288T11 20v-7H4q-.425 0-.712-.288T3 12t.288-.712T4 11h7V4q0-.425.288-.712T12 3t.713.288T13 4v7h7q.425 0 .713.288T21 12t-.288.713T20 13h-7v7q0 .425-.288.713T12 21"
									/></svg
								>
								Add reminder
							</span>
						</Button>
						{#if notificationsDisabled}
							<div
								class="gap-1 text-error flex shrink-0 flex-row items-center"
								title="All reminders are currently disabled in Settings. Your reminder preferences are saved and will be restored when you re-enable notifications."
							>
								<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
									/>
									<line
										x1="3"
										y1="3"
										x2="21"
										y2="21"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
									/>
								</svg>
								<span class="text-xs font-medium">Do Not Disturb</span>
							</div>
						{/if}
					</div>
					{#if notificationsDisabled}
						<p
							class="m-0 rounded-xl border-error-container bg-error-container/20 p-3 text-sm text-on-surface-variant border"
						>
							<strong>Reminders are muted.</strong> Your settings are preserved but notifications are
							currently disabled. Re-enable notifications in Settings to activate them.
						</p>
					{/if}
					{#each notifications as notification, i (notification)}
						<div
							class={[
								'reminder-fields gap-3 grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.65fr)_minmax(0,0.8fr)_auto] items-center @max-[30rem]:grid-cols-2',
								notificationsDisabled && 'opacity-50'
							]}
						>
							<SelectOutlined
								label="Method"
								options={[
									{ text: 'Notification', value: 'notification' },
									{ text: 'Email', value: 'email' }
								]}
								bind:value={notifications[i].method}
								disabled={notificationsDisabled}
							/>
							<TextFieldOutlined
								type="number"
								label="Time"
								bind:value={notifications[i].time}
								disabled={notificationsDisabled}
							/>
							<SelectOutlined
								label="Unit"
								options={[
									{ text: 'minutes', value: 'minutes' },
									{ text: 'hours', value: 'hours' },
									{ text: 'days', value: 'days' }
								]}
								bind:value={notifications[i].type}
								disabled={notificationsDisabled}
							/>
							<div class="@max-[30rem]:justify-self-end">
								<Button
									variant="elevated"
									iconType="full"
									aria-label="Remove reminder"
									onclick={() => {
										notifications = notifications.filter((_, idx) => idx !== i);
									}}
									disabled={notificationsDisabled}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="20"
										height="20"
										viewBox="0 0 24 24"
										aria-hidden="true"
										><path
											fill="currentColor"
											d="M6 13q-.425 0-.712-.288T5 12t.288-.712T6 11h12q.425 0 .713.288T19 12t-.288.713T18 13z"
										/></svg
									>
								</Button>
							</div>
						</div>
					{/each}
				</section>

				<section class="editor-section gap-3 flex flex-wrap items-center justify-between">
					<div>
						<h2 class="m3-font-title-medium m-0 text-on-surface">Event color</h2>
					</div>
					<div class="gap-2 flex shrink-0 flex-row items-center">
						<ColorPicker bind:value={courseColor} label="Choose course color" />
					</div>
				</section>
			</div>
		</Dialog>
	</div>
{/if}

<style>
	.event-editor :global(dialog) {
		width: min(40rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-width: 40rem;
		max-height: calc(100dvh - 2rem);
		overflow: hidden;
		container-type: inline-size;
	}

	.event-editor :global(dialog > .headline:empty) {
		display: none;
	}

	.event-editor :global(dialog > .content) {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.25rem;
		margin-bottom: 1rem;
	}

	.event-editor :global(dialog > .buttons) {
		flex-shrink: 0;
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
		padding-top: 0.75rem;
	}

	.editor-section + .editor-section {
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
		padding-top: 0.75rem;
	}

	@container (min-width: 30rem) {
		.preset-row {
			grid-template-columns: 6rem minmax(0, 1fr);
			align-items: start;
		}

		.preset-row h3 {
			padding-top: 0.5rem;
		}
	}

	.reminder-fields :global(.m3-container) {
		min-width: 0;
	}

	.event-editor :global(.desc-chips button.m3-container) {
		flex-shrink: 0;
		width: fit-content;
		max-width: 100%;
		height: auto !important;
		min-height: 2.5rem;
		padding-top: 0.5rem !important;
		padding-bottom: 0.5rem !important;
		align-items: center !important;
		white-space: pre-line;
		text-align: left;
		overflow-wrap: anywhere;
		overflow: visible;
	}
</style>
