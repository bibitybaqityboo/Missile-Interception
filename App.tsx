import React, { useCallback, useEffect, useState } from 'react';
import { Scene3D } from './components/Scene3D';
import { AnalysisPanel } from './components/AnalysisPanel';
import { CameraBar } from './components/CameraBar';
import { ControlPanel } from './components/ControlPanel';
import { ResultBanner } from './components/ResultBanner';
import { TelemetryPanel } from './components/TelemetryPanel';
import { SimulationConfig, SimulationStatus, SimulationStats, HistoryPoint, CameraMode } from './types';
import { INITIAL_CONFIG, isTerminal } from './simulation';
import { initAudio, isMuted, setMuted, sfx } from './services/audio';
import { Crosshair, Volume2, VolumeX } from 'lucide-react';

const STATUS_STYLE: Record<SimulationStatus, { label: string; className: string; dot: string }> = {
  [SimulationStatus.IDLE]: { label: 'Standby', className: 'border-slate-600 text-slate-300 bg-slate-900/60', dot: 'bg-slate-500' },
  [SimulationStatus.RUNNING]: { label: 'Engaging', className: 'border-amber-400 text-amber-300 bg-amber-400/10 shadow-[0_0_18px_rgba(245,158,11,0.25)]', dot: 'bg-amber-400 pulse-dot' },
  [SimulationStatus.HIT]: { label: 'Splash', className: 'border-emerald-400 text-emerald-300 bg-emerald-400/10 shadow-[0_0_20px_rgba(16,185,129,0.3)]', dot: 'bg-emerald-400' },
  [SimulationStatus.MISS]: { label: 'Miss', className: 'border-rose-400 text-rose-300 bg-rose-400/10 shadow-[0_0_20px_rgba(244,63,94,0.3)]', dot: 'bg-rose-400' },
  [SimulationStatus.CRASH]: { label: 'Lost', className: 'border-amber-500 text-amber-300 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.3)]', dot: 'bg-amber-500' },
};

const App: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(INITIAL_CONFIG);
  const [status, setStatus] = useState<SimulationStatus>(SimulationStatus.IDLE);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [cameraMode, setCameraMode] = useState<CameraMode>('FREE');
  const [cameraNonce, setCameraNonce] = useState(0);
  const [runId, setRunId] = useState(0);
  const [muted, setMutedState] = useState(isMuted);
  const [panelCollapsed, setPanelCollapsed] = useState(() => window.innerWidth < 640);

  const running = status === SimulationStatus.RUNNING;

  const clearRun = useCallback(() => {
    setHistory([]);
    setStats(null);
    setRunId((id) => id + 1);
  }, []);

  const handleLaunch = useCallback(() => {
    if (running) return;
    initAudio();
    sfx.launch();
    clearRun();
    setStatus(SimulationStatus.RUNNING);
  }, [running, clearRun]);

  const handleReset = useCallback(() => {
    clearRun();
    setStatus(SimulationStatus.IDLE);
  }, [clearRun]);

  // Editing parameters after a run returns to standby so the scene previews the new setup.
  const updateConfig = useCallback(
    (update: (prev: SimulationConfig) => SimulationConfig) => {
      if (running) return;
      setConfig(update);
      if (isTerminal(status)) handleReset();
    },
    [running, status, handleReset],
  );

  const handleParamChange = useCallback(
    (key: keyof SimulationConfig, value: number) => updateConfig((prev) => ({ ...prev, [key]: value })),
    [updateConfig],
  );

  const selectCamera = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    if (mode === 'FREE') setCameraNonce((n) => n + 1);
    sfx.click();
  }, []);

  const toggleMute = useCallback(() => {
    initAudio();
    setMuted(!muted);
    setMutedState(!muted);
  }, [muted]);

  const handleSimulationEnd = useCallback((results: SimulationStats) => {
    setStats(results);
  }, []);

  const handleUpdateHistory = useCallback((point: HistoryPoint) => {
    setHistory((prev) => [...prev, point]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('textarea, [contenteditable="true"], input:not([type="range"])')) return;
      switch (e.code) {
        case 'Space':
        case 'Enter':
          if (el?.closest('button')) return; // let a keyboard-focused button handle its own activation
          e.preventDefault();
          handleLaunch();
          break;
        case 'KeyR':
          handleReset();
          break;
        case 'Digit1':
          selectCamera('FREE');
          break;
        case 'Digit2':
          selectCamera('MISSILE');
          break;
        case 'Digit3':
          selectCamera('TARGET');
          break;
        case 'KeyM':
          toggleMute();
          break;
      }
    };
    // Mouse clicks shouldn't leave buttons focused, or Space would re-press them instead of launching.
    // Keyboard activations (detail === 0) keep focus for keyboard users.
    const onClick = (e: MouseEvent) => {
      if (e.detail > 0) (e.target as HTMLElement | null)?.closest('button')?.blur();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [handleLaunch, handleReset, selectCamera, toggleMute]);

  const statusStyle = STATUS_STYLE[status];
  const lastPoint = history[history.length - 1];

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden bg-[#030712] font-sans text-slate-200">
      {/* 3D Scene Background */}
      <div className="absolute inset-0 z-0">
        <Scene3D
          config={config}
          status={status}
          cameraMode={cameraMode}
          cameraNonce={cameraNonce}
          runId={runId}
          onSimulationEnd={handleSimulationEnd}
          onUpdateHistory={handleUpdateHistory}
          onStatusChange={setStatus}
        />
      </div>

      {/* CRT scanlines + impact flash */}
      <div className="scanlines pointer-events-none absolute inset-0 z-40" />
      {status === SimulationStatus.HIT && (
        <div
          key={runId}
          className="screen-flash pointer-events-none absolute inset-0 z-30"
          style={{ background: 'radial-gradient(circle at center, rgba(254,243,199,0.35), rgba(251,146,60,0.12) 45%, transparent 75%)' }}
        />
      )}

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between bg-linear-to-b from-[#030712]/90 via-[#030712]/40 to-transparent px-4 pb-10 pt-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10">
            <Crosshair className="text-emerald-400" size={20} strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <h1 className="text-lg font-bold tracking-[0.22em] text-white drop-shadow-[0_0_12px_rgba(16,185,129,0.45)] sm:text-xl sm:tracking-[0.3em]">AEROGUARD</h1>
            <p className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500 sm:block">Intercept simulator · v1.1</p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur-sm transition-all duration-300 ${statusStyle.className}`}
            role="status"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
            {statusStyle.label}
            {running && lastPoint && (
              <span className="tracking-normal text-amber-200/80 lg:hidden">· {lastPoint.distance.toFixed(0)} m</span>
            )}
          </div>
          <button
            onClick={toggleMute}
            className="rounded-md border border-white/10 bg-slate-900/60 p-2 text-slate-400 backdrop-blur-sm transition hover:border-white/25 hover:text-slate-200"
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={muted}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </header>

      {/* Left column: parameters */}
      <aside className="absolute left-4 top-20 z-10 flex max-h-[calc(100dvh-12.5rem)] w-[min(20rem,calc(100vw-2rem))] flex-col sm:left-6">
        <ControlPanel
          config={config}
          status={status}
          collapsed={panelCollapsed}
          onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
          onParamChange={handleParamChange}
          onApplyPreset={(preset) => updateConfig(() => preset)}
          onLaunch={handleLaunch}
          onReset={handleReset}
        />
      </aside>

      {/* Right column: telemetry & debrief */}
      <aside className="absolute right-6 top-20 z-10 hidden max-h-[calc(100dvh-12.5rem)] w-80 flex-col gap-3 overflow-y-auto lg:flex">
        <TelemetryPanel config={config} status={status} history={history} />
        {stats && <AnalysisPanel key={runId} config={config} stats={stats} />}
      </aside>

      <ResultBanner stats={stats} />
      <CameraBar mode={cameraMode} onSelect={selectCamera} />
    </div>
  );
};

export default App;
