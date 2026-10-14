export function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function text(value: unknown): value is string {
	return typeof value === 'string' && !!value.trim();
}

export function timestamp(value: unknown): value is string {
	return (
		text(value) &&
		/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}
