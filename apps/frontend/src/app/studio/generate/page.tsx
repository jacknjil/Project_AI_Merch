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

  function updateField(key: keyof BuilderFields, value: string, currentSubjectCustom: string) {
    const updated = { ...fields, [key]: value };
    if (key === 'niche') {
      updated.subject = '';
      setSubjectCustom('');
    }
    setFields(updated);
    const assembled = buildPrompt({
      ...updated,
      subject: key === 'niche' ? '' : (currentSubjectCustom.trim() || updated.subject),
    });
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
              <label htmlFor="niche" className="text-sm font-medium leading-none">Niche</label>
              <select
                id="niche"
                value={fields.niche}
                onChange={(e) => updateField('niche', e.target.value, subjectCustom)}
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
              <label htmlFor="subject" className="text-sm font-medium leading-none">Subject</label>
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
                id="subject"
                type="text"
                value={subjectCustom}
                onChange={(e) => updateSubjectCustom(e.target.value)}
                placeholder={subjectOptions.length > 0 ? 'Or type your own…' : 'e.g. wolf howling at moon'}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            {/* Builder: Style */}
            <div className="w-full space-y-1">
              <label htmlFor="style" className="text-sm font-medium leading-none">Style</label>
              <select
                id="style"
                value={fields.style}
                onChange={(e) => updateField('style', e.target.value, subjectCustom)}
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
              <label htmlFor="mood" className="text-sm font-medium leading-none">Mood</label>
              <select
                id="mood"
                value={fields.mood}
                onChange={(e) => updateField('mood', e.target.value, subjectCustom)}
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
              <label htmlFor="colorPalette" className="text-sm font-medium leading-none">Color Palette</label>
              <select
                id="colorPalette"
                value={fields.colorPalette}
                onChange={(e) => updateField('colorPalette', e.target.value, subjectCustom)}
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
                onChange={(e) => { setPrompt(e.target.value); setEnhanceError(null); }}
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
