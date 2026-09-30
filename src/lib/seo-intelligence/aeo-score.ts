import type { AnalysisInput, Finding } from './types';
import { finding, quote } from './finding';
import { containsPhrase, normalise, wordCount } from './text';

/**
 * The AEO score (answer engine optimisation): 100 points for how easily a
 * search feature or assistant can lift a correct, self-contained answer from
 * the page. An internal heuristic — not a score any platform publishes.
 *
 *   FAQ content            20
 *   Valid FAQ schema       10
 *   Question headings      15
 *   Concise direct answers 15
 *   Lists / scannability   10
 *   A clear definition     10
 *   Intent coverage        10
 *   Contact clarity        10
 */

const QUESTION = /^(what|how|why|where|when|who|which|can|do|does|is|are|should|will)\b|\?\s*$/i;

/** Things buyers ask about, each recognised by any of its words. */
const INTENTS: Array<{ name: string; words: string[] }> = [
  { name: 'price', words: ['price', 'prices', 'pricing', 'cost', 'costs', 'quote', 'plan', 'plans'] },
  { name: 'buying', words: ['buy', 'purchase', 'order', 'licence', 'licences', 'license', 'licenses', 'subscription'] },
  { name: 'support', words: ['support', 'help', 'assistance', 'training'] },
  { name: 'setup', words: ['install', 'installation', 'setup', 'deploy', 'deployment', 'migration', 'onboarding'] },
  { name: 'renewal', words: ['renew', 'renewal', 'upgrade', 'billing', 'invoice'] },
];

export function questionHeadings(input: AnalysisInput): string[] {
  return [...input.doc.headings.map((h) => h.text), ...input.doc.faq.map((f) => f.question)].filter((t) => QUESTION.test(t.trim()));
}

export function aeoFindings(input: AnalysisInput): Finding[] {
  const { doc } = input;
  const faq = doc.faq;
  const questions = questionHeadings(input);
  const concise = faq.filter((f) => {
    const n = wordCount(f.answer);
    return n >= 8 && n <= 60;
  }).length;
  const body = ` ${normalise(doc.body)} `;
  const intents = INTENTS.filter((intent) => intent.words.some((w) => body.includes(` ${w} `)));
  const subject = input.city?.productName ?? input.keywords[0] ?? input.label;
  const opening = doc.firstText.split(/\s+/).slice(0, 80).join(' ');
  const defines =
    (containsPhrase(opening, subject) || containsPhrase(opening, input.label) || input.keywords.some((k) => containsPhrase(opening, k))) &&
    /\b(is|are|offers|provides|helps|lets|gives|supplies|includes)\b/i.test(opening);
  const faqSchema = faq.length > 0 && input.technical.structuredData.includes('FAQPage');
  const contactable = input.org.hasPhone || input.org.hasEmail || doc.hasForm;

  const example = input.city
    ? `Where can I buy ${input.city.productName ?? 'licenses'} in ${input.city.name}?`
    : input.keywords[0]
      ? `What is ${input.keywords[0]}?`
      : `What does ${input.label} include?`;

  return [
    finding({
      id: 'aeo.faq',
      category: 'aeo',
      severity: 'warning',
      points: faq.length >= 3 ? 20 : faq.length * 7,
      maxPoints: 20,
      title: 'FAQ section',
      description: faq.length ? `${faq.length} question${faq.length === 1 ? '' : 's'} answered on the page.` : 'Missing FAQ section.',
      recommendation: `Add an FAQ section with at least three real customer questions, for example ${quote(example)}.`,
    }),
    finding({
      id: 'aeo.faqSchema',
      category: 'aeo',
      severity: 'info',
      points: faqSchema ? 10 : 0,
      maxPoints: 10,
      title: 'FAQ structured data',
      description: faqSchema
        ? `FAQPage schema is emitted for ${faq.length} complete question${faq.length === 1 ? '' : 's'}.`
        : faq.length
          ? 'The questions on this page are not emitted as FAQPage schema.'
          : 'No FAQPage schema: it is generated automatically from an FAQ section with questions and answers.',
      recommendation: 'Add an FAQ section; its schema follows automatically. Questions without an answer are left out of it.',
    }),
    finding({
      id: 'aeo.questions',
      category: 'aeo',
      severity: 'info',
      points: questions.length >= 3 ? 15 : questions.length * 5,
      maxPoints: 15,
      title: 'Question-led headings',
      description: questions.length ? `${questions.length} heading${questions.length === 1 ? '' : 's'} or FAQ entries phrased as questions.` : 'No headings are phrased the way people ask.',
      recommendation: `Phrase some headings as the questions buyers ask, e.g. ${quote(example)}.`,
    }),
    finding({
      id: 'aeo.answers',
      category: 'aeo',
      severity: 'info',
      points: faq.length ? (concise / faq.length) * 15 : 0,
      maxPoints: 15,
      title: 'Concise direct answers',
      description: faq.length ? `${concise} of ${faq.length} answers are a direct 8–60 word answer.` : 'There are no question-and-answer pairs to lift an answer from.',
      recommendation: 'Start each answer with a one- or two-sentence direct answer, then add detail.',
    }),
    finding({
      id: 'aeo.lists',
      category: 'aeo',
      severity: 'info',
      points: doc.listItems >= 5 ? 10 : doc.listItems >= 2 ? 5 : 0,
      maxPoints: 10,
      title: 'Scannable lists',
      description: `${doc.listItems} list item${doc.listItems === 1 ? '' : 's'} (bullets, features, steps).`,
      recommendation: 'Present features, steps or comparisons as lists — they are easier to scan and to quote.',
    }),
    finding({
      id: 'aeo.definition',
      category: 'aeo',
      severity: 'info',
      points: defines ? 10 : 0,
      maxPoints: 10,
      title: 'Clear opening explanation',
      description: defines ? 'The opening names the subject and says what it is or does.' : 'The opening does not plainly say what this page offers.',
      recommendation: `Open with a plain sentence that answers “what is this?”, naming ${quote(subject)}.`,
    }),
    finding({
      id: 'aeo.intent',
      category: 'aeo',
      severity: 'info',
      points: Math.min(10, intents.length * 3.4),
      maxPoints: 10,
      title: 'Buyer questions covered',
      description: intents.length ? `Covers ${intents.map((i) => i.name).join(', ')}.` : 'None of price, buying, support, setup or renewal is discussed.',
      recommendation: `Cover what buyers need to decide: ${INTENTS.filter((i) => !intents.includes(i)).map((i) => i.name).join(', ')}.`,
    }),
    finding({
      id: 'aeo.contact',
      category: 'aeo',
      severity: 'info',
      points: contactable ? 10 : 0,
      maxPoints: 10,
      title: 'Who to contact',
      description: contactable ? 'A phone number, email or enquiry form makes the next step clear.' : 'No phone, email or form: an answer engine cannot tell people how to reach you.',
      recommendation: 'Add an enquiry form, or set a phone number and email in this country’s settings.',
    }),
  ];
}
