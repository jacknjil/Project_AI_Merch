import { describe, it, expect } from 'vitest';
import { suggestCategoryForBlueprint, fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages } from './printify';

describe('suggestCategoryForBlueprint', () => {
  it('returns shirt for blueprint 12 (app default shirt)', () => {
    expect(suggestCategoryForBlueprint(12)).toBe('shirt');
  });

  it('returns sticker for blueprint 400 (Kiss-Cut Stickers)', () => {
    expect(suggestCategoryForBlueprint(400)).toBe('sticker');
  });

  it('returns tote for blueprint 1313 (Cotton Canvas Tote Bag)', () => {
    expect(suggestCategoryForBlueprint(1313)).toBe('tote');
  });

  it('returns hoodie for blueprint 77 (alternate hoodie blueprint)', () => {
    expect(suggestCategoryForBlueprint(77)).toBe('hoodie');
  });

  it('returns shirt for blueprint 706 (alternate shirt blueprint)', () => {
    expect(suggestCategoryForBlueprint(706)).toBe('shirt');
  });

  it('returns undefined for an unrecognized blueprint id', () => {
    expect(suggestCategoryForBlueprint(999999)).toBeUndefined();
  });
});

describe('fetchAllPrintifyProducts', () => {
  it('collects products across multiple pages', async () => {
    const pages = [
      { data: [{ id: '1', title: 'A', blueprint_id: 12, print_provider_id: 99, images: [] }], current_page: 1, last_page: 2 },
      { data: [{ id: '2', title: 'B', blueprint_id: 400, print_provider_id: 1, images: [] }], current_page: 2, last_page: 2 },
    ];
    const fetchPage = async (page: number) => pages[page - 1];
    const result = await fetchAllPrintifyProducts(fetchPage);
    expect(result.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('stops after a hard cap even if last_page never matches current_page', async () => {
    let calls = 0;
    const fetchPage = async (page: number) => {
      calls += 1;
      return { data: [], current_page: page, last_page: 999999 };
    };
    await fetchAllPrintifyProducts(fetchPage);
    expect(calls).toBe(50);
  });
});

describe('filterUnmatchedProducts', () => {
  const products = [
    { id: 'a', title: 'A', blueprint_id: 12, print_provider_id: 99, images: [] },
    { id: 'b', title: 'B', blueprint_id: 400, print_provider_id: 1, images: [] },
    { id: 'c', title: 'C', blueprint_id: 12, print_provider_id: 99, images: [] },
  ];

  it('excludes tracked and ignored product ids', () => {
    const result = filterUnmatchedProducts(products, new Set(['a']), new Set(['c']));
    expect(result.map((p) => p.id)).toEqual(['b']);
  });

  it('returns all products when nothing is tracked or ignored', () => {
    const result = filterUnmatchedProducts(products, new Set(), new Set());
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('mapPrintifyImages', () => {
  it('labels the default image Front and numbers alternates in order', () => {
    const result = mapPrintifyImages([
      { src: 'https://x/1.png', is_default: false },
      { src: 'https://x/2.png', is_default: true },
      { src: 'https://x/3.png', is_default: false },
    ]);
    expect(result).toEqual([
      { src: 'https://x/1.png', label: 'Alternate 1', isDefault: false },
      { src: 'https://x/2.png', label: 'Front', isDefault: true },
      { src: 'https://x/3.png', label: 'Alternate 2', isDefault: false },
    ]);
  });

  it('returns an empty array for no images', () => {
    expect(mapPrintifyImages([])).toEqual([]);
  });
});
