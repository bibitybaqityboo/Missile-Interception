import React from 'react';
import { Activity } from 'lucide-react';
import { HistoryPoint, SimulationConfig, SimulationStatus } from '../types';
import { KILL_RADIUS, LAUNCH_HEIGHT, SPEED_OF_SOUND, initialRange } from '../simulation';
import { DistanceChart } from './DistanceChart';
import { Panel } from './Panel';

interface TelemetryPanelProps {
  config: SimulationConfig;
  status: SimulationStatus;
  history: HistoryPoint[];
}

const Readout: React.FC<{ label: string; value: string; unit?: string; tone?: string }> = ({ label, value, unit, tone = 'text-slate-100' }) => (
  <div className="rounded-md border border-white/5 bg-slate-900/50 px-2.5 py-2">
    <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className={`mt-0.5 font-mono text-lg leading-none tabular-nums ${tone}`}>
      {value}
      {unit && <span className="ml-1 text-[10px] text-slate-500">{unit}</span>}
    </div>
  </div>
);

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ config, status, history }) => {
  const start = initialRange(config);
  const last = history[history.length - 1];
  const live = status === SimulationStatus.RUNNING;

  const range = last?.distance ?? start;
  const closing = last?.closingSpeed ?? 0;
  const timeToGo = live && closing > 1 ? Math.max(0, (range - KILL_RADIUS) / closing) : null;
  const progress = Math.min(1, Math.max(0, 1 - (range - KILL_RADIUS) / (start - KILL_RADIUS)));

  return (
    <Panel
      title="Telemetry"
      icon={<Activity size={14} />}
      right={
        <span className={`flex items-center gap-1.5 font-mono text-[10px] tracking-wider ${live ? 'text-amber-300' : 'text-slate-500'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'pulse-dot bg-amber-400' : 'bg-slate-600'}`} />
          {live ? 'LIVE' : 'STANDBY'}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Readout label="Mission time" value={`T+${(last?.time ?? 0).toFixed(1)}`} unit="s" />
        <Readout label="Range" value={range.toFixed(0)} unit="m" tone="text-sky-300" />
        <Readout
          label="Closing"
          value={last ? closing.toFixed(0) : '—'}
          unit={last ? 'm/s' : undefined}
          tone={closing < 0 ? 'text-rose-300' : 'text-emerald-300'}
        />
        <Readout label="Time to go" value={timeToGo === null ? '—' : timeToGo.toFixed(1)} unit={timeToGo === null ? undefined : 's'} tone="text-amber-200" />
        <Readout label="Altitude" value={(last?.altitude ?? LAUNCH_HEIGHT).toFixed(0)} unit="m" />
        <Readout label="Airspeed" value={`M${(config.missileSpeed / SPEED_OF_SOUND).toFixed(2)}`} />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[9px] uppercase tracking-[0.18em] text-slate-500">
          <span>Closure</span>
          <span className="font-mono">{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-linear-to-r from-sky-500 to-emerald-400 transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-4 mb-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">Target separation (m)</div>
      <DistanceChart data={history} initialDistance={start} />
    </Panel>
  );
};
