import React from 'react';
import { Play, CloudRain, Mountain, Droplets, Grid } from 'lucide-react';
import { Season, WorldConfig } from '../types';

interface MenuProps {
  config: WorldConfig;
  updateConfig: (key: keyof WorldConfig, value: number | boolean | string) => void;
  onStart: () => void;
}

export const Menu: React.FC<MenuProps> = ({ config, updateConfig, onStart }) => {
  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white items-center justify-center relative overflow-hidden">
      {/* Background Abstract */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 opacity-50 z-0"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 z-0"></div>

      <div className="z-10 w-full max-w-4xl bg-gray-800/90 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700 p-8 flex flex-col md:flex-row gap-8">
        {/* Header & Description */}
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent mb-2">
              TerraForge 3D
            </h1>
            <p className="text-gray-400">
              Configura los parámetros iniciales para tu mundo procedural. Ajusta las estaciones, la resolución de la malla y la geografía.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
              <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2 mb-2">
                <CloudRain size={16} /> Temporada
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {(['spring', 'summer', 'autumn', 'winter'] as Season[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateConfig('season', s)}
                    className={`py-2 px-4 rounded capitalize text-sm transition-colors ${
                      config.season === s ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {s === 'spring' && 'Primavera 🌸'}
                    {s === 'summer' && 'Verano ☀️'}
                    {s === 'autumn' && 'Otoño 🍂'}
                    {s === 'winter' && 'Invierno ❄️'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={onStart}
            className="w-full py-4 mt-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold text-lg rounded-xl shadow-lg transform transition-all hover:scale-105 flex items-center justify-center gap-3"
          >
            <Play fill="white" size={24} />
            Generar Mundo
          </button>
        </div>

        {/* Sliders Column */}
        <div className="flex-1 space-y-6 bg-gray-900/50 p-6 rounded-xl border border-gray-700">
          {/* Vertex Resolution */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span className="flex items-center gap-2">
                <Grid size={14} /> Resolución (Vértices)
              </span>
              <span className="text-purple-300">{config.resolution}x{config.resolution}</span>
            </div>
            <input
              type="range"
              min="30"
              max="250"
              step="10"
              value={config.resolution}
              onChange={(e) => updateConfig('resolution', Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <p className="text-[10px] text-gray-500">Más vértices = terreno más suave pero mayor consumo.</p>
          </div>

          <div className="h-px bg-gray-700 my-4" />

          {/* Land Water Ratio */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span className="flex items-center gap-2">
                <Mountain size={14} /> Tierra vs Agua
              </span>
              <span className="text-blue-300">{config.landBias > 0.3 ? 'Más Tierra' : config.landBias < 0 ? 'Islas' : 'Equilibrado'}</span>
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

          {/* Rivers */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span className="flex items-center gap-2">
                <Droplets size={14} /> Ancho Ríos
              </span>
              <span>{config.riverWidth}u</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              value={config.riverWidth}
              onChange={(e) => updateConfig('riverWidth', Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* Relief */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span className="flex items-center gap-2">
                <Mountain size={14} /> Escala Relieve
              </span>
              <span>{(config.reliefScale * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.5"
              step="0.1"
              value={config.reliefScale}
              onChange={(e) => updateConfig('reliefScale', Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
          </div>

          {/* Map Size */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span className="flex items-center gap-2">📐 Tamaño Plano</span>
              <span>{config.size}</span>
            </div>
            <input
              type="range"
              min="100"
              max="500"
              step="50"
              value={config.size}
              onChange={(e) => updateConfig('size', Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
