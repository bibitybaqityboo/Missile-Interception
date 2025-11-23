import React, { useState } from 'react';
import { analyzeEngagement } from '../services/geminiService';
import { SimulationConfig, SimulationStats } from '../types';
import { Bot, Loader2, RefreshCw } from 'lucide-react';

interface AnalysisPanelProps {
  config: SimulationConfig;
  stats: SimulationStats | null;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ config, stats }) => {
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!stats) return;
    setLoading(true);
    const result = await analyzeEngagement(config, stats);
    setAnalysis(result);
    setLoading(false);
  };

  if (!stats) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-700 p-4 rounded-lg shadow-xl backdrop-blur-md max-w-sm mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-emerald-400 font-bold flex items-center gap-2">
          <Bot size={18} />
          TACTICAL ADVISOR
        </h3>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded transition flex items-center gap-1 disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {analysis ? 'RE-ASSESS' : 'ANALYZE'}
        </button>
      </div>

      <div className="text-slate-300 text-sm leading-relaxed min-h-[60px] bg-slate-800/50 p-3 rounded border border-slate-700 font-mono">
        {loading ? (
          <span className="animate-pulse text-emerald-500/70">Computing flight telemetry...</span>
        ) : analysis ? (
          analysis
        ) : (
          <span className="text-slate-500 italic">Ready for post-flight analysis.</span>
        )}
      </div>
    </div>
  );
};
