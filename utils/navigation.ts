import * as THREE from 'three';
import { BoatInstance, NavigationCell } from '../types';

interface GridContext {
  grid: NavigationCell[];
  resolution: number;
  segmentSize: number;
  worldSize: number;
  boats: BoatNode[];
}

interface BoatNode {
  cellIndex: number;
  instance: BoatInstance;
}

interface PathNode {
  index: number;
  f: number;
  g: number;
  h: number;
  mode: 'land' | 'water';
}

interface PathResult {
  path: number[];
  cost: number;
  mode: 'land' | 'water' | 'mixed';
}

const WALK_SPEED = 1;
const BOAT_SPEED = 2.5;
const EMBARK_COST = 12;
const DISEMBARK_COST = 12;
const MAX_BOAT_SEARCH_DISTANCE = 120;

const neighborOffsets = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const buildIndex = (i: number, j: number, resolution: number) => i * resolution + j;

const clampToGrid = (value: number, resolution: number) =>
  THREE.MathUtils.clamp(Math.round(value), 0, resolution - 1);

const getCell = (index: number, context: GridContext) => context.grid[index];

const isLandCell = (cell?: NavigationCell) => !!cell && cell.walkable && cell.type === 'land';
const isWaterCell = (cell?: NavigationCell) => !!cell && cell.walkable && cell.type === 'water';

const shorelineNeighbors = (index: number, context: GridContext) => {
  const { resolution } = context;
  const ci = Math.floor(index / resolution);
  const cj = index % resolution;

  for (const [di, dj] of neighborOffsets) {
    const ni = ci + di;
    const nj = cj + dj;
    if (ni < 0 || nj < 0 || ni >= resolution || nj >= resolution) continue;

    const neighbor = getCell(buildIndex(ni, nj, resolution), context);
    if (isWaterCell(neighbor)) return true;
  }

  return false;
};

const worldValuesToCellIndex = (
  x: number,
  z: number,
  resolution: number,
  segmentSize: number,
  worldSize: number
) => {
  const halfSize = worldSize / 2;
  const i = clampToGrid((x + halfSize) / segmentSize, resolution);
  const j = clampToGrid((z + halfSize) / segmentSize, resolution);
  return buildIndex(i, j, resolution);
};

export const worldToCellIndex = (
  position: THREE.Vector3,
  context: GridContext
): number => worldValuesToCellIndex(position.x, position.z, context.resolution, context.segmentSize, context.worldSize);

export const findNearestWalkable = (
  position: THREE.Vector3,
  context: GridContext
): number | null => {
  if (!context.grid.length) return null;

  const centerIndex = worldToCellIndex(position, context);
  if (isLandCell(context.grid[centerIndex])) {
    return centerIndex;
  }

  const halfSize = context.worldSize / 2;
  const maxRadius = Math.ceil((context.worldSize / context.segmentSize) / 2);
  const centerI = clampToGrid((position.x + halfSize) / context.segmentSize, context.resolution);
  const centerJ = clampToGrid((position.z + halfSize) / context.segmentSize, context.resolution);

  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        const i = clampToGrid(centerI + di, context.resolution);
        const j = clampToGrid(centerJ + dj, context.resolution);
        const idx = buildIndex(i, j, context.resolution);
        const cell = context.grid[idx];
        if (isLandCell(cell)) return idx;
      }
    }
  }

  return null;
};

export const findRandomWalkable = (
  context: GridContext,
  avoidIndex?: number,
  minDistance = 0
): number | null => {
  const candidates = context.grid
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell, index }) => {
      if (!isLandCell(cell)) return false;
      if (avoidIndex == null || minDistance <= 0) return true;
      const ai = Math.floor(avoidIndex / context.resolution);
      const aj = avoidIndex % context.resolution;
      const ci = Math.floor(index / context.resolution);
      const cj = index % context.resolution;
      const distanceCells = Math.hypot(ai - ci, aj - cj);
      return distanceCells * context.segmentSize >= minDistance;
    });

  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)].index;
};

const buildAStar = (
  startIndex: number,
  goalIndex: number,
  context: GridContext,
  mode: 'land' | 'water'
): PathResult => {
  if (startIndex === goalIndex) return { path: [startIndex], cost: 0, mode };

  const { grid, resolution, segmentSize } = context;
  const open = new Map<number, PathNode>();
  const closed = new Set<number>();
  const cameFrom = new Map<number, number>();

  const goalCell = grid[goalIndex];
  const heuristic = (index: number) => {
    const cell = grid[index];
    const distance = Math.hypot(cell.x - goalCell.x, cell.z - goalCell.z);
    const speed = mode === 'water' ? BOAT_SPEED : WALK_SPEED;
    return distance / speed;
  };

  const startNode: PathNode = { index: startIndex, g: 0, h: heuristic(startIndex), f: heuristic(startIndex), mode };
  open.set(startIndex, startNode);

  const popLowestF = () => {
    let lowest: PathNode | null = null;
    open.forEach((node) => {
      if (!lowest || node.f < lowest.f) lowest = node;
    });
    if (!lowest) return null;
    open.delete(lowest.index);
    return lowest;
  };

  while (open.size) {
    const current = popLowestF();
    if (!current) break;
    if (current.index === goalIndex) {
      const path = [current.index];
      let cursor = current.index;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        path.push(cursor);
      }
      return { path: path.reverse(), cost: current.g, mode };
    }

    closed.add(current.index);
    const ci = Math.floor(current.index / resolution);
    const cj = current.index % resolution;

    for (const [di, dj] of neighborOffsets) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= resolution || nj >= resolution) continue;

      const neighborIndex = buildIndex(ni, nj, resolution);
      if (closed.has(neighborIndex)) continue;

      const neighbor = grid[neighborIndex];
      if (mode === 'land' && !isLandCell(neighbor)) continue;
      if (mode === 'water' && !isWaterCell(neighbor)) continue;

      const stepCost = Math.hypot(di, dj) * segmentSize;
      let tentativeG = current.g + stepCost;

      if (mode === 'land') {
        const slopePenalty = THREE.MathUtils.clamp(neighbor.slope - 0.3, 0, 1) * 6;
        const heightPenalty = Math.max(0, neighbor.height - goalCell.height) * 0.03;
        tentativeG = current.g + stepCost * (1 + slopePenalty + heightPenalty);
      } else {
        tentativeG = current.g + stepCost / BOAT_SPEED;
      }

      const existing = open.get(neighborIndex);
      if (!existing || tentativeG < existing.g) {
        cameFrom.set(neighborIndex, current.index);
        const h = heuristic(neighborIndex);
        open.set(neighborIndex, { index: neighborIndex, g: tentativeG, h, f: tentativeG + h, mode });
      }
    }
  }

  return { path: [], cost: Infinity, mode };
};

const calculatePathCost = (path: number[], context: GridContext, mode: 'land' | 'water') => {
  if (path.length < 2) return 0;
  let cost = 0;
  const { resolution, segmentSize } = context;

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const current = path[i];
    const pi = Math.floor(prev / resolution);
    const pj = prev % resolution;
    const ci = Math.floor(current / resolution);
    const cj = current % resolution;
    const stepCost = Math.hypot(pi - ci, pj - cj) * segmentSize;
    if (mode === 'water') {
      cost += stepCost / BOAT_SPEED;
      continue;
    }

    const neighbor = getCell(current, context);
    const target = getCell(path[path.length - 1], context);
    const slopePenalty = THREE.MathUtils.clamp(neighbor.slope - 0.3, 0, 1) * 6;
    const heightPenalty = Math.max(0, neighbor.height - target.height) * 0.03;
    cost += stepCost * (1 + slopePenalty + heightPenalty);
  }

  return cost;
};

const combinePaths = (...segments: number[][]) => {
  return segments.reduce<number[]>((acc, segment) => {
    if (!segment.length) return acc;
    if (!acc.length) return [...segment];
    return [...acc, ...segment.slice(1)];
  }, []);
};

const findNearestShorelineLand = (
  targetIndex: number,
  context: GridContext,
  maxRadiusCells = 12
): number | null => {
  const { resolution } = context;
  const centerI = Math.floor(targetIndex / resolution);
  const centerJ = targetIndex % resolution;

  for (let radius = 0; radius <= maxRadiusCells; radius++) {
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        const i = clampToGrid(centerI + di, resolution);
        const j = clampToGrid(centerJ + dj, resolution);
        const idx = buildIndex(i, j, resolution);
        const cell = getCell(idx, context);
        if (isLandCell(cell) && shorelineNeighbors(idx, context)) return idx;
      }
    }
  }

  return null;
};

const findAdjacentWaterCell = (landIndex: number, context: GridContext) => {
  const { resolution } = context;
  const ci = Math.floor(landIndex / resolution);
  const cj = landIndex % resolution;

  for (const [di, dj] of neighborOffsets) {
    const ni = ci + di;
    const nj = cj + dj;
    if (ni < 0 || nj < 0 || ni >= resolution || nj >= resolution) continue;
    const idx = buildIndex(ni, nj, resolution);
    const cell = getCell(idx, context);
    if (isWaterCell(cell)) return idx;
  }

  return null;
};

const estimateWaterCrossingRatio = (startIndex: number, goalIndex: number, context: GridContext) => {
  const samples = 12;
  const start = getCell(startIndex, context);
  const goal = getCell(goalIndex, context);
  if (!start || !goal) return 0;

  let waterHits = 0;
  const from = new THREE.Vector2(start.x, start.z);
  const to = new THREE.Vector2(goal.x, goal.z);

  for (let i = 1; i <= samples; i++) {
    const t = i / (samples + 1);
    const point = new THREE.Vector2().lerpVectors(from, to, t);
    const idx = worldValuesToCellIndex(point.x, point.y, context.resolution, context.segmentSize, context.worldSize);
    const cell = getCell(idx, context);
    if (isWaterCell(cell)) waterHits += 1;
  }

  return waterHits / samples;
};

export const findNearestBoat = (
  position: THREE.Vector3,
  context: GridContext,
  maxDistance = MAX_BOAT_SEARCH_DISTANCE
): BoatNode | null => {
  if (!context.boats.length) return null;

  let closest: BoatNode | null = null;
  let minDistance = maxDistance;

  for (const boat of context.boats) {
    const cell = getCell(boat.cellIndex, context);
    if (!cell) continue;
    const distance = Math.hypot(position.x - cell.x, position.z - cell.z);
    if (distance <= minDistance) {
      minDistance = distance;
      closest = boat;
    }
  }

  return closest;
};

export const buildMultimodalPath = (
  startIndex: number,
  goalIndex: number,
  context: GridContext
): number[] => {
  const landPlan = buildAStar(startIndex, goalIndex, context, 'land');
  const landCost = calculatePathCost(landPlan.path, context, 'land');

  const startCell = getCell(startIndex, context);
  const boatCandidate = startCell ? findNearestBoat(new THREE.Vector3(startCell.x, startCell.height, startCell.z), context) : null;

  const crossingRatio = estimateWaterCrossingRatio(startIndex, goalIndex, context);

  if (!boatCandidate) {
    return landPlan.path;
  }

  const embarkLand = findNearestShorelineLand(boatCandidate.cellIndex, context);
  if (embarkLand == null) return landPlan.path;

  const disembarkLand = findNearestShorelineLand(goalIndex, context);
  if (disembarkLand == null) return landPlan.path;

  const boatEntryWater = findAdjacentWaterCell(embarkLand, context) ?? boatCandidate.cellIndex;
  const boatExitWater = findAdjacentWaterCell(disembarkLand, context);
  if (boatExitWater == null) return landPlan.path;

  const toBoatLand = buildAStar(startIndex, embarkLand, context, 'land');
  const waterLeg = buildAStar(boatEntryWater, boatExitWater, context, 'water');
  const fromBoatLand = buildAStar(disembarkLand, goalIndex, context, 'land');

  if (!toBoatLand.path.length || !waterLeg.path.length || !fromBoatLand.path.length) {
    return landPlan.path;
  }

  const boatCost =
    calculatePathCost(toBoatLand.path, context, 'land') +
    EMBARK_COST +
    calculatePathCost(waterLeg.path, context, 'water') +
    DISEMBARK_COST +
    calculatePathCost(fromBoatLand.path, context, 'land');

  const prefersBoat =
    (crossingRatio > 0.35 && boatCost <= landCost * 1.35) ||
    boatCost < landCost * 0.85 ||
    !Number.isFinite(landCost);

  if (!prefersBoat) return landPlan.path;

  return combinePaths(toBoatLand.path, waterLeg.path, fromBoatLand.path);
};

export const buildPath = (
  startIndex: number,
  goalIndex: number,
  context: GridContext
): number[] => buildMultimodalPath(startIndex, goalIndex, context);

export const buildLandPath = (
  startIndex: number,
  goalIndex: number,
  context: GridContext
): number[] => buildAStar(startIndex, goalIndex, context, 'land').path;

export const createNavContext = (
  grid: NavigationCell[],
  resolution: number,
  segmentSize: number,
  worldSize: number,
  boats: BoatInstance[] = []
): GridContext => {
  const boatNodes: BoatNode[] = boats.map((instance) => {
    const cellIndex = worldValuesToCellIndex(instance.x, instance.z, resolution, segmentSize, worldSize);
    return { cellIndex, instance };
  });

  return { grid, resolution, segmentSize, worldSize, boats: boatNodes };
};

export type { GridContext };
