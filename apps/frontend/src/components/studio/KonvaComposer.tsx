'use client';

import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';

interface KonvaComposerProps {
  assetUrl: string;
  productMockupUrl: string;
  stageRef: RefObject<Konva.Stage | null>;
}

const STAGE_SIZE = 600;

function ProductBackground({ url }: { url: string }) {
  const [image, status] = useImage(url, 'anonymous');
  if (status === 'failed') {
    return (
      <KonvaImage
        image={undefined}
        width={STAGE_SIZE}
        height={STAGE_SIZE}
        fill="#1a1a2e"
        listening={false}
      />
    );
  }
  return (
    <KonvaImage
      image={image}
      width={STAGE_SIZE}
      height={STAGE_SIZE}
      listening={false}
    />
  );
}

function DraggableAsset({ url }: { url: string }) {
  const [image, status] = useImage(url, 'anonymous');
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (image && imageRef.current && transformerRef.current) {
      transformerRef.current.nodes([imageRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [image]);

  const size = STAGE_SIZE * 0.4;
  const pos = (STAGE_SIZE - size) / 2;

  if (status === 'failed') {
    return (
      <KonvaImage
        image={undefined}
        x={pos}
        y={pos}
        width={size}
        height={size}
        fill="#2a2a3e"
        stroke="#555"
        strokeWidth={2}
        draggable
      />
    );
  }

  return (
    <>
      <KonvaImage
        ref={imageRef}
        image={image}
        x={pos}
        y={pos}
        width={size}
        height={size}
        draggable
      />
      <Transformer ref={transformerRef} rotateEnabled={false} />
    </>
  );
}

export default function KonvaComposer({
  assetUrl,
  productMockupUrl,
  stageRef,
}: KonvaComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setScale(containerRef.current.offsetWidth / STAGE_SIZE);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-lg border border-white/10"
      style={{ aspectRatio: '1 / 1' }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: STAGE_SIZE,
          height: STAGE_SIZE,
        }}
      >
        <Stage ref={stageRef} width={STAGE_SIZE} height={STAGE_SIZE}>
          <Layer>
            <ProductBackground url={productMockupUrl} />
          </Layer>
          <Layer>
            <DraggableAsset url={assetUrl} />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
