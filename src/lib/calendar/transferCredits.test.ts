import { expect, it } from 'vitest';
import { kindOf, signatureOf, transcriptCredits } from './transferCredits';

const navigation = ['studentInformation', 'transferCredit', 'institutionCredit'].map((code) => ({
	code
}));

function row(subject: string, course: string, title: string, creditHours = '4.000') {
	return { subject, course, title, grade: 'TR', creditHours, qualityPoints: '0.00', rVal: '' };
}

const transfer = {
	class: 'net.hedtech.banner.student.academicTranscript.TransferCreditService',
	transferCreditInfo: [],
	transferCreditList: [
		{
			collegeName: 'Advanced Placement Program',
			periodSeqNo: 'SPRING 2025',
			transferCreditInfo: [
				row('MATH', '1750', 'AP CALCULUS AB'),
				row('HIST', '1XXX', 'AP WORLD HISTORY'),
				row('ENGL', '1100', 'AP ENGLISH LANGUAGE')
			]
		},
		{
			collegeName: 'Example Community College',
			periodSeqNo: 'FALL 2024',
			transferCreditInfo: [
				row('PSYC', '1500', 'INTRO  PSYCHOLOGY', '3.000'),
				row('ENGL', '1100', 'COMPOSITION I')
			]
		}
	]
};

it('reads each transfer credit with its WIT course, credits and kind', () => {
	expect(transcriptCredits({ navigation, transfer })).toEqual([
		{
			code: 'ENGL 1100',
			title: 'AP ENGLISH LANGUAGE',
			credits: 4,
			kind: 'ap',
			source: 'Advanced Placement Program',
			countable: true
		},
		{
			code: 'HIST 1XXX',
			title: 'AP WORLD HISTORY',
			credits: 4,
			kind: 'ap',
			source: 'Advanced Placement Program',
			countable: false
		},
		{
			code: 'MATH 1750',
			title: 'AP CALCULUS AB',
			credits: 4,
			kind: 'ap',
			source: 'Advanced Placement Program',
			countable: true
		},
		{
			code: 'PSYC 1500',
			title: 'INTRO PSYCHOLOGY',
			credits: 3,
			kind: 'transfer',
			source: 'Example Community College',
			countable: true
		}
	]);
});

it('finds no credit when the transcript has no transfer credit section', () => {
	expect(
		transcriptCredits({
			navigation: [{ code: 'studentInformation' }, { code: 'institutionCredit' }],
			transfer: { transferCreditList: null }
		})
	).toEqual([]);
	expect(
		transcriptCredits({ navigation, transfer: { ...transfer, transferCreditList: [] } })
	).toEqual([]);
});

it.each([
	['a missing list in a listed section', { navigation, transfer: {} }],
	['a missing navigation', { navigation: undefined, transfer }],
	[
		'a row with no course',
		{
			navigation,
			transfer: {
				transferCreditList: [
					{ collegeName: 'X', transferCreditInfo: [row('MATH', '', 'CALCULUS')] }
				]
			}
		}
	]
])('rejects %s instead of reporting no credit', (_, page) => {
	expect(() => transcriptCredits(page)).toThrow('could not be read');
});

it('names exams as test credit and other schools as transfer credit', () => {
	expect(kindOf('Advanced Placement Program')).toBe('ap');
	expect(kindOf('CLEP Examination Program')).toBe('test');
	expect(kindOf('International Baccalaureate')).toBe('test');
	expect(kindOf('Northeastern University')).toBe('transfer');
});

it('gives the same signature for the same credit in any order', () => {
	const found = transcriptCredits({ navigation, transfer });
	expect(signatureOf([...found].reverse())).toBe(signatureOf(found));
	expect(signatureOf(found.slice(1))).not.toBe(signatureOf(found));
});
