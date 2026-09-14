<script lang="ts">
    let {
        value = $bindable("#000000"),
        label = "Choose color",
    }: {
        value?: string;
        label?: string;
    } = $props();
</script>

<label class="color-picker" title={label}>
    <input type="color" bind:value aria-label={label} />
    <span class="swatch" style:background-color={value}></span>
    <span class="value">{value.toUpperCase()}</span>
    <svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 10 5 5 5-5z" />
    </svg>
</label>

<style>
    .color-picker {
        position: relative;
        display: inline-flex;
        width: fit-content;
        min-width: 10.5rem;
        height: calc(3.5rem + var(--m3-util-density-term, 0rem));
        align-items: center;
        gap: 0.75rem;
        border: 1px solid rgb(var(--m3-scheme-outline));
        border-radius: var(--m3-field-outlined-shape, var(--m3-util-rounding-extra-small, 0.25rem));
        padding: 0 0.75rem 0 1rem;
        color: rgb(var(--m3-scheme-on-surface));
        cursor: pointer;
        transition:
            border-color 100ms,
            background-color 100ms;
    }

    .color-picker:hover {
        border-color: rgb(var(--m3-scheme-on-surface));
        background-color: rgb(var(--m3-scheme-on-surface) / 0.04);
    }

    .color-picker:focus-within {
        border-color: rgb(var(--m3-scheme-primary));
        box-shadow: inset 0 0 0 1px rgb(var(--m3-scheme-primary));
    }

    input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        padding: 0;
        opacity: 0;
        cursor: pointer;
    }

    .swatch {
        width: 2rem;
        height: 2rem;
        flex: 0 0 auto;
        border-radius: 9999px;
        box-shadow:
            inset 0 0 0 1px rgb(var(--m3-scheme-on-surface) / 0.25),
            0 1px 2px rgb(var(--m3-scheme-shadow) / 0.2);
    }

    .value {
        min-width: 4.25rem;
        font-family: var(--m3-font-body, var(--m3-font));
        font-size: var(--m3-font-body-large-size, 1rem);
        line-height: var(--m3-font-body-large-height, 1.5);
        letter-spacing: var(--m3-font-body-large-tracking, 0.03125rem);
    }

    .arrow {
        width: 1.5rem;
        height: 1.5rem;
        flex: 0 0 auto;
        fill: rgb(var(--m3-scheme-on-surface-variant));
        pointer-events: none;
    }
</style>
