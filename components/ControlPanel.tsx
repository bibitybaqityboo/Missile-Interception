import React from 'react';
import { ChevronDown, Lock, RotateCcw, Rocket, SlidersHorizontal } from 'lucide-react';
import { SimulationConfig, SimulationStatus } from '../types';
import { PARAMS, PRESETS, ParamSpec, isTerminal } from '../simulation';
import { Panel } from './Panel';

interface ControlPanelProps {
  config: SimulationConfig;
  status: SimulationStatus;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onParamChange: (key: keyof SimulationConfig, value: number) => void;
  onApplyPreset: (config: SimulationConfig) => void;
  onLaunch: () => void;
  onReset: () => void;
}

const sameConfig = (a: SimulationConfig, b: SimulationConfig) =>
  (Object.keys(a) as (keyof SimulationConfig)[]).every((k) => a[k] === b[k]);

const ParamSlider: React.FC<{
  spec: ParamSpec;
  config: SimulationConfig;
  locked: boolean;
  onChange: (value: number) => void;
}> = ({ spec, config, locked, onChange }) => {
  const value = config[spec.key];
  const fill = ((value - spec.min) / (spec.max - spec.min)) * 100;
  const id = `param-${spec.key}`;
  return (
    <div className={`transition-opacity ${locked ? 'opacity-45' : ''}`}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          {spec.label}
        </label>
        <span className="font-mono text-sm tabular-nums" style={{ color: spec.accent }}>
          {value}
          <span className="ml-1 text-[10px] text-slate-500">{spec.unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider mt-1"
        style={{ '--fill': `${fill}%`, '--accent': spec.accent } as React.CSSProperties}
      />
      <div className="font-mono text-[10px] text-slate-500">{spec.hint(value, config)}</div>
    </div>
  );
};

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config, status, collapsed, onToggleCollapsed, onParamChange, onApplyPreset, onLaunch, onReset,
}) => {
  const running = status === SimulationStatus.RUNNING;
  const launchLabel = running ? 'Engaging…' : isTerminal(status) ? 'Re-engage' : 'Launch';

  return (
    <Panel
      title="Engagement parameters"
      icon={<SlidersHorizontal size={14} />}
      className="flex min-h-0 flex-col"
      bodyClassName="flex min-h-0 flex-col p-4"
      right={
        <button
          onClick={onToggleCollapsed}
          className="-mr-1 rounded p-1 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
          aria-label={collapsed ? 'Expand parameters' : 'Collapse parameters'}
          aria-expanded={!collapsed}
        >
          <ChevronDown size={16} className={`transition-transform duration-300 ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      }
    >
      {/* Only the parameters scroll, so the launch controls stay reachable on short screens. */}
      <div
        className={`grid min-h-0 transition-[grid-template-rows,opacity] duration-300 ease-out ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
      >
        <div className={`scroll-fade -mr-2 min-h-0 pr-2 ${collapsed ? 'overflow-hidden' : 'overflow-y-auto'}`} inert={collapsed}>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const active = sameConfig(preset.config, config);
              return (
                <button
                  key={preset.name}
                  onClick={() => onApplyPreset(preset.config)}
                  disabled={running}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
                      : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200'
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          <div className="space-y-3.5">
            {PARAMS.map((spec) => (
              <ParamSlider key={spec.key} spec={spec} config={config} locked={running} onChange={(v) => onParamChange(spec.key, v)} />
            ))}
          </div>

          {running && (
            <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-400/80">
              <Lock size={11} /> Parameters locked during flight
            </div>
          )}
          <div className="h-5" />
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          onClick={onLaunch}
          disabled={running}
          className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-md bg-emerald-500 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-950 shadow-[0_0_24px_-4px_rgba(16,185,129,0.7)] transition hover:bg-emerald-400 hover:shadow-[0_0_30px_-2px_rgba(52,211,153,0.8)] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-amber-300 disabled:shadow-none"
        >
          <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/25 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100 group-disabled:hidden" />
          {running ? <span className="pulse-dot h-2 w-2 rounded-full bg-amber-400" /> : <Rocket size={14} strokeWidth={2.5} />}
          {launchLabel}
        </button>
        <button
          onClick={onReset}
          disabled={status === SimulationStatus.IDLE}
          title="Reset (R)"
          aria-label="Reset simulation"
          className="rounded-md border border-white/10 bg-slate-800/80 px-3.5 text-slate-300 transition hover:border-white/25 hover:bg-slate-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      <div className="mt-3 hidden shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] uppercase tracking-wider text-slate-500 sm:flex">
        <span className="flex items-center gap-1"><span className="kbd">Space</span> launch</span>
        <span className="flex items-center gap-1"><span className="kbd">R</span> reset</span>
        <span className="flex items-center gap-1"><span className="kbd">1</span><span className="kbd">2</span><span className="kbd">3</span> camera</span>
        <span className="flex items-center gap-1"><span className="kbd">M</span> mute</span>
      </div>
    </Panel>
  );
};
