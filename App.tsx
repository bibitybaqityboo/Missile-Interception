import React, { useState, useCallback } from 'react';
import { Scene3D } from './components/Scene3D';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DistanceChart } from './components/DistanceChart';
import { SimulationConfig, SimulationStatus, SimulationStats, HistoryPoint, CameraMode } from './types';
import { Play, RotateCcw, Crosshair, Zap, Settings2, Rocket, Globe, Target } from 'lucide-react';

const INITIAL_CONFIG: SimulationConfig = {
  missileSpeed: 100,
  targetSpeed: 60,
  turnRate: 35,
  targetDistance: 400,
  launchAngle: 45,
};

const App: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(INITIAL_CONFIG);
  const [status, setStatus] = useState<SimulationStatus>(SimulationStatus.IDLE);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [cameraMode, setCameraMode] = useState<CameraMode>('FREE');

  const handleStart = () => {
    setStatus(SimulationStatus.RUNNING);
    setHistory([]);
    setStats(null);
  };

  const handleReset = () => {
    setStatus(SimulationStatus.IDLE);
    setHistory([]);
    setStats(null);
  };

  const handleSimulationEnd = useCallback((results: SimulationStats) => {
    setStats(results);
  }, []);

  const handleUpdateHistory = useCallback((point: HistoryPoint) => {
    setHistory(prev => [...prev, point]);
  }, []);

  const handleConfigChange = (key: keyof SimulationConfig, value: number) => {
    if (status !== SimulationStatus.IDLE) return;
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans select-none">
      {/* CRT Scanline Overlay */}
      <div className="absolute inset-0 z-50 pointer-events-none opacity-[0.03]"
           style={{ background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }} 
      />
      
      {/* 3D Scene Background */}
      <div className="absolute inset-0 z-0">
        <Scene3D 
          config={config} 
          status={status}
          cameraMode={cameraMode}
          onSimulationEnd={handleSimulationEnd}
          onUpdateHistory={handleUpdateHistory}
          onStatusChange={setStatus}
        />
      </div>

      {/* Header Overlay */}
      <div className="absolute top-0 left-0 w-full p-4 pointer-events-none flex justify-between items-start z-10 bg-gradient-to-b from-slate-900 via-slate-900/50 to-transparent pb-12">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">
            <Crosshair className="text-emerald-500" strokeWidth={3} />
            <span className="tracking-widest">AEROGUARD</span> 
            <span className="text-slate-500 text-xs font-mono border border-slate-700 px-2 py-0.5 rounded tracking-normal opacity-70">SYS.V1.0.4</span>
          </h1>
        </div>
        <div className="text-right pointer-events-auto">
          <div className={`text-sm font-bold px-4 py-1.5 rounded-sm border-l-4 backdrop-blur-sm transition-all duration-300 ${
            status === SimulationStatus.RUNNING ? 'border-amber-500 text-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]' :
            status === SimulationStatus.HIT ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.3)]' :
            status === SimulationStatus.MISS ? 'border-red-500 text-red-500 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.3)]' :
            'border-slate-600 text-slate-400 bg-slate-900/50'
          }`}>
             STATUS: <span className="font-mono tracking-widest">{status}</span>
          </div>
        </div>
      </div>

      {/* Left Sidebar - Controls */}
      <div className="absolute top-24 left-6 z-10 w-80 flex flex-col gap-4 pointer-events-none">
        <div className="bg-slate-950/80 border border-slate-800 p-5 rounded-xl shadow-2xl backdrop-blur-md pointer-events-auto relative overflow-hidden group">
          {/* Deco line */}
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-500 to-transparent opacity-50" />
          
          <div className="flex items-center gap-2 mb-5 text-emerald-400/80 border-b border-slate-800 pb-2">
            <Settings2 size={16} />
            <span className="font-bold text-xs tracking-[0.2em] uppercase">Parameters</span>
          </div>
          
          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-mono">
                <span>V_MISSILE (MACH {(config.missileSpeed/340).toFixed(1)})</span>
                <span className="text-emerald-500">{config.missileSpeed} m/s</span>
              </div>
              <input 
                type="range" min="50" max="250" step="5"
                value={config.missileSpeed}
                onChange={(e) => handleConfigChange('missileSpeed', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-colors"
                disabled={status === SimulationStatus.RUNNING}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-mono">
                <span>V_TARGET</span>
                <span className="text-red-400">{config.targetSpeed} m/s</span>
              </div>
              <input 
                type="range" min="10" max="150" step="5"
                value={config.targetSpeed}
                onChange={(e) => handleConfigChange('targetSpeed', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-colors"
                disabled={status === SimulationStatus.RUNNING}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-mono">
                <span>R_INTERCEPT</span>
                <span className="text-blue-400">{config.targetDistance} m</span>
              </div>
              <input 
                type="range" min="100" max="800" step="50"
                value={config.targetDistance}
                onChange={(e) => handleConfigChange('targetDistance', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
                disabled={status === SimulationStatus.RUNNING}
              />
            </div>

             <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-mono">
                <span>MAX_G (TURN)</span>
                <span className="text-purple-400">{config.turnRate}°/s</span>
              </div>
              <input 
                type="range" min="5" max="90" step="1"
                value={config.turnRate}
                onChange={(e) => handleConfigChange('turnRate', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-colors"
                disabled={status === SimulationStatus.RUNNING}
              />
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button 
              onClick={handleStart}
              disabled={status === SimulationStatus.RUNNING}
              className="flex-1 bg-emerald-600/90 hover:bg-emerald-500 text-white py-2.5 rounded shadow-[0_0_15px_rgba(16,185,129,0.4)] font-bold text-xs tracking-widest transition-all flex justify-center items-center gap-2 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed group-hover:scale-[1.02]"
            >
              <Zap size={14} className="fill-current" /> INITIATE
            </button>
            <button 
              onClick={handleReset}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded transition border border-slate-700 hover:border-slate-500"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Telemetry Chart */}
        <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl shadow-xl backdrop-blur-md pointer-events-auto min-h-[150px] relative">
           <div className="absolute top-0 right-0 p-2 opacity-20">
             <Crosshair size={40} />
           </div>
           <DistanceChart data={history} />
        </div>
        
        {/* Gemini Analysis Panel */}
        <div className="pointer-events-auto transition-transform duration-500 ease-out">
          <AnalysisPanel config={config} stats={stats} />
        </div>
      </div>

      {/* Camera Controls Overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto z-20">
         <div className="flex gap-2 bg-slate-950/80 p-2 rounded-xl border border-slate-800 backdrop-blur-md shadow-2xl">
            <button 
              onClick={() => setCameraMode('FREE')}
              className={`p-3 rounded-lg flex flex-col items-center gap-1 min-w-[80px] transition-all border ${cameraMode === 'FREE' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
            >
              <Globe size={20} />
              <span className="text-[10px] font-bold tracking-wider">ORBIT</span>
            </button>
            <button 
              onClick={() => setCameraMode('MISSILE')}
              className={`p-3 rounded-lg flex flex-col items-center gap-1 min-w-[80px] transition-all border ${cameraMode === 'MISSILE' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
            >
              <Rocket size={20} />
              <span className="text-[10px] font-bold tracking-wider">CHASE</span>
            </button>
            <button 
              onClick={() => setCameraMode('TARGET')}
              className={`p-3 rounded-lg flex flex-col items-center gap-1 min-w-[80px] transition-all border ${cameraMode === 'TARGET' ? 'bg-red-500/10 border-red-500 text-red-400' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
            >
              <Target size={20} />
              <span className="text-[10px] font-bold tracking-wider">TARGET</span>
            </button>
         </div>
      </div>

      {/* Right Overlay - Tutorial / Info */}
      <div className="absolute bottom-6 right-6 pointer-events-none text-right z-10">
         <div className="text-slate-600 text-[10px] font-mono tracking-widest bg-slate-950/50 px-2 py-1 rounded backdrop-blur">
           <p>CAM: {cameraMode === 'FREE' ? 'ROTATE[LMB] PAN[RMB] ZOOM[SCRL]' : 'LOCKED ON TARGET'}</p>
         </div>
      </div>
    </div>
  );
};

export default App;