<script lang="ts">
    import outlook from '$lib/images/outlook.svg';
    import apple from '$lib/images/apple.svg';
    import fantastical from '$lib/images/fantastical.jpg';

    const importGuides = [
        {
            href: "https://support.microsoft.com/en-us/office/import-calendars-into-outlook-8e8364e1-400e-4c0f-a573-fe76b5a2d379#:~:text=Add%20internet%20calendars",
            img: outlook,
            title: "Outlook",
            description: "ICS import guide",
            domain: "support.microsoft.com",
        },
        {
            href: "https://support.apple.com/en-mn/guide/iphone/ipha0d932e96/ios#:~:text=Subscribe%20to%20iCal%20(.ics)",
            img: apple,
            title: "Apple Calendar (iPhone)",
            description: "ICS import guide",
            domain: "support.apple.com",
        },
        {
            href: "https://support.apple.com/en-mn/guide/calendar/icl1022/mac#:~:text=share%20calendars.-,Subscribe%20to%20a%20calendar,-To%20subscribe%20to",
            img: apple,
            title: "Apple Calendar (Mac)",
            description: "ICS import guide",
            domain: "support.apple.com",
        },
        {
            href: "https://flexibits.com/fantastical/help/getting-started#adding-a-calendar-subscription",
            img: fantastical,
            title: "Fantastical",
            description: "ICS import guide",
            domain: "flexibits.com",
        },
    ];

    const templateGroups = [
        {
            title: "Course information",
            items: [
                { token: "{{title}}", description: "Full course title." },
                { token: "{{course_code}}", description: "Subject-number-section (e.g., COMP-101-01)." },
                { token: "{{subject}}", description: "Department code (e.g., COMP)." },
                { token: "{{course_number}}", description: "Course number only (e.g., 101)." },
                { token: "{{section_number}}", description: "Section number (e.g., 01)." },
                { token: "{{crn}}", description: "Course Reference Number." },
            ],
        },
        {
            title: "Location",
            items: [
                { token: "{{room}}", description: "Room number/name." },
                { token: "{{building}}", description: "Building name." },
                { token: "{{location}}", description: "Pre-formatted building - room." },
            ],
        },
        {
            title: "Faculty",
            items: [
                { token: "{{faculty}}", description: "Primary instructor." },
                { token: "{{all_faculty}}", description: "All instructors, comma-separated." },
            ],
        },
        {
            title: "Time",
            items: [
                { token: "{{start_time}}", description: "Meeting start time." },
                { token: "{{end_time}}", description: "Meeting end time." },
                { token: "{{day}}", description: "Full weekday (e.g., Monday)." },
                { token: "{{day_abbr}}", description: "Abbreviated weekday (e.g., Mon)." },
            ],
        },
        {
            title: "Academic",
            items: [
                { token: "{{term}}", description: "Academic term (e.g., Spring 2024)." },
                { token: "{{schedule_type}}", description: "Meeting type (Lecture, Laboratory, Hybrid)." },
                { token: "{{schedule_type_short}}", description: "Shorthand (e.g., Lab for Laboratory)." },
            ],
        },
    ];
</script>

<div class="@container flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto pb-2">
    <section class="flex flex-col gap-3 rounded-2xl bg-surface-container p-4 shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]">
        <div class="flex flex-col gap-1">
            <h2 class="m-0 text-base font-bold text-on-surface">Import ICS calendar</h2>
            <p class="m-0 text-sm text-on-surface-variant">Add your calendar feed to another app using the official guides below.</p>
        </div>
        <div class="flex flex-col gap-2">
            {#each importGuides as guide (guide.href)}
                <a
                    href={guide.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex flex-row items-center gap-3 rounded-xl bg-surface-container-lowest p-3 transition-colors hover:bg-surface-container-high"
                >
                    <img src={guide.img} alt="" class="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    <div class="flex min-w-0 flex-col gap-0.5">
                        <span class="text-sm font-medium text-on-surface">{guide.title}</span>
                        <span class="text-xs text-on-surface-variant">{guide.description} · {guide.domain}</span>
                    </div>
                    <svg class="ml-auto h-5 w-5 shrink-0 text-on-surface-variant" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M10 6v2h5.59L4 19.59 5.41 21 17 9.41V15h2V6z"/>
                    </svg>
                </a>
            {/each}
        </div>
    </section>

    <section class="flex flex-col gap-3 rounded-2xl bg-surface-container p-4 shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]">
        <div class="flex flex-col gap-1">
            <h2 class="m-0 text-base font-bold text-on-surface">Advanced editing</h2>
            <p class="m-0 text-sm text-on-surface-variant">Use variables to generate event titles, descriptions, and locations from your course data.</p>
        </div>
        <div class="grid grid-cols-1 gap-2 @min-[28rem]:grid-cols-2">
            {#each templateGroups as group (group.title)}
                <div class="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3">
                    <h3 class="m-0 text-sm font-bold text-on-surface">{group.title}</h3>
                    <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                        {#each group.items as item (item.token)}
                            <li class="text-sm text-on-surface-variant">
                                <span class="rounded-md bg-surface-container-high px-1.5 py-0.5 font-mono text-xs text-primary">{item.token}</span>
                                {item.description}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/each}
            <div class="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3">
                <h3 class="m-0 text-sm font-bold text-on-surface">Conditionals (if/else)</h3>
                <p class="m-0 text-sm text-on-surface-variant">Only simple <span class="font-mono text-xs">if</span>/<span class="font-mono text-xs">else</span> is supported.</p>
                <pre class="m-0 overflow-x-auto rounded-lg bg-surface-container-high p-3 text-xs text-on-surface-variant whitespace-pre-wrap"><code>{'{{title}}{% if faculty %} - {{faculty}}{% else %} - No instructor{% endif %}'}</code></pre>
            </div>
        </div>
    </section>
</div>
