<script lang="ts">
    let { onclick, disabled = false }: { onclick: () => void; disabled?: boolean } = $props();
</script>

<button class="google-sign-in" type="button" {onclick} {disabled}>
    <span class="google-sign-in-logo" aria-hidden="true">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            <path fill="none" d="M0 0h48v48H0z"></path>
        </svg>
    </span>
    <span>Sign in with Google</span>
</button>

<style>
    .google-sign-in {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        height: 3rem;
        min-width: 280px;
        padding: 0 1.25rem;
        border: none;
        border-radius: 0.75rem;
        background: rgb(var(--m3-scheme-primary-container));
        color: rgb(var(--m3-scheme-on-primary-container));
        font-family: "Roboto Flex", sans-serif;
        font-size: 0.95rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        cursor: pointer;
        transition: background-color 0.15s ease, box-shadow 0.15s ease;
    }

    .google-sign-in-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 0.4rem;
        background: #ffffff;
        flex-shrink: 0;
    }

    .google-sign-in-logo svg {
        display: block;
        width: 1.15rem;
        height: 1.15rem;
    }

    .google-sign-in:hover:not(:disabled) {
        background: rgb(var(--m3-scheme-secondary-container));
        box-shadow: 0 1px 3px rgb(var(--m3-scheme-shadow) / 0.24);
    }

    .google-sign-in:focus-visible {
        outline: 2px solid rgb(var(--m3-scheme-primary));
        outline-offset: 2px;
    }

    .google-sign-in:disabled {
        cursor: default;
        opacity: 0.5;
    }
</style>
