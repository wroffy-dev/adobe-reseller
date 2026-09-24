import { parseSectionDesign } from './design';

/**
 * How a product page's sections are laid out: which run in the product's
 * boxed column (beside the sidebar) and which span the screen the way a page's
 * sections do.
 *
 * Pure, so the product surface and the tests share it.
 */

/** The minimum a section needs to be placed. */
export type SegmentSection = {
  id: string;
  blockType: string;
  settings: unknown;
  isVisible: boolean;
  sortOrder: number;
};

/**
 * Whether a section leaves the boxed column.
 *
 * A hero always does: on every other page a hero is a full-width band whose
 * content lines up with the header, and a product page's hero is the same
 * block, so it renders the same way without anybody having to switch it on.
 * Any other section does when its Responsive tab says "Stretch to the screen
 * edges".
 */
export function isStretched(section: Pick<SegmentSection, 'blockType' | 'settings'>): boolean {
  return section.blockType === 'hero' || parseSectionDesign(section.settings).stretch;
}

export type Segment<T extends SegmentSection = SegmentSection> = {
  key: string;
  stretch: boolean;
  sections: T[];
  withSidebar: boolean;
};

/**
 * Splits the product's sections into runs that sit in the boxed column and
 * runs that are stretched to the screen edges.
 *
 * Without a sidebar every stretched section breaks out where it stands. With
 * one, only the stretched sections at the very top and bottom can: a section
 * beside the sidebar shares its row with the sidebar, so it stays in its
 * column. There is always a boxed run when there is a sidebar, even an empty
 * one, because that run is where the sidebar lives.
 */
export function segmentDetail<T extends SegmentSection>(detail: T[], withSidebar: boolean): Segment<T>[] {
  const visible = detail
    .filter((section) => section.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const stretched = visible.map(isStretched);

  if (withSidebar) {
    let head = 0;
    while (head < visible.length && stretched[head]) head += 1;
    let tail = visible.length;
    while (tail > head && stretched[tail - 1]) tail -= 1;

    const segments: Segment<T>[] = [];
    if (head > 0) {
      segments.push({ key: 'top', stretch: true, sections: visible.slice(0, head), withSidebar: false });
    }
    segments.push({
      key: 'main',
      stretch: false,
      sections: visible.slice(head, tail),
      withSidebar: true,
    });
    if (tail < visible.length) {
      segments.push({ key: 'bottom', stretch: true, sections: visible.slice(tail), withSidebar: false });
    }
    return segments;
  }

  const segments: Segment<T>[] = [];
  visible.forEach((section, index) => {
    const last = segments[segments.length - 1];
    if (last && last.stretch === stretched[index]) {
      last.sections.push(section);
    } else {
      segments.push({
        key: section.id,
        stretch: stretched[index]!,
        sections: [section],
        withSidebar: false,
      });
    }
  });
  // A product with nothing visible still renders the (empty) boxed column.
  return segments.length > 0
    ? segments
    : [{ key: 'main', stretch: false, sections: [], withSidebar: false }];
}

