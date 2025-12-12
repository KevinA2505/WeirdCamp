import React from 'react';
import { Box, Lightbulb } from 'lucide-react';
import { WorldConfig } from '../types';

interface ControlPanelProps {
  config: WorldConfig;
  onBackToMenu: () => void;
  onRegenerate: () => void;
  updateConfig: (key: keyof WorldConfig, value: number | boolean | string) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ config, onBackToMenu, onRegenerate, updateConfig }) => {
  return (
    <aside className="w-80 flex-shrink-0 bg-gray-800 p-6 flex flex-col gap-6 shadow-xl z-10 overflow-y-auto">
      <div className="border-b border-gray-700 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Explorador
          </h1>
          <p className="text-xs text-gray-400 mt-1 capitalize">{config.season}</p>
        </div>
        <button onClick={onBackToMenu} className="text-xs bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 transition">
          Menú
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <button
            onClick={onRegenerate}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>Regenerar Plano</span>
          </button>

          <button
            onClick={() => updateConfig('flashlightEnabled', !config.flashlightEnabled)}
            className={`w-full py-3 font-semibold rounded-lg shadow transition-all flex items-center justify-center gap-2 ${
              config.flashlightEnabled ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            <Lightbulb size={18} />
            <span>{config.flashlightEnabled ? 'Apagar Linterna' : 'Encender Linterna'}</span>
          </button>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-700">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <label>Vértices (Resolución)</label>
              <span className="text-purple-300">{config.resolution}</span>
            </div>
            <input
              type="range"
              min="30"
              max="250"
              step="10"
              value={config.resolution}
              onChange={(e) => updateConfig('resolution', Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-400"
            />
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-700">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <label>Velocidad Día/Noche</label>
              <span>{config.dayNightSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0"
              max="3.0"
              step="0.1"
              value={config.dayNightSpeed}
              onChange={(e) => updateConfig('dayNightSpeed', Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-400"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={config.showHitboxes}
              onChange={(e) => updateConfig('showHitboxes', e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            <span className="text-xs text-gray-300 flex items-center gap-1">
              <Box size={12} /> Mostrar Hitboxes
            </span>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-gray-700">
          <h3 className="font-semibold text-gray-300 text-sm">Ajustes Rápidos</h3>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <label>Tierra/Agua</label>
            </div>
            <input
              type="range"
              min="-0.5"
              max="1.0"
              step="0.05"
              value={config.landBias}
              onChange={(e) => updateConfig('landBias', Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-gray-700 text-xs text-gray-500">
        <p>Controles:</p>
        <ul className="list-disc pl-4 mt-1 space-y-1">
          <li>Click Izq: Rotar / Der: Pan / Rueda: Zoom</li>
          <li>Linterna: Mueve el mouse sobre terreno</li>
        </ul>
      </div>
    </aside>
  );
};
