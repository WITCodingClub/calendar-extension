// The backend puts university events in Graphite until the user picks a color
// (PreferenceResolver::UNI_CAL_DEFAULTS), so the picker shows Graphite too.
export const UNI_CAL_DEFAULT_COLOR = '#616161';

export const GOOGLE_COLORS = [
	{ id: '11', name: 'Tomato', hex: '#d50000' },
	{ id: '4', name: 'Flamingo', hex: '#e67c73' },
	{ id: '6', name: 'Tangerine', hex: '#f4511e' },
	{ id: '5', name: 'Banana', hex: '#f6bf26' },
	{ id: '2', name: 'Sage', hex: '#33b679' },
	{ id: '10', name: 'Basil', hex: '#0b8043' },
	{ id: '7', name: 'Peacock', hex: '#039be5' },
	{ id: '9', name: 'Blueberry', hex: '#3f51b5' },
	{ id: '1', name: 'Lavender', hex: '#7986cb' },
	{ id: '3', name: 'Grape', hex: '#8e24aa' },
	{ id: '8', name: 'Graphite', hex: '#616161' }
];

// Legacy Google Calendar color ID to hex mapping. The backend returns hex
// colors, but a backend from before custom colors returns a numeric id.
// Keep this map only to read that id.
const COLOR_ID_TO_HEX: Record<string, string> = Object.fromEntries(
	GOOGLE_COLORS.map(({ id, hex }) => [id, hex])
);

const EVENT_HEX_TO_WITCC: Record<string, string> = {
	'#a4bdfc': '#7986cb',
	'#7ae7bf': '#33b679',
	'#dbadff': '#8e24aa',
	'#ff887c': '#e67c73',
	'#fbd75b': '#f6bf26',
	'#ffb878': '#f4511e',
	'#46d6db': '#039be5',
	'#e1e1e1': '#616161',
	'#5484ed': '#3f51b5',
	'#51b749': '#0b8043',
	'#dc2127': '#d50000'
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

export function toDropdownColor(
	color: string | number | null | undefined,
	fallback = '#d50000'
): string {
	if (color == null || color === '') return fallback;
	const normalized = String(color).toLowerCase();
	return (
		EVENT_HEX_TO_WITCC[normalized] ??
		COLOR_ID_TO_HEX[normalized] ??
		(normalized.startsWith('#') ? normalized : fallback)
	);
}

export function textColor(background: string): string {
	const hex = background.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? '#000000' : '#ffffff';
}
