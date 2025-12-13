export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface WorldConfig {
  size: number;
  resolution: number; // Segments per side
  seed: number;
  waterLevel: number;
  forestDensity: number;
  rockDensity: number;
  reliefScale: number;
  riverWidth: number; 
  lakeThreshold: number;
  showHitboxes: boolean;
  showNavMesh: boolean;
  showLandNavMesh: boolean;
  showWaterNavMesh: boolean;
  showBoatMarkers: boolean;
  showRouteDebug: boolean;
  dayNightSpeed: number;
  flashlightEnabled: boolean;
  flashlightIntensity: number;

  // New parameters
  season: Season;
  landBias: number; // -1.0 to 1.0 (Higher = more land)
  rainEnabled: boolean;
  rainIntensity: number; // 0 to 1
}

export interface TerrainData {
  positions: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  pines: ObjectInstance[];
  broadleafs: ObjectInstance[];
  rocks: ObjectInstance[];
  // New Hitbox Data
  waterInstances: ObjectInstance[];
  peakInstances: ObjectInstance[];
  boats: BoatInstance[];
  segmentSize: number; // Export segment size for hitbox scaling
  navGrid: NavigationCell[];
  navResolution: number;
}

export interface ObjectInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  id: string;
}

export interface BoatInstance {
  id: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  mass: number;
  friction: number;
  buoyancy: number;
  occupiedBy: string | null;
  lastUsedAt: number;
}

export enum AgentState {
  Walking = 'Walking',
  SeekingBoat = 'SeekingBoat',
  Mounting = 'Mounting',
  Sailing = 'Sailing',
  Dismounting = 'Dismounting',
  Waiting = 'Waiting',
}

export enum BiomeType {
  WATER,
  SAND,
  GRASS,
  ROCK,
  SNOW
}

export type NavCellType = 'land' | 'water';

export interface NavigationCell {
  x: number;
  z: number;
  height: number;
  slope: number;
  type: NavCellType;
  walkable: boolean;
  flags: {
    isWater: boolean;
    isPeak: boolean;
  };
}