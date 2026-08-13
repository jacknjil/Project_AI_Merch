import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { suggestCategoryForBlueprint, fetchAllPrintifyProducts, filterUnmatchedProducts, mapPrintifyImages, findOrphanedAssets, pickUploadFormat, upscalePreservingAlpha, findFrontArtworkSrc, hasAlphaChannel, type AssetProductRef } from './printify';

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

  it('returns hat for blueprint 1446 (Snapback Trucker Cap)', () => {
    expect(suggestCategoryForBlueprint(1446)).toBe('hat');
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

describe('findOrphanedAssets', () => {
  const assets: AssetProductRef[] = [
    { id: '1', title: 'Still live', printifyProductId: 'p1', printifyStatus: 'published' },
    { id: '2', title: 'Deleted on Printify', printifyProductId: 'p2', printifyStatus: 'published' },
    { id: '3', title: 'Never published', printifyProductId: undefined, printifyStatus: undefined },
    { id: '4', title: 'Already archived', printifyProductId: 'p4', printifyStatus: 'archived' },
  ];
  const liveIds = new Set(['p1']);

  it('flags assets whose printifyProductId is missing from the live Printify list', () => {
    const result = findOrphanedAssets(assets, liveIds);
    expect(result.map((a) => a.id)).toEqual(['2']);
  });

  it('excludes assets with no printifyProductId', () => {
    const result = findOrphanedAssets(assets, liveIds);
    expect(result.find((a) => a.id === '3')).toBeUndefined();
  });

  it('excludes assets already marked archived, even if missing from the live list', () => {
    const result = findOrphanedAssets(assets, liveIds);
    expect(result.find((a) => a.id === '4')).toBeUndefined();
  });

  it('returns an empty array when every tracked asset is still live', () => {
    const result = findOrphanedAssets(
      [{ id: '1', title: 'Live', printifyProductId: 'p1', printifyStatus: 'published' }],
      new Set(['p1']),
    );
    expect(result).toEqual([]);
  });
});

describe('pickUploadFormat', () => {
  it('returns png when the image has an alpha channel', () => {
    expect(pickUploadFormat(true)).toBe('png');
  });

  it('returns jpeg when the image has no alpha channel', () => {
    expect(pickUploadFormat(false)).toBe('jpeg');
  });
});

describe('findFrontArtworkSrc', () => {
  it('returns the src of the front placeholder image', () => {
    const printAreas = [
      {
        placeholders: [
          { position: 'back', images: [] },
          { position: 'front', images: [{ src: 'https://x/front-print.jpg' }] },
          { position: 'neck', images: [{ src: '' }] },
        ],
      },
    ];
    expect(findFrontArtworkSrc(printAreas)).toBe('https://x/front-print.jpg');
  });

  it('returns null when there is no front placeholder', () => {
    const printAreas = [{ placeholders: [{ position: 'back', images: [] }] }];
    expect(findFrontArtworkSrc(printAreas)).toBeNull();
  });

  it('returns null when the front placeholder has no images', () => {
    const printAreas = [{ placeholders: [{ position: 'front', images: [] }] }];
    expect(findFrontArtworkSrc(printAreas)).toBeNull();
  });

  it('returns null when print_areas is empty', () => {
    expect(findFrontArtworkSrc([])).toBeNull();
  });
});

describe('hasAlphaChannel', () => {
  it('returns true for a PNG buffer with an alpha channel', async () => {
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    expect(await hasAlphaChannel(buffer)).toBe(true);
  });

  it('returns false for a JPEG buffer with no alpha channel', async () => {
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).jpeg().toBuffer();
    expect(await hasAlphaChannel(buffer)).toBe(false);
  });
});

describe('upscalePreservingAlpha', () => {
  it('preserves alpha and resizes to the target dimensions', async () => {
    const transparentQuadrant = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();

    const input = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{ input: transparentQuadrant, left: 0, top: 0 }])
      .png()
      .toBuffer();

    const output = await upscalePreservingAlpha(input, 400);
    const meta = await sharp(output).metadata();

    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });
});
