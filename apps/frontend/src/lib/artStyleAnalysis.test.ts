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
import { classifyFontCategory } from './artStyleAnalysis';

const mockCreate = openai.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

describe('classifyFontCategory', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the category GPT responds with when it is valid', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'elegant-serif' } }] });
    const result = await classifyFontCategory(Buffer.from('fake-png'), {});
    expect(result).toBe('elegant-serif');
  });

  it('falls back to bold-display when GPT returns something outside the fixed category list', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'comic-sans-vibes' } }] });
    const result = await classifyFontCategory(Buffer.from('fake-png'), {});
    expect(result).toBe('bold-display');
  });

  it('falls back to bold-display when the OpenAI call throws', async () => {
    mockCreate.mockRejectedValue(new Error('network error'));
    const result = await classifyFontCategory(Buffer.from('fake-png'), {});
    expect(result).toBe('bold-display');
  });

  it('includes colorPalette and styleTag context in the prompt when provided', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'vintage-distressed' } }] });
    await classifyFontCategory(Buffer.from('fake-png'), { colorPalette: 'sunset', styleTag: 'vintage-badge' });
    const callArgs = mockCreate.mock.calls[0][0];
    const promptText = callArgs.messages[0].content[0].text;
    expect(promptText).toContain('sunset');
    expect(promptText).toContain('vintage-badge');
  });
});
