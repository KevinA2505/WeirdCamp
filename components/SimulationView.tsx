import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WorldConfig } from '../types';
import { World } from './World';
import { ControlPanel } from './ControlPanel';

interface SimulationViewProps {
  config: WorldConfig;
  onBackToMenu: () => void;
  onRegenerate: () => void;
  onApplySmoothing: () => void;
  onRecalculateNormals: () => void;
  updateConfig: (key: keyof WorldConfig, value: number | boolean | string) => void;
  refreshKey: number;
  recalcNormalsKey: number;
}

export const SimulationView: React.FC<SimulationViewProps> = ({ config, onBackToMenu, onRegenerate, onApplySmoothing, onRecalculateNormals, updateConfig, refreshKey, recalcNormalsKey }) => {
  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white overflow-hidden">
      <ControlPanel
        config={config}
        onBackToMenu={onBackToMenu}
        onRegenerate={onRegenerate}
        onApplySmoothing={onApplySmoothing}
        onRecalculateNormals={onRecalculateNormals}
        updateConfig={updateConfig}
      />

      <main className="flex-1 relative bg-black">
        <Canvas shadows={config.shadowsEnabled} camera={{ position: [50, 50, 50], fov: 45 }}>
          <Suspense fallback={null}>
            <World config={config} refreshKey={refreshKey} recalcNormalsKey={recalcNormalsKey} />
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
