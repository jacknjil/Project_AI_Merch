'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { PROMPT_TEMPLATES } from '@/lib/promptTemplates';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type GeneratedAsset = {
  id: string;
  title: string;
  niche: string;
  imageUrl: string;
};

export default function GenerateAssetPage() {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [count, setCount] = useState<number>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setError(null);
    setLoading(true);
    setGeneratedAssets([]);

    try {
      const res = await fetch('/api/generate-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          title: title || prompt.slice(0, 60),
          niche: niche || 'general',
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
          {/* Tab-bar slot — add future tabs (Settings, History) here */}
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

            <Input
              label="Niche"
              placeholder="e.g. 80s-retro, kawaii-animals"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />

            {/* Template selector */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Prompt Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedTemplate(id);
                  const tmpl = PROMPT_TEMPLATES.find((t) => t.id === id);
                  if (tmpl) {
                    setPrompt(
                      tmpl.build({
                        subject: 'a mountain',
                        animal: 'a fox',
                        character: 'a robot',
                        theme: 'a forest at sunset',
                      })
                    );
                  }
                }}
                className="flex h-10 w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="" className="bg-secondary">-- Select Template --</option>
                {PROMPT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-secondary">
                    {t.label}
                  </option>
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
                  onChange={(e) =>
                    setCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="h-10 w-20 rounded-md border border-white/20 bg-transparent px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <span className="text-xs text-muted">1–8 images</span>
              </div>
            </div>

            {/* Prompt */}
            <div className="w-full space-y-1">
              <label className="text-sm font-medium leading-none">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="Describe the design(s) you want to generate…"
                className="flex w-full resize-none rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading}
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
            /* Empty state — rendered on load so no layout shift when results arrive */
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
                Choose a template or write a prompt, then hit Generate
              </p>
            </div>
          ) : (
            /* Results grid */
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
                    {/* Image with Saved badge */}
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
                    {/* Card info */}
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-primary">{asset.title}</p>
                      {asset.niche && (
                        <p className="mt-0.5 text-xs text-muted">{asset.niche}</p>
                      )}
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
