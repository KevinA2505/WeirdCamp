import React from 'react';
import { Play, CloudRain, Mountain, Grid, Sparkles, Waves } from 'lucide-react';
import { Season, WorldConfig } from '../types';

interface MenuProps {
  config: WorldConfig;
  updateConfig: (key: keyof WorldConfig, value: number | boolean | string) => void;
  onStart: () => void;
}

export const Menu: React.FC<MenuProps> = ({ config, updateConfig, onStart }) => {
  const presets: { label: string; description: string; values: Partial<WorldConfig>; emoji: string }[] = [
    {
      label: 'Islas',
      description: 'Costas suaves, mucha agua y lagos dispersos.',
      emoji: '🏝️',
      values: { landBias: -0.1, reliefScale: 0.85, riverWidth: 8, lakeThreshold: 0.18 },
    },
    {
      label: 'Continental',
      description: 'Balance entre tierra y agua con ríos más anchos.',
      emoji: '🧭',
      values: { landBias: 0.25, reliefScale: 1.0, riverWidth: 14, lakeThreshold: 0.12 },
    },
    {
      label: 'Montañoso',
      description: 'Relieve marcado y más tierra emergida.',
      emoji: '⛰️',
      values: { landBias: 0.35, reliefScale: 1.15, riverWidth: 10, lakeThreshold: 0.1 },
    },
  ];

  const handlePreset = (values: Partial<WorldConfig>) => {
    Object.entries(values).forEach(([key, value]) => {
      updateConfig(key as keyof WorldConfig, value as number | boolean | string);
    });
  };

  const renderSlider = (
    key: keyof WorldConfig,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    helper?: string,
    formatter?: (val: number) => string
  ) => {
    const sliderId = `slider-${key}`;
    const helperId = helper ? `${sliderId}-helper` : undefined;

    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-300">
          <label htmlFor={sliderId}>{label}</label>
          <span className="text-blue-200 font-semibold">{formatter ? formatter(value) : value}</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-describedby={helperId}
          onChange={(e) => updateConfig(key, Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
        {helper && (
          <p id={helperId} className="text-[10px] text-gray-500">
            {helper}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white items-center justify-center relative overflow-hidden">
      {/* Background Abstract */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 opacity-50 z-0"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 z-0"></div>

      <div className="z-10 w-full max-w-5xl bg-gray-800/90 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700 p-8 flex flex-col md:flex-row gap-8">
        {/* Header & Description */}
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent mb-2">
              TerraForge 3D
            </h1>
            <p className="text-gray-400">
              Configura los parámetros iniciales para tu mundo procedural. Ajusta las estaciones, la resolución de la malla y la geografía con controles optimizados para rendimiento.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
              <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2 mb-3">
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

            <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600 space-y-3">
              <h3 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                <Sparkles size={16} /> Presets rápidos
              </h3>
              <div className="grid md:grid-cols-3 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset.values)}
                    className="p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-left transition-colors border border-gray-700"
                  >
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>{preset.label}</span>
                      <span>{preset.emoji}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-tight">{preset.description}</p>
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
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-300 font-semibold">
              <Grid size={14} /> Resolución y escala
            </div>
            {renderSlider(
              'resolution',
              'Vértices',
              config.resolution,
              60,
              200,
              10,
              'Mantente por debajo de 200 para un renderizado fluido.',
              (val) => `${val} x ${val}`
            )}
            {renderSlider(
              'size',
              'Tamaño del plano',
              config.size,
              180,
              420,
              20,
              'Ajusta la amplitud del mundo sin disparar la densidad de vértices.'
            )}
          </div>

          <div className="h-px bg-gray-700" />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-300 font-semibold">
              <Mountain size={14} /> Geografía y agua
            </div>
            {renderSlider(
              'landBias',
              'Tierra vs Agua',
              config.landBias,
              -0.4,
              0.8,
              0.05,
              'Valores negativos = más islas. Valores altos = continentes.',
              (val) => (val > 0.3 ? 'Más tierra' : val < 0 ? 'Islas' : 'Equilibrado')
            )}
            {renderSlider(
              'reliefScale',
              'Relieve',
              config.reliefScale,
              0.6,
              1.2,
              0.05,
              'Escala vertical acotada para evitar montañas imposibles.',
              (val) => `${(val * 100).toFixed(0)}%`
            )}
            {renderSlider(
              'riverWidth',
              'Ancho de ríos',
              config.riverWidth,
              0,
              30,
              1,
              'Ríos más delgados son más baratos de calcular.'
            )}
            {renderSlider(
              'lakeThreshold',
              'Probabilidad de lagos',
              config.lakeThreshold,
              0,
              0.3,
              0.01,
              'Controla cuántos humedales y lagos aparecen.',
              (val) => `${(val * 100).toFixed(0)}%`
            )}
          </div>

          <div className="h-px bg-gray-700" />

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-300 font-semibold">
              <Waves size={14} /> Extras visuales
            </div>
            <div className="text-xs text-gray-400 leading-relaxed">
              Valores optimizados para mantener buena velocidad de generación sin sacrificar la variedad del terreno.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
