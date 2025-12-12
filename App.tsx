import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WorldConfig, Season } from './types';
import { World } from './components/World';
import { Lightbulb, Sun, Droplets, Mountain, Zap, Leaf, Snowflake, CloudRain, Play, Grid, Box } from 'lucide-react';

const App = () => {
  const [view, setView] = useState<'MENU' | 'SIMULATION'>('MENU');
  
  const [config, setConfig] = useState<WorldConfig>({
    size: 250, 
    resolution: 120, 
    seed: Math.random() * 10000,
    forestDensity: 0.25,
    rockDensity: 0.05,
    reliefScale: 1.0,
    riverWidth: 15, 
    lakeThreshold: 0.15, 
    showHitboxes: false,
    dayNightSpeed: 1.0, 
    flashlightEnabled: false,
    flashlightIntensity: 1500,
    season: 'spring',
    landBias: 0.35 // Default ~70/30
  });

  const handleRegenerate = () => {
    setConfig(prev => ({ ...prev, seed: Math.random() * 10000 }));
  };

  const updateConfig = (key: keyof WorldConfig, value: number | boolean | string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const startGame = () => {
    handleRegenerate(); // New seed on start
    setView('SIMULATION');
  };

  if (view === 'MENU') {
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
                    <CloudRain size={16}/> Temporada
                 </h3>
                 <div className="grid grid-cols-2 gap-2">
                    {(['spring', 'summer', 'autumn', 'winter'] as Season[]).map((s) => (
                      <button 
                        key={s}
                        onClick={() => updateConfig('season', s)}
                        className={`py-2 px-4 rounded capitalize text-sm transition-colors ${config.season === s ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
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
              onClick={startGame}
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
                   <span className="flex items-center gap-2"><Grid size={14} /> Resolución (Vértices)</span>
                   <span className="text-purple-300">{config.resolution}x{config.resolution}</span>
                </div>
                <input 
                  type="range" min="30" max="250" step="10"
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
                   <span className="flex items-center gap-2"><Mountain size={14} /> Tierra vs Agua</span>
                   <span className="text-blue-300">{config.landBias > 0.3 ? 'Más Tierra' : config.landBias < 0 ? 'Islas' : 'Equilibrado'}</span>
                </div>
                <input 
                  type="range" min="-0.5" max="1.0" step="0.05"
                  value={config.landBias}
                  onChange={(e) => updateConfig('landBias', Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
             </div>

             {/* Rivers */}
             <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-300">
                   <span className="flex items-center gap-2"><Droplets size={14} /> Ancho Ríos</span>
                   <span>{config.riverWidth}u</span>
                </div>
                <input 
                  type="range" min="0" max="40" step="1"
                  value={config.riverWidth}
                  onChange={(e) => updateConfig('riverWidth', Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
             </div>

             {/* Relief */}
             <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-300">
                   <span className="flex items-center gap-2"><Mountain size={14} /> Escala Relieve</span>
                   <span>{(config.reliefScale * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="1.5" step="0.1"
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
                  type="range" min="100" max="500" step="50"
                  value={config.size}
                  onChange={(e) => updateConfig('size', Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-400"
                />
             </div>

          </div>
        </div>
      </div>
    );
  }

  // SIMULATION VIEW
  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white overflow-hidden">
      
      {/* Control Panel (Sidebar) */}
      <aside className="w-80 flex-shrink-0 bg-gray-800 p-6 flex flex-col gap-6 shadow-xl z-10 overflow-y-auto">
        <div className="border-b border-gray-700 pb-4 flex justify-between items-center">
          <div>
             <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              Explorador
            </h1>
            <p className="text-xs text-gray-400 mt-1 capitalize">{config.season}</p>
          </div>
          <button onClick={() => setView('MENU')} className="text-xs bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 transition">
            Menú
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <button 
              onClick={handleRegenerate}
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
                type="range" min="30" max="250" step="10"
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
                type="range" min="0" max="3.0" step="0.1"
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
                <span className="text-xs text-gray-300 flex items-center gap-1"><Box size={12}/> Mostrar Hitboxes</span>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-gray-700">
            <h3 className="font-semibold text-gray-300 text-sm">Ajustes Rápidos</h3>
             <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                    <label>Tierra/Agua</label>
                </div>
                <input 
                  type="range" min="-0.5" max="1.0" step="0.05"
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

      {/* 3D Viewport */}
      <main className="flex-1 relative bg-black">
        <Canvas shadows camera={{ position: [50, 50, 50], fov: 45 }}>
          <Suspense fallback={null}>
            <World config={config} />
            <OrbitControls 
              enableDamping 
              dampingFactor={0.1}
              minDistance={10} 
              maxDistance={config.size * 2}
              maxPolarAngle={Math.PI / 2 - 0.05}
            />
          </Suspense>
        </Canvas>
      </main>
    </div>
  );
};

export default App;