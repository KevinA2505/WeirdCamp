import React, { useEffect, useRef } from 'react';
import { WorldConfig } from '../types';

interface Position2D {
  x: number;
  z: number;
}

interface MiniMapProps {
  config: WorldConfig;
  cameraPosition?: Position2D;
  playerPosition?: Position2D;
  showOverlay?: boolean;
  className?: string;
}

const CANVAS_SIZE = 220;
const PADDING = 16;

export const MiniMap: React.FC<MiniMapProps> = ({
  config,
  cameraPosition,
  playerPosition,
  showOverlay = true,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showOverlay) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { size, waterLevel } = config;
    const halfSize = size / 2;
    const usable = CANVAS_SIZE - PADDING * 2;
    const scale = usable / size;
    const center = CANVAS_SIZE / 2;

    const worldToCanvas = (x: number, z: number) => ({
      x: center + x * scale,
      y: center - z * scale,
    });

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE);
    gradient.addColorStop(0, 'rgba(24, 24, 27, 0.9)');
    gradient.addColorStop(1, 'rgba(10, 10, 12, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Terrain outline
    const terrainTopLeft = worldToCanvas(-halfSize, -halfSize);
    const terrainBottomRight = worldToCanvas(halfSize, halfSize);
    const terrainWidth = terrainBottomRight.x - terrainTopLeft.x;
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(terrainTopLeft.x, terrainTopLeft.y, terrainWidth, terrainWidth);

    // Water plane indicator
    ctx.fillStyle = waterLevel <= 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)';
    ctx.fillRect(terrainTopLeft.x, terrainTopLeft.y, terrainWidth, terrainWidth);

    // Boundary walls (slightly outside terrain)
    const wallOffset = 8;
    const wallTopLeft = worldToCanvas(-halfSize - wallOffset, -halfSize - wallOffset);
    const wallSize = terrainWidth + wallOffset * 2 * scale;
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(wallTopLeft.x, wallTopLeft.y, wallSize, wallSize);

    // Center marker
    ctx.beginPath();
    ctx.arc(center, center, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#e5e7eb';
    ctx.fill();

    // Player or camera marker
    const activePosition: Position2D = playerPosition || cameraPosition || { x: 0, z: 0 };
    const hasPosition = Boolean(playerPosition || cameraPosition);
    const marker = worldToCanvas(activePosition.x, activePosition.z);
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = hasPosition ? '#34d399' : 'rgba(52, 211, 153, 0.6)';
    ctx.strokeStyle = 'rgba(12, 83, 54, 0.9)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Heading indicator (simplified)
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - 10);
    ctx.lineTo(marker.x, marker.y + 10);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('N', center - 4, PADDING + 8);
    ctx.fillText('Terreno', terrainTopLeft.x + 4, terrainTopLeft.y + 14);
    ctx.fillText('Límite', wallTopLeft.x + 4, wallTopLeft.y + 12);
    ctx.fillStyle = '#34d399';
    ctx.fillText(hasPosition ? 'Jugador' : 'Centro', marker.x + 8, marker.y - 8);
  }, [config, cameraPosition, playerPosition, showOverlay]);

  if (!showOverlay) return null;

  return (
    <div
      className={`bg-black/30 backdrop-blur-lg rounded-lg border border-white/10 shadow-xl p-3 text-xs text-gray-200 ${
        className || ''
      }`}
    >
      <div className="flex items-center justify-between mb-2 text-[11px] text-gray-400">
        <span className="uppercase tracking-[0.08em] text-gray-300">MiniMapa</span>
        <span className="text-gray-500">Escala 1:{Math.round(config.size)}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="rounded-md border border-white/5 shadow-inner bg-black/40"
      />
    </div>
  );
};
