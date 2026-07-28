'use client';

import type { CSSProperties } from 'react';

type FilterValue = {
  value: string;
  count: number;
};

type FilterDimension = {
  key: string;
  label: string;
  values: FilterValue[];
};

type FilterBarProps = {
  filters: FilterDimension[];
  active: Record<string, string | null>;
  onChange: (key: string, value: string | null) => void;
  topN?: number;
};

const DEFAULT_TOP_N = 8;

const pillBaseStyle: CSSProperties = {
  fontSize: '0.75rem',
  padding: '4px 10px',
  borderRadius: 999,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  maxWidth: 220,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export default function FilterBar({ filters, active, onChange, topN = DEFAULT_TOP_N }: FilterBarProps) {
  const dimensions = filters.filter((f) => f.values.length > 0);
  if (dimensions.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {dimensions.map((dim) => (
        <FilterRow
          key={dim.key}
          dimension={dim}
          activeValue={active[dim.key] ?? null}
          onChange={(value) => onChange(dim.key, value)}
          topN={topN}
        />
      ))}
    </div>
  );
}

function FilterRow({
  dimension,
  activeValue,
  onChange,
  topN,
}: {
  dimension: FilterDimension;
  activeValue: string | null;
  onChange: (value: string | null) => void;
  topN: number;
}) {
  // Values arrive pre-sorted by usage count (most common first), so the
  // split below naturally re-ranks itself as the underlying catalog changes.
  const topValues = dimension.values.slice(0, topN);
  const overflowValues = dimension.values.slice(topN);

  const activeInOverflow = activeValue
    ? overflowValues.find((v) => v.value === activeValue)
    : undefined;

  const pillValues = activeInOverflow ? [...topValues, activeInOverflow] : topValues;
  const remainingOverflow = activeInOverflow
    ? overflowValues.filter((v) => v.value !== activeValue)
    : overflowValues;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: 36 }}>{dimension.label}</span>

      {pillValues.map(({ value, count }) => {
        const isActive = activeValue === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(isActive ? null : value)}
            title={`${value} (${count})`}
            style={{
              ...pillBaseStyle,
              border: `1px solid ${isActive ? '#06b6d4' : '#4b5563'}`,
              background: isActive ? '#0c2a31' : '#1f2937',
              color: isActive ? '#a5f3fc' : '#9ca3af',
            }}
          >
            {value}
          </button>
        );
      })}

      {remainingOverflow.length > 0 && (
        <select
          value=""
          onChange={(e) => onChange(e.target.value || null)}
          aria-label={`More ${dimension.label.toLowerCase()} filters`}
          style={{
            fontSize: '0.75rem',
            padding: '4px 8px',
            borderRadius: 999,
            border: '1px solid #4b5563',
            background: '#1f2937',
            color: '#9ca3af',
            cursor: 'pointer',
          }}
        >
          <option value="">+{remainingOverflow.length} more…</option>
          {remainingOverflow.map(({ value, count }) => (
            <option key={value} value={value}>
              {value} ({count})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
