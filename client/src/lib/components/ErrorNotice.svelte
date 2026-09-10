<script lang="ts">
  export let title: string;
  export let error: string | null = null;
  export let includeStatusLink: boolean = false;
</script>

<h1 class="text-3xl font-extrabold text-center text-on-error mb-4">{title}</h1>
<p class="text-center text-error-container mb-4 break">
  {#if error}{error}{/if}
  {#if includeStatusLink}
    {" "}Please check the <a class="text-on-error underline" href="https://stats.uptimerobot.com/QS76oPqfzz" target="_blank">status page</a> for updates. Also, make
  {/if}
  {" "} <a href='https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory' target='_blank' class='text-on-error underline'>WIT Self Service</a> first, then try again. If the issue persists, please submit a bug report on <a class="text-on-error underline" href="https://github.com/WITCodingClub/calendar-backend/issues" target="_blank">GitHub</a>.
</p>