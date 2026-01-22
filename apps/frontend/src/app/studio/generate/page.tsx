'use client';

import React, { useState } from 'react';
import { PROMPT_TEMPLATES } from '@/lib/promptTemplates';
import Image from 'next/image';

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
        headers: {
          'Content-Type': 'application/json',
        },
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
      const assets: GeneratedAsset[] = data.assets ?? [];
      setGeneratedAssets(assets);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1>AI Asset Generator (Batch)</h1>
      <p style={{ color: '#9ca3af' }}>
        Use a template or custom prompt to generate multiple designs at once.
        All images are uploaded to Storage and registered in your{' '}
        <code>assets</code> collection.
      </p>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Title */}
        <label>
          Title (optional):
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        {/* Niche */}
        <label>
          Niche (optional, e.g. 80s-retro&quot;, kawaii-animals&quot;):
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        {/* Template selector */}
        <label>
          Prompt Template:
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
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          >
            <option value="">-- Select Template --</option>
            {PROMPT_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/* Batch size */}
        <label>
          Number of images:
          <input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) =>
              setCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))
            }
            style={{ width: 100, padding: 8, marginTop: 4 }}
          />
          <span style={{ marginLeft: 8, fontSize: '0.9rem', color: '#9ca3af' }}>
            (1–8, keep small while testing)
          </span>
        </label>

        {/* Prompt textarea */}
        <label>
          Prompt:
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            style={{ width: '100%', padding: 8, marginTop: 4 }}
            placeholder="Describe the design(s) you want to generate..."
          />
        </label>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            marginTop: 8,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #1f2937',
            background: loading ? '#374151' : '#2563eb',
            color: 'white',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading
            ? `Generating ${count} image(s)...`
            : `Generate ${count} image(s)`}
        </button>

        {error && <p style={{ color: '#f87171', marginTop: 8 }}>{error}</p>}

        {/* Results grid */}
        {generatedAssets.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ marginBottom: 8 }}>
              Generated {generatedAssets.length} asset
              {generatedAssets.length > 1 ? 's' : ''} (also saved to Gallery):
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              {generatedAssets.map((asset) => (
                <div
                  key={asset.id}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #1f2937',
                    background: '#020617',
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 8,
                      overflow: 'hidden',
                      marginBottom: 6,
                      background: '#111827',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Image
                      src={asset.imageUrl}
                      alt={asset.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.85rem',
                    }}
                  >
                    {asset.title}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                    }}
                  >
                    {asset.niche}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
