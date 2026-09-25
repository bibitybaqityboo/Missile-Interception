import { SimulationConfig, SimulationStatus } from './types';

export const KILL_RADIUS = 15;        // m: proximity fuze radius
export const MAX_FLIGHT_TIME = 20;    // s: interceptor self-destructs after this
export const PHYSICS_STEP = 1 / 120;  // s: fixed integration step, independent of frame rate
export const HISTORY_INTERVAL = 0.1;  // s: telemetry sample period
export const LAUNCH_HEIGHT = 4;       // m: missile rests on the pad at this height
export const TARGET_ALTITUDE = 100;   // m
export const SPEED_OF_SOUND = 340;    // m/s
export const GRAVITY = 9.81;          // m/s²

export const INITIAL_CONFIG: SimulationConfig = {
  missileSpeed: 100,
  targetSpeed: 60,
  turnRate: 35,
  targetDistance: 400,
  launchAngle: 45,
  obstacleCount: 0,
};

export const isTerminal = (status: SimulationStatus) =>
  status === SimulationStatus.HIT || status === SimulationStatus.MISS || status === SimulationStatus.CRASH;

/** Straight-line distance between the launch pad and the bogey's spawn point. */
export const initialRange = (config: SimulationConfig) =>
  Math.hypot(config.targetDistance, TARGET_ALTITUDE - LAUNCH_HEIGHT);

export interface ParamSpec {
  key: keyof SimulationConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  accent: string;
  hint: (value: number, config: SimulationConfig) => string;
}

export const PARAMS: ParamSpec[] = [
  {
    key: 'missileSpeed', label: 'Interceptor speed', min: 50, max: 250, step: 5, unit: 'm/s', accent: '#34d399',
    hint: (v, c) => `Mach ${(v / SPEED_OF_SOUND).toFixed(2)} · ${(v / c.targetSpeed).toFixed(1)}× bogey speed`,
  },
  {
    key: 'targetSpeed', label: 'Bogey speed', min: 10, max: 150, step: 5, unit: 'm/s', accent: '#fb7185',
    hint: (v) => `Mach ${(v / SPEED_OF_SOUND).toFixed(2)}`,
  },
  {
    key: 'turnRate', label: 'Max turn rate', min: 5, max: 90, step: 1, unit: '°/s', accent: '#a78bfa',
    hint: (v, c) => `${((c.missileSpeed * v * Math.PI) / 180 / GRAVITY).toFixed(1)} g lateral at full speed`,
  },
  {
    key: 'targetDistance', label: 'Initial range', min: 100, max: 800, step: 50, unit: 'm', accent: '#38bdf8',
    hint: (v, c) => `~${(v / (c.missileSpeed + c.targetSpeed)).toFixed(1)} s to impact head-on`,
  },
  {
    key: 'launchAngle', label: 'Launch elevation', min: 10, max: 90, step: 5, unit: '°', accent: '#fbbf24',
    hint: (v) => (v >= 80 ? 'Vertical launch' : v <= 25 ? 'Low, direct launch' : 'Lofted launch'),
  },
  {
    key: 'obstacleCount', label: 'Debris field', min: 0, max: 20, step: 1, unit: 'obj', accent: '#94a3b8',
    hint: (v) => (v === 0 ? 'Clear airspace' : `${v} obstacles between pad and bogey`),
  },
];

export const PRESETS: { name: string; config: SimulationConfig }[] = [
  { name: 'Standard', config: INITIAL_CONFIG },
  { name: 'Fast mover', config: { missileSpeed: 200, targetSpeed: 140, turnRate: 30, targetDistance: 700, launchAngle: 30, obstacleCount: 0 } },
  { name: 'Dogfight', config: { missileSpeed: 110, targetSpeed: 90, turnRate: 80, targetDistance: 150, launchAngle: 80, obstacleCount: 0 } },
  { name: 'Debris field', config: { missileSpeed: 130, targetSpeed: 50, turnRate: 55, targetDistance: 500, launchAngle: 40, obstacleCount: 14 } },
];
