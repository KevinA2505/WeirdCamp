export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface WorldConfig {
  size: number;
  resolution: number; // Segments per side
  seed: number;
  forestDensity: number;
  rockDensity: number;
  reliefScale: number;
  riverWidth: number;
  lakeThreshold: number;
  showHitboxes: boolean;
  dayNightSpeed: number;
  flashlightEnabled: boolean;
  flashlightIntensity: number;

  // Fog parameters
  fogColor: string;
  fogDensity: number;
  fogFalloff: number;

  // New parameters
  season: Season;
  landBias: number; // -1.0 to 1.0 (Higher = more land)
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
  segmentSize: number; // Export segment size for hitbox scaling
}

export interface ObjectInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  id: string;
}

export enum BiomeType {
  WATER,
  SAND,
  GRASS,
  ROCK,
  SNOW
}