import type { TemplateVariables } from '../types';

export const TITLE_TEMPLATES = [
	"{% if schedule_type == 'Laboratory' %}{{title | remove: '- Lab'}} - {{schedule_type_short}}{% else %}{{title}}{% endif %}",
	"{% if schedule_type == 'Laboratory' %}{{course_code}}{% else %}{{title}} - {{schedule_type_short}}{% endif %}"
];
export const DESCRIPTION_TEMPLATES = [
	'{{faculty}}\n{{faculty_email}}',
	'{{faculty}}\n{{faculty_email}}\n{{course_code}} {{course_number}}',
	'{{term}} - {{schedule_type}}'
];
export const LOCATION_TEMPLATES = ['{{building}} - {{room}}', '{{building}} {{room}}'];

export function parseTemplate(t: string, templates?: TemplateVariables): string[] {
	const evalCond = (cond: string): boolean => {
		const m = cond.match(/^\s*([a-zA-Z0-9_]+)\s*(==|!=)\s*(["'])(.*?)\3\s*$/);
		if (!m) return false;
		const left = m[1] as keyof TemplateVariables;
		const op = m[2];
		const right = m[4];
		const leftVal = String(templates?.[left] ?? '');
		return op === '=='
			? leftVal.toLowerCase() === right.toLowerCase()
			: leftVal.toLowerCase() !== right.toLowerCase();
	};
	let s = t;
	while (true) {
		const openRe = /\{%\s*if\s+([\s\S]+?)\s*%\}/g;
		const openMatch = openRe.exec(s);
		if (!openMatch) break;
		const start = openMatch.index;
		const afterOpen = openMatch.index + openMatch[0].length;
		const endifRe = /\{%\s*endif\s*%\}/g;
		endifRe.lastIndex = afterOpen;
		const endifMatch = endifRe.exec(s);
		if (!endifMatch) break;
		const elseRe = /\{%\s*else\s*%\}/g;
		elseRe.lastIndex = afterOpen;
		const elseMatch = elseRe.exec(s);
		const hasElse = !!elseMatch && elseMatch.index < endifMatch.index;
		const trueBlockEnd = hasElse ? elseMatch!.index : endifMatch.index;
		const trueBlock = s.slice(afterOpen, trueBlockEnd);
		const falseBlock = hasElse
			? s.slice(elseMatch!.index + elseMatch![0].length, endifMatch.index)
			: '';
		const chosen = evalCond(openMatch[1]) ? trueBlock : falseBlock;
		s = s.slice(0, start) + chosen + s.slice(endifMatch.index + endifMatch[0].length);
	}
	const result: string[] = [];
	let lastIndex = 0;
	const regex = /\{\{\s*([a-zA-Z0-9_]+)(?:\s*\|\s*remove:\s*(["'])(.*?)\2)?\s*\}\}/g;
	let m: RegExpExecArray | null;
	while ((m = regex.exec(s)) !== null) {
		if (m.index > lastIndex) {
			result.push(s.slice(lastIndex, m.index));
		}
		const key = m[1] as keyof TemplateVariables;
		let value = templates?.[key] ?? '';
		if (!value && m[1] === 'schedule_type_short') {
			const st = String(templates?.schedule_type ?? '').toLowerCase();
			value =
				st === 'laboratory' ? 'Lab' : st === 'lecture' ? 'Lec' : (templates?.schedule_type ?? '');
		}
		if (m[3]) {
			value = value.replaceAll(m[3], '');
		}
		result.push(value);
		lastIndex = regex.lastIndex;
	}
	if (lastIndex < s.length) {
		result.push(s.slice(lastIndex));
	}
	return result;
}

export function isPresetSelected(
	current: string,
	presets: string[],
	index: number,
	templates?: TemplateVariables
): boolean {
	const preset = presets[index];
	if (!preset) return false;
	const effective = current || presets[0];
	if (!effective) return false;
	if (effective === preset) return true;
	return parseTemplate(effective, templates).join('') === parseTemplate(preset, templates).join('');
}
