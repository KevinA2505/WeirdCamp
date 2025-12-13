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
}

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

export const worldToCellIndex = (
  position: THREE.Vector3,
  context: GridContext
): number => {
  const halfSize = context.worldSize / 2;
  const i = clampToGrid((position.x + halfSize) / context.segmentSize, context.resolution);
  const j = clampToGrid((position.z + halfSize) / context.segmentSize, context.resolution);
  return buildIndex(i, j, context.resolution);
};

export const findNearestWalkable = (
  position: THREE.Vector3,
  context: GridContext
): number | null => {
  if (!context.grid.length) return null;

  const centerIndex = worldToCellIndex(position, context);
  if (context.grid[centerIndex]?.walkable && context.grid[centerIndex].type === 'land') {
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
        if (cell?.walkable && cell.type === 'land') return idx;
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
      if (!cell.walkable || cell.type !== 'land') return false;
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

export const buildPath = (
  startIndex: number,
  goalIndex: number,
  context: GridContext
): number[] => {
  if (startIndex === goalIndex) return [startIndex];

  const { grid, resolution, segmentSize } = context;
  const open = new Map<number, PathNode>();
  const closed = new Set<number>();
  const cameFrom = new Map<number, number>();

  const goalCell = grid[goalIndex];
  const heuristic = (index: number) => {
    const cell = grid[index];
    return Math.hypot(cell.x - goalCell.x, cell.z - goalCell.z);
  };

  const startNode: PathNode = { index: startIndex, g: 0, h: heuristic(startIndex), f: heuristic(startIndex) };
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
      return path.reverse();
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
      if (!neighbor.walkable || neighbor.type !== 'land') continue;

      const stepCost = Math.hypot(di, dj) * segmentSize;
      const slopePenalty = THREE.MathUtils.clamp(neighbor.slope - 0.3, 0, 1) * 6;
      const heightPenalty = Math.max(0, neighbor.height - goalCell.height) * 0.03;
      const tentativeG = current.g + stepCost * (1 + slopePenalty + heightPenalty);

      const existing = open.get(neighborIndex);
      if (!existing || tentativeG < existing.g) {
        cameFrom.set(neighborIndex, current.index);
        const h = heuristic(neighborIndex);
        open.set(neighborIndex, { index: neighborIndex, g: tentativeG, h, f: tentativeG + h });
      }
    }
  }

  return [];
};

export const createNavContext = (
  grid: NavigationCell[],
  resolution: number,
  segmentSize: number,
  worldSize: number
): GridContext => ({ grid, resolution, segmentSize, worldSize });

export type { GridContext };
