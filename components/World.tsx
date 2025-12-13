import React, { useMemo, useRef, useState, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldConfig, ObjectInstance, NavigationCell } from '../types';
import { generateTerrain } from '../utils/noise';
import { TerrainObjects } from './TerrainObjects';
import { Billboard, Sky, Stars } from '@react-three/drei';

type DayPhase = 'dawn' | 'noon' | 'dusk' | 'midnight';
type WeatherType = 'clear' | 'rain' | 'snow';

const WATER_LEVEL = 0;

interface WeatherState {
  type: WeatherType;
  intensity: number;
}

interface CloudInstance {
  position: [number, number, number];
  scale: number;
}

interface WorldProps {
  config: WorldConfig;
}

// Sub-component for efficient rendering of thousands of hitboxes
const HitboxLayer: React.FC<{
  instances: ObjectInstance[],
  color: string,
  size: number,
  visible: boolean
}> = ({ instances, color, size, visible }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    // Update instances
    instances.forEach((obj, i) => {
      dummy.position.set(obj.x, obj.y, obj.z);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [instances, visible, size]);

  if (instances.length === 0) return null;

  const opacity = visible ? 0.85 : 0;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={opacity}
        depthWrite={visible}
      />
    </instancedMesh>
  );
};

const NavigationOverlay: React.FC<{
  grid: NavigationCell[];
  segmentSize: number;
  visible: boolean;
}> = ({ grid, segmentSize, visible }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const overlayHeight = 0.15;
  const overlayScale = segmentSize * 0.92;

  useLayoutEffect(() => {
    if (!meshRef.current || !visible) return;

    const mesh = meshRef.current;
    const reusableColor = new THREE.Color();

    grid.forEach((cell, i) => {
      dummy.position.set(cell.x, cell.height + overlayHeight, cell.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(overlayScale, overlayScale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (cell.type === 'water') {
        mesh.setColorAt(i, reusableColor.set('#9ca3af'));
      } else {
        mesh.setColorAt(i, reusableColor.set('#ef4444'));
      }
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [grid, dummy, overlayHeight, overlayScale, visible]);

  if (!visible || grid.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, grid.length]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0.32}
        depthWrite={false}
        side={THREE.DoubleSide}
        vertexColors
      />
    </instancedMesh>
  );
};

export const World: React.FC<WorldProps> = ({ config }) => {
  const {
    size, resolution, seed, waterLevel, forestDensity,
    rockDensity, reliefScale, riverWidth, lakeThreshold, showHitboxes, showNavMesh,
    dayNightSpeed, flashlightEnabled, flashlightIntensity,
    season, landBias
  } = config;

  // Day/Night State
  const [sunPosition, setSunPosition] = useState(new THREE.Vector3(100, 100, 100));
  const [sunColor, setSunColor] = useState(new THREE.Color('#ffffff'));
  const [ambientColor, setAmbientColor] = useState(new THREE.Color('#ffffff'));
  const [ambientIntensity, setAmbientIntensity] = useState(0.5);
  const [skyRayleigh, setSkyRayleigh] = useState(0.5);
  const [time, setTime] = useState(0);
  const [starVisibility, setStarVisibility] = useState(1);

  // Weather State
  const [weather, setWeather] = useState<WeatherState>({
    type: 'clear',
    intensity: 0,
  });
  const staticClouds = useMemo<CloudInstance[]>(() => createClouds(8), [size]);
  const [rainClouds, setRainClouds] = useState<CloudInstance[]>([]);
  const [cloudOpacity, setCloudOpacity] = useState(0.18);
  const [cloudOpacityTarget, setCloudOpacityTarget] = useState(0.18);
  const [rainCloudOpacity, setRainCloudOpacity] = useState(0);
  const [rainCloudOpacityTarget, setRainCloudOpacityTarget] = useState(0);
  const rainCloudTargetRef = useRef(0);
  const rainSpawnTimer = useRef(0);
  useEffect(() => {
    const targetType: WeatherType = config.rainEnabled ? (season === 'winter' ? 'snow' : 'rain') : 'clear';
    const targetIntensity = config.rainEnabled ? config.rainIntensity : 0;
    const targetRainCloudCount = config.rainEnabled ? Math.round(10 + config.rainIntensity * 8) : 0;

    setWeather((prev) => ({
      ...prev,
      type: targetType,
      intensity: targetIntensity,
    }));

    rainCloudTargetRef.current = targetRainCloudCount;
    setCloudOpacityTarget(config.rainEnabled ? 0.28 : 0.18);
    setRainCloudOpacityTarget(config.rainEnabled ? 0.6 : 0);
  }, [config.rainEnabled, config.rainIntensity, season, size]);

  const starsRef = useRef<THREE.Points>(null);
  useLayoutEffect(() => {
    if (!starsRef.current) return;
    const material = starsRef.current.material as THREE.ShaderMaterial;
    material.transparent = true;
    material.opacity = THREE.MathUtils.clamp(starVisibility, 0, 1);
    material.needsUpdate = true;
  }, [starVisibility]);

  // Fog State
  const [fogColor, setFogColor] = useState(new THREE.Color('#ffffff'));
  const [fogNear, setFogNear] = useState(10);
  const [fogFar, setFogFar] = useState(200);

  // References
  const lightRef = useRef<THREE.PointLight>(null);
  const terrainRef = useRef<THREE.Mesh>(null);
  const precipitationRef = useRef<THREE.Points>(null);

  // Memoize terrain generation
  const { positions, colors, normals, indices, pines, broadleafs, rocks, waterInstances, peakInstances, segmentSize, navGrid } = useMemo(() => {
    return generateTerrain(
      size,
      resolution,
      seed,
      waterLevel,
      forestDensity,
      rockDensity,
      reliefScale,
      riverWidth,
      lakeThreshold,
      season,
      landBias
    );
  }, [size, resolution, seed, waterLevel, forestDensity, rockDensity, reliefScale, riverWidth, lakeThreshold, season, landBias]);

  // Geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }, [positions, colors, normals, indices]);

  const landHitboxGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const landIndices: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;

      const ay = positions[a + 1];
      const by = positions[b + 1];
      const cy = positions[c + 1];

      if (ay >= WATER_LEVEL && by >= WATER_LEVEL && cy >= WATER_LEVEL) {
        landIndices.push(indices[i], indices[i + 1], indices[i + 2]);
      }
    }

    const IndexArray = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
    geo.setIndex(new THREE.BufferAttribute(new IndexArray(landIndices), 1));
    geo.computeVertexNormals();

    return geo;
  }, [positions, indices]);

  // Create Boundary Hitboxes (Walls)
  const boundaries = useMemo(() => {
    const halfSize = size / 2;
    const wallThickness = 5;
    const wallHeight = 100;

    return [
      // North
      { pos: [0, 0, -halfSize - wallThickness / 2], args: [size + wallThickness * 2, wallHeight, wallThickness] },
      // South
      { pos: [0, 0, halfSize + wallThickness / 2], args: [size + wallThickness * 2, wallHeight, wallThickness] },
      // East
      { pos: [halfSize + wallThickness / 2, 0, 0], args: [wallThickness, wallHeight, size] },
      // West
      { pos: [-halfSize - wallThickness / 2, 0, 0], args: [wallThickness, wallHeight, size] },
    ];
  }, [size]);


  const wrapTime = (value: number) => {
    const fullCycle = Math.PI * 2;
    return value % fullCycle;
  };

  const getPhaseAndProgress = (cycle: number): { phase: DayPhase; progress: number } => {
    const normalized = cycle / (Math.PI * 2); // 0-1
    const segment = Math.floor(normalized * 4) % 4;
    const segmentProgress = (normalized * 4) - segment;

    switch (segment) {
      case 0:
        return { phase: 'dawn', progress: segmentProgress };
      case 1:
        return { phase: 'noon', progress: segmentProgress };
      case 2:
        return { phase: 'dusk', progress: segmentProgress };
      default:
        return { phase: 'midnight', progress: segmentProgress };
    }
  };

  function createClouds(count: number): CloudInstance[] {
    return Array.from({ length: count }, () => ({
      position: [
        (Math.random() - 0.5) * size,
        size * 0.25 + Math.random() * 15,
        (Math.random() - 0.5) * size,
      ],
      scale: 8 + Math.random() * 12,
    }));
  }

  // Frame Loop for Cycle and Interactions
  useFrame((state, delta) => {
    // 1. Day/Night Cycle Logic
    if (dayNightSpeed > 0) {
      const radiansPerSecond = 0.0261799;
      const newTime = wrapTime(time + delta * dayNightSpeed * radiansPerSecond);
      setTime(newTime);

      const radius = size * 1.5;
      const elevation = Math.sin(newTime);
      const azimuth = Math.cos(newTime);

      setSunPosition(new THREE.Vector3(azimuth * radius, elevation * radius, 0));

      const { phase, progress } = getPhaseAndProgress(newTime);

      const lerpColors = (from: THREE.Color, to: THREE.Color, t: number) => from.clone().lerp(to, t);
      const lerpNumbers = (from: number, to: number, t: number) => THREE.MathUtils.lerp(from, to, t);

      const phaseTargets: Record<DayPhase, {
        sun: THREE.Color;
        ambient: THREE.Color;
        fog: THREE.Color;
        intensity: number;
        rayleigh: number;
        stars: number;
      }> = {
        dawn: {
          sun: new THREE.Color('#ffb347'),
          ambient: new THREE.Color('#7c3aed'),
          fog: new THREE.Color('#5b21b6'),
          intensity: 0.4,
          rayleigh: 2.5,
          stars: 0.4,
        },
        noon: {
          sun: new THREE.Color('#fff7cd'),
          ambient: new THREE.Color('#ffffff'),
          fog: season === 'autumn' ? new THREE.Color('#fed7aa') : new THREE.Color('#e0f2fe'),
          intensity: 0.8,
          rayleigh: 0.25,
          stars: 0,
        },
        dusk: {
          sun: new THREE.Color('#ff7043'),
          ambient: new THREE.Color('#6d28d9'),
          fog: new THREE.Color('#312e81'),
          intensity: 0.35,
          rayleigh: 2.0,
          stars: 0.5,
        },
        midnight: {
          sun: new THREE.Color('#0b1021'),
          ambient: new THREE.Color('#0f172a'),
          fog: new THREE.Color('#0b132b'),
          intensity: 0.1,
          rayleigh: 0.1,
          stars: 1,
        },
      };

      const nextPhase = phase === 'dawn' ? 'noon' : phase === 'noon' ? 'dusk' : phase === 'dusk' ? 'midnight' : 'dawn';
      const fromTarget = phaseTargets[phase];
      const toTarget = phaseTargets[nextPhase];

      const targetSunColor = lerpColors(fromTarget.sun, toTarget.sun, progress);
      const baseAmbient = lerpColors(fromTarget.ambient, toTarget.ambient, progress);
      const targetIntensity = lerpNumbers(fromTarget.intensity, toTarget.intensity, progress);
      const targetRayleigh = lerpNumbers(fromTarget.rayleigh, toTarget.rayleigh, progress);
      const targetFogColor = lerpColors(fromTarget.fog, toTarget.fog, progress);
      const targetStars = lerpNumbers(fromTarget.stars, toTarget.stars, progress);

      const seasonalAmbient = baseAmbient.clone();
      if (season === 'winter') {
        seasonalAmbient.lerp(new THREE.Color('#e2e8f0'), 0.35);
      } else if (season === 'autumn') {
        seasonalAmbient.lerp(new THREE.Color('#fcd34d'), 0.15);
      }

      setSunColor(prev => prev.lerp(targetSunColor, 0.05));
      setAmbientColor(prev => prev.lerp(seasonalAmbient, 0.05));
      setAmbientIntensity(prev => THREE.MathUtils.lerp(prev, targetIntensity, 0.05));
      setSkyRayleigh(prev => THREE.MathUtils.lerp(prev, targetRayleigh, 0.02));
      setFogColor(prev => prev.lerp(targetFogColor, 0.05));
      setStarVisibility(prev => THREE.MathUtils.lerp(prev, targetStars, 0.05));
    }

    // Update Fog Settings based on config
    const fogDensityMultiplier = season === 'winter' ? 0.6 : (season === 'autumn' ? 0.8 : 1.0);
    setFogNear(10);
    setFogFar(size * fogDensityMultiplier);

    // 2. Weather fades
    setCloudOpacity((prev) => THREE.MathUtils.lerp(prev, cloudOpacityTarget, 0.02));
    setRainCloudOpacity((prev) => THREE.MathUtils.lerp(prev, rainCloudOpacityTarget, 0.03));

    rainSpawnTimer.current += delta;

    if (rainSpawnTimer.current > 0.6) {
      if (rainClouds.length < rainCloudTargetRef.current && rainCloudOpacityTarget > 0) {
        setRainClouds((prev) => [...prev, ...createClouds(1)]);
      } else if (
        rainClouds.length > rainCloudTargetRef.current &&
        (!config.rainEnabled || rainCloudOpacity < 0.1)
      ) {
        setRainClouds((prev) => prev.slice(1));
      }
      rainSpawnTimer.current = 0;
    }

    // 3. Flashlight
    if (flashlightEnabled && lightRef.current && terrainRef.current) {
      state.raycaster.setFromCamera(state.pointer, state.camera);
      const intersects = state.raycaster.intersectObject(terrainRef.current, false);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        lightRef.current.position.set(point.x, point.y + 20, point.z);
        lightRef.current.intensity = flashlightIntensity;
      } else {
        lightRef.current.intensity = 0;
      }
    }
  });

  const Precipitation: React.FC<{ type: WeatherType; intensity: number; area: number }> = ({ type, intensity, area }) => {
    const count = Math.max(0, Math.floor(1200 * intensity));
    const positions = useMemo(() => {
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = (Math.random() - 0.5) * area;
        arr[i * 3 + 1] = Math.random() * 60 + 30;
        arr[i * 3 + 2] = (Math.random() - 0.5) * area;
      }
      return arr;
    }, [count, area]);

    const speeds = useMemo(() => {
      const arr = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        arr[i] = type === 'snow' ? -(3 + Math.random() * 2) : -(12 + Math.random() * 6);
      }
      return arr;
    }, [count, type]);

    useFrame((_, delta) => {
      if (!precipitationRef.current) return;
      const positionsAttr = precipitationRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        positionsAttr.array[i * 3 + 1] += speeds[i] * delta * 10;

        if (positionsAttr.array[i * 3 + 1] < 0) {
          positionsAttr.array[i * 3] = (Math.random() - 0.5) * area;
          positionsAttr.array[i * 3 + 1] = Math.random() * 60 + 40;
          positionsAttr.array[i * 3 + 2] = (Math.random() - 0.5) * area;
        }
      }
      positionsAttr.needsUpdate = true;
    });

    if (count === 0) return null;

    const isSnow = type === 'snow';
    const particleSize = isSnow ? 0.3675 : 0.35;
    const particleOpacity = isSnow ? 0.6 : 0.85;
    const particleColor = isSnow ? '#e2e8f0' : '#93c5fd';

      return (
        <points ref={precipitationRef} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            color={particleColor}
          size={particleSize}
          transparent
          opacity={particleOpacity}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    );
  };

  const CloudLayer: React.FC<{ clouds: CloudInstance[]; opacity: number }> = ({ clouds, opacity }) => (
    <group>
      {clouds.map((cloud, index) => (
        <Billboard key={`cloud-${index}`} position={cloud.position} follow rotation={[0, 0, 0]}>
          <mesh>
            <planeGeometry args={[cloud.scale, cloud.scale * 0.6]} />
            <meshStandardMaterial
              color="#e5e7eb"
              transparent
              opacity={opacity}
              depthWrite={false}
              emissiveIntensity={0}
            />
          </mesh>
        </Billboard>
      ))}
    </group>
  );

  return (
    <group>
      {/* Dynamic Fog */}
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      {/* Set background to fog color to blend horizon */}
      <color attach="background" args={[fogColor.r, fogColor.g, fogColor.b]} />

      {/* Environment */}
      <ambientLight color={ambientColor} intensity={ambientIntensity} />

      <directionalLight
        position={sunPosition}
        color={sunColor}
        intensity={sunPosition.y > 0 ? 1.5 : 0}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
        shadow-camera-near={1}
        shadow-camera-far={size * 3}
        shadow-camera-left={-size / 2}
        shadow-camera-right={size / 2}
        shadow-camera-top={size / 2}
        shadow-camera-bottom={-size / 2}
      />


      {/* Only render Sky if not too foggy/night */}
      {dayNightSpeed > 0 && (
        <Sky
          sunPosition={sunPosition}
          turbidity={season === 'winter' ? 20 : 10}
          rayleigh={skyRayleigh}
          mieCoefficient={season === 'autumn' ? 0.05 : 0.005}
          mieDirectionalG={0.8}
        />
      )}

      <Stars
        ref={starsRef}
        radius={300}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />

      {flashlightEnabled && (
        <pointLight
          ref={lightRef}
          distance={150}
          decay={1.5}
          color="#fff7ed"
          castShadow
        />
      )}

      {/* Main Terrain Mesh */}
      <mesh ref={terrainRef} receiveShadow castShadow geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          flatShading
          side={THREE.DoubleSide}
          shadowSide={THREE.FrontSide}
          roughness={0.8}
          metalness={0.05}
        />
      </mesh>

      {/* Ground hitbox that follows the terrain surface (triangulated) */}
      <mesh geometry={landHitboxGeometry} castShadow={false} receiveShadow={false}>
        <meshBasicMaterial
          color="#22c55e"
          wireframe
          transparent
          opacity={showHitboxes ? 0.65 : 0}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      <NavigationOverlay grid={navGrid} segmentSize={segmentSize} visible={showHitboxes || showNavMesh} />


      {/* Instanced Objects (Trees, Rocks) */}
      <TerrainObjects data={pines} type="pine" showHitboxes={showHitboxes} season={season} />
      <TerrainObjects data={broadleafs} type="broadleaf" showHitboxes={showHitboxes} season={season} />
      <TerrainObjects data={rocks} type="rock" showHitboxes={showHitboxes} season={season} />

      {/* Special Hitbox Layers (Water & Peaks) */}
      <HitboxLayer
        instances={waterInstances}
        color="#06b6d4" // Cyan
        size={segmentSize}
        visible={showHitboxes}
      />
      <HitboxLayer
        instances={peakInstances}
        color="#f97316" // Orange
        size={segmentSize}
        visible={showHitboxes}
      />

      {/* Atmosphere */}
      <CloudLayer clouds={staticClouds} opacity={cloudOpacity} />
      <CloudLayer clouds={rainClouds} opacity={rainCloudOpacity} />
      {weather.type !== 'clear' && <Precipitation type={weather.type} intensity={weather.intensity} area={size} />}


      {/* Water Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[size * 1.5, size * 1.5]} />
        <meshStandardMaterial
          color={season === 'winter' ? '#94a3b8' : '#3b82f6'}
          transparent
          opacity={0.7}
          roughness={0.05}
          metalness={0.5}
        />
      </mesh>

      {/* Map Boundary Walls (Hitboxes) */}
      <group>
        {boundaries.map((b, i) => (
          <mesh key={`boundary-${i}`} position={new THREE.Vector3(...b.pos)}>
            <boxGeometry args={[b.args[0], b.args[1], b.args[2]]} />
            <meshBasicMaterial
              color="red"
              wireframe
              visible={showHitboxes}
              transparent={!showHitboxes}
              opacity={showHitboxes ? 1 : 0}
            />
          </mesh>
        ))}
      </group>

      {/* Floor Hitbox visual */}
      {showHitboxes && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -10, 0]}>
          <boxGeometry args={[size, size, 1]} />
          <meshBasicMaterial color="yellow" wireframe />
        </mesh>
      )}
    </group>
  );
};