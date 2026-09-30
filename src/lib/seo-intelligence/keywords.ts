import type { AnalysisInput, Finding } from './types';
import { finding, quote } from './finding';
import { countPhrase, matchLevel, slugWords, tokenCoverage, wordCount, type MatchLevel } from './text';

/**
 * Keyword checks — 25 of the SEO score's 100 points.
 *
 * Each placement is scored for the best of the (up to three) primary
 * keywords, with the first keyword counting in full and the others at 80%:
 * the page's main phrase should lead. A partial match (most of the phrase's
 * words, not the exact phrase) earns half. Repetition is never rewarded — a
 * phrase used far more often than natural copy would use it loses points.
 */

const WEIGHT: Record<MatchLevel, number> = { exact: 1, partial: 0.5, none: 0 };

function best(text: string, keywords: readonly string[]): { level: MatchLevel; keyword: string; factor: number } {
  let top = { level: 'none' as MatchLevel, keyword: keywords[0] ?? '', factor: 0 };
  keywords.forEach((keyword, index) => {
    const level = matchLevel(text, keyword);
    const factor = WEIGHT[level] * (index === 0 ? 1 : 0.8);
    if (factor > top.factor) top = { level, keyword, factor };
  });
  return top;
}

function placement(
  input: AnalysisInput,
  id: string,
  where: string,
  text: string,
  maxPoints: number,
  advice: string,
): Finding {
  const { keywords } = input;
  const match = best(text, keywords);
  const described =
    match.level === 'exact'
      ? `${quote(match.keyword)} appears in the ${where}.`
      : match.level === 'partial'
        ? `Most words of ${quote(match.keyword)} appear in the ${where}, but not the phrase itself.`
        : `None of the primary keywords appear in the ${where}.`;
  return finding({
    id,
    category: 'keywords',
    severity: 'warning',
    points: maxPoints * match.factor,
    maxPoints,
    title: `Keyword in ${where}`,
    description: described,
    recommendation: advice.replace('{keyword}', quote(keywords[0] ?? '')),
  });
}

export function keywordFindings(input: AnalysisInput): Finding[] {
  const { keywords, doc } = input;
  if (keywords.length === 0) {
    return [
      finding({
        id: 'kw.defined',
        category: 'keywords',
        severity: 'warning',
        points: 0,
        maxPoints: 25,
        title: 'Primary keywords set',
        description: 'No primary keywords are set, so keyword placement cannot be checked and scores 0 of 25.',
        recommendation: 'Add up to three primary keywords — the phrases people type when looking for this page.',
      }),
    ];
  }

  const words = wordCount(doc.body);
  const primary = keywords[0]!;
  const occurrences = countPhrase(doc.body, primary);
  const phraseWords = Math.max(1, wordCount(primary));
  const density = words ? (occurrences * phraseWords) / words : 0;
  // More than ~3% of the copy, or a dozen repetitions, reads as stuffing.
  const stuffed = density > 0.03 || occurrences > 12;
  const titleRepeats = countPhrase(input.title, primary) > 1;

  const headings = doc.headings.filter((h) => h.level >= 2).map((h) => h.text).join(' · ');

  return [
    finding({
      id: 'kw.defined',
      category: 'keywords',
      severity: 'info',
      points: 3,
      maxPoints: 3,
      title: 'Primary keywords set',
      description: `${keywords.length} primary keyword${keywords.length === 1 ? '' : 's'}: ${keywords.map(quote).join(', ')}.`,
    }),
    placement(input, 'kw.title', 'SEO title', input.title, 5, 'Put {keyword} near the start of the SEO title.'),
    placement(input, 'kw.h1', 'H1', doc.h1.join(' '), 5, 'Use {keyword}, or a natural variation, in the main heading.'),
    placement(input, 'kw.description', 'meta description', input.description, 3, 'Mention {keyword} once in the meta description.'),
    placement(input, 'kw.intro', 'first section', doc.firstText, 3, 'Mention {keyword} in the opening section, where readers and crawlers look first.'),
    placement(input, 'kw.headings', 'subheadings', headings, 2, 'Use a keyword or a close variation in at least one subheading.'),
    finding({
      id: 'kw.slug',
      category: 'keywords',
      severity: 'info',
      points: tokenCoverage(slugWords(input.slug), primary) >= 0.5 ? 2 : tokenCoverage(slugWords(input.slug), primary) > 0 ? 1 : 0,
      maxPoints: 2,
      title: 'Keyword in URL',
      description: `The URL ${input.path} carries ${Math.round(tokenCoverage(slugWords(input.slug), primary) * 100)}% of the main keyword's words.`,
      recommendation: 'A short slug containing the keyword’s main words helps. Change it only before the page is indexed — moving a live URL costs a redirect.',
    }),
    finding({
      id: 'kw.natural',
      category: 'keywords',
      severity: stuffed || titleRepeats ? 'warning' : 'info',
      points: stuffed || titleRepeats ? 0 : occurrences === 0 ? 1 : 2,
      maxPoints: 2,
      title: 'Natural keyword use',
      description: stuffed
        ? `${quote(primary)} is used ${occurrences} times (${(density * 100).toFixed(1)}% of the copy) — that reads as keyword stuffing.`
        : titleRepeats
          ? `The SEO title repeats ${quote(primary)}.`
          : occurrences === 0
            ? `${quote(primary)} does not appear in the body copy.`
            : `${quote(primary)} is used ${occurrences} time${occurrences === 1 ? '' : 's'} in ${words} words — natural.`,
      recommendation: stuffed || titleRepeats
        ? 'Use the phrase where it reads naturally and vary the wording elsewhere. Repetition is not rewarded.'
        : 'Use the main keyword at least once in the body copy.',
    }),
  ];
}
