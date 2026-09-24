import type { HeroContent } from './blocks';

/**
 * The text's share of a hero's width: the preset, or the custom percentage.
 * Pure, so the renderer and the tests share it.
 */
export function heroTextShare(content: Pick<HeroContent, 'columnSplit' | 'columnSplitCustom'>): number {
  return content.columnSplit === 'custom' ? content.columnSplitCustom : Number(content.columnSplit);
}

/**
 * The grid tracks, in visual order: when the image or form sits on the left,
 * its share comes first.
 */
export function heroColumns(textShare: number, asideFirst: boolean): string {
  const text = `minmax(0,${textShare}fr)`;
  const aside = `minmax(0,${100 - textShare}fr)`;
  return asideFirst ? `${aside} ${text}` : `${text} ${aside}`;
}
