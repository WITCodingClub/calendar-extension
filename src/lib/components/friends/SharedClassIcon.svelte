<script lang="ts">
	let { owners }: { owners: { name: string; color: string }[] } = $props();
	const id = $props.id();
</script>

<span
	class="shared-class-icon"
	title={`Shared class: ${owners.map((owner) => owner.name).join(', ')}`}
>
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<defs>
			<linearGradient {id}>
				{#each owners as owner, index (index)}
					<stop offset={`${(index / owners.length) * 100}%`} stop-color={owner.color} />
					<stop offset={`${((index + 1) / owners.length) * 100}%`} stop-color={owner.color} />
				{/each}
			</linearGradient>
		</defs>
		<path
			fill={`url(#${id})`}
			d="M16.5 12c1.38 0 2.5-1.12 2.5-2.5S17.88 7 16.5 7 14 8.12 14 9.5s1.12 2.5 2.5 2.5zM9 12c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm7.5 1c-1.83 0-5.5.92-5.5 2.75V17h11v-1.25c0-1.83-3.67-2.75-5.5-2.75zM9 13c-2.33 0-7 1.17-7 3.5V17h7v-1.25c0-.85.33-2.24 2.31-3.36C10.5 13.1 9.66 13 9 13z"
		/>
	</svg>
</span>

<style>
	.shared-class-icon {
		position: absolute;
		top: 0.125rem;
		right: 0.125rem;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 0.25rem;
		background: rgb(var(--m3-scheme-surface-container-lowest));
	}
	svg {
		width: 100%;
		height: 100%;
	}
</style>
