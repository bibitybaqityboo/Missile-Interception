export enum SimulationStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  HIT = 'HIT',
  MISS = 'MISS',
  CRASH = 'CRASH',
}

export type CameraMode = 'FREE' | 'MISSILE' | 'TARGET';

/** Why an engagement ended. */
export type EndReason = 'intercept' | 'timeout' | 'escaped' | 'debris' | 'ground';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ObstacleData {
  position: Vec3;
  scale: number;
  floatSpeed: number;
}

export interface SimulationConfig {
  missileSpeed: number;
  targetSpeed: number;
  turnRate: number; // Max degrees per second turn
  targetDistance: number;
  launchAngle: number;
  obstacleCount: number;
}

export interface SimulationStats {
  timeElapsed: number;
  distanceToTarget: number;
  missileVelocity: number;
  closestApproach: number;
  didHit: boolean;
  outcome: SimulationStatus;
  reason: EndReason;
}

export interface HistoryPoint {
  time: number;
  distance: number;
  altitude: number;
  closingSpeed: number;
}
