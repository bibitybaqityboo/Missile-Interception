import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Grid, Text, PerspectiveCamera, Trail, Float } from '@react-three/drei';
import * as THREE from 'three';
import { SimulationConfig, SimulationStatus, SimulationStats, HistoryPoint, CameraMode, ObstacleData } from '../types';

interface Scene3DProps {
  config: SimulationConfig;
  status: SimulationStatus;
  cameraMode: CameraMode;
  onSimulationEnd: (stats: SimulationStats) => void;
  onUpdateHistory: (point: HistoryPoint) => void;
  onStatusChange: (status: SimulationStatus) => void;
}

// --- Audio System ---
const playExplosion = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(800, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, t + 1);
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
  } catch (e) {
    // Ignore audio errors
  }
};

// --- Visual Components ---

const BackgroundPlanets = () => {
  return (
    <group>
        <group position={[-500, 200, -800]} rotation={[0.4, 0, 0.2]}>
             <mesh>
                <sphereGeometry args={[180, 64, 64]} />
                <meshStandardMaterial color="#312e81" metalness={0.2} roughness={0.8} />
            </mesh>
            <mesh rotation={[1.6, 0, 0]}>
                <ringGeometry args={[220, 300, 64]} />
                <meshStandardMaterial color="#818cf8" transparent opacity={0.4} side={THREE.DoubleSide} />
            </mesh>
             <mesh rotation={[1.6, 0, 0]}>
                <ringGeometry args={[210, 218, 64]} />
                <meshStandardMaterial color="#4f46e5" transparent opacity={0.6} side={THREE.DoubleSide} />
            </mesh>
        </group>
        <pointLight position={[-300, 200, -500]} intensity={2} distance={1000} color="#6366f1" />

        <mesh position={[600, 100, -600]}>
            <sphereGeometry args={[60, 32, 32]} />
            <meshStandardMaterial color="#7f1d1d" emissive="#7f1d1d" emissiveIntensity={0.2} />
        </mesh>
    </group>
  );
};

const ObstacleField = ({ obstacles }: { obstacles: ObstacleData[] }) => {
    return (
        <group>
            {obstacles.map((obs, i) => (
                <group key={i} position={[obs.position.x, obs.position.y, obs.position.z]}>
                    <Float speed={1} rotationIntensity={1} floatIntensity={0.5}>
                        <mesh scale={obs.scale} castShadow receiveShadow>
                            <dodecahedronGeometry args={[1, 0]} />
                            <meshStandardMaterial color="#475569" roughness={0.9} metalness={0.3} flatShading />
                        </mesh>
                         <mesh scale={obs.scale * 1.05}>
                            <dodecahedronGeometry args={[1, 0]} />
                            <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.2} />
                        </mesh>
                    </Float>
                </group>
            ))}
        </group>
    );
}

const MissileModel = () => {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 4, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <coneGeometry args={[0.3, 1, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.4} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
           <mesh position={[0.4, -1.5, 0]}>
            <boxGeometry args={[0.8, 1.2, 0.1]} />
            <meshStandardMaterial color="#475569" metalness={0.6} />
          </mesh>
           <mesh position={[0.3, 1.2, 0]}>
            <boxGeometry args={[0.4, 0.6, 0.05]} />
            <meshStandardMaterial color="#475569" metalness={0.6} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -2.1, 0]}>
        <cylinderGeometry args={[0.2, 0.1, 0.2]} />
        <meshBasicMaterial color="#f59e0b" toneMapped={false} />
      </mesh>
      <pointLight position={[0, -2.5, 0]} color="#f59e0b" intensity={5} distance={10} decay={2} />
    </group>
  );
};

const TargetModel = () => {
  const outerRing = useRef<THREE.Mesh>(null);
  const innerCore = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (outerRing.current) {
      outerRing.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.5;
      outerRing.current.rotation.y += 0.02;
    }
    if (innerCore.current) {
      innerCore.current.rotation.z -= 0.05;
      innerCore.current.rotation.x -= 0.02;
    }
  });

  return (
    <group>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh ref={innerCore}>
          <icosahedronGeometry args={[1.5, 0]} />
          <meshStandardMaterial color="#e11d48" emissive="#be123c" emissiveIntensity={0.8} roughness={0.2} metalness={0.8} />
        </mesh>
        <mesh ref={outerRing} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[3, 0.1, 8, 32]} />
          <meshStandardMaterial color="#fb7185" emissive="#fb7185" emissiveIntensity={0.5} wireframe />
        </mesh>
        <pointLight color="#f43f5e" intensity={3} distance={20} decay={2} />
      </Float>
      <Text position={[0, 5, 0]} fontSize={2} color="#f43f5e" font="https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff">
        BOGEY
      </Text>
    </group>
  );
};

const Explosion = ({ position }: { position: THREE.Vector3 }) => {
  const particlesRef = useRef<(THREE.Mesh | null)[]>([]);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  
  const particleData = useMemo(() => {
    return Array.from({ length: 40 }).map(() => ({
      direction: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      speed: Math.random() * 60 + 20,
      scale: Math.random() * 3 + 1,
      color: Math.random() > 0.4 ? '#f59e0b' : '#ef4444',
    }));
  }, []);

  useFrame((_, delta) => {
    const safeDelta = Math.min(delta, 0.1);
    particlesRef.current.forEach((mesh, i) => {
      const data = particleData[i];
      if (mesh && data) {
        mesh.position.add(data.direction.clone().multiplyScalar(data.speed * safeDelta));
        mesh.rotation.x += safeDelta * 5;
        mesh.rotation.y += safeDelta * 5;
        mesh.scale.multiplyScalar(0.92);
      }
    });

    if (shockwaveRef.current) {
      shockwaveRef.current.scale.multiplyScalar(1.0 + safeDelta * 4);
      const material = shockwaveRef.current.material as THREE.MeshBasicMaterial;
      if (material) {
        material.opacity = Math.max(0, material.opacity - safeDelta * 2.0);
      }
    }
    
    if (lightRef.current) {
      lightRef.current.intensity = Math.max(0, lightRef.current.intensity - safeDelta * 40);
    }
  });

  return (
    <group position={position}>
      {particleData.map((data, i) => (
        <mesh 
          key={i} 
          ref={(el) => { particlesRef.current[i] = el; }}
          scale={[data.scale, data.scale, data.scale]}
        >
          <dodecahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial 
            color={data.color} 
            emissive={data.color} 
            emissiveIntensity={4} 
            transparent 
          />
        </mesh>
      ))}
      <mesh ref={shockwaveRef}>
        <sphereGeometry args={[2, 32, 32]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.8} side={THREE.BackSide} />
      </mesh>
      <pointLight ref={lightRef} color="#f59e0b" intensity={80} distance={150} decay={2} />
    </group>
  );
};

// --- Physics & Logic Component ---

const SimulationLoop: React.FC<Scene3DProps> = ({ config, status, cameraMode, onSimulationEnd, onUpdateHistory, onStatusChange }) => {
  const missileRef = useRef<THREE.Group>(null);
  const targetRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  
  const [explosionPos, setExplosionPos] = useState<THREE.Vector3 | null>(null);
  
  // Memoize obstacles
  const obstacles = useMemo(() => {
      const newObstacles: ObstacleData[] = [];
      const spreadX = 150;
      const spreadY = 100;
      const depth = config.targetDistance * 0.8;
      const count = config.obstacleCount || 0;
      
      for (let i = 0; i < count; i++) {
          newObstacles.push({
              position: {
                  x: (Math.random() - 0.5) * spreadX * 2,
                  y: 50 + (Math.random()) * spreadY,
                  z: - (Math.random() * depth + 50)
              },
              scale: Math.random() * 8 + 4,
              rotationSpeed: { x: Math.random(), y: Math.random(), z: Math.random() }
          });
      }
      return newObstacles;
  }, [config.obstacleCount, config.targetDistance]);

  // Mutable Physics State
  const state = useRef({
    time: 0,
    missilePos: new THREE.Vector3(0, 0, 0),
    missileVel: new THREE.Vector3(0, 1, 0),
    targetPos: new THREE.Vector3(0, 0, 0),
    targetVel: new THREE.Vector3(0, 0, 0),
    minDist: Infinity,
  });

  // Init/Reset Logic
  useEffect(() => {
    if (status === SimulationStatus.IDLE) {
        state.current.time = 0;
        state.current.minDist = Infinity;
        setExplosionPos(null);
        
        // Missile Start
        state.current.missilePos.set(0, 0, 0);
        
        const rad = (config.launchAngle * Math.PI) / 180;
        const speed = isNaN(config.missileSpeed) ? 100 : config.missileSpeed;
        state.current.missileVel.set(0, Math.sin(rad), Math.cos(rad)).normalize().multiplyScalar(speed);

        // Target Start
        const dist = isNaN(config.targetDistance) ? 400 : config.targetDistance;
        state.current.targetPos.set(0, 100, -dist);
        
        const tSpeed = isNaN(config.targetSpeed) ? 60 : config.targetSpeed;
        state.current.targetVel.set(0, 0, 1).normalize().multiplyScalar(tSpeed);
    }
  }, [status, config]);

  useFrame((_, delta) => {
    // 1. SYNC VISUALS IN IDLE
    if (status === SimulationStatus.IDLE) {
        if (missileRef.current) {
            missileRef.current.position.copy(state.current.missilePos);
            const lookAtPoint = state.current.missilePos.clone().add(state.current.missileVel);
            missileRef.current.lookAt(lookAtPoint);
        }
        if (targetRef.current) {
            targetRef.current.position.copy(state.current.targetPos);
        }
        return; 
    }

    if (status !== SimulationStatus.RUNNING) return;

    const s = state.current;
    const safeDelta = Math.min(delta, 0.1);
    s.time += safeDelta;

    // --- Camera Chase Logic ---
    if (cameraMode === 'MISSILE') {
      const velocity = s.missileVel.clone();
      if (velocity.lengthSq() < 0.1) velocity.set(0, 1, 0); 
      velocity.normalize();
      
      const desiredPos = s.missilePos.clone()
        .sub(velocity.clone().multiplyScalar(20))
        .add(new THREE.Vector3(0, 5, 0));
        
      camera.position.lerp(desiredPos, 0.1);
      camera.lookAt(s.missilePos);
    } else if (cameraMode === 'TARGET') {
      const desiredPos = s.targetPos.clone().add(new THREE.Vector3(15, 10, 25));
      camera.position.lerp(desiredPos, 0.1);
      camera.lookAt(s.targetPos);
    }

    // --- 1. Move Target ---
    const waveForce = new THREE.Vector3(Math.cos(s.time * 0.8) * 10, Math.sin(s.time * 0.5) * 5, 0);
    
    let targetAvoidance = new THREE.Vector3(0,0,0);
    obstacles.forEach(obs => {
        const obsPos = new THREE.Vector3(obs.position.x, obs.position.y, obs.position.z);
        const dist = s.targetPos.distanceTo(obsPos);
        const threshold = obs.scale * 4; 
        if (dist < threshold) {
            const push = s.targetPos.clone().sub(obsPos).normalize().multiplyScalar((threshold - dist) * 2);
            targetAvoidance.add(push);
        }
    });

    s.targetVel.add(waveForce.multiplyScalar(safeDelta));
    s.targetVel.add(targetAvoidance.multiplyScalar(safeDelta * 20));
    s.targetVel.lerp(new THREE.Vector3(s.targetVel.x, s.targetVel.y, config.targetSpeed), safeDelta * 0.1);
    s.targetVel.normalize().multiplyScalar(config.targetSpeed);
    
    s.targetPos.add(s.targetVel.clone().multiplyScalar(safeDelta));

    // --- 2. Missile Logic ---
    const toTarget = new THREE.Vector3().subVectors(s.targetPos, s.missilePos);
    const dist = toTarget.length();
    
    if (dist < s.minDist) s.minDist = dist;

    // Check Obstacle Collision
    for (const obs of obstacles) {
        const obsPos = new THREE.Vector3(obs.position.x, obs.position.y, obs.position.z);
        if (s.missilePos.distanceTo(obsPos) < obs.scale + 2.0) {
             onStatusChange(SimulationStatus.CRASH);
             setExplosionPos(s.missilePos.clone());
             playExplosion();
             onSimulationEnd({
                timeElapsed: s.time,
                distanceToTarget: dist,
                missileVelocity: s.missileVel.length(),
                closestApproach: s.minDist,
                didHit: false
             });
             return;
        }
    }

    // HIT Condition
    if (dist < 15) { 
      onStatusChange(SimulationStatus.HIT);
      setExplosionPos(s.targetPos.clone());
      playExplosion();
      onSimulationEnd({
        timeElapsed: s.time,
        distanceToTarget: 0,
        missileVelocity: s.missileVel.length(),
        closestApproach: 0,
        didHit: true
      });
      return;
    }

    // MISS Condition
    if (s.time > 20 || dist > config.targetDistance * 1.5 || s.missilePos.y < -50) {
      onStatusChange(SimulationStatus.MISS);
      onSimulationEnd({
        timeElapsed: s.time,
        distanceToTarget: dist,
        missileVelocity: s.missileVel.length(),
        closestApproach: s.minDist,
        didHit: false
      });
      return;
    }

    // Guidance
    const pursuitDir = toTarget.clone().normalize();
    const avoidanceDir = new THREE.Vector3(0,0,0);
    let avoidanceActive = false;
    
    obstacles.forEach(obs => {
        const obsPos = new THREE.Vector3(obs.position.x, obs.position.y, obs.position.z);
        const toObs = obsPos.clone().sub(s.missilePos);
        const distToObs = toObs.length();
        
        if (distToObs < 60) {
            const angle = s.missileVel.angleTo(toObs);
            if (angle < Math.PI / 3) {
                 const push = s.missilePos.clone().sub(obsPos).normalize();
                 const weight = 1.0 / Math.max(0.1, (distToObs - obs.scale)); 
                 avoidanceDir.add(push.multiplyScalar(weight * 80)); 
                 avoidanceActive = true;
            }
        }
    });

    let finalDesiredDir = pursuitDir;
    if (avoidanceActive) {
        finalDesiredDir.add(avoidanceDir).normalize();
    }

    const currentDir = s.missileVel.clone().normalize();
    const maxTurnRad = (config.turnRate * Math.PI / 180) * safeDelta;
    const angleDiff = currentDir.angleTo(finalDesiredDir);
    
    let newDir = finalDesiredDir;
    if (angleDiff > maxTurnRad) {
      newDir = new THREE.Vector3().copy(currentDir).lerp(finalDesiredDir, maxTurnRad / angleDiff).normalize();
    }

    s.missileVel.copy(newDir.multiplyScalar(config.missileSpeed));
    s.missilePos.add(s.missileVel.clone().multiplyScalar(safeDelta));

    // Sync Refs
    if (missileRef.current) {
      missileRef.current.position.copy(s.missilePos);
      missileRef.current.lookAt(s.missilePos.clone().add(s.missileVel));
    }
    if (targetRef.current) {
      targetRef.current.position.copy(s.targetPos);
    }

    // Update History (throttled)
    if (Math.floor(s.time * 60) % 5 === 0) {
      onUpdateHistory({
        time: s.time,
        distance: dist,
        altitude: s.missilePos.y
      });
    }
  });

  return (
    <>
      <OrbitControls makeDefault enabled={cameraMode === 'FREE'} maxPolarAngle={Math.PI / 1.8} />
      
      <ObstacleField obstacles={obstacles} />

      <group ref={missileRef} visible={status !== SimulationStatus.HIT && status !== SimulationStatus.CRASH}>
        <Trail 
            width={3} 
            length={25} 
            color="#64748b" 
            attenuation={(t) => t * t}
            interval={2}
          >
            <Trail 
              width={1.2} 
              length={12} 
              color="#f59e0b" 
              attenuation={(t) => t}
            >
              <MissileModel />
            </Trail>
        </Trail>
      </group>

      <group ref={targetRef} visible={status !== SimulationStatus.HIT}>
        <TargetModel />
      </group>

      {(status === SimulationStatus.HIT || status === SimulationStatus.CRASH) && explosionPos && (
        <Explosion position={explosionPos} />
      )}
    </>
  );
};

export const Scene3D: React.FC<Scene3DProps> = (props) => {
  return (
    <Canvas shadows dpr={[1, 2]}>
      <PerspectiveCamera makeDefault position={[80, 60, 100]} fov={50} />
      
      <color attach="background" args={['#020617']} />
      <fog attach="fog" args={['#020617', 50, 1200]} />
      
      <Stars radius={200} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />
      
      <BackgroundPlanets />
      
      <ambientLight intensity={0.2} />
      <directionalLight position={[50, 100, 50]} intensity={1} castShadow />
      <hemisphereLight args={['#0f172a', '#1e293b', 0.5]} />

      <group position={[0, -20, 0]}>
        <Grid 
          infiniteGrid 
          fadeDistance={400} 
          sectionColor="#0ea5e9" 
          cellColor="#1e293b" 
          sectionSize={50} 
          cellSize={10} 
          sectionThickness={1}
        />
      </group>

      <SimulationLoop {...props} />
    </Canvas>
  );
};