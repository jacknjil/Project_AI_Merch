import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./artStyleAnalysis', async () => {
  const actual = await vi.importActual<typeof import('./artStyleAnalysis')>('./artStyleAnalysis');
  return { ...actual, analyzeArtStyle: vi.fn() };
});
vi.mock('./colorExtraction', () => ({ deriveTextColors: vi.fn() }));

import { analyzeArtStyle } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { resolveOverlayStyle } from './textOverlayStyling';

const mockAnalyze = analyzeArtStyle as unknown as ReturnType<typeof vi.fn>;
const mockDeriveColors = deriveTextColors as unknown as ReturnType<typeof vi.fn>;

describe('resolveOverlayStyle', () => {
  beforeEach(() => {
    mockAnalyze.mockReset();
    mockDeriveColors.mockReset();
  });

  it('resolves the font buffer, colors, and shape returned by style analysis and color extraction', async () => {
    mockAnalyze.mockResolvedValue({ fontCategory: 'elegant-serif', shape: 'circular' });
    mockDeriveColors.mockResolvedValue({ fill: '#111111', stroke: '#EEEEEE' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#111111');
    expect(result.stroke).toBe('#EEEEEE');
    expect(result.shape).toBe('circular');
    expect(result.fontBuffer.length).toBeGreaterThan(0);
  });

  it('surfaces the safe defaults when the underlying analysis reports its own fallback', async () => {
    mockAnalyze.mockResolvedValue({ fontCategory: 'bold-display', shape: 'rectangular' });
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#2C2C2A');
    expect(result.stroke).toBe('#FFFFFF');
    expect(result.shape).toBe('rectangular');
  });

  it('passes colorPalette and styleTag context through to analyzeArtStyle', async () => {
    mockAnalyze.mockResolvedValue({ fontCategory: 'bold-display', shape: 'rectangular' });
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    await resolveOverlayStyle(Buffer.from('fake-png'), { colorPalette: 'neon', styleTag: 'cyberpunk' });

    expect(mockAnalyze).toHaveBeenCalledWith(expect.any(Buffer), { colorPalette: 'neon', styleTag: 'cyberpunk' });
  });
});
