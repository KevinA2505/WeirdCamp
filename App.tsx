import React, { useState } from 'react';
import { WorldConfig } from './types';
import { Menu } from './components/Menu';
import { SimulationView } from './components/SimulationView';

type View = 'MENU' | 'SIMULATION';

const App = () => {
  const [view, setView] = useState<View>('MENU');
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
    fogColor: '#d9e3ff',
    fogDensity: 0.003,
    fogFalloff: 2.0,
    season: 'spring',
    landBias: 0.35,
  });

  const handleRegenerate = () => {
    setConfig((prev) => ({ ...prev, seed: Math.random() * 10000 }));
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
      updateConfig={updateConfig}
    />
  );
};

export default App;
