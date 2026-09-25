import React from 'react';

interface PanelProps {
  title?: string;
  icon?: React.ReactNode;
  /** Colour of the corner brackets and title icon. */
  accent?: string;
  right?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}

export const Panel: React.FC<PanelProps> = ({ title, icon, accent = '#34d399', right, className = '', bodyClassName = 'p-4', children, ref }) => (
  <section ref={ref} className={`hud-panel ${className}`} style={{ '--panel-accent': accent } as React.CSSProperties}>
    {title && (
      <header className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <span style={{ color: accent }} className="flex">{icon}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">{title}</h2>
        {right && <div className="ml-auto flex items-center">{right}</div>}
      </header>
    )}
    {children && <div className={bodyClassName}>{children}</div>}
  </section>
);
