// The backend puts university events in Graphite until the user picks a color
// (PreferenceResolver::UNI_CAL_DEFAULTS), so the picker shows Graphite too.
export const UNI_CAL_DEFAULT_COLOR = '#616161';

// Legacy Google Calendar color ID to hex mapping. The backend returns hex
// colors, but a backend from before custom colors returns a numeric id.
// Keep this map only to read that id.
const COLOR_ID_TO_HEX: Record<string, string> = {
    '1': '#7986cb', // Lavender
    '2': '#33b679', // Sage
    '3': '#8e24aa', // Grape
    '4': '#e67c73', // Flamingo
    '5': '#f6bf26', // Banana
    '6': '#f4511e', // Tangerine
    '7': '#039be5', // Peacock
    '8': '#616161', // Graphite
    '9': '#3f51b5', // Blueberry
    '10': '#0b8043', // Basil
    '11': '#d50000' // Tomato
};

type ColorPreference = { color_id?: string | number | null } | null | undefined;

// The color that the backend gives university events, as a hex string.
//
// The uni_cal preference covers the whole university calendar. Fall back to a
// category color for users saved before issue #498, whose color still sits on
// the per-category preferences. With no saved color, use the backend default.
export function resolveUniCalColor(prefs: {
    uni_cal_global?: ColorPreference;
    uni_cal_categories?: Record<string, ColorPreference>;
}): string {
    const firstCategory = Object.values(prefs.uni_cal_categories ?? {})[0];
    const storedColor = prefs.uni_cal_global?.color_id ?? firstCategory?.color_id;
    if (storedColor === undefined || storedColor === null || storedColor === '') {
        return UNI_CAL_DEFAULT_COLOR;
    }

    const colorValue = String(storedColor);
    if (colorValue.startsWith('#')) {
        return colorValue;
    }
    return COLOR_ID_TO_HEX[colorValue] ?? UNI_CAL_DEFAULT_COLOR;
}
