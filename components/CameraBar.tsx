import React from 'react';
import { Globe, Rocket, Target } from 'lucide-react';
import { CameraMode } from '../types';

const MODES: { mode: CameraMode; label: string; key: string; icon: React.ReactNode; active: string }[] = [
  { mode: 'FREE', label: 'Orbit', key: '1', icon: <Globe size={18} />, active: 'border-emerald-400/70 bg-emerald-400/10 text-emerald-300' },
  { mode: 'MISSILE', label: 'Chase', key: '2', icon: <Rocket size={18} />, active: 'border-amber-400/70 bg-amber-400/10 text-amber-300' },
  { mode: 'TARGET', label: 'Bogey', key: '3', icon: <Target size={18} />, active: 'border-rose-400/70 bg-rose-400/10 text-rose-300' },
];

interface CameraBarProps {
  mode: CameraMode;
  onSelect: (mode: CameraMode) => void;
}

export const CameraBar: React.FC<CameraBarProps> = ({ mode, onSelect }) => (
  <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6">
    <div className="hud-panel flex gap-1.5 p-1.5" role="radiogroup" aria-label="Camera">
      {MODES.map((m) => {
        const active = m.mode === mode;
        return (
          <button
            key={m.mode}
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(m.mode)}
            title={m.mode === 'FREE' && active ? 'Recenter overview (1)' : `${m.label} camera (${m.key})`}
            className={`relative flex min-w-[72px] flex-col items-center gap-1 rounded-md border px-3 py-2 transition active:scale-95 ${
              active ? m.active : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {m.icon}
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">{m.label}</span>
            <span className="absolute right-1 top-1 hidden font-mono text-[8px] text-slate-600 sm:block">{m.key}</span>
          </button>
        );
      })}
    </div>
    <p className="hidden font-mono text-[10px] tracking-wider text-slate-500 [text-shadow:0_1px_2px_#000] sm:block">
      {mode === 'FREE' ? 'Drag to orbit · Right-drag to pan · Scroll to zoom' : 'Camera locked · press 1 for free orbit'}
    </p>
  </div>
);
