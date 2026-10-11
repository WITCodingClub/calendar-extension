<script lang="ts">
	import { TextFieldOutlined } from 'm3-svelte';
	import { CALENDAR_ICON } from '$lib/icons';
	import { todayDate } from '$lib/datetime';
	import { validDate } from '$lib/friends/schedule';
	import DatePicker from './date-picker/DatePicker.svelte';

	let {
		label,
		value = $bindable(''),
		required = false,
		disabled = false,
		min,
		max,
		year,
		error = false,
		validate,
		validationMessage = 'This date is invalid. Pick a different date.'
	}: {
		label: string;
		value?: string;
		required?: boolean;
		disabled?: boolean;
		min?: string;
		max?: string;
		year?: number;
		error?: boolean;
		validate?: (value: string) => boolean;
		validationMessage?: string;
	} = $props();

	const messageId = $props.id();
	const pickerId = `${messageId}-picker`;
	let picker: HTMLDivElement;
	let open = $state(false);
	const currentYear = Number(todayDate().slice(0, 4));
	const startYear = $derived(
		year ?? (min ? Number(min.slice(0, 4)) : Math.max(1, currentYear - 50))
	);
	const endYear = $derived(
		year ?? (max ? Number(max.slice(0, 4)) : Math.min(9999, currentYear + 5))
	);
	const pickerYear = $derived(
		Math.min(
			endYear,
			Math.max(
				startYear,
				year ?? Number((value && isValid(value) ? value : min || max || todayDate()).slice(0, 4))
			)
		)
	);
	function isValid(date: string) {
		return (
			/^\d{4}-\d{2}-\d{2}$/.test(date) &&
			validDate(date) &&
			(!min || date >= min) &&
			(!max || date <= max) &&
			(year === undefined || Number(date.slice(0, 4)) === year) &&
			(!validate || validate(date))
		);
	}
	const invalid = $derived(error || (!value ? required : !isValid(value)));
	$effect(() => {
		if (disabled && open) picker.hidePopover();
	});
</script>

<div class="date-field min-w-0 gap-1 grid" style:--anchor-name="--{messageId}">
	<TextFieldOutlined
		{label}
		type="date"
		bind:value
		{required}
		{disabled}
		error={invalid}
		trailing={{
			icon: { body: `<path fill="currentColor" d="${CALENDAR_ICON}"/>`, width: 24, height: 24 },
			disabled,
			title: `Pick ${label.toLowerCase()}`,
			'aria-haspopup': 'dialog',
			'aria-expanded': open,
			'aria-controls': pickerId,
			popovertarget: pickerId,
			onclick: (event) => event.stopPropagation()
		}}
		aria-invalid={invalid}
		aria-describedby={invalid ? messageId : undefined}
	/>
	<div
		bind:this={picker}
		id={pickerId}
		class="picker"
		popover="auto"
		role="dialog"
		aria-label="Date picker"
		ontoggle={(event) => (open = event.newState === 'open')}
	>
		{#if open}
			<DatePicker
				date={value}
				year={pickerYear}
				{startYear}
				{endYear}
				clearable={!required}
				dateValidator={isValid}
				close={() => picker.hidePopover()}
				setDate={(date) => (value = date)}
			/>
		{/if}
	</div>
	{#if invalid}
		<p id={messageId} class="text-xs text-error" aria-live="polite">{validationMessage}</p>
	{/if}
</div>

<style>
	@position-try --date-picker-top {
		position-area: top center;
		margin-block: 0 0.5rem;
	}
	@position-try --date-picker-right {
		position-area: bottom center;
		justify-self: end;
	}
	@position-try --date-picker-top-right {
		position-area: top center;
		justify-self: end;
		margin-block: 0 0.5rem;
	}
	.date-field > :global(.m3-container) {
		min-width: 0;
		width: 100%;
		anchor-name: var(--anchor-name);
	}
	.date-field :global(input::-webkit-calendar-picker-indicator) {
		display: none;
	}
	.picker {
		border: 0;
		padding: 0;
		color: rgb(var(--m3-scheme-on-surface));
		background: transparent;
		max-width: calc(100vw - 1.5rem);
		max-height: calc(100dvh - 1.5rem);
		overflow: auto;
		@supports (anchor-name: --a) {
			position-anchor: var(--anchor-name);
			position-area: bottom center;
			justify-self: start;
			margin: 0;
			margin-block-start: 0.5rem;
			inset: auto;
			position-try-fallbacks: --date-picker-top, --date-picker-right, --date-picker-top-right;
		}
	}
</style>
