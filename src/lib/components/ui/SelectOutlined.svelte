<script lang="ts">
	import { SelectOutlined as NativeSelectOutlined, Icon } from 'm3-svelte';
	import { tick, type ComponentProps } from 'svelte';

	let {
		label,
		options,
		value = $bindable(),
		width = 'auto',
		disabled = false,
		...extra
	}: ComponentProps<typeof NativeSelectOutlined> = $props();

	const native = typeof CSS === 'undefined' || CSS.supports('appearance', 'base-select');
	const id = $props.id();
	let trigger = $state<HTMLButtonElement>();
	let picker = $state<HTMLDivElement>();
	let open = $state(false);
	let active = $state(-1);
	let position = $state('');
	let search = '';
	let searchedAt = 0;
	const selected = $derived(options.find((option) => option.value === value));

	function close() {
		picker?.hidePopover();
	}

	async function show() {
		if (disabled || !trigger || !picker) return;
		active = options.findIndex((option) => option.value === value && !option.disabled);
		if (active < 0) active = options.findIndex((option) => !option.disabled);
		const rect = trigger.getBoundingClientRect();
		const below = window.innerHeight - rect.bottom - 8;
		const above = rect.top - 8;
		const upwards = below < Math.min(240, above);
		position = `left:${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px;min-width:${rect.width}px;max-width:${window.innerWidth - 16}px;max-height:${Math.max(0, upwards ? above : below)}px;${upwards ? `bottom:${window.innerHeight - rect.top}px` : `top:${rect.bottom}px`}`;
		picker.showPopover();
		open = true;
		await tick();
		scrollActive();
	}

	function scrollActive() {
		picker?.querySelector(`[id="${id}-option-${active}"]`)?.scrollIntoView({ block: 'nearest' });
	}

	function choose(index: number) {
		const option = options[index];
		if (!option || option.disabled || disabled) return;
		value = option.value;
		close();
		trigger?.focus();
	}

	async function keydown(event: KeyboardEvent) {
		if (event.key === 'Tab') {
			close();
			return;
		}
		if (event.key === 'Escape') {
			if (open) {
				event.preventDefault();
				event.stopPropagation();
				close();
			}
			return;
		}
		if (event.key === 'Enter' || (event.key === ' ' && !search)) {
			event.preventDefault();
			if (open) choose(active);
			else await show();
			return;
		}
		const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key);
		if (!navigation && (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey))
			return;
		event.preventDefault();
		if (!open) await show();
		const enabled = options
			.map((option, index) => (!option.disabled ? index : -1))
			.filter((index) => index >= 0);
		if (!enabled.length) return;
		if (navigation) {
			const index = enabled.indexOf(active);
			if (event.key === 'Home') active = enabled[0];
			else if (event.key === 'End') active = enabled[enabled.length - 1];
			else
				active =
					enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length];
		} else {
			search = Date.now() - searchedAt > 700 ? event.key : search + event.key;
			searchedAt = Date.now();
			const match = enabled.find((index) =>
				options[index].text.toLowerCase().startsWith(search.toLowerCase())
			);
			if (match !== undefined) active = match;
		}
		await tick();
		scrollActive();
	}

	$effect(() => {
		if (disabled) close();
	});

	$effect(() => {
		if (!open) return;
		function onScroll(event: Event) {
			if (event.target instanceof Node && picker?.contains(event.target)) return;
			close();
		}
		window.addEventListener('scroll', onScroll, true);
		return () => window.removeEventListener('scroll', onScroll, true);
	});
</script>

<svelte:window onresize={close} />

{#if native}
	<NativeSelectOutlined {label} {options} bind:value {width} {disabled} {...extra} />
{:else}
	<div class="field" style:width style:align-self={width === 'auto' ? 'start' : undefined}>
		<button
			bind:this={trigger}
			type="button"
			class="trigger m3-font-body-large"
			role="combobox"
			aria-label={extra['aria-label'] || label || undefined}
			aria-expanded={open}
			aria-controls="{id}-picker"
			aria-haspopup="listbox"
			aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
			{disabled}
			onkeydown={keydown}
			onblur={close}
			onclick={() => (open ? close() : show())}
		>
			{#if selected?.icon}<Icon icon={selected.icon} size={24} />{/if}
			<span>{selected?.text ?? ''}</span>
			<span class="arrow" aria-hidden="true">▾</span>
		</button>
		{#if label}<span class="label m3-font-body-small">{label}</span>{/if}
		<div
			bind:this={picker}
			id="{id}-picker"
			class="picker"
			popover="auto"
			role="listbox"
			aria-label={extra['aria-label'] || label || undefined}
			style={position}
			ontoggle={(event) => {
				open = event.newState === 'open';
				if (!open) search = '';
			}}
		>
			{#each options as option, index (index)}
				<button
					type="button"
					tabindex="-1"
					id="{id}-option-{index}"
					role="option"
					aria-selected={option.value === value}
					aria-disabled={!!option.disabled}
					disabled={!!option.disabled}
					class="option m3-font-body-large"
					class:active={active === index}
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => choose(index)}
				>
					{#if option.icon}<Icon icon={option.icon} size={24} />{/if}
					{option.text}
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.field {
		position: relative;
		min-width: 0;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		height: calc(3.5rem + var(--m3-util-density-term));
		padding: 0 1rem;
		border: 1px solid rgb(var(--m3-scheme-outline));
		border-radius: var(--m3-field-outlined-shape, var(--m3-util-rounding-extra-small));
		background: transparent;
		color: rgb(var(--m3-scheme-on-surface));
		cursor: pointer;
		text-align: start;
	}
	.trigger:focus-visible,
	.trigger[aria-expanded='true'] {
		outline: 2px solid rgb(var(--m3-scheme-primary));
		outline-offset: -2px;
	}
	.trigger:disabled {
		opacity: 0.38;
		cursor: default;
	}
	.arrow {
		margin-inline-start: auto;
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.label {
		position: absolute;
		top: 0;
		inset-inline-start: 0.75rem;
		translate: 0 -50%;
		padding: 0 0.25rem;
		background: var(--m3-util-background, rgb(var(--m3-scheme-surface)));
		color: rgb(var(--m3-scheme-on-surface-variant));
		pointer-events: none;
	}
	.picker {
		position: fixed;
		inset: auto;
		margin: 0;
		padding: 0.5rem 0;
		border: none;
		border-radius: var(--m3-menu-shape, var(--m3-util-rounding-extra-small));
		background: rgb(var(--m3-scheme-surface-container));
		color: rgb(var(--m3-scheme-on-surface));
		box-shadow: var(--m3-util-elevation-2);
		overflow: auto;
		overscroll-behavior: contain;
	}
	.option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: calc(3rem + var(--m3-util-density-term));
		padding: 0.5rem 1rem;
		width: 100%;
		border: none;
		background: transparent;
		color: inherit;
		text-align: start;
		cursor: pointer;
	}
	.option[aria-selected='true'] {
		background: rgb(var(--m3-scheme-primary-container));
		color: rgb(var(--m3-scheme-on-primary-container));
	}
	.option.active,
	.option:hover {
		box-shadow: inset 0 0 0 100vmax rgb(var(--m3-scheme-on-surface) / 0.08);
	}
	.option[aria-disabled='true'] {
		opacity: 0.38;
		cursor: default;
	}
</style>
