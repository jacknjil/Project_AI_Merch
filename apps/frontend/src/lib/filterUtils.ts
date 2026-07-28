export type FilterValueCount = {
  value: string;
  count: number;
};

/**
 * Counts occurrences of a field across a list of items and returns them
 * sorted most-common-first (ties broken alphabetically). Blank/undefined
 * values are dropped.
 */
export function countByValue<T>(items: T[], getValue: (item: T) => string | undefined): FilterValueCount[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const value = getValue(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
