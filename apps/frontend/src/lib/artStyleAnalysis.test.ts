import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

import { openai } from './openai';
import { analyzeArtStyle } from './artStyleAnalysis';

const mockCreate = openai.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

function mockJsonResponse(content: unknown) {
  mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

describe('analyzeArtStyle', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the fontCategory and shape GPT responds with when both are valid', async () => {
    mockJsonResponse({ fontCategory: 'elegant-serif', shape: 'circular' });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result).toEqual({ fontCategory: 'elegant-serif', shape: 'circular' });
  });

  it('falls back to bold-display when fontCategory is outside the fixed list', async () => {
    mockJsonResponse({ fontCategory: 'comic-sans-vibes', shape: 'rectangular' });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result.fontCategory).toBe('bold-display');
    expect(result.shape).toBe('rectangular');
  });

  it('falls back to rectangular when shape is outside the fixed list', async () => {
    mockJsonResponse({ fontCategory: 'minimal-sans', shape: 'hexagonal' });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result.fontCategory).toBe('minimal-sans');
    expect(result.shape).toBe('rectangular');
  });

  it('falls back to both defaults when the response is not valid JSON', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json at all' } }] });
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result).toEqual({ fontCategory: 'bold-display', shape: 'rectangular' });
  });

  it('falls back to both defaults when the OpenAI call throws', async () => {
    mockCreate.mockRejectedValue(new Error('network error'));
    const result = await analyzeArtStyle(Buffer.from('fake-png'), {});
    expect(result).toEqual({ fontCategory: 'bold-display', shape: 'rectangular' });
  });

  it('includes colorPalette and styleTag context in the prompt when provided', async () => {
    mockJsonResponse({ fontCategory: 'vintage-distressed', shape: 'rectangular' });
    await analyzeArtStyle(Buffer.from('fake-png'), { colorPalette: 'sunset', styleTag: 'vintage-badge' });
    const callArgs = mockCreate.mock.calls[0][0];
    const promptText = callArgs.messages[0].content[0].text;
    expect(promptText).toContain('sunset');
    expect(promptText).toContain('vintage-badge');
  });
});
