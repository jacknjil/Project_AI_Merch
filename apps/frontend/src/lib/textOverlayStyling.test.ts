import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./artStyleAnalysis', async () => {
  const actual = await vi.importActual<typeof import('./artStyleAnalysis')>('./artStyleAnalysis');
  return { ...actual, classifyFontCategory: vi.fn() };
});
vi.mock('./colorExtraction', () => ({ deriveTextColors: vi.fn() }));

import { classifyFontCategory } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { resolveOverlayStyle } from './textOverlayStyling';

const mockClassify = classifyFontCategory as unknown as ReturnType<typeof vi.fn>;
const mockDeriveColors = deriveTextColors as unknown as ReturnType<typeof vi.fn>;

describe('resolveOverlayStyle', () => {
  beforeEach(() => {
    mockClassify.mockReset();
    mockDeriveColors.mockReset();
  });

  it('resolves the font buffer and colors returned by style analysis and color extraction', async () => {
    mockClassify.mockResolvedValue('elegant-serif');
    mockDeriveColors.mockResolvedValue({ fill: '#111111', stroke: '#EEEEEE' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#111111');
    expect(result.stroke).toBe('#EEEEEE');
    expect(result.fontBuffer.length).toBeGreaterThan(0);
  });

  it('surfaces the safe defaults when both underlying analyses report their own fallback', async () => {
    // classifyFontCategory/deriveTextColors already self-fallback internally
    // on failure (Tasks 1-2); this proves resolveOverlayStyle passes those
    // safe defaults through correctly rather than throwing.
    mockClassify.mockResolvedValue('bold-display');
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    const result = await resolveOverlayStyle(Buffer.from('fake-png'));

    expect(result.fill).toBe('#2C2C2A');
    expect(result.stroke).toBe('#FFFFFF');
  });

  it('passes colorPalette and styleTag context through to classifyFontCategory', async () => {
    mockClassify.mockResolvedValue('bold-display');
    mockDeriveColors.mockResolvedValue({ fill: '#2C2C2A', stroke: '#FFFFFF' });

    await resolveOverlayStyle(Buffer.from('fake-png'), { colorPalette: 'neon', styleTag: 'cyberpunk' });

    expect(mockClassify).toHaveBeenCalledWith(
      expect.any(Buffer),
      { colorPalette: 'neon', styleTag: 'cyberpunk' },
    );
  });
});
