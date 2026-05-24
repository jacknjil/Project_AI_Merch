# Prompt Builder & AI Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template dropdown on `/studio/generate` with a 5-field guided prompt builder (Niche → Subject → Style → Mood → Color Palette) and add an optional "Enhance Prompt" button that calls GPT-4.1-mini to expand the assembled prompt before DALL-E generation.

**Architecture:** Three file changes — a new `promptBuilder.ts` lib for field config and assembly logic, a new `/api/studio/enhance-prompt` POST route that calls GPT-4.1-mini, and an updated `generate/page.tsx` that wires the builder UI to both. The existing generate route and `promptTemplates.ts` are untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, React 19, Tailwind CSS v4, OpenAI SDK v6 (gpt-4.1-mini for enhance, existing gpt-image-1 for generate)

**Note on testing:** No test runner is installed. Verification uses TypeScript compilation (`npm run build`) and lint (`npm run lint`) as automated checks, plus manual browser verification for UI behaviour.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/promptBuilder.ts` | Field config data + `buildPrompt()` assembly function |
| Create | `src/app/api/studio/enhance-prompt/route.ts` | POST endpoint — GPT-4.1-mini prompt expansion |
| Modify | `src/app/studio/generate/page.tsx` | Builder UI, Enhance button, wiring |

---

## Task 1: Create `src/lib/promptBuilder.ts`

**Files:**
- Create: `src/lib/promptBuilder.ts`

- [ ] **Step 1: Create the file with field config and `buildPrompt`**

Create `src/lib/promptBuilder.ts` with this exact content:

```typescript
export type BuilderFields = {
  niche: string;
  subject: string;
  style: string;
  mood: string;
  colorPalette: string;
};

export const NICHES = [
  { value: 'nurses', label: 'Nurses' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'dogs', label: 'Dog Lovers' },
  { value: 'astrology', label: 'Astrology' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'hiking', label: 'Hiking / Outdoors' },
  { value: 'general', label: 'General' },
];

export const SUBJECTS_BY_NICHE: Record<string, string[]> = {
  nurses: ['stethoscope', 'coffee cup with scrubs', 'heartbeat monitor', 'nursing cap', 'syringe'],
  teachers: ['red apple', 'stack of books', 'chalkboard', 'pencil', 'graduation cap'],
  dogs: ['golden retriever', 'pug face', 'dachshund', 'dog paw print', 'dog bone'],
  astrology: ['zodiac wheel', 'moon phases', 'crystal ball', 'star map', 'celestial sun and moon'],
  gaming: ['game controller', 'pixel heart', 'cyber ninja', 'retro arcade cabinet', 'space invader'],
  hiking: ['mountain trail at sunrise', 'campfire under stars', 'compass rose', 'pine forest', 'bear silhouette'],
  general: ['wolf howling at moon', 'astronaut floating', 'dragon', 'phoenix rising', 'tiger'],
};

export const STYLE_TAGS = [
  { value: 'vintage-badge', label: 'Vintage Badge' },
  { value: 'retro-pixel', label: 'Retro Pixel' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'minimalist-line', label: 'Minimalist Line Art' },
  { value: 'kawaii', label: 'Kawaii / Cute' },
  { value: 'typography-humor', label: 'Typography / Humor' },
  { value: 'celestial-mystical', label: 'Celestial / Mystical' },
  { value: 'retro-poster', label: 'Retro Poster' },
  { value: 'illustration', label: 'Illustration' },
];

export const MOODS = [
  { value: 'epic', label: 'Epic' },
  { value: 'cute', label: 'Cute' },
  { value: 'dark', label: 'Dark' },
  { value: 'playful', label: 'Playful' },
  { value: 'elegant', label: 'Elegant' },
  { value: 'bold', label: 'Bold' },
  { value: 'mysterious', label: 'Mysterious' },
  { value: 'energetic', label: 'Energetic' },
];

export const COLOR_PALETTES = [
  { value: 'neon', label: 'Neon' },
  { value: 'earth tones', label: 'Earth Tones' },
  { value: 'monochrome', label: 'Monochrome' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'dark and gold', label: 'Dark & Gold' },
  { value: 'ocean blue', label: 'Ocean Blue' },
  { value: 'forest green', label: 'Forest Green' },
];

export function buildPrompt(fields: Partial<BuilderFields>): string {
  const { subject, style, mood, colorPalette, niche } = fields;
  if (!subject) return '';

  const parts: string[] = [`A high-quality merch design featuring ${subject}`];
  if (style) parts.push(`${style} aesthetic`);
  if (mood) parts.push(`${mood} mood`);
  if (colorPalette) parts.push(`${colorPalette} color palette`);
  if (niche && niche !== 'general') parts.push(`perfect for the ${niche} niche`);
  parts.push('clean composition, print-ready');

  return parts.join(', ') + '.';
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```

Expected: build completes with no type errors in `promptBuilder.ts`. (Other pre-existing errors are fine.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/promptBuilder.ts
git commit -m "feat: add promptBuilder lib with field config and buildPrompt()"
```

---

## Task 2: Create `/api/studio/enhance-prompt` Route

**Files:**
- Create: `src/app/api/studio/enhance-prompt/route.ts`

- [ ] **Step 1: Create the API route**

Create `src/app/api/studio/enhance-prompt/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```

Expected: no new type errors.

- [ ] **Step 3: Smoke-test the endpoint against the running container**

Rebuild and restart the container first:
```bash
cd apps/frontend && sudo docker stop ai-merch-frontend && sudo docker rm ai-merch-frontend
sudo docker build -t ai-merch-store:latest .
sudo docker run -d --name ai-merch-frontend -p 3000:3000 --env-file /home/jrwldjr/Project_AI_Merch/apps/frontend/.env.production ai-merch-store:latest
```

Then test:
```bash
curl -s -X POST https://ai-merch.jjrsguide.com/api/studio/enhance-prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A high-quality merch design featuring golden retriever, kawaii / cute aesthetic, cute mood, pastel color palette, print-ready."}' | python3 -m json.tool
```

Expected: `{ "enhancedPrompt": "<expanded prompt string>" }`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/studio/enhance-prompt/route.ts
git commit -m "feat: add /api/studio/enhance-prompt route using GPT-4.1-mini"
```

---

## Task 3: Update `generate/page.tsx` with Builder UI

**Files:**
- Modify: `src/app/studio/generate/page.tsx`

- [ ] **Step 1: Replace the page with the updated version**

Replace the full contents of `src/app/studio/generate/page.tsx`:

```typescript
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  BuilderFields,
  NICHES,
  SUBJECTS_BY_NICHE,
  STYLE_TAGS,
  MOODS,
  COLOR_PALETTES,
  buildPrompt,
} from '@/lib/promptBuilder';
import { PROMPT_TEMPLATES } from '@/lib/promptTemplates';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type GeneratedAsset = {
  id: string;
  title: string;
  niche: string;
  imageUrl: string;
};

const EMPTY_FIELDS: BuilderFields = {
  niche: '',
  subject: '',
  style: '',
  mood: '',
  colorPalette: '',
};

export default function GenerateAssetPage() {
  const [fields, setFields] = useState<BuilderFields>(EMPTY_FIELDS);
  const [subjectCustom, setSubjectCustom] = useState('');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [count, setCount] = useState<number>(1);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const subjectValue = subjectCustom.trim() || fields.subject;
  const effectiveFields = { ...fields, subject: subjectValue };

  function updateField(key: keyof BuilderFields, value: string) {
    const updated = { ...fields, [key]: value };
    if (key === 'niche') {
      updated.subject = '';
      setSubjectCustom('');
    }
    setFields(updated);
    const assembled = buildPrompt({ ...updated, subject: key === 'niche' ? '' : (subjectCustom.trim() || updated.subject) });
    if (assembled) setPrompt(assembled);
  }

  function updateSubjectDropdown(value: string) {
    setSubjectCustom('');
    const updated = { ...fields, subject: value };
    setFields(updated);
    const assembled = buildPrompt({ ...updated, subject: value });
    if (assembled) setPrompt(assembled);
  }

  function updateSubjectCustom(value: string) {
    setSubjectCustom(value);
    const assembled = buildPrompt({ ...fields, subject: value.trim() || fields.subject });
    if (assembled) setPrompt(assembled);
  }

  async function handleEnhance() {
    if (!prompt.trim()) return;
    setEnhancing(true);
    setEnhanceError(null);
    try {
      const res = await fetch('/api/studio/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enhance failed');
      setPrompt(data.enhancedPrompt);
    } catch (err: unknown) {
      setEnhanceError(err instanceof Error ? err.message : 'Enhance failed');
    } finally {
      setEnhancing(false);
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setError(null);
    setLoading(true);
    setGeneratedAssets([]);

    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          title: title || prompt.slice(0, 60),
          niche: effectiveFields.niche || 'general',
          count,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Generation failed');
      }

      const data = await res.json();
      setGeneratedAssets(data.assets ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const subjectOptions = fields.niche ? (SUBJECTS_BY_NICHE[fields.niche] ?? []) : [];
  const canEnhance = !!prompt.trim() && !enhancing;

  return (
    <div className="flex flex-1 flex-col">
      {/* Page header */}
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">AI Studio</p>
        <h1 className="text-2xl font-black text-primary">Generate</h1>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 flex-col lg:flex-row">

        {/* LEFT: Control panel */}
        <aside className="w-full shrink-0 border-b border-white/5 p-6 lg:w-96 lg:self-start lg:sticky lg:top-16 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="mb-6 border-b border-white/10">
            <span className="inline-block border-b-2 border-accent pb-2 text-sm font-semibold text-primary">
              Generate
            </span>
          </div>

          <div className="flex flex-col gap-5">
            <Input
              label="Title"
              placeholder="Name your design…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {/* Builder: Niche */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Niche</label>
              <select
                value={fields.niche}
                onChange={(e) => updateField('niche', e.target.value)}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="" className="bg-secondary">-- Select Niche --</option>
                {NICHES.map((n) => (
                  <option key={n.value} value={n.value} className="bg-secondary">{n.label}</option>
                ))}
              </select>
            </div>

            {/* Builder: Subject */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Subject</label>
              {subjectOptions.length > 0 && (
                <select
                  value={fields.subject}
                  onChange={(e) => updateSubjectDropdown(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="" className="bg-secondary">-- Pick a subject --</option>
                  {subjectOptions.map((s) => (
                    <option key={s} value={s} className="bg-secondary">{s}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={subjectCustom}
                onChange={(e) => updateSubjectCustom(e.target.value)}
                placeholder={subjectOptions.length > 0 ? 'Or type your own…' : 'e.g. wolf howling at moon'}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            {/* Builder: Style */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Style</label>
              <select
                value={fields.style}
                onChange={(e) => updateField('style', e.target.value)}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="" className="bg-secondary">-- Select Style --</option>
                {STYLE_TAGS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-secondary">{s.label}</option>
                ))}
              </select>
            </div>

            {/* Builder: Mood */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Mood</label>
              <select
                value={fields.mood}
                onChange={(e) => updateField('mood', e.target.value)}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="" className="bg-secondary">-- Select Mood --</option>
                {MOODS.map((m) => (
                  <option key={m.value} value={m.value} className="bg-secondary">{m.label}</option>
                ))}
              </select>
            </div>

            {/* Builder: Color Palette */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Color Palette</label>
              <select
                value={fields.colorPalette}
                onChange={(e) => updateField('colorPalette', e.target.value)}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="" className="bg-secondary">-- Select Palette --</option>
                {COLOR_PALETTES.map((c) => (
                  <option key={c.value} value={c.value} className="bg-secondary">{c.label}</option>
                ))}
              </select>
            </div>

            {/* Quick Templates */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none text-muted">Quick Templates</label>
              <select
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  const tmpl = PROMPT_TEMPLATES.find((t) => t.id === id);
                  if (tmpl) {
                    setPrompt(tmpl.build({ subject: 'a mountain', animal: 'a fox', character: 'a robot', theme: 'a forest at sunset' }));
                    setFields(EMPTY_FIELDS);
                    setSubjectCustom('');
                  }
                }}
                className="flex h-10 w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="" className="bg-secondary">-- Use a template --</option>
                {PROMPT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-secondary">{t.label}</option>
                ))}
              </select>
            </div>

            {/* Count */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Number of images</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={count}
                  onChange={(e) => setCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
                  className="h-10 w-20 rounded-md border border-white/20 bg-transparent px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <span className="text-xs text-muted">1–8 images</span>
              </div>
            </div>

            {/* Prompt textarea */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="Fill the fields above or write your own prompt…"
                className="flex w-full resize-none rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            {/* Enhance button */}
            <Button
              onClick={handleEnhance}
              disabled={!canEnhance}
              variant="secondary"
              className="w-full"
            >
              {enhancing ? 'Enhancing…' : 'Enhance Prompt ✦'}
            </Button>
            {enhanceError && <p className="text-sm text-yellow-400">{enhanceError} — you can still generate.</p>}

            <Button
              onClick={handleGenerate}
              disabled={loading}
              variant="primary"
              className="w-full"
              size="lg"
            >
              {loading ? `Generating ${count} image(s)…` : `Generate ${count} image(s)`}
            </Button>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </aside>

        {/* RIGHT: Results panel */}
        <section className="flex-1 p-6">
          {generatedAssets.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
              <svg
                className="h-10 w-10 text-accent/40"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              <p className="text-sm font-medium text-primary">Your designs will appear here</p>
              <p className="text-xs text-muted">
                Choose a niche and subject, then hit Generate
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-muted">
                {generatedAssets.length} design{generatedAssets.length !== 1 ? 's' : ''} generated
              </p>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {generatedAssets.map((asset) => (
                  <article
                    key={asset.id}
                    className="overflow-hidden rounded-lg border border-white/10 bg-secondary"
                  >
                    <div className="relative aspect-square overflow-hidden bg-background">
                      <Image
                        src={asset.imageUrl}
                        alt={asset.title}
                        fill
                        className="object-cover"
                      />
                      <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-accent">
                        Saved ✓
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-primary">{asset.title}</p>
                      {asset.niche && (
                        <p className="mt-0.5 text-xs text-muted">{asset.niche}</p>
                      )}
                      <Link
                        href={`/studio/apply?assetId=${asset.id}`}
                        className="mt-2 block w-full rounded-md bg-accent/10 px-3 py-1.5 text-center text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                      >
                        Apply to Product →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles and lint passes**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/studio/generate/page.tsx
git commit -m "feat: replace template dropdown with guided 5-field prompt builder + enhance button"
```

---

## Task 4: Deploy and Verify

- [ ] **Step 1: Rebuild and restart the container**

```bash
cd apps/frontend
sudo docker stop ai-merch-frontend && sudo docker rm ai-merch-frontend
sudo docker build -t ai-merch-store:latest .
sudo docker run -d --name ai-merch-frontend -p 3000:3000 --env-file /home/jrwldjr/Project_AI_Merch/apps/frontend/.env.production ai-merch-store:latest
sudo docker logs ai-merch-frontend --tail=20
```

Expected: "Ready" in logs, no startup errors.

- [ ] **Step 2: Manual browser verification**

Open `https://ai-merch.jjrsguide.com/studio/generate` and verify:

1. Left panel shows: Niche, Subject, Style, Mood, Color Palette dropdowns + Quick Templates section
2. Selecting Niche populates Subject dropdown with relevant options
3. Filling Subject (dropdown or free text) auto-populates the prompt textarea
4. Changing any field updates the prompt textarea in real time
5. "Enhance Prompt ✦" button is disabled when textarea is empty, enabled when filled
6. Clicking Enhance replaces textarea content with a richer prompt
7. If Enhance fails (e.g. disconnect network): yellow warning shows, textarea unchanged, Generate still works
8. Generate button produces images as before

- [ ] **Step 3: Final commit tag**

```bash
git tag sprint-8-prompt-builder
```
