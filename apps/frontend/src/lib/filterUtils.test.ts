import { describe, it, expect } from 'vitest';
import { countByValue } from './filterUtils';

describe('countByValue', () => {
  it('sorts values by descending frequency', () => {
    const items = [{ tag: 'cats' }, { tag: 'dogs' }, { tag: 'cats' }, { tag: 'cats' }];

    const result = countByValue(items, (i) => i.tag);

    expect(result).toEqual([
      { value: 'cats', count: 3 },
      { value: 'dogs', count: 1 },
    ]);
  });

  it('breaks ties alphabetically', () => {
    const items = [{ tag: 'zebra' }, { tag: 'anime' }];

    const result = countByValue(items, (i) => i.tag);

    expect(result).toEqual([
      { value: 'anime', count: 1 },
      { value: 'zebra', count: 1 },
    ]);
  });

  it('drops blank and undefined values', () => {
    const items = [{ tag: '' }, { tag: undefined }, { tag: 'cats' }];

    const result = countByValue(items, (i) => i.tag);

    expect(result).toEqual([{ value: 'cats', count: 1 }]);
  });

  it('returns an empty array when there are no items', () => {
    const result = countByValue<{ tag?: string }>([], (i) => i.tag);

    expect(result).toEqual([]);
  });
});
