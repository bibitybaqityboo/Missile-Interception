import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Float, Grid, OrbitControls, Stars, Trail } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SimulationConfig, SimulationStatus, SimulationStats, HistoryPoint, CameraMode, ObstacleData, EndReason } from '../types';
import {
  HISTORY_INTERVAL, KILL_RADIUS, LAUNCH_HEIGHT, MAX_FLIGHT_TIME, PHYSICS_STEP, TARGET_ALTITUDE, isTerminal,
} from '../simulation';
import { sfx } from '../services/audio';

interface Scene3DProps {
  config: SimulationConfig;
  status: SimulationStatus;
  cameraMode: CameraMode;
  /** Changes whenever the camera should fly back to the overview shot. */
  cameraNonce: number;
  /** Increments on every launch/reset so the scene can start from a clean slate. */
  runId: number;
  onSimulationEnd: (stats: SimulationStats) => void;
  onUpdateHistory: (point: HistoryPoint) => void;
  onStatusChange: (status: SimulationStatus) => void;
}

// --- Shared helpers ---

/** An HDR colour: values above 1 are picked up by the bloom pass. */
const hdr = (hex: string, intensity: number) => new THREE.Color(hex).multiplyScalar(intensity);

const COLORS = {
  interceptor: new THREE.Color('#34d399'),
  bogey: new THREE.Color('#fb7185'),
  flame: hdr('#fbbf24', 6),
  flameCore: hdr('#fff7ed', 8),
  padGlow: hdr('#34d399', 3),
  bogeyCore: hdr('#f43f5e', 1.5),
};

const UP = new THREE.Vector3(0, 1, 0);
const MAX_PATH_POINTS = 1200;
const PATH_SAMPLE = 0.05;
const POST_ENGAGEMENT_TIME = 8;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Frame-rate independent smoothing factor for lerp(). */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Deterministic PRNG so a given debris setting always produces the same field. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const generateObstacles = (count: number, targetDistance: number): ObstacleData[] => {
  const rand = mulberry32(count * 7919 + targetDistance);
  const obstacles: ObstacleData[] = [];
  const pad = new THREE.Vector3(0, LAUNCH_HEIGHT, 0);
  const spawn = new THREE.Vector3(0, TARGET_ALTITUDE, -targetDistance);
  for (let attempts = 0; obstacles.length < count && attempts < count * 30; attempts++) {
    const p = new THREE.Vector3((rand() - 0.5) * 170, 30 + rand() * 110, -(40 + rand() * targetDistance * 0.85));
    const scale = 4 + rand() * 8;
    // Keep the pad and the bogey's spawn point clear so a run can't end on frame one.
    if (p.distanceTo(pad) < 55 + scale || p.distanceTo(spawn) < 40 + scale) continue;
    obstacles.push({ position: { x: p.x, y: p.y, z: p.z }, scale, floatSpeed: 0.5 + rand() });
  }
  return obstacles;
};

/**
 * Camera placement that frames the whole engagement for a given range. Landscape screens get a
 * side-on view; portrait screens look down the engagement axis so it runs up the screen.
 */
const overviewFor = (distance: number, portrait: boolean) =>
  portrait
    ? {
        position: new THREE.Vector3(distance * 0.25 + 30, 170 + distance * 0.4, distance * 0.6 + 150),
        target: new THREE.Vector3(0, 50, -distance * 0.45),
      }
    : {
        position: new THREE.Vector3(distance * 0.6 + 60, 120 + distance * 0.22, distance * 0.45 + 90),
        target: new THREE.Vector3(0, 50, -distance * 0.48),
      };

/** Rotate `current` toward `desired` by at most `maxAngle` radians. Both must be unit vectors. */
const rotateTowards = (current: THREE.Vector3, desired: THREE.Vector3, maxAngle: number, axis: THREE.Vector3) => {
  const angle = current.angleTo(desired);
  if (angle <= maxAngle) return current.copy(desired);
  axis.crossVectors(current, desired);
  if (axis.lengthSq() < 1e-10) axis.set(1, 0, 0).cross(current); // anti-parallel: any perpendicular axis works
  if (axis.lengthSq() < 1e-10) axis.set(0, 0, 1);
  return current.applyAxisAngle(axis.normalize(), maxAngle);
};

interface PathTrack {
  line: THREE.Line;
  count: number;
}

const makePath = (color: THREE.Color, opacity: number): PathTrack => {
  const geometry = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(new Float32Array(MAX_PATH_POINTS * 3), 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attr);
  geometry.setDrawRange(0, 0);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  line.frustumCulled = false;
  return { line, count: 0 };
};

/** Write the path's live head; `commit` keeps it as a permanent vertex. */
const writePath = (path: PathTrack, pos: THREE.Vector3, commit: boolean) => {
  const attr = path.line.geometry.getAttribute('position') as THREE.BufferAttribute;
  attr.setXYZ(path.count, pos.x, pos.y, pos.z);
  if (commit && path.count < MAX_PATH_POINTS - 1) {
    // The new head slot is drawn this frame too, so it must not hold stale data.
    path.count++;
    attr.setXYZ(path.count, pos.x, pos.y, pos.z);
  }
  attr.needsUpdate = true;
  path.line.geometry.setDrawRange(0, path.count + 1);
};

const clearPath = (path: PathTrack) => {
  path.count = 0;
  path.line.geometry.setDrawRange(0, 0);
};

const makeDashedLine = (color: THREE.Color, opacity: number, dashSize: number, gapSize: number) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize, gapSize }));
  line.frustumCulled = false;
  return line;
};

const setSegment = (line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => {
  const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  attr.setXYZ(0, a.x, a.y, a.z);
  attr.setXYZ(1, b.x, b.y, b.z);
  attr.needsUpdate = true;
  line.computeLineDistances();
};

// --- Environment ---

const BackgroundPlanets = () => (
  <group>
    <group position={[-250, 520, -1500]} rotation={[0.4, 0, 0.2]}>
      <mesh>
        <sphereGeometry args={[200, 64, 64]} />
        <meshStandardMaterial color="#312e81" metalness={0.2} roughness={0.8} fog={false} />
      </mesh>
      <mesh rotation={[1.6, 0, 0]}>
        <ringGeometry args={[240, 330, 96]} />
        <meshStandardMaterial color="#818cf8" transparent opacity={0.35} side={THREE.DoubleSide} fog={false} />
      </mesh>
      <mesh rotation={[1.6, 0, 0]}>
        <ringGeometry args={[228, 236, 96]} />
        <meshStandardMaterial color="#4f46e5" transparent opacity={0.55} side={THREE.DoubleSide} fog={false} />
      </mesh>
    </group>
    <pointLight position={[150, 620, -1150]} intensity={2} distance={1400} decay={0} color="#6366f1" />
    <mesh position={[900, 180, -1000]}>
      <sphereGeometry args={[70, 32, 32]} />
      <meshStandardMaterial color="#7f1d1d" emissive="#7f1d1d" emissiveIntensity={0.35} fog={false} />
    </mesh>
  </group>
);

const RangeRings = () => {
  const rings = useMemo(
    () =>
      [200, 400, 600, 800].map((radius) => {
        const points = Array.from({ length: 129 }, (_, i) => {
          const a = (i / 128) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        });
        return new THREE.BufferGeometry().setFromPoints(points);
      }),
    [],
  );
  useEffect(() => () => rings.forEach((g) => g.dispose()), [rings]);
  return (
    <group position={[0, 0.15, 0]}>
      {rings.map((geometry, i) => (
        <lineLoop key={i} geometry={geometry}>
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.16 - i * 0.025} />
        </lineLoop>
      ))}
    </group>
  );
};

const LaunchPad = () => (
  <group>
    <mesh position={[0, 0.6, 0]}>
      <cylinderGeometry args={[7, 8.5, 1.2, 6]} />
      <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.45} />
    </mesh>
    <mesh position={[0, 1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[4.6, 5.2, 6]} />
      <meshBasicMaterial color={COLORS.padGlow} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[11, 11.4, 64]} />
      <meshBasicMaterial color="#34d399" transparent opacity={0.35} />
    </mesh>
  </group>
);

const ObstacleField = ({ obstacles }: { obstacles: ObstacleData[] }) => (
  <group>
    {obstacles.map((obs, i) => (
      <group key={i} position={[obs.position.x, obs.position.y, obs.position.z]}>
        <Float speed={obs.floatSpeed} rotationIntensity={1} floatIntensity={0.5}>
          <mesh scale={obs.scale}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#3f4a5c" roughness={0.9} metalness={0.3} flatShading />
          </mesh>
          <mesh scale={obs.scale * 1.06}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.18} />
          </mesh>
        </Float>
      </group>
    ))}
  </group>
);

// --- Actors ---

const MissileModel = ({ burning }: { burning: boolean }) => {
  const flame = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 1 + Math.sin(t * 60) * 0.12 + Math.sin(t * 37) * 0.08;
    if (flame.current) flame.current.scale.set(1, flicker, 1);
    if (light.current) light.current.intensity = burning ? 30 * flicker : 0;
  });

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.32, 0.4, 4, 16]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.335, 0.335, 0.25, 16]} />
        <meshStandardMaterial color="#10b981" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <coneGeometry args={[0.32, 1, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.35} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <mesh position={[0.45, -1.5, 0]}>
            <boxGeometry args={[0.8, 1.2, 0.08]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0.3, 1.2, 0]}>
            <boxGeometry args={[0.4, 0.6, 0.05]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -2.1, 0]}>
        <cylinderGeometry args={[0.25, 0.32, 0.25, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>
      <group ref={flame} position={[0, -2.25, 0]} visible={burning}>
        <mesh position={[0, -1.6, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.34, 3.2, 16, 1, true]} />
          <meshBasicMaterial color={COLORS.flame} transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.8, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.18, 1.6, 12, 1, true]} />
          <meshBasicMaterial color={COLORS.flameCore} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <pointLight ref={light} position={[0, -3, 0]} color="#f59e0b" intensity={0} distance={25} decay={2} />
    </group>
  );
};

const TargetModel = () => {
  const outerRing = useRef<THREE.Mesh>(null);
  const innerCore = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (outerRing.current) {
      outerRing.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.5;
      outerRing.current.rotation.y += delta * 1.2;
    }
    if (innerCore.current) {
      innerCore.current.rotation.z -= delta * 3;
      innerCore.current.rotation.x -= delta * 1.2;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={innerCore}>
        <icosahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color="#9f1239" emissive={COLORS.bogeyCore} roughness={0.25} metalness={0.8} flatShading />
      </mesh>
      <mesh ref={outerRing} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.4, 0.08, 8, 48]} />
        <meshBasicMaterial color={hdr('#fb7185', 1.6)} wireframe toneMapped={false} />
      </mesh>
      <pointLight color="#f43f5e" intensity={40} distance={30} decay={2} />
    </Float>
  );
};

type ExplosionKind = 'hit' | 'crash' | 'fizzle';

interface ExplosionSpec {
  id: number;
  kind: ExplosionKind;
  position: THREE.Vector3;
}

const EXPLOSION_STYLES: Record<ExplosionKind, { size: number; sparks: number; fire: THREE.Color; spark: THREE.Color; smoke: string; light: number }> = {
  hit: { size: 1, sparks: 70, fire: hdr('#f97316', 5), spark: hdr('#fcd34d', 7), smoke: '#475569', light: 400 },
  crash: { size: 0.75, sparks: 45, fire: hdr('#f59e0b', 4), spark: hdr('#fde68a', 5), smoke: '#334155', light: 250 },
  fizzle: { size: 0.4, sparks: 26, fire: hdr('#fde68a', 3), spark: hdr('#e2e8f0', 4), smoke: '#64748b', light: 80 },
};

const Explosion = ({ position, kind }: { position: THREE.Vector3; kind: ExplosionKind }) => {
  const style = EXPLOSION_STYLES[kind];
  const age = useRef(0);
  const group = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const sparkRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const fireRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Several overlapping additive puffs read as a volumetric fireball; one sphere looks flat.
  const fire = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        offset: i === 0 ? new THREE.Vector3() : new THREE.Vector3().randomDirection().multiplyScalar((2 + Math.random() * 3) * style.size),
        size: (i === 0 ? 1 : 0.45 + Math.random() * 0.45) * style.size,
        delay: i === 0 ? 0 : Math.random() * 0.15,
      })),
    [style],
  );

  const sparks = useMemo(
    () =>
      Array.from({ length: style.sparks }, () => ({
        velocity: new THREE.Vector3().randomDirection().multiplyScalar((35 + Math.random() * 75) * style.size),
        position: new THREE.Vector3(),
        size: (0.35 + Math.random() * 0.7) * style.size,
        life: 0.7 + Math.random() * 1.1,
      })),
    [style],
  );

  const smoke = useMemo(
    () =>
      Array.from({ length: 12 }, () => ({
        offset: new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 6 * style.size),
        drift: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5),
        size: (4 + Math.random() * 5) * style.size,
        life: 3 + Math.random() * 2.5,
      })),
    [style],
  );

  const sparkGeometry = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  const sparkMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: style.spark, toneMapped: false }), [style]);
  useEffect(() => () => { sparkGeometry.dispose(); sparkMaterial.dispose(); }, [sparkGeometry, sparkMaterial]);

  useFrame((_, delta) => {
    if (!group.current || !group.current.visible) return;
    const dt = Math.min(delta, 0.1);
    const t = (age.current += dt);
    if (t > 7) {
      group.current.visible = false;
      return;
    }

    fire.forEach((puff, i) => {
      const mesh = fireRefs.current[i];
      if (!mesh) return;
      const age = Math.max(0, t - puff.delay);
      mesh.visible = t >= puff.delay;
      mesh.position.copy(puff.offset).multiplyScalar(1 + age * 1.5);
      mesh.scale.setScalar(puff.size * (1.5 + 9 * (1 - Math.exp(-age * 6))));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.max(0, 1 - age / 0.95);
    });
    if (flash.current) {
      flash.current.scale.setScalar(style.size * (5 + t * 60));
      (flash.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t / 0.16);
    }
    if (ring.current) {
      ring.current.scale.setScalar(style.size * (2 + t * 110));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 1.5);
    }
    if (light.current) light.current.intensity = style.light * Math.exp(-t * 4);

    const drag = Math.exp(-dt * 1.8);
    sparks.forEach((sp, i) => {
      const mesh = sparkRefs.current[i];
      if (!mesh) return;
      sp.velocity.multiplyScalar(drag);
      sp.velocity.y -= 25 * dt;
      sp.position.addScaledVector(sp.velocity, dt);
      const k = Math.max(0, 1 - t / sp.life);
      mesh.position.copy(sp.position);
      mesh.scale.setScalar(sp.size * k);
      mesh.visible = k > 0;
    });

    smoke.forEach((sm, i) => {
      const mesh = smokeRefs.current[i];
      if (!mesh) return;
      mesh.position.copy(sm.offset).addScaledVector(sm.drift, t);
      mesh.scale.setScalar(sm.size * (0.4 + Math.min(1, t * 0.7) * 1.3));
      const fadeIn = Math.min(1, t / 0.4);
      (mesh.material as THREE.MeshStandardMaterial).opacity = 0.32 * fadeIn * Math.max(0, 1 - t / sm.life);
    });
  });

  return (
    <group ref={group} position={position}>
      <mesh ref={flash}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={hdr('#ffffff', 10)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {fire.map((_, i) => (
        <mesh key={i} ref={(el) => { fireRefs.current[i] = el; }} visible={false}>
          <icosahedronGeometry args={[1, 3]} />
          <meshBasicMaterial color={style.fire} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <Billboard>
        <mesh ref={ring}>
          <ringGeometry args={[0.92, 1, 64]} />
          <meshBasicMaterial color={hdr('#fef3c7', 3)} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </Billboard>
      {sparks.map((_, i) => (
        <mesh key={i} ref={(el) => { sparkRefs.current[i] = el; }} geometry={sparkGeometry} material={sparkMaterial} />
      ))}
      {smoke.map((_, i) => (
        <mesh key={i} ref={(el) => { smokeRefs.current[i] = el; }}>
          <icosahedronGeometry args={[1, 2]} />
          <meshStandardMaterial color={style.smoke} transparent opacity={0} depthWrite={false} roughness={1} />
        </mesh>
      ))}
      <pointLight ref={light} color="#f59e0b" intensity={style.light} distance={220} decay={1.5} />
    </group>
  );
};

// --- DOM labels projected from 3D positions ---
// Plain DOM positioned from useFrame: cheaper than a React root per label and StrictMode-safe.

interface LabelRefs {
  target: HTMLDivElement | null;
  missile: HTMLDivElement | null;
  range: HTMLSpanElement | null;
}

const TargetReticle = ({ status, rangeRef }: { status: SimulationStatus; rangeRef: (el: HTMLSpanElement | null) => void }) => {
  const locked = status === SimulationStatus.RUNNING;
  const state = locked ? 'LOCKED' : status === SimulationStatus.IDLE ? 'TRACKING' : 'EVADED';
  return (
    <div className={`reticle ${locked ? 'reticle--locked' : ''}`}>
      <i /><i /><i /><i />
      <div className="reticle__label">
        BOGEY · {state}
        <span ref={rangeRef} className="reticle__range" />
      </div>
    </div>
  );
};

const InterceptorMarker = ({ status }: { status: SimulationStatus }) => (
  <div className="int-marker">
    <span className="int-marker__diamond" />
    <span className="int-marker__label">{status === SimulationStatus.IDLE ? 'INTERCEPTOR · ARMED' : 'INT'}</span>
  </div>
);

const projected = new THREE.Vector3();

/** Move a DOM label to the screen position of a world point; hide it when behind the camera. */
const placeLabel = (el: HTMLElement | null, world: THREE.Vector3, camera: THREE.Camera, width: number, height: number) => {
  if (!el) return;
  projected.copy(world).project(camera);
  if (projected.z > 1) {
    el.style.visibility = 'hidden';
    return;
  }
  el.style.visibility = 'visible';
  el.style.transform = `translate3d(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px, 0)`;
};

// --- Physics, camera & scene graph ---

type SimulationLoopProps = Scene3DProps & { labels: React.RefObject<LabelRefs> };

interface PhysicsState {
  runId: number;
  config: SimulationConfig | null;
  time: number;
  accumulator: number;
  sampleClock: number;
  pathClock: number;
  lastSampleDist: number;
  minDist: number;
  ended: boolean;
  targetAlive: boolean;
  postTime: number;
  missilePos: THREE.Vector3;
  missileVel: THREE.Vector3;
  targetPos: THREE.Vector3;
  targetVel: THREE.Vector3;
}

const SimulationLoop: React.FC<SimulationLoopProps> = ({
  config, status, cameraMode, cameraNonce, runId, onSimulationEnd, onUpdateHistory, onStatusChange, labels,
}) => {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const missileRef = useRef<THREE.Group>(null);
  const targetRef = useRef<THREE.Group>(null);
  const targetGroundRef = useRef<THREE.Mesh>(null);
  const missileGroundRef = useRef<THREE.Mesh>(null);
  const shake = useRef({ amount: 0, origin: new THREE.Vector3() });

  const [explosion, setExplosion] = useState<ExplosionSpec | null>(null);

  const obstacles = useMemo(
    () => generateObstacles(config.obstacleCount, config.targetDistance),
    [config.obstacleCount, config.targetDistance],
  );

  const paths = useMemo(() => ({ missile: makePath(COLORS.interceptor, 0.85), target: makePath(COLORS.bogey, 0.7) }), []);
  const lines = useMemo(
    () => ({
      los: makeDashedLine(COLORS.interceptor, 0.45, 6, 5),
      missileDrop: makeDashedLine(COLORS.interceptor, 0.35, 3, 3),
      targetDrop: makeDashedLine(COLORS.bogey, 0.4, 3, 3),
    }),
    [],
  );
  useEffect(
    () => () => {
      [paths.missile.line, paths.target.line, lines.los, lines.missileDrop, lines.targetDrop].forEach((l) => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      });
    },
    [paths, lines],
  );

  const sim = useRef<PhysicsState>({
    runId: -1,
    config: null,
    time: 0,
    accumulator: 0,
    sampleClock: 0,
    pathClock: 0,
    lastSampleDist: 0,
    minDist: Infinity,
    ended: false,
    targetAlive: true,
    postTime: 0,
    missilePos: new THREE.Vector3(),
    missileVel: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    targetVel: new THREE.Vector3(),
  });

  // Scratch vectors reused every step to avoid per-frame allocations.
  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), axis: new THREE.Vector3(),
      desiredPos: new THREE.Vector3(), desiredLook: new THREE.Vector3(),
    }),
    [],
  );

  const cam = useRef({
    mode: null as CameraMode | null,
    nonce: -1,
    framedDistance: -1,
    framedPortrait: false,
    userMoved: false,
    transition: 1,
    look: new THREE.Vector3(),
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  });

  // Any manual orbit means the user has chosen a view: stop auto-reframing on range changes.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => { cam.current.userMoved = true; };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, []);

  // Each new run starts without the previous run's explosion.
  useEffect(() => setExplosion(null), [runId]);

  const resetPhysics = (s: PhysicsState) => {
    s.time = 0;
    s.accumulator = 0;
    s.sampleClock = 0;
    s.pathClock = 0;
    s.minDist = Infinity;
    s.ended = false;
    s.targetAlive = true;
    s.postTime = 0;
    const rad = THREE.MathUtils.degToRad(config.launchAngle);
    s.missilePos.set(0, LAUNCH_HEIGHT, 0);
    s.missileVel.set(0, Math.sin(rad), -Math.cos(rad)).multiplyScalar(config.missileSpeed);
    s.targetPos.set(0, TARGET_ALTITUDE, -config.targetDistance);
    s.targetVel.set(0, 0, config.targetSpeed);
    s.lastSampleDist = s.missilePos.distanceTo(s.targetPos);
    clearPath(paths.missile);
    clearPath(paths.target);
  };

  const finish = (s: PhysicsState, outcome: SimulationStatus, reason: EndReason, dist: number, kind: ExplosionKind, at: THREE.Vector3) => {
    s.ended = true;
    s.targetAlive = outcome !== SimulationStatus.HIT;
    writePath(paths.missile, s.missilePos, true);
    writePath(paths.target, s.targetPos, true);
    onUpdateHistory({ time: s.time, distance: dist, altitude: s.missilePos.y, closingSpeed: 0 });
    onStatusChange(outcome);
    onSimulationEnd({
      timeElapsed: s.time,
      distanceToTarget: dist,
      missileVelocity: s.missileVel.length(),
      closestApproach: Math.min(s.minDist, dist),
      didHit: outcome === SimulationStatus.HIT,
      outcome,
      reason,
    });
    setExplosion({ id: runId, kind, position: at.clone() });
    shake.current.amount = kind === 'hit' ? 1 : kind === 'crash' ? 0.7 : 0.3;
    shake.current.origin.copy(at);
    sfx.explosion(kind === 'fizzle' ? 0.35 : kind === 'crash' ? 0.8 : 1);
    if (outcome === SimulationStatus.MISS) sfx.fail();
  };

  const moveTarget = (s: PhysicsState, dt: number) => {
    const wave = tmp.a.set(Math.cos(s.time * 0.8) * 10, Math.sin(s.time * 0.5) * 5, 0);
    const avoidance = tmp.b.set(0, 0, 0);
    for (const obs of obstacles) {
      const obsPos = tmp.c.set(obs.position.x, obs.position.y, obs.position.z);
      const d = s.targetPos.distanceTo(obsPos);
      const threshold = obs.scale * 4;
      if (d < threshold) avoidance.add(obsPos.subVectors(s.targetPos, obsPos).normalize().multiplyScalar((threshold - d) * 2));
    }
    s.targetVel.addScaledVector(wave, dt).addScaledVector(avoidance, dt * 20);
    s.targetVel.z += (config.targetSpeed - s.targetVel.z) * dt * 0.1;
    s.targetVel.setLength(config.targetSpeed);
    s.targetPos.addScaledVector(s.targetVel, dt);
  };

  /** One fixed physics step. Returns false once the engagement is over. */
  const step = (s: PhysicsState, dt: number) => {
    s.time += dt;
    moveTarget(s, dt);

    const toTarget = tmp.a.subVectors(s.targetPos, s.missilePos);
    const dist = toTarget.length();
    s.minDist = Math.min(s.minDist, dist);

    if (s.missilePos.y < 0) {
      finish(s, SimulationStatus.CRASH, 'ground', dist, 'crash', s.missilePos.clone().setY(1));
      return false;
    }
    for (const obs of obstacles) {
      if (s.missilePos.distanceTo(tmp.b.set(obs.position.x, obs.position.y, obs.position.z)) < obs.scale + 2) {
        finish(s, SimulationStatus.CRASH, 'debris', dist, 'crash', s.missilePos);
        return false;
      }
    }
    if (dist < KILL_RADIUS) {
      finish(s, SimulationStatus.HIT, 'intercept', dist, 'hit', s.targetPos);
      return false;
    }
    if (s.time > MAX_FLIGHT_TIME || dist > config.targetDistance * 1.5) {
      finish(s, SimulationStatus.MISS, s.time > MAX_FLIGHT_TIME ? 'timeout' : 'escaped', dist, 'fizzle', s.missilePos);
      return false;
    }

    // Guidance: pure pursuit, bent away from debris that sits ahead of the nose.
    const desired = toTarget.normalize();
    const avoidance = tmp.b.set(0, 0, 0);
    for (const obs of obstacles) {
      const toObs = tmp.c.set(obs.position.x, obs.position.y, obs.position.z).sub(s.missilePos);
      const distToObs = toObs.length();
      if (distToObs < 60 && s.missileVel.angleTo(toObs) < Math.PI / 3) {
        const weight = 80 / Math.max(0.1, distToObs - obs.scale);
        avoidance.addScaledVector(toObs.normalize(), -weight);
      }
    }
    if (avoidance.lengthSq() > 0) desired.add(avoidance).normalize();

    const heading = tmp.c.copy(s.missileVel).normalize();
    rotateTowards(heading, desired, THREE.MathUtils.degToRad(config.turnRate) * dt, tmp.axis);
    s.missileVel.copy(heading).multiplyScalar(config.missileSpeed);
    s.missilePos.addScaledVector(s.missileVel, dt);

    s.sampleClock += dt;
    if (s.sampleClock >= HISTORY_INTERVAL - 1e-9) {
      onUpdateHistory({
        time: s.time,
        distance: dist,
        altitude: s.missilePos.y,
        closingSpeed: (s.lastSampleDist - dist) / s.sampleClock,
      });
      s.lastSampleDist = dist;
      s.sampleClock = 0;
    }
    return true;
  };

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const s = sim.current;

    // (Re)initialise on a new run, or live-preview config edits while idle.
    if (s.runId !== runId || (status === SimulationStatus.IDLE && s.config !== config)) {
      resetPhysics(s);
      s.runId = runId;
      s.config = config;
      if (status === SimulationStatus.RUNNING) {
        writePath(paths.missile, s.missilePos, true);
        writePath(paths.target, s.targetPos, true);
      }
    }

    if (status === SimulationStatus.RUNNING && !s.ended) {
      s.accumulator += dt;
      while (s.accumulator >= PHYSICS_STEP) {
        s.accumulator -= PHYSICS_STEP;
        if (!step(s, PHYSICS_STEP)) break;
      }
    } else if (s.ended && s.targetAlive && s.postTime < POST_ENGAGEMENT_TIME) {
      // The bogey survived: let it fly on so the miss reads clearly.
      s.postTime += dt;
      s.time += dt;
      moveTarget(s, dt);
    }

    if (status !== SimulationStatus.IDLE) {
      s.pathClock += dt;
      const commit = s.pathClock >= PATH_SAMPLE;
      if (commit) s.pathClock = 0;
      if (!s.ended) writePath(paths.missile, s.missilePos, commit);
      if (!s.ended || (s.targetAlive && s.postTime < POST_ENGAGEMENT_TIME)) writePath(paths.target, s.targetPos, commit);
    }

    // Sync visuals
    if (missileRef.current) {
      missileRef.current.position.copy(s.missilePos);
      missileRef.current.lookAt(tmp.a.copy(s.missilePos).add(s.missileVel));
    }
    if (targetRef.current) targetRef.current.position.copy(s.targetPos);
    setSegment(lines.los, s.missilePos, s.targetPos);
    lines.los.visible = status === SimulationStatus.RUNNING;
    setSegment(lines.missileDrop, s.missilePos, tmp.a.copy(s.missilePos).setY(0));
    setSegment(lines.targetDrop, s.targetPos, tmp.a.copy(s.targetPos).setY(0));
    lines.targetDrop.visible = status !== SimulationStatus.HIT;
    lines.missileDrop.visible = !isTerminal(status);
    targetGroundRef.current?.position.set(s.targetPos.x, 0.2, s.targetPos.z);
    missileGroundRef.current?.position.set(s.missilePos.x, 0.2, s.missilePos.z);
    const rangeLabel = labels.current.range;
    if (rangeLabel) {
      const text = `${Math.round(s.missilePos.distanceTo(s.targetPos))} m`;
      if (rangeLabel.textContent !== text) rangeLabel.textContent = text;
    }

    // --- Camera ---
    const c = cam.current;
    const controls = controlsRef.current;
    if (!controls) return;

    const portrait = size.width < size.height;
    const modeChanged = c.mode !== cameraMode;
    if (modeChanged && c.mode === 'FREE') c.look.copy(controls.target);
    const reframe =
      cameraMode === 'FREE' &&
      (modeChanged ||
        c.nonce !== cameraNonce ||
        (!c.userMoved && (c.framedDistance !== config.targetDistance || c.framedPortrait !== portrait)));
    if (reframe) {
      const view = overviewFor(config.targetDistance, portrait);
      c.fromPos.copy(camera.position);
      c.fromTarget.copy(c.mode === 'FREE' ? controls.target : c.look);
      c.toPos.copy(view.position);
      c.toTarget.copy(view.target);
      c.userMoved = false;
      c.framedDistance = config.targetDistance;
      c.framedPortrait = portrait;
      if (c.mode === null) {
        // First frame: snap straight to the overview.
        camera.position.copy(view.position);
        controls.target.copy(view.target);
        camera.lookAt(view.target);
        c.transition = 1;
      } else {
        c.transition = 0;
      }
    }
    c.mode = cameraMode;
    c.nonce = cameraNonce;

    if (cameraMode === 'FREE') {
      if (c.transition < 1) {
        c.transition = Math.min(1, c.transition + dt / 1.1);
        const e = easeInOutCubic(c.transition);
        camera.position.lerpVectors(c.fromPos, c.toPos, e);
        controls.target.lerpVectors(c.fromTarget, c.toTarget, e);
        camera.lookAt(controls.target);
      }
      controls.enabled = c.transition >= 1;
    } else {
      controls.enabled = false;
      if (cameraMode === 'MISSILE') {
        const dir = tmp.a.copy(s.missileVel);
        if (dir.lengthSq() < 1e-6) dir.copy(UP);
        dir.normalize();
        // Once the interceptor is gone, back off to watch the aftermath instead of sitting in the fireball.
        const lost = s.ended;
        tmp.desiredPos.copy(s.missilePos).addScaledVector(dir, lost ? -95 : -26).addScaledVector(UP, lost ? 30 : 7);
        tmp.desiredLook.copy(s.missilePos).addScaledVector(dir, lost ? 0 : 40);
      } else {
        // Over the bogey's shoulder, looking back down the threat axis at the incoming interceptor.
        const dir = tmp.a.subVectors(s.missilePos, s.targetPos);
        dir.y *= 0.3;
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        const side = tmp.b.crossVectors(dir, UP).normalize();
        const lost = !s.targetAlive;
        tmp.desiredPos.copy(s.targetPos).addScaledVector(dir, lost ? -95 : -34).addScaledVector(UP, lost ? 30 : 11).addScaledVector(side, lost ? 25 : 10);
        tmp.desiredLook.copy(s.targetPos).addScaledVector(dir, lost ? 0 : 30);
      }
      tmp.desiredPos.y = Math.max(tmp.desiredPos.y, 2);
      camera.position.lerp(tmp.desiredPos, modeChanged ? 0 : damp(s.ended ? 2.5 : 7, dt));
      c.look.lerp(tmp.desiredLook, damp(10, dt));
      camera.lookAt(c.look);
    }

    // Camera shake, scaled by how close the camera is to the blast. Applied as a pure rotation
    // so it never accumulates: OrbitControls and the chase cams re-aim the camera every frame.
    const sh = shake.current;
    if (sh.amount > 0.001) {
      const proximity = THREE.MathUtils.clamp(80 / camera.position.distanceTo(sh.origin), 0.2, 1);
      const a = sh.amount * proximity * 0.03;
      camera.rotateX((Math.random() - 0.5) * a);
      camera.rotateY((Math.random() - 0.5) * a);
      camera.rotateZ((Math.random() - 0.5) * a * 0.5);
      sh.amount *= Math.exp(-dt * 3.5);
    }

    camera.updateMatrixWorld();
    placeLabel(labels.current.target, s.targetPos, camera, size.width, size.height);
    placeLabel(labels.current.missile, s.missilePos, camera, size.width, size.height);
  });

  const missileVisible = !isTerminal(status);
  const targetVisible = status !== SimulationStatus.HIT;

  return (
    <>
      <OrbitControls ref={controlsRef} makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={20} maxDistance={2200} enableDamping dampingFactor={0.08} />

      <ObstacleField obstacles={obstacles} />
      <primitive object={paths.missile.line} />
      <primitive object={paths.target.line} />
      <primitive object={lines.los} />
      <primitive object={lines.missileDrop} />
      <primitive object={lines.targetDrop} />

      <mesh ref={missileGroundRef} rotation={[-Math.PI / 2, 0, 0]} visible={missileVisible && status !== SimulationStatus.IDLE}>
        <ringGeometry args={[2.2, 3, 32]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh ref={targetGroundRef} rotation={[-Math.PI / 2, 0, 0]} visible={targetVisible}>
        <ringGeometry args={[4, 5, 32]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.4} depthWrite={false} />
      </mesh>

      <group ref={missileRef} visible={missileVisible}>
        <Trail key={runId} width={4} length={30} color={hdr('#94a3b8', 0.6)} attenuation={(t) => t * t} interval={2}>
          <Trail width={1} length={8} color={hdr('#fbbf24', 1.6)} attenuation={(t) => t * t}>
            <MissileModel burning={status === SimulationStatus.RUNNING} />
          </Trail>
        </Trail>
      </group>

      <group ref={targetRef} visible={targetVisible}>
        <TargetModel />
      </group>

      {explosion && <Explosion key={explosion.id} position={explosion.position} kind={explosion.kind} />}
    </>
  );
};

export const Scene3D = memo((props: Scene3DProps) => {
  const labels = useRef<LabelRefs>({ target: null, missile: null, range: null });
  const { status, cameraMode } = props;
  const labelClass = 'absolute left-0 top-0 will-change-transform [visibility:hidden]';

  return (
    <div className="relative h-full w-full">
      <Canvas dpr={[1, 2]} gl={{ antialias: false, powerPreference: 'high-performance' }} camera={{ fov: 50, near: 0.5, far: 6000 }}>
        <color attach="background" args={['#030712']} />
        <fog attach="fog" args={['#030712', 350, 1800]} />

        <Stars radius={1600} depth={400} count={5000} factor={50} saturation={0} fade speed={0.4} />
        <BackgroundPlanets />

        <ambientLight intensity={0.35} />
        <directionalLight position={[80, 160, 60]} intensity={1.4} color="#e0f2fe" />
        <hemisphereLight args={['#1e3a8a', '#0f172a', 0.6]} />

        <Grid
          infiniteGrid
          fadeDistance={1600}
          fadeStrength={3}
          sectionColor="#0e7490"
          cellColor="#172033"
          sectionSize={100}
          cellSize={20}
          sectionThickness={1.1}
          cellThickness={0.6}
        />
        <RangeRings />
        <LaunchPad />

        <SimulationLoop {...props} labels={labels} />

        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={1.15} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.3} darkness={0.7} />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {status !== SimulationStatus.HIT && cameraMode !== 'TARGET' && (
          <div ref={(el) => { labels.current.target = el; }} className={labelClass}>
            <div className="-translate-x-1/2 -translate-y-1/2">
              <TargetReticle status={status} rangeRef={(el) => { labels.current.range = el; }} />
            </div>
          </div>
        )}
        {!isTerminal(status) && cameraMode !== 'MISSILE' && (
          <div ref={(el) => { labels.current.missile = el; }} className={labelClass}>
            <div className="-translate-x-[5px] -translate-y-1/2">
              <InterceptorMarker status={status} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
