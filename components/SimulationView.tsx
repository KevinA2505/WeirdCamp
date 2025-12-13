import React, { Suspense, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WorldConfig } from '../types';
import { World, WorldHandle } from './World';
import { ControlPanel } from './ControlPanel';
import { MiniMap } from './MiniMap';

interface SimulationViewProps {
  config: WorldConfig;
  onBackToMenu: () => void;
  onRegenerate: () => void;
  updateConfig: (key: keyof WorldConfig, value: number | boolean | string) => void;
}

export const SimulationView: React.FC<SimulationViewProps> = ({ config, onBackToMenu, onRegenerate, updateConfig }) => {
  const [showMiniMap, setShowMiniMap] = useState(true);
  const worldRef = useRef<WorldHandle>(null);

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white overflow-hidden">
      <ControlPanel config={config} onBackToMenu={onBackToMenu} onRegenerate={onRegenerate} updateConfig={updateConfig} />

      <main className="flex-1 relative bg-black">
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
          <button
            onClick={() => setShowMiniMap((prev) => !prev)}
            className="px-3 py-1.5 text-xs bg-gray-800/80 hover:bg-gray-700 rounded border border-white/10 transition"
          >
            {showMiniMap ? 'Ocultar MiniMapa' : 'Mostrar MiniMapa'}
          </button>

          <button
            onClick={() => worldRef.current?.spawnHuman()}
            className="px-3 py-1.5 text-xs bg-emerald-600/90 hover:bg-emerald-500 text-white rounded border border-emerald-300/40 shadow"
          >
            Generar humano en malla roja
          </button>

          <MiniMap config={config} showOverlay={showMiniMap} />
        </div>

        <Canvas shadows camera={{ position: [50, 50, 50], fov: 45 }}>
          <Suspense fallback={null}>
            <World ref={worldRef} config={config} />
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
