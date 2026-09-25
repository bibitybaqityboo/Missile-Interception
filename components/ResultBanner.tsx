import React from 'react';
import { EndReason, SimulationStats, SimulationStatus } from '../types';

const HEADLINE: Record<string, { title: string; color: string; glow: string }> = {
  [SimulationStatus.HIT]: { title: 'Target destroyed', color: 'text-emerald-300', glow: 'rgba(52,211,153,0.55)' },
  [SimulationStatus.MISS]: { title: 'Intercept failed', color: 'text-rose-300', glow: 'rgba(251,113,133,0.55)' },
  [SimulationStatus.CRASH]: { title: 'Interceptor lost', color: 'text-amber-300', glow: 'rgba(251,191,36,0.5)' },
};

const detail = (reason: EndReason, stats: SimulationStats) => {
  const t = `T+${stats.timeElapsed.toFixed(1)} s`;
  switch (reason) {
    case 'intercept': return `Proximity fuze at ${stats.closestApproach.toFixed(1)} m · ${t}`;
    case 'timeout': return `Fuel exhausted, self-destruct · closest pass ${stats.closestApproach.toFixed(1)} m`;
    case 'escaped': return `Bogey opened the range · closest pass ${stats.closestApproach.toFixed(1)} m`;
    case 'debris': return `Collided with debris · ${t}`;
    case 'ground': return `Ground impact · ${t}`;
  }
};

export const ResultBanner: React.FC<{ stats: SimulationStats | null }> = ({ stats }) => {
  if (!stats) return null;
  const headline = HEADLINE[stats.outcome];
  if (!headline) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-32 z-20 flex justify-center px-4 sm:bottom-auto sm:left-[21.5rem] sm:top-20 lg:left-0">
      <div className="banner-in text-center" role="status">
        <div
          className={`text-2xl font-bold uppercase tracking-[0.25em] md:text-3xl xl:text-4xl ${headline.color}`}
          style={{ textShadow: `0 0 28px ${headline.glow}, 0 2px 4px rgba(0,0,0,0.8)` }}
        >
          {headline.title}
        </div>
        <div className="mt-2 font-mono text-xs tracking-wider text-slate-300/90 [text-shadow:0_1px_3px_#000]">
          {detail(stats.reason, stats)}
        </div>
        <div className="mt-3 hidden items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400 sm:flex">
          <span className="kbd">Space</span> re-engage
          <span className="kbd">R</span> reset
        </div>
      </div>
    </div>
  );
};
