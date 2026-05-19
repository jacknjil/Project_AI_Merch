// src/components/BentoGrid.tsx
import React from 'react';

// Updated BentoItem inside src/components/BentoGrid.tsx
export const BentoItem = ({
  children,
  title,
  isHero = false,
  className = '',
}: {
  children: React.ReactNode;
  title?: string;
  isHero?: boolean;
  className?: string;
}) => {
  return (
    <div
      className={`
      p-6 rounded-lg border-3 border-accent 
      bg-secondary transition-all hover:shadow-[0_0_15px_rgba(0,255,65,0.3)]
      ${isHero ? 'md:col-span-2' : 'col-span-1'} 
      ${className}
    `}
    >
      {title && (
        <h3 className="font-(--font-heading) mb-4 text-xl uppercase tracking-wider">
          {title}
        </h3>
      )}
      <div className="font-(--font-body)">{children}</div>
    </div>
  );
};

export const BentoGrid = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={`
      grid grid-cols-1 md:grid-cols-3 gap-6 
      p-6 min-h-screen w-full max-w-7xl mx-auto
      ${className}
    `}
    >
      {children}
    </div>
  );
};
