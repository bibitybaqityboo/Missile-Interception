import React, { useEffect, useRef, useState } from 'react';
import { analyzeEngagement, isAdvisorAvailable } from '../services/geminiService';
import { SimulationConfig, SimulationStats, SimulationStatus } from '../types';
import { Bot, ClipboardList, Loader2, Sparkles } from 'lucide-react';
import { Panel } from './Panel';

interface AnalysisPanelProps {
  config: SimulationConfig;
  stats: SimulationStats;
}

const OUTCOME = {
  [SimulationStatus.HIT]: { label: 'Splash', className: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/40', accent: '#34d399' },
  [SimulationStatus.MISS]: { label: 'Miss', className: 'bg-rose-400/15 text-rose-300 border-rose-400/40', accent: '#fb7185' },
  [SimulationStatus.CRASH]: { label: 'Lost', className: 'bg-amber-400/15 text-amber-300 border-amber-400/40', accent: '#fbbf24' },
} as const;

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between border-b border-white/5 py-1.5 last:border-0">
    <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</span>
    <span className="font-mono text-xs tabular-nums text-slate-200">{value}</span>
  </div>
);

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ config, stats }) => {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const outcome = OUTCOME[stats.outcome as keyof typeof OUTCOME] ?? OUTCOME[SimulationStatus.MISS];
  const advisor = isAdvisorAvailable();

  // On short screens the debrief lands below the fold; bring it into view when it appears.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      setAnalysis(await analyzeEngagement(config, stats));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel
      ref={rootRef}
      title="Debrief"
      icon={<ClipboardList size={14} />}
      accent={outcome.accent}
      className="banner-in shrink-0"
      right={
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${outcome.className}`}>
          {outcome.label}
        </span>
      }
    >
      <Row label="Flight time" value={`${stats.timeElapsed.toFixed(2)} s`} />
      <Row label="Closest approach" value={`${stats.closestApproach.toFixed(1)} m`} />
      <Row label="Final separation" value={`${stats.distanceToTarget.toFixed(1)} m`} />
      <Row label="Speed advantage" value={`${(config.missileSpeed / config.targetSpeed).toFixed(2)}×`} />

      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
          <Bot size={13} /> Tactical advisor
        </span>
        {advisor && (
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex items-center gap-1.5 rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {analysis ? 'Re-assess' : 'Analyze'}
          </button>
        )}
      </div>

      <div className="mt-2 min-h-[56px] rounded-md border border-white/5 bg-slate-900/60 p-3 font-mono text-xs leading-relaxed text-slate-300">
        {!advisor ? (
          <span className="text-slate-500">
            Advisor offline. Add <code className="text-slate-300">GEMINI_API_KEY</code> to <code className="text-slate-300">.env.local</code> for an AI assessment.
          </span>
        ) : loading ? (
          <span className="animate-pulse text-emerald-400/70">Computing flight telemetry…</span>
        ) : analysis ? (
          analysis
        ) : (
          <span className="text-slate-500">Ready for post-flight analysis.</span>
        )}
      </div>
    </Panel>
  );
};
