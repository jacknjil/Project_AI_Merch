import { describe, it, expect } from 'vitest';
import { suggestCategoryForBlueprint } from './printify';

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
