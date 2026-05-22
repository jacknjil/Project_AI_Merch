'use client';

type FilterDimension = {
  key: 'niche' | 'style';
  label: string;
  values: string[];
};

type FilterBarProps = {
  filters: FilterDimension[];
  active: Record<'niche' | 'style', string | null>;
  onChange: (key: 'niche' | 'style', value: string | null) => void;
};

export default function FilterBar({ filters, active, onChange }: FilterBarProps) {
  const dimensions = filters.filter((f) => f.values.length > 0);
  if (dimensions.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {dimensions.map((dim) => (
        <div
          key={dim.key}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: 36 }}>
            {dim.label}
          </span>
          {dim.values.map((val) => {
            const isActive = active[dim.key] === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onChange(dim.key, isActive ? null : val)}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? '#06b6d4' : '#4b5563'}`,
                  background: isActive ? '#0c2a31' : '#1f2937',
                  color: isActive ? '#a5f3fc' : '#9ca3af',
                  cursor: 'pointer',
                }}
              >
                {val}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
