import { createNoise2D } from 'simplex-noise';
import { TerrainData, ObjectInstance, Season, NavigationCell } from '../types';
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
  waterLevel: number = 0,
  forestDensity: number,
  rockDensity: number,
  reliefScale: number = 1.0,
  riverWidth: number = 10,
  lakeThreshold: number = 0.2,
  season: Season = 'spring',
  landBias: number = 0.35
): TerrainData => {
  
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

  const getWarpedCoordinates = (x: number, z: number) => {
      const warpScale = 0.005; 
      const warpStrength = 20; 
      const qx = warpNoise(x * warpScale, z * warpScale);
      const qz = warpNoise(x * warpScale + 5.2, z * warpScale + 1.3);
      
      return {
          wx: x + qx * warpStrength,
          wz: z + qz * warpStrength
      };
  };


  // --- Main Generation Loop ---

  // Clamp inputs to avoid runaway geometries and keep performance predictable
  const effectiveResolution = THREE.MathUtils.clamp(Math.round(resolution), 30, 220);
  const effectiveRelief = THREE.MathUtils.clamp(reliefScale, 0.35, 1.25);
  const effectiveRiverWidth = THREE.MathUtils.clamp(riverWidth, 0, 40);
  const effectiveLakeThreshold = THREE.MathUtils.clamp(lakeThreshold, 0, 0.4) * 0.8;
  const effectiveLandBias = THREE.MathUtils.clamp(landBias, -0.5, 1.0);

  const resolutionPlusOne = effectiveResolution + 1;
  const vertexCount = resolutionPlusOne * resolutionPlusOne;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  
  const pines: ObjectInstance[] = [];
  const broadleafs: ObjectInstance[] = [];
  const rocks: ObjectInstance[] = [];
  const waterInstances: ObjectInstance[] = [];
  const peakInstances: ObjectInstance[] = [];

  const segmentSize = size / effectiveResolution;
  const halfSize = size / 2;
  const WATER_LEVEL = waterLevel;

  const peakThreshold = 60 * effectiveRelief;

  const navResolution = resolutionPlusOne;
  const navGrid: NavigationCell[] = new Array(navResolution * navResolution);

  const GLOBAL_SCALE = 0.006;

  for (let i = 0; i <= effectiveResolution; i++) {
    for (let j = 0; j <= effectiveResolution; j++) {
      const realX = i * segmentSize - halfSize;
      const realZ = j * segmentSize - halfSize;
      
      const { wx, wz } = getWarpedCoordinates(realX, realZ);

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

          if (distToRiver < effectiveRiverWidth * 2.5) {
              const bank = THREE.MathUtils.smoothstep(distToRiver, effectiveRiverWidth * 0.5, effectiveRiverWidth * 2.5);
              const digDepth = (1.0 - bank) * 15;
              y -= digDepth;
              
              if (y < WATER_LEVEL - 2) {
                  y = WATER_LEVEL - 5 + fbm(nx*5, nz*5, 2, 0.5, 2) * 2;
              }
          }
      }

      // --- D. Lakes ---
      const moisture = moistureNoise(nx * 1.5, nz * 1.5); 
      
      const isLowLand = y > -5 && y < 10 * effectiveRelief;
      const isWet = moisture > (1.0 - effectiveLakeThreshold * 1.5);

      if (isLowLand && isWet) {
          y = THREE.MathUtils.lerp(y, WATER_LEVEL - 5, 0.8);
      }

      if (y < -20) y = -20;

      // --- Assign Positions ---
      const index = i * resolutionPlusOne + j;
      positions[index * 3] = realX;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = realZ;

      // --- Special Hitboxes ---

      // Water Hitbox: Identify underwater terrain
      const isWater = y < WATER_LEVEL;
      if (isWater) {
          waterInstances.push({
              x: realX,
              y: WATER_LEVEL + 0.2, // Float slightly above water surface
              z: realZ,
              scale: 1,
              id: `w-${index}`
          });
      }

      // Peak Hitbox: Identify very high terrain
      // Threshold depends on relief scale but generally peaks are > 60% max height
      const isPeak = y > peakThreshold; // Increased to target tips
      if (isPeak) {
          peakInstances.push({
              x: realX,
              y: y,
              z: realZ,
              scale: 1,
              id: `p-${index}`
          });
      }

      navGrid[index] = {
          x: realX,
          z: realZ,
          height: y,
          slope: 0,
          type: isWater ? 'water' : 'land',
          walkable: false,
          flags: { isWater, isPeak },
      };


      // --- E. Biomes & Coloring ---
      let color = COLORS.GRASS;
      const height = y;

      const slopeNoise = Math.abs(noise2D(nx * 10, nz * 10));

      // Adjust color thresholds slightly for Winter to look more covered
      const snowThreshold = season === 'winter' ? 15 * effectiveRelief : 65 * effectiveRelief;
      const grassThreshold = season === 'winter' ? 5 : 25 * effectiveRelief;

      if (height < WATER_LEVEL) {
          if (height < WATER_LEVEL - 8) color = COLORS.DEEP_WATER;
          else color = COLORS.WATER;
      } else if (height < WATER_LEVEL + 3) {
          color = COLORS.SAND;
      } else if (height < grassThreshold) {
           if (fbm(nx*5, nz*5, 2, 0.5, 2) > 0.2) color = COLORS.DARK_GRASS;
           else color = COLORS.GRASS;
      } else if (height < snowThreshold) {
           if (slopeNoise > 0.3) color = COLORS.ROCK;
           else color = COLORS.DARK_GRASS;
      } else {
           color = COLORS.SNOW;
      }

      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;

      // --- F. Object Scattering ---
      if (height > WATER_LEVEL + 1.5) {
          
          if (color === COLORS.GRASS || color === COLORS.DARK_GRASS || (season === 'winter' && height < snowThreshold)) {
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

  const heightAt = (i: number, j: number) => {
    const clampedI = THREE.MathUtils.clamp(i, 0, navResolution - 1);
    const clampedJ = THREE.MathUtils.clamp(j, 0, navResolution - 1);
    return navGrid[clampedI * navResolution + clampedJ].height;
  };

  const maxWalkableSlope = 1.1; // ~47 degrees
  for (let i = 0; i < navResolution; i++) {
    for (let j = 0; j < navResolution; j++) {
      const index = i * navResolution + j;
      const cell = navGrid[index];

      const slopeX = Math.max(
        Math.abs(cell.height - heightAt(i + 1, j)),
        Math.abs(cell.height - heightAt(i - 1, j))
      ) / segmentSize;

      const slopeZ = Math.max(
        Math.abs(cell.height - heightAt(i, j + 1)),
        Math.abs(cell.height - heightAt(i, j - 1))
      ) / segmentSize;

      const slope = Math.max(slopeX, slopeZ);

      const walkable = !cell.flags.isWater && !cell.flags.isPeak && slope <= maxWalkableSlope;

      navGrid[index] = {
        ...cell,
        slope,
        walkable,
      };
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return {
    positions,
    colors,
    indices: new Uint32Array(indices),
    normals: geometry.attributes.normal.array as Float32Array,
    pines,
    broadleafs,
    rocks,
    waterInstances,
    peakInstances,
    segmentSize,
    navGrid,
    navResolution
  };
};