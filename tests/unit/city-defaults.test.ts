import { describe, it, expect } from 'vitest';
import {
  citySlug,
  cityProductSlug,
  cityStarterSections,
  normaliseKeywords,
  rebaseCitySlug,
  replaceTokens,
  suggestCityProductSeo,
  suggestCitySeo,
} from '@/lib/cities/defaults';
import { cityInputSchema, cityPageInputSchema } from '@/lib/validation/city';

describe('city defaults', () => {
  it('suggests local SEO from the city name without hardcoding a city', () => {
    const delhi = suggestCitySeo({ city: 'Delhi', country: 'India' }, 'Adobe reseller');
    expect(delhi.seoTitle).toBe('Adobe Reseller in Delhi | Adobe Licensing Partner');
    expect(delhi.h1).toBe('Adobe Reseller in Delhi');
    expect(delhi.keywords).toEqual(['Adobe reseller in Delhi', 'Adobe partner in Delhi', 'Adobe licenses in Delhi']);
    expect(delhi.seoDescription).toContain('Delhi, India');

    const dubai = suggestCitySeo({ city: 'Dubai', region: 'Dubai Emirate', country: 'United Arab Emirates' });
    expect(dubai.h1).toBe('Adobe Reseller in Dubai');
    expect(dubai.seoDescription).toContain('Dubai, Dubai Emirate, United Arab Emirates');
  });

  it('suggests product-page SEO from the city and the product', () => {
    const s = suggestCityProductSeo({ city: 'Delhi', country: 'India', product: 'Adobe Acrobat Pro' });
    expect(s.h1).toBe('Adobe Acrobat Pro in Delhi');
    // The site's title template adds the brand; the suggestion must not repeat it.
    expect(s.seoTitle).toBe('Adobe Acrobat Pro in Delhi | Licenses & Pricing');
    expect(s.keywords).toHaveLength(3);
  });

  it('keeps at most three distinct primary keywords', () => {
    expect(normaliseKeywords(['  a  b ', 'A B', '', 'c', 'd', 'e'])).toEqual(['a b', 'c', 'd']);
    expect(normaliseKeywords([null, undefined, ''])).toEqual([]);
  });

  it('builds slugs and nested product slugs', () => {
    expect(citySlug('New Delhi')).toBe('new-delhi');
    expect(citySlug('Abu Dhabi')).toBe('abu-dhabi');
    expect(cityProductSlug('delhi', 'adobe-acrobat-pro')).toBe('delhi/adobe-acrobat-pro');
  });

  it('moves only the city page and pages under it', () => {
    expect(rebaseCitySlug('delhi', 'delhi', 'new-delhi')).toBe('new-delhi');
    expect(rebaseCitySlug('delhi/adobe-acrobat-pro', 'delhi', 'new-delhi')).toBe('new-delhi/adobe-acrobat-pro');
    expect(rebaseCitySlug('delhi-ncr', 'delhi', 'new-delhi')).toBeNull();
    expect(rebaseCitySlug('about', 'delhi', 'new-delhi')).toBeNull();
  });

  it('fills template tokens once, in every string of a payload', () => {
    const out = replaceTokens(
      { heading: 'Adobe in {{city}}', items: [{ q: 'Support in {{ city }}, {{region}}?' }], n: 3 },
      { city: 'Gurugram', region: 'Haryana', country: 'India' },
    );
    expect(out).toEqual({ heading: 'Adobe in Gurugram', items: [{ q: 'Support in Gurugram, Haryana?' }], n: 3 });
  });

  it('starts a city page with a hero H1, an FAQ with local questions and a live product block', () => {
    const seo = suggestCitySeo({ city: 'Delhi', country: 'India' });
    const sections = cityStarterSections({ city: 'Delhi', country: 'India' }, seo, 'Adobe reseller', 'contact');
    expect(sections[0]).toMatchObject({ blockType: 'hero', content: { heading: 'Adobe Reseller in Delhi' } });
    expect(sections.some((s) => s.blockType === 'productCards')).toBe(true);
    const faq = sections.find((s) => s.blockType === 'faq')!;
    expect(JSON.stringify(faq.content)).toContain('Where can I buy Adobe licenses in Delhi?');
    // No section stores a price: prices come from Product/ProductCountry.
    expect(JSON.stringify(sections)).not.toMatch(/"(monthly|annual)Price"/);
  });

  it('makes the region optional and validates the slug', () => {
    const ok = cityInputSchema.parse({ countryId: 'c', name: 'Delhi', slug: 'Delhi' });
    expect(ok.region).toBeNull();
    expect(ok.slug).toBe('delhi');
    expect(() => cityInputSchema.parse({ countryId: 'c', name: 'X', slug: '///' })).toThrow();
    expect(cityPageInputSchema.parse({ keywords: ['a', 'b', 'c', 'd'] }).keywords).toEqual(['a', 'b', 'c']);
  });
});
