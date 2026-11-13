import { API } from '../api';
import { codeOf, unique } from './options';
import type { CatalogSection, SectionQuery } from './types';

const PAGE_SIZE = 200;
const MAX_PAGES = 10;
const CRN_CHUNK = 50;

export async function allSections(query: SectionQuery): Promise<CatalogSection[]> {
	const sections: CatalogSection[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const result = await API.getSections({ ...query, page, per_page: PAGE_SIZE });
		sections.push(...result.data);
		if (page >= result.meta.total_pages) break;
	}
	return sections;
}

export async function sectionsByCrn(uid: string, crns: string[]): Promise<CatalogSection[]> {
	const list = unique(crns);
	const chunks: string[][] = [];
	for (let index = 0; index < list.length; index += CRN_CHUNK)
		chunks.push(list.slice(index, index + CRN_CHUNK));
	const pages = await Promise.all(chunks.map((crn) => allSections({ term_uid: uid, crn })));
	return pages.flat();
}

export async function sectionsOfCodes(uid: string, codes: string[]): Promise<CatalogSection[]> {
	const bySubject: Record<string, string[]> = {};
	for (const code of codes) {
		const [subject, number] = code.split(' ');
		if (subject && number) bySubject[subject] = [...(bySubject[subject] ?? []), number];
	}
	const pages = await Promise.all(
		Object.entries(bySubject).map(([subject, numbers]) =>
			allSections({ term_uid: uid, subject, course_number: numbers })
		)
	);
	const found = pages.flat().filter((section) => codes.includes(codeOf(section)));
	const known = found.map((section) => section.crn);
	const partners = unique(
		found.flatMap((section) => section.linked.crns).filter((crn) => !known.includes(crn))
	);
	return [...found, ...(partners.length ? await sectionsByCrn(uid, partners) : [])];
}
