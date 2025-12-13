import { createNoise2D } from 'simplex-noise';
import { TerrainData, ObjectInstance, Season } from '../types';
import * as THREE from 'three';

// Define Palettes for each season
const PALETTES = {
  spring: {
    DEEP_WATER: new THREE.Color('#1e3a8a'),
    WATER: new THREE.Color('#3b82f6'),
    SAND: new THREE.Color('#fcd34d'),
    GRASS: new THREE.Color('#86efac'), // Fresh light green
    DARK_GRASS: new THREE.Color('#166534'),
    ROCK: new THREE.Color('#78716c'),
    SNOW: new THREE.Color('#f3f4f6'),
  },
  summer: {
    DEEP_WATER: new THREE.Color('#172554'),
    WATER: new THREE.Color('#2563eb'),
    SAND: new THREE.Color('#fde047'),
    GRASS: new THREE.Color('#4ade80'), // Vibrant green
    DARK_GRASS: new THREE.Color('#14532d'), // Deep green
    ROCK: new THREE.Color('#57534e'),
    SNOW: new THREE.Color('#ffffff'),
  },
  autumn: {
    DEEP_WATER: new THREE.Color('#334155'), // Darker, colder water
    WATER: new THREE.Color('#64748b'),
    SAND: new THREE.Color('#d6d3d1'), // Desaturated sand
    GRASS: new THREE.Color('#d97706'), // Amber/Orange
    DARK_GRASS: new THREE.Color('#78350f'), // Brown
    ROCK: new THREE.Color('#44403c'),
    SNOW: new THREE.Color('#e5e7eb'),
  },
  winter: {
    DEEP_WATER: new THREE.Color('#1e293b'),
    WATER: new THREE.Color('#94a3b8'), // Icy water
    SAND: new THREE.Color('#cbd5e1'), // Frozen shore
    GRASS: new THREE.Color('#e2e8f0'), // Snow covered grass
    DARK_GRASS: new THREE.Color('#94a3b8'), // Dirty snow
    ROCK: new THREE.Color('#374151'),
    SNOW: new THREE.Color('#ffffff'),
  }
};

export const generateTerrain = (
  size: number,
  resolution: number,
  seed: number,
  warpStrength: number,
  heightSmoothingIterations: number,
  waterLevel: number = 0,
  forestDensity: number,
  rockDensity: number,
  reliefScale: number = 1.0,
  riverWidth: number = 10,
  lakeThreshold: number = 0.2,
  season: Season = 'spring',
  landBias: number = 0.35
): TerrainData => {

  const smoothHeightmap = (heights: Float32Array, side: number, iterations: number) => {
    const temp = new Float32Array(heights.length);
    const clampedIterations = THREE.MathUtils.clamp(Math.floor(iterations), 0, 6);

    for (let iter = 0; iter < clampedIterations; iter++) {
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          let sum = 0;
          let count = 0;

          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const nx = THREE.MathUtils.clamp(x + ox, 0, side - 1);
              const ny = THREE.MathUtils.clamp(y + oy, 0, side - 1);
              sum += heights[ny * side + nx];
              count++;
            }
          }

          temp[y * side + x] = sum / count;
        }
      }
      heights.set(temp);
    }
  };
  
  // Select Colors based on Season
  const COLORS = PALETTES[season];

  // --- Initialize Noise Generators ---
  const noise2D = createNoise2D(() => seed);
  const warpNoise = createNoise2D(() => seed + 123);
  const moistureNoise = createNoise2D(() => seed + 456);

  // --- Helper Functions ---

  const fbm = (x: number, z: number, octaves: number, persistence: number, lacunarity: number) => {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    for(let i=0; i<octaves; i++) {
        total += noise2D(x * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return total / maxValue;
  };

  const ridgedFbm = (x: number, z: number, octaves: number, persistence: number, lacunarity: number) => {
      let total = 0;
      let frequency = 1;
      let amplitude = 1;
      let weight = 1;
      let maxValue = 0;

      for(let i=0; i<octaves; i++) {
          let v = 1.0 - Math.abs(noise2D(x * frequency, z * frequency));
          v = v * v; 
          v *= weight;
          weight = Math.max(0, Math.min(1, v * 2)); 
          
          total += v * amplitude;
          maxValue += amplitude;
          amplitude *= persistence;
          frequency *= lacunarity;
      }
      return total / maxValue;
  };

  const getWarpedCoordinates = (x: number, z: number, strength: number) => {
      const warpScale = 0.005;
      const qx = warpNoise(x * warpScale, z * warpScale);
      const qz = warpNoise(x * warpScale + 5.2, z * warpScale + 1.3);

      return {
          wx: x + qx * strength,
          wz: z + qz * strength
      };
  };


  // --- Main Generation Loop ---

  // Clamp inputs to avoid runaway geometries and keep performance predictable
  const effectiveResolution = THREE.MathUtils.clamp(Math.round(resolution), 30, 260);
  const effectiveWarpStrength = THREE.MathUtils.clamp(warpStrength, 0, 60);
  const effectiveRelief = THREE.MathUtils.clamp(reliefScale, 0.35, 1.25);
  const effectiveRiverWidth = THREE.MathUtils.clamp(riverWidth, 0, 40);
  const effectiveLakeThreshold = THREE.MathUtils.clamp(lakeThreshold, 0, 0.4) * 0.8;
  const effectiveLandBias = THREE.MathUtils.clamp(landBias, -0.5, 1.0);
  const smoothingIterations = THREE.MathUtils.clamp(heightSmoothingIterations, 0, 6);

  const resolutionPlusOne = effectiveResolution + 1;
  const vertexCount = resolutionPlusOne * resolutionPlusOne;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  const heights = new Float32Array(vertexCount);
  const moistures = new Float32Array(vertexCount);

  const pines: ObjectInstance[] = [];
  const broadleafs: ObjectInstance[] = [];
  const rocks: ObjectInstance[] = [];
  const waterInstances: ObjectInstance[] = [];
  const peakInstances: ObjectInstance[] = [];

  const segmentSize = size / effectiveResolution;
  const halfSize = size / 2;
  const WATER_LEVEL = 0;

  const GLOBAL_SCALE = 0.006;

  for (let i = 0; i <= effectiveResolution; i++) {
    for (let j = 0; j <= effectiveResolution; j++) {
      const realX = i * segmentSize - halfSize;
      const realZ = j * segmentSize - halfSize;

      const { wx, wz } = getWarpedCoordinates(realX * (effectiveWarpStrength / 20 + 0.5), realZ * (effectiveWarpStrength / 20 + 0.5), effectiveWarpStrength);

      const nx = wx * GLOBAL_SCALE;
      const nz = wz * GLOBAL_SCALE;

      let y = 0;

      // --- A. Base Height ---
      let baseHeight = fbm(nx, nz, 3, 0.5, 2.0); 
      
      // APPLY LAND BIAS
      baseHeight += effectiveLandBias;

      baseHeight *= 15 * effectiveRelief;
      
      // --- B. Mountain Ranges ---
      let mountainMask = fbm(nx * 0.5 + 100, nz * 0.5 + 100, 2, 0.5, 2.0);
      mountainMask = THREE.MathUtils.smoothstep(mountainMask, 0.2, 0.8);

      const mountainShape = ridgedFbm(nx * 1.5, nz * 1.5, 4, 0.5, 2.2);
      const mountainHeight = mountainShape * 55 * effectiveRelief * mountainMask;

      y = baseHeight + mountainHeight;

      // --- C. Rivers ---
      if (effectiveRiverWidth > 0) {
          const riverPath = Math.sin(wx * 0.008) * 30 + fbm(wx * 0.02, wz * 0.02, 2, 0.5, 2) * 20;
          const distToRiver = Math.abs(wz - riverPath);
          const riverMask = 1 - THREE.MathUtils.smoothstep(effectiveRiverWidth * 0.8, effectiveRiverWidth, distToRiver);

          if (riverMask > 0) {
              const digDepth = riverMask * 15;
              y -= digDepth;

              if (y < WATER_LEVEL - 2) {
                  y = WATER_LEVEL - 5 + fbm(nx * 5, nz * 5, 2, 0.5, 2) * 2;
              }
          }
      }

      // --- D. Lakes ---
      const moisture = moistureNoise(nx * 1.5, nz * 1.5);
      moistures[i * resolutionPlusOne + j] = moisture;

      const isLowLand = y > -5 && y < 10 * effectiveRelief;
      const humidityThreshold = 1.0 - effectiveLakeThreshold * 1.5;
      const lakeMask = THREE.MathUtils.smoothstep(humidityThreshold, humidityThreshold + 0.1, moisture);

      if (isLowLand && lakeMask > 0) {
          y = THREE.MathUtils.lerp(y, WATER_LEVEL - 5, lakeMask);
      }

      if (y < -20) y = -20;

      const index = i * resolutionPlusOne + j;
      heights[index] = y;
    }
  }

  smoothHeightmap(heights, resolutionPlusOne, smoothingIterations);

  for (let i = 0; i <= effectiveResolution; i++) {
    for (let j = 0; j <= effectiveResolution; j++) {
      const index = i * resolutionPlusOne + j;
      const realX = i * segmentSize - halfSize;
      const realZ = j * segmentSize - halfSize;
      const y = heights[index];
      const nx = realX * GLOBAL_SCALE;
      const nz = realZ * GLOBAL_SCALE;

      positions[index * 3] = realX;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = realZ;

      if (y < WATER_LEVEL) {
          waterInstances.push({
              x: realX,
              y: WATER_LEVEL + 0.2,
              z: realZ,
              scale: 1,
              id: `w-${index}`
          });
      }

      const peakThreshold = 60 * effectiveRelief;
      if (y > peakThreshold) {
          peakInstances.push({
              x: realX,
              y: y,
              z: realZ,
              scale: 1,
              id: `p-${index}`
          });
      }

      let color = COLORS.GRASS;
      const slopeNoise = Math.abs(noise2D(nx * 10, nz * 10));
      const snowThreshold = season === 'winter' ? 15 * effectiveRelief : 65 * effectiveRelief;
      const grassThreshold = season === 'winter' ? 5 : 25 * effectiveRelief;
      const moisture = moistures[index];

      if (y < WATER_LEVEL) {
          color = y < WATER_LEVEL - 8 ? COLORS.DEEP_WATER : COLORS.WATER;
      } else if (y < WATER_LEVEL + 3) {
          color = COLORS.SAND;
      } else if (y < grassThreshold) {
           color = fbm(nx * 5, nz * 5, 2, 0.5, 2) > 0.2 ? COLORS.DARK_GRASS : COLORS.GRASS;
      } else if (y < snowThreshold) {
           color = slopeNoise > 0.3 ? COLORS.ROCK : COLORS.DARK_GRASS;
      } else {
           color = COLORS.SNOW;
      }

      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;

      if (y > WATER_LEVEL + 1.5) {
          if (color === COLORS.GRASS || color === COLORS.DARK_GRASS || (season === 'winter' && y < snowThreshold)) {
              if (moisture > 0 && Math.random() < forestDensity) {
                   const scale = 0.6 + Math.random() * 0.8;
                   if (fbm(nx * 10, nz * 10, 2, 0.5, 2) > 0) {
                       if (Math.random() > 0.3) {
                           pines.push({ x: realX, y, z: realZ, scale, id: `pine-${index}` });
                       } else {
                           broadleafs.push({ x: realX, y, z: realZ, scale: scale * 0.8, id: `leaf-${index}` });
                       }
                   }
              }
          }

          if (color === COLORS.ROCK || (color === COLORS.GRASS && Math.random() < 0.02)) {
              if (Math.random() < rockDensity) {
                   rocks.push({ x: realX, y, z: realZ, scale: 0.5 + Math.random(), id: `rock-${index}` });
              }
          }
      }
    }
  }

  for (let i = 0; i < effectiveResolution; i++) {
    for (let j = 0; j < effectiveResolution; j++) {
      const a = i * resolutionPlusOne + j;
      const b = i * resolutionPlusOne + j + 1;
      const c = (i + 1) * resolutionPlusOne + j + 1;
      const d = (i + 1) * resolutionPlusOne + j;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  return {
    positions,
    colors,
    indices: new Uint32Array(indices),
    pines,
    broadleafs,
    rocks,
    waterInstances,
    peakInstances,
    segmentSize
  };
};