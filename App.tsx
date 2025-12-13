import React, { useState } from 'react';
import { WorldConfig } from './types';
import { Menu } from './components/Menu';
import { SimulationView } from './components/SimulationView';

type View = 'MENU' | 'SIMULATION';

const App = () => {
  const [view, setView] = useState<View>('MENU');
  const [config, setConfig] = useState<WorldConfig>({
    size: 260,
    resolution: 140,
    seed: Math.random() * 10000,
    warpStrength: 20,
    heightSmoothingIterations: 2,
    forestDensity: 0.25,
    rockDensity: 0.05,
    reliefScale: 0.95,
    riverWidth: 12,
    lakeThreshold: 0.12,
    showHitboxes: false,
    shadowsEnabled: true,
    unlitMaterial: false,
    wireframeEnabled: false,
    dayNightSpeed: 0.8,
    flashlightEnabled: false,
    flashlightIntensity: 1500,
    season: 'spring',
    landBias: 0.2,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [recalcNormalsKey, setRecalcNormalsKey] = useState(0);

  const handleRegenerate = () => {
    setConfig((prev) => ({ ...prev, seed: Math.random() * 10000 }));
    setRefreshKey((prev) => prev + 1);
  };

  const handleApplySmoothing = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleRecalculateNormals = () => {
    setRecalcNormalsKey((prev) => prev + 1);
  };

  const updateConfig = (key: keyof WorldConfig, value: number | boolean | string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const startGame = () => {
    handleRegenerate();
    setView('SIMULATION');
  };

  if (view === 'MENU') {
    return <Menu config={config} updateConfig={updateConfig} onStart={startGame} />;
  }

  return (
    <SimulationView
      config={config}
      onBackToMenu={() => setView('MENU')}
      onRegenerate={handleRegenerate}
      onApplySmoothing={handleApplySmoothing}
      onRecalculateNormals={handleRecalculateNormals}
      updateConfig={updateConfig}
      refreshKey={refreshKey}
      recalcNormalsKey={recalcNormalsKey}
    />
  );
};

export default App;
