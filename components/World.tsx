import React, { useMemo, useRef, useState, useLayoutEffect, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldConfig, ObjectInstance, NavigationCell, BoatInstance, AgentState } from '../types';
import { generateTerrain } from '../utils/noise';
import { TerrainObjects } from './TerrainObjects';
import { Billboard, Sky, Stars } from '@react-three/drei';
import { HumanAgent, HumanRuntime } from './HumanAgent';
import {
  buildMultimodalPath,
  buildLandPath,
  createNavContext,
  findNearestBoat,
  findNearestWalkable,
  findRandomWalkable,
  worldToCellIndex,
} from '../utils/navigation';

type DayPhase = 'dawn' | 'noon' | 'dusk' | 'midnight';
type WeatherType = 'clear' | 'rain' | 'snow';

export interface WorldHandle {
  spawnHuman: () => void;
}

type AgentRecord = HumanRuntime & {
  path: number[];
  waypoint: number;
  targetIndex: number | null;
  lastRepath: number;
  lastProgressCheck: number;
  distanceSinceProgress: number;
  pauseTimer: number;
  nextPauseAt: number;
  nextGazeShift: number;
  state: AgentState;
  boatId: string | null;
  boatWaypointStart: number | null;
  boatWaypointEnd: number | null;
  mountProgress: number;
  waitingUntil: number;
  dismountTarget: THREE.Vector3 | null;
};

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

const BoatFleet: React.FC<{ boats: BoatInstance[]; showHitboxes: boolean }> = ({ boats, showHitboxes }) => {
  const hullRef = useRef<THREE.InstancedMesh>(null);
  const deckRef = useRef<THREE.InstancedMesh>(null);
  const hitboxRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!hullRef.current || !deckRef.current) return;

    boats.forEach((boat, index) => {
      dummy.position.set(boat.x, boat.y, boat.z);
      dummy.rotation.set(0, boat.rotation, 0);
      dummy.scale.set(boat.scale, boat.scale, boat.scale);
      dummy.updateMatrix();
      hullRef.current!.setMatrixAt(index, dummy.matrix);
      deckRef.current!.setMatrixAt(index, dummy.matrix);
      if (hitboxRef.current) {
        hitboxRef.current.setMatrixAt(index, dummy.matrix);
      }
    });

    hullRef.current.instanceMatrix.needsUpdate = true;
    deckRef.current.instanceMatrix.needsUpdate = true;
    if (hitboxRef.current) hitboxRef.current.instanceMatrix.needsUpdate = true;
  }, [boats, showHitboxes]);

  if (boats.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={hullRef} args={[undefined, undefined, boats.length]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.7, 1.4]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.7} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={deckRef} args={[undefined, undefined, boats.length]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.4, 1]} />
        <meshStandardMaterial color="#d6d3d1" roughness={0.4} metalness={0.05} />
      </instancedMesh>
      {showHitboxes && (
        <instancedMesh
          ref={hitboxRef}
          args={[undefined, undefined, boats.length]}
          frustumCulled={false}
          renderOrder={1}
        >
          <boxGeometry args={[3.4, 0.9, 1.6]} />
          <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.6} />
        </instancedMesh>
      )}
    </group>
  );
};

export const World = forwardRef<WorldHandle, WorldProps>(({ config }, ref) => {
  const {
    size, resolution, seed, waterLevel, forestDensity,
    rockDensity, reliefScale, riverWidth, lakeThreshold, showHitboxes, showNavMesh, showLandNavMesh, showWaterNavMesh,
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
  const fireflyVisibility = sunPosition.y < 0 ? starVisibility : 0;
  const BOAT_PROXIMITY_RADIUS = 12;
  const MOUNT_DURATION = 1.2;
  const DISMOUNT_DURATION = 0.9;
  const WAIT_RETRY_MS = 2500;

  // Weather State
  const [weather, setWeather] = useState<WeatherState>({
    type: 'clear',
    intensity: 0,
  });
  const humansRef = useRef<Map<string, AgentRecord>>(new Map());
  const [humanIds, setHumanIds] = useState<string[]>([]);
  const HUMAN_SCALE = 0.9;
  const HUMAN_HEIGHT = 2.2 * HUMAN_SCALE;
  const HUMAN_RADIUS = 0.45 * HUMAN_SCALE;
  const HUMAN_GROUND_OFFSET = 0.06;
  const HUMAN_COLORS = useMemo(() => ['#f97316', '#22d3ee', '#facc15', '#34d399'], []);
  const staticClouds = useMemo<CloudInstance[]>(() => createClouds(8), [size]);
  const [rainClouds, setRainClouds] = useState<CloudInstance[]>([]);
  const [cloudOpacity, setCloudOpacity] = useState(0.18);
  const [cloudOpacityTarget, setCloudOpacityTarget] = useState(0.18);
  const [rainCloudOpacity, setRainCloudOpacity] = useState(0);
  const [rainCloudOpacityTarget, setRainCloudOpacityTarget] = useState(0);
  const rainCloudTargetRef = useRef(0);
  const rainSpawnTimer = useRef(0);
  const fireflyRef = useRef<THREE.Points>(null);
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

  useLayoutEffect(() => {
    if (!fireflyRef.current) return;
    const material = fireflyRef.current.material as THREE.PointsMaterial;
    material.transparent = true;
    material.opacity = THREE.MathUtils.clamp(fireflyVisibility, 0, 1);
    material.needsUpdate = true;
  }, [fireflyVisibility]);

  // Fog State
  const [fogColor, setFogColor] = useState(new THREE.Color('#ffffff'));
  const [fogNear, setFogNear] = useState(10);
  const [fogFar, setFogFar] = useState(200);

  // References
  const lightRef = useRef<THREE.PointLight>(null);
  const terrainRef = useRef<THREE.Mesh>(null);
  const precipitationRef = useRef<THREE.Points>(null);

  // Memoize terrain generation
  const { positions, colors, normals, indices, pines, broadleafs, rocks, waterInstances, peakInstances, boats, segmentSize, navGrid, navResolution } = useMemo(() => {
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

  const [boatStates, setBoatStates] = useState<BoatInstance[]>(() => boats.map((boat) => ({ ...boat })));
  const boatOccupants = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    const next = new Map<string, string | null>();
    boatStates.forEach((boat) => next.set(boat.id, boatOccupants.current.get(boat.id) ?? null));
    boatOccupants.current = next;
  }, [boatStates]);

  const navContext = useMemo(
    () => createNavContext(navGrid, navResolution, segmentSize, size, boatStates),
    [boatStates, navGrid, navResolution, segmentSize, size]
  );

  const getGroundedHeight = useCallback(
    (cellHeight: number) => cellHeight + HUMAN_GROUND_OFFSET,
    [HUMAN_GROUND_OFFSET]
  );

  useEffect(() => {
    humansRef.current.clear();
    setHumanIds([]);
  }, [navGrid]);

  const randomPauseDuration = useCallback(() => 1800 + Math.random() * 2200, []);
  const randomPauseInterval = useCallback(() => 4500 + Math.random() * 7000, []);

  const assignNewDestination = useCallback(
    (agent: AgentRecord, preferLand = false) => {
      if (!navContext.grid.length) return;
      const startIndex = findNearestWalkable(agent.position, navContext);
      if (startIndex == null) return;

      const desiredDistance = Math.max(size * 0.35, 20);
      let destination = findRandomWalkable(navContext, startIndex, desiredDistance);
      if (destination == null) destination = findRandomWalkable(navContext, startIndex, 0);
      if (destination == null) return;

      const boatNearby = findNearestBoat(agent.position, navContext);
      const path = preferLand ? buildLandPath(startIndex, destination, navContext) : buildMultimodalPath(startIndex, destination, navContext);
      if (path.length < 2) return;

      agent.path = path;
      agent.waypoint = 1;
      agent.targetIndex = destination;
      const traversesWater = path.some((idx) => navContext.grid[idx]?.type === 'water');
      agent.mode = traversesWater || boatNearby ? 'running' : path.length > navResolution ? 'running' : 'walking';
      agent.lastRepath = performance.now();
      agent.lastProgressCheck = performance.now();
      agent.distanceSinceProgress = 0;
      agent.pauseTimer = 0;
      agent.nextPauseAt = performance.now() + randomPauseInterval();
      agent.nextGazeShift = 0;
      if (agent.boatId) boatOccupants.current.set(agent.boatId, null);
      agent.state = AgentState.Walking;
      agent.boatId = null;
      agent.boatWaypointStart = null;
      agent.boatWaypointEnd = null;
      agent.mountProgress = 0;
      agent.waitingUntil = 0;
      agent.dismountTarget = null;

      const nextCell = navContext.grid[path[1]];
      if (nextCell) {
        agent.heading = Math.atan2(nextCell.x - agent.position.x, nextCell.z - agent.position.z);
      }
    },
    [navContext, navResolution, randomPauseInterval, size]
  );

  const createAgent = useCallback(
    (cellIndex: number) => {
      const cell = navContext.grid[cellIndex];
      if (!cell) return;

      const id = `human-${Math.random().toString(16).slice(2, 8)}`;
      const position = new THREE.Vector3(cell.x, getGroundedHeight(cell.height), cell.z);

      const agent: AgentRecord = {
        id,
        position,
        heading: 0,
        mode: 'walking',
        color: HUMAN_COLORS[Math.floor(Math.random() * HUMAN_COLORS.length)],
        height: HUMAN_HEIGHT,
        radius: HUMAN_RADIUS,
        path: [],
        waypoint: 0,
        targetIndex: null,
        lastRepath: performance.now(),
        lastProgressCheck: performance.now(),
        distanceSinceProgress: 0,
        pauseTimer: 0,
        nextPauseAt: performance.now() + randomPauseInterval(),
        nextGazeShift: 0,
        state: AgentState.Walking,
        boatId: null,
        boatWaypointStart: null,
        boatWaypointEnd: null,
        mountProgress: 0,
        waitingUntil: 0,
        dismountTarget: null,
      };

      humansRef.current.set(id, agent);
      setHumanIds((prev) => [...prev, id]);
      assignNewDestination(agent);
    },
    [
      HUMAN_COLORS,
      HUMAN_HEIGHT,
      HUMAN_RADIUS,
      assignNewDestination,
      getGroundedHeight,
      navContext,
      randomPauseInterval,
    ]
  );

  const spawnHuman = useCallback(() => {
    if (!navContext.grid.length) return;
    const index = findRandomWalkable(navContext);
    if (index == null) return;
    createAgent(index);
  }, [createAgent, navContext]);

  useImperativeHandle(ref, () => ({ spawnHuman }), [spawnHuman]);

  const seaLevel = waterLevel;

  const fireflies = useMemo(() => {
    const treeInstances = [...pines, ...broadleafs];
    if (!treeInstances.length) return [] as {
      position: THREE.Vector3;
      phase: number;
      floatHeight: number;
      sway: number;
    }[];

    const targetCount = Math.min(30, Math.max(10, Math.floor(10 + Math.random() * 11)));
    const chosen: typeof treeInstances = [];

    for (let i = 0; i < targetCount; i++) {
      chosen.push(treeInstances[Math.floor(Math.random() * treeInstances.length)]);
    }

    return chosen.map((tree) => {
      const jitterRadius = 4;
      const basePosition = new THREE.Vector3(
        tree.x + (Math.random() - 0.5) * jitterRadius,
        tree.y + 1 + Math.random() * 2,
        tree.z + (Math.random() - 0.5) * jitterRadius,
      );

      return {
        position: basePosition,
        phase: Math.random() * Math.PI * 2,
        floatHeight: 0.5 + Math.random() * 0.6,
        sway: 0.3 + Math.random() * 0.25,
      };
    });
  }, [pines, broadleafs]);

  const fireflyPositions = useMemo(() => {
    const positions = new Float32Array(fireflies.length * 3);
    fireflies.forEach((firefly, index) => {
      positions[index * 3] = firefly.position.x;
      positions[index * 3 + 1] = firefly.position.y;
      positions[index * 3 + 2] = firefly.position.z;
    });
    return positions;
  }, [fireflies]);

  const navigationGeometries = useMemo(() => {
    if (!navGrid.length) return { water: null, land: null };

    const vertexCount = navGrid.length;
    const positions = new Float32Array(vertexCount * 3);
    const overlayHeight = 0.12;

    navGrid.forEach((cell, i) => {
      const baseY = cell.type === 'water' ? Math.max(cell.height, seaLevel) : cell.height;

      positions[i * 3] = cell.x;
      positions[i * 3 + 1] = baseY + overlayHeight;
      positions[i * 3 + 2] = cell.z;
    });

    const buildGeometry = (targetType: NavigationCell['type'], color: THREE.Color) => {
      const colors = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }

      const indices: number[] = [];
      for (let i = 0; i < navResolution - 1; i++) {
        for (let j = 0; j < navResolution - 1; j++) {
          const a = i * navResolution + j;
          const b = i * navResolution + j + 1;
          const c = (i + 1) * navResolution + j + 1;
          const d = (i + 1) * navResolution + j;

          const quadTypes = [a, b, c, d].map((index) => navGrid[index].type);
          const allWater = quadTypes.every((type) => type === 'water');

          // Keep water quads exclusive, but allow the land mesh to fill any
          // remaining gaps so that the overlays always cover the full grid.
          const quadMatches =
            targetType === 'water'
              ? allWater
              : !allWater;

          if (!quadMatches) continue;

          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      if (!indices.length) return null;

      const IndexArray = navGrid.length > 65535 ? Uint32Array : Uint16Array;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(new IndexArray(indices), 1));
      geometry.computeVertexNormals();
      return geometry;
    };

    return {
      water: buildGeometry('water', new THREE.Color('#a855f7')),
      land: buildGeometry('land', new THREE.Color('#ef4444')),
    };
  }, [navGrid, navResolution, seaLevel]);

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

      if (ay >= seaLevel && by >= seaLevel && cy >= seaLevel) {
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

    // 4. Fireflies (only gently animate during night)
    if (fireflyRef.current && fireflies.length) {
      const positionsAttr = fireflyRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const elapsed = state.clock.elapsedTime;

      for (let i = 0; i < fireflies.length; i++) {
        const base = fireflies[i];
        const offsetY = Math.sin(elapsed * 0.6 + base.phase) * base.floatHeight;
        const offsetX = Math.cos(elapsed * 0.4 + base.phase) * base.sway;
        const offsetZ = Math.sin(elapsed * 0.5 + base.phase) * base.sway;

        positionsAttr.array[i * 3] = base.position.x + offsetX;
        positionsAttr.array[i * 3 + 1] = base.position.y + offsetY;
        positionsAttr.array[i * 3 + 2] = base.position.z + offsetZ;
      }

      positionsAttr.needsUpdate = true;
    }

    // 5. Autonomous humanoids navigating land navmesh and boats
    if (navContext.grid.length && humansRef.current.size) {
      const boatUpdates = new Map<string, BoatInstance>();

      humansRef.current.forEach((agent) => {
        const now = performance.now();
        const currentIndex = worldToCellIndex(agent.position, navContext);

        if (!agent.path.length || agent.waypoint >= agent.path.length) {
          assignNewDestination(agent);
          return;
        }

        if (agent.state === AgentState.Waiting) {
          if (now >= agent.waitingUntil) {
            assignNewDestination(agent, true);
            agent.state = AgentState.Walking;
          }
          return;
        }

        if (agent.state === AgentState.Walking && agent.pauseTimer <= 0 && now >= agent.nextPauseAt) {
          agent.pauseTimer = randomPauseDuration();
          agent.nextPauseAt = now + agent.pauseTimer + randomPauseInterval();
          agent.nextGazeShift = now;
          agent.distanceSinceProgress = 0;
          agent.lastProgressCheck = now;
        }

        if (agent.state === AgentState.Walking && agent.pauseTimer > 0) {
          agent.pauseTimer = Math.max(0, agent.pauseTimer - delta * 1000);

          if (agent.pauseTimer > 0 && now >= agent.nextGazeShift) {
            const gazeIndex = findRandomWalkable(navContext, currentIndex, 6);
            if (gazeIndex != null) {
              const gazeCell = navContext.grid[gazeIndex];
              agent.heading = Math.atan2(gazeCell.x - agent.position.x, gazeCell.z - agent.position.z);
            } else {
              agent.heading = wrapTime(agent.heading + (Math.random() - 0.5));
            }

            agent.nextGazeShift = now + 400 + Math.random() * 700;
          }

          return;
        }

        const currentCell = navContext.grid[currentIndex];
        if (agent.state !== AgentState.Sailing && (!currentCell.walkable || currentCell.type !== 'land')) {
          const safeIndex = findNearestWalkable(agent.position, navContext);
          if (safeIndex != null) {
            const safeCell = navContext.grid[safeIndex];
            agent.position.set(safeCell.x, getGroundedHeight(safeCell.height), safeCell.z);
          }
          assignNewDestination(agent);
          return;
        }

        const targetCell = navContext.grid[agent.path[agent.waypoint]];
        if (!targetCell || !targetCell.walkable) {
          assignNewDestination(agent);
          return;
        }

        if (targetCell.type === 'water' && agent.state === AgentState.Walking) {
          let waterEnd = agent.waypoint;
          while (
            waterEnd + 1 < agent.path.length &&
            navContext.grid[agent.path[waterEnd + 1]]?.type === 'water'
          ) {
            waterEnd += 1;
          }

          agent.boatWaypointStart = agent.waypoint;
          agent.boatWaypointEnd = waterEnd;
          const boatCandidate = findNearestBoat(agent.position, navContext, BOAT_PROXIMITY_RADIUS);

          if (boatCandidate && !boatOccupants.current.get(boatCandidate.instance.id)) {
            agent.boatId = boatCandidate.instance.id;
            boatOccupants.current.set(boatCandidate.instance.id, agent.id);
            const shoreIndex = findNearestWalkable(
              new THREE.Vector3(boatCandidate.instance.x, boatCandidate.instance.y, boatCandidate.instance.z),
              navContext
            );

            if (shoreIndex != null) {
              const toBoat = buildLandPath(currentIndex, shoreIndex, navContext);
              if (toBoat.length > 1) {
                agent.path = toBoat;
                agent.waypoint = 1;
                agent.state = AgentState.SeekingBoat;
                return;
              }
            }

            boatOccupants.current.set(boatCandidate.instance.id, null);
            agent.boatId = null;
            agent.waitingUntil = now + WAIT_RETRY_MS;
            agent.state = AgentState.Waiting;
            return;
          }

          assignNewDestination(agent, true);
          agent.state = AgentState.Waiting;
          agent.waitingUntil = now + WAIT_RETRY_MS;
          return;
        }

        if (agent.state === AgentState.Mounting) {
          agent.mountProgress = Math.min(1, agent.mountProgress + delta / MOUNT_DURATION);
          const boat = boatStates.find((b) => b.id === agent.boatId);
          if (boat) {
            const boatPos = new THREE.Vector3(boat.x, boat.y + 0.2, boat.z);
            agent.position.lerp(boatPos, 0.18);
            agent.heading = boat.rotation;
          }

          if (agent.mountProgress >= 1) {
            const boat = boatStates.find((b) => b.id === agent.boatId);
            agent.state = AgentState.Sailing;
            agent.mode = boat && boat.mass > 40 ? 'motor' : 'rowing';
            agent.waypoint = agent.boatWaypointStart ?? agent.waypoint;
            agent.mountProgress = 0;
          }
          return;
        }

        if (agent.state === AgentState.Sailing) {
          const boat = boatStates.find((b) => b.id === agent.boatId);
          if (!boat) {
            if (agent.boatId) boatOccupants.current.set(agent.boatId, null);
            agent.state = AgentState.Waiting;
            agent.waitingUntil = now + WAIT_RETRY_MS;
            return;
          }

          const waterTarget = navContext.grid[agent.path[agent.waypoint]];
          if (!waterTarget) {
            assignNewDestination(agent);
            return;
          }

          const boatPos = new THREE.Vector3(boat.x, boat.y, boat.z);
          const targetPosition = new THREE.Vector3(waterTarget.x, Math.max(waterTarget.height, seaLevel), waterTarget.z);
          const direction = targetPosition.clone().sub(boatPos);
          const distance = direction.length();

          if (distance < 0.5) {
            agent.waypoint += 1;
            if (agent.boatWaypointEnd != null && agent.waypoint > agent.boatWaypointEnd) {
              const landIndex = agent.path[agent.boatWaypointEnd + 1];
              const landCell = navContext.grid[landIndex];
              agent.dismountTarget = landCell
                ? new THREE.Vector3(landCell.x, getGroundedHeight(landCell.height), landCell.z)
                : null;
              agent.state = AgentState.Dismounting;
              agent.mountProgress = 0;
            }
            return;
          }

          direction.normalize();
          const boatSpeed = agent.mode === 'motor' ? 10 : 6;
          const step = Math.min(distance, boatSpeed * delta);
          const heading = Math.atan2(direction.x, direction.z);
          const updatedBoat: BoatInstance = { ...boat, x: boat.x + direction.x * step, z: boat.z + direction.z * step, rotation: heading };
          boatUpdates.set(updatedBoat.id, updatedBoat);
          agent.position.set(updatedBoat.x, updatedBoat.y, updatedBoat.z);
          agent.heading = heading;
          agent.distanceSinceProgress += step;
          return;
        }

        if (agent.state === AgentState.Dismounting) {
          agent.mountProgress = Math.min(1, agent.mountProgress + delta / DISMOUNT_DURATION);
          if (agent.dismountTarget) {
            agent.position.lerp(agent.dismountTarget, 0.16);
            agent.heading = Math.atan2(
              agent.dismountTarget.x - agent.position.x,
              agent.dismountTarget.z - agent.position.z
            );
          }

          if (agent.mountProgress >= 1) {
            if (agent.boatId) boatOccupants.current.set(agent.boatId, null);
            if (agent.boatWaypointEnd != null) {
              agent.waypoint = agent.boatWaypointEnd + 1;
            }
            agent.state = AgentState.Walking;
            agent.mode = 'walking';
            agent.boatId = null;
            agent.boatWaypointStart = null;
            agent.boatWaypointEnd = null;
            agent.mountProgress = 0;
            agent.dismountTarget = null;
            agent.waitingUntil = 0;
          }
          return;
        }

        if (agent.state === AgentState.SeekingBoat) {
          const boat = agent.boatId ? boatStates.find((b) => b.id === agent.boatId) : null;
          const boatPosition = boat ? new THREE.Vector3(boat.x, boat.y, boat.z) : null;
          const proximity = boatPosition ? boatPosition.distanceTo(agent.position) : Infinity;

          if (proximity < 1.2) {
            agent.state = AgentState.Mounting;
            agent.mountProgress = 0;
            return;
          }
        }

        const targetPosition = new THREE.Vector3(targetCell.x, getGroundedHeight(targetCell.height), targetCell.z);
        const direction = targetPosition.clone().sub(agent.position);
        const distance = direction.length();

        if (distance < 0.35) {
          agent.waypoint += 1;
          if (agent.waypoint >= agent.path.length) assignNewDestination(agent);
          return;
        }

        direction.normalize();
        const slopeFactor = THREE.MathUtils.clamp(1 - targetCell.slope * 0.22, 0.4, 1);
        const speed = (agent.mode === 'running' ? 7 : 3.6) * slopeFactor;
        const step = Math.min(distance, speed * delta);
        agent.position.addScaledVector(direction, step);
        agent.heading = Math.atan2(direction.x, direction.z);

        agent.distanceSinceProgress += step;
        if (now - agent.lastProgressCheck > 1200) {
          if (agent.distanceSinceProgress < 0.5) {
            assignNewDestination(agent);
          }
          agent.distanceSinceProgress = 0;
          agent.lastProgressCheck = now;
        }
      });

      if (boatUpdates.size) {
        setBoatStates((prev) => prev.map((boat) => boatUpdates.get(boat.id) ?? boat));
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

      {fireflies.length > 0 && (
        <points ref={fireflyRef} frustumCulled={false} visible={fireflyVisibility > 0.05}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[fireflyPositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            color="#facc15"
            size={1}
            sizeAttenuation
            transparent
            opacity={fireflyVisibility}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

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
          side={THREE.FrontSide}
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

      {showNavMesh && config.showWaterNavMesh && navigationGeometries.water && (
        <mesh geometry={navigationGeometries.water} frustumCulled={false}>
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.45}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {showNavMesh && config.showLandNavMesh && navigationGeometries.land && (
        <mesh geometry={navigationGeometries.land} frustumCulled={false}>
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.55}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Autonomous humans walking the red navmesh */}
      <group>
        {humanIds.map((id) => (
          <HumanAgent key={id} agentId={id} runtimeRef={humansRef} showHitboxes={showHitboxes} />
        ))}
      </group>


      {/* Instanced Objects (Trees, Rocks) */}
      <TerrainObjects data={pines} type="pine" showHitboxes={showHitboxes} season={season} />
      <TerrainObjects data={broadleafs} type="broadleaf" showHitboxes={showHitboxes} season={season} />
      <TerrainObjects data={rocks} type="rock" showHitboxes={showHitboxes} season={season} />
          <BoatFleet boats={boatStates} showHitboxes={showHitboxes} />

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
});
