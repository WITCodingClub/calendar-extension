<script lang="ts">
    import { SelectOutlined } from "m3-svelte";

    // The Google Calendar event palette. "Custom" opens the native color
    // input, so a person can pick any color.
    const PALETTE = [
        { text: "Tomato", value: "#d50000" },
        { text: "Flamingo", value: "#e67c73" },
        { text: "Tangerine", value: "#f4511e" },
        { text: "Banana", value: "#f6bf26" },
        { text: "Sage", value: "#33b679" },
        { text: "Basil", value: "#0b8043" },
        { text: "Peacock", value: "#039be5" },
        { text: "Blueberry", value: "#3f51b5" },
        { text: "Lavender", value: "#7986cb" },
        { text: "Grape", value: "#8e24aa" },
        { text: "Graphite", value: "#616161" },
    ];
    const CUSTOM = "custom";

    let {
        value = $bindable("#d50000"),
        label = "Choose color",
        onchange,
    }: {
        value?: string | null;
        label?: string;
        onchange?: (value: string) => void;
    } = $props();

    let colorInput: HTMLInputElement;
    // The color that was showing when the person chose "Custom". The select
    // keeps showing "Custom" until the color changes.
    let customFrom = $state<string | null>(null);

    // The native color input needs a valid color, so fall back to black.
    let color = $derived((value || "#000000").toLowerCase());
    let inPalette = $derived(PALETTE.some((option) => option.value === color));
    let options = $derived([
        ...PALETTE,
        { text: inPalette ? "Custom…" : `Custom (${color.toUpperCase()})`, value: CUSTOM },
    ]);

    function select(option: string) {
        if (option === CUSTOM) {
            customFrom = color;
            openCustomPicker();
            return;
        }

        customFrom = null;
        value = option;
        onchange?.(option);
    }

    function openCustomPicker() {
        try {
            colorInput.showPicker();
        } catch {
            colorInput.click();
        }
    }
</script>

<div class="flex flex-row gap-2 items-center">
    <label class="swatch" style:background-color={color} title="Pick a custom color">
        <input
            bind:this={colorInput}
            type="color"
            value={color}
            aria-label="{label}: custom color"
            oninput={(event) => { value = event.currentTarget.value; }}
            onchange={(event) => onchange?.(event.currentTarget.value)}
        />
    </label>
    <SelectOutlined
        label=""
        aria-label={label}
        {options}
        bind:value={() => (customFrom === color || !inPalette ? CUSTOM : color), select}
    />
</div>

<style>
    .swatch {
        position: relative;
        width: 1.5rem;
        height: 1.5rem;
        flex: 0 0 auto;
        border: 2px solid rgb(var(--m3-scheme-outline));
        border-radius: 9999px;
        cursor: pointer;
    }

    .swatch input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        padding: 0;
        opacity: 0;
        cursor: pointer;
    }
</style>
