'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

export type MockupImage = { src: string; label: string; isDefault: boolean };

interface ProductTileImageProps {
  mockupImages?: MockupImage[];
  fallbackSrc: string | null;
  alt: string;
}

const CYCLE_INTERVAL_MS = 1500;

export default function ProductTileImage({ mockupImages, fallbackSrc, alt }: ProductTileImageProps) {
  const images = mockupImages && mockupImages.length > 1 ? mockupImages : null;
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function handleMouseEnter() {
    if (!images) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, CYCLE_INTERVAL_MS);
  }

  function handleMouseLeave() {
    if (!images) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setActiveIndex(0);
  }

  function handleClick() {
    if (!images) return;
    setActiveIndex((prev) => (prev + 1) % images.length);
  }

  const displayedSrc = images ? images[activeIndex].src : fallbackSrc;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        borderRadius: 10,
        border: '1px solid #111827',
        overflow: 'hidden',
        background: '#020617',
        aspectRatio: '1 / 1',
        position: 'relative',
        cursor: images ? 'pointer' : 'default',
      }}
    >
      {displayedSrc ? (
        <Image
          src={displayedSrc}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
            color: '#6b7280',
            textAlign: 'center',
            padding: 8,
          }}
        >
          No image yet
        </span>
      )}

      {images && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {images.map((img, i) => (
            <span
              key={img.src}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: i === activeIndex ? '#e5e7eb' : 'rgba(229, 231, 235, 0.35)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
