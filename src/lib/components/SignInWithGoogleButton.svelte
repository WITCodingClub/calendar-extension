<script lang="ts">
    let { onclick, disabled = false }: { onclick: () => void; disabled?: boolean } = $props();
</script>

<button
    class="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-outline bg-surface-container-lowest px-5 text-[0.95rem] font-semibold tracking-[0.01em] text-on-surface transition-[background-color,box-shadow] duration-150 hover:enabled:bg-surface-container-high hover:enabled:shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.24)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50"
    type="button"
    {onclick}
    {disabled}
>
    <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.4rem] bg-white" aria-hidden="true">
        <svg class="block h-[1.15rem] w-[1.15rem]" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            <path fill="none" d="M0 0h48v48H0z"></path>
        </svg>
    </span>
    <span>Sign in with Google</span>
</button>
