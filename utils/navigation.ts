import * as THREE from 'three';
import { NavigationCell } from '../types';

interface GridContext {
  grid: NavigationCell[];
  resolution: number;
  segmentSize: number;
  worldSize: number;
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

const distanceToSegment = (point: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => {
  const ab = b.clone().sub(a);
  const ap = point.clone().sub(a);
  if (ab.lengthSq() === 0) return point.distanceTo(a);
  const t = THREE.MathUtils.clamp(ab.dot(ap) / ab.lengthSq(), 0, 1);
  const projection = a.clone().add(ab.multiplyScalar(t));
  return projection.distanceTo(point);
};

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
    const speed = mode === 'water' ? 1 : WALK_SPEED;
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

      const slopePenalty = THREE.MathUtils.clamp(neighbor.slope - 0.3, 0, 1) * 6;
      const heightPenalty = Math.max(0, neighbor.height - goalCell.height) * 0.03;
      tentativeG = current.g + stepCost * (1 + slopePenalty + heightPenalty);

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
    const neighbor = getCell(current, context);
    const target = getCell(path[path.length - 1], context);
    const slopePenalty = THREE.MathUtils.clamp(neighbor.slope - 0.3, 0, 1) * 6;
    const heightPenalty = Math.max(0, neighbor.height - target.height) * 0.03;
    cost += stepCost * (1 + slopePenalty + heightPenalty);
  }

  return cost;
};

export const buildMultimodalPath = (
  startIndex: number,
  goalIndex: number,
  context: GridContext
): number[] => {
  return buildAStar(startIndex, goalIndex, context, 'land').path;
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
  worldSize: number
): GridContext => {
  return { grid, resolution, segmentSize, worldSize };
};

export type { GridContext };
