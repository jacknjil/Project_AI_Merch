import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are an expert DALL-E prompt engineer specializing in print-on-demand merchandise design.
Take the user's basic prompt and expand it into a detailed, vivid DALL-E prompt optimized for apparel and accessory printing.
Focus on visual details: composition, lighting, texture, color gradients, line weight.
Keep the result under 400 characters. Return only the enhanced prompt with no explanation or preamble.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = (body.prompt ?? '').toString().trim();

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const enhancedPrompt = completion.choices[0]?.message?.content?.trim() ?? prompt;
    return NextResponse.json({ enhancedPrompt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[studio/enhance-prompt]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
