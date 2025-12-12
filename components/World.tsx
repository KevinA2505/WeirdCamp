import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldConfig, ObjectInstance } from '../types';
import { generateTerrain } from '../utils/noise';
import { TerrainObjects } from './TerrainObjects';
import { Sky, Stars } from '@react-three/drei';

interface WorldProps {
  config: WorldConfig;
}

// Sub-component for efficient rendering of thousands of hitboxes
const HitboxLayer: React.FC<{ 
    instances: ObjectInstance[], 
    color: string, 
    size: number,
    visible: boolean 
}> = ({ instances, color, size, visible }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useLayoutEffect(() => {
        if (!meshRef.current || !visible) return;
        
        // Update instances
        instances.forEach((obj, i) => {
            dummy.position.set(obj.x, obj.y, obj.z);
            dummy.scale.set(size, size, size);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [instances, visible, size]);

    if (!visible || instances.length === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} wireframe />
        </instancedMesh>
    );
};

export const World: React.FC<WorldProps> = ({ config }) => {
  const { 
    size, resolution, seed, waterLevel, forestDensity, 
    rockDensity, reliefScale, riverWidth, lakeThreshold, showHitboxes, 
    dayNightSpeed, flashlightEnabled, flashlightIntensity,
    season, landBias 
  } = config;

  // Day/Night State
  const [sunPosition, setSunPosition] = useState(new THREE.Vector3(100, 100, 100));
  const [sunColor, setSunColor] = useState(new THREE.Color('#ffffff'));
  const [ambientColor, setAmbientColor] = useState(new THREE.Color('#ffffff'));
  const [ambientIntensity, setAmbientIntensity] = useState(0.5);
  const [skyRayleigh, setSkyRayleigh] = useState(0.5);
  const [time, setTime] = useState(0);

  // Fog State
  const [fogColor, setFogColor] = useState(new THREE.Color('#ffffff'));
  const [fogNear, setFogNear] = useState(10);
  const [fogFar, setFogFar] = useState(200);

  // References
  const lightRef = useRef<THREE.PointLight>(null);
  const terrainRef = useRef<THREE.Mesh>(null);

  // Memoize terrain generation
  const { positions, colors, normals, indices, pines, broadleafs, rocks, waterInstances, peakInstances, segmentSize } = useMemo(() => {
    return generateTerrain(
        size, 
        resolution, 
        seed, 
        waterLevel, 
        forestDensity, 
        rockDensity, 
        reliefScale, 
        riverWidth, 
        lakeThreshold,
        season,
        landBias
    );
  }, [size, resolution, seed, waterLevel, forestDensity, rockDensity, reliefScale, riverWidth, lakeThreshold, season, landBias]);

  // Geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
  }, [positions, colors, normals, indices]);

  // Create Boundary Hitboxes (Walls)
  const boundaries = useMemo(() => {
      const halfSize = size / 2;
      const wallThickness = 5;
      const wallHeight = 100;
      
      return [
        // North
        { pos: [0, 0, -halfSize - wallThickness/2], args: [size + wallThickness * 2, wallHeight, wallThickness] },
        // South
        { pos: [0, 0, halfSize + wallThickness/2], args: [size + wallThickness * 2, wallHeight, wallThickness] },
        // East
        { pos: [halfSize + wallThickness/2, 0, 0], args: [wallThickness, wallHeight, size] },
        // West
        { pos: [-halfSize - wallThickness/2, 0, 0], args: [wallThickness, wallHeight, size] },
      ];
  }, [size]);


  // Frame Loop for Cycle and Interactions
  useFrame((state, delta) => {
    // 1. Day/Night Cycle Logic
    if (dayNightSpeed > 0) {
      const radiansPerSecond = 0.0261799;
      const newTime = time + delta * dayNightSpeed * radiansPerSecond;
      setTime(newTime);
      
      const radius = size * 1.5; 
      const elevation = Math.sin(newTime); 
      const azimuth = Math.cos(newTime);
      
      setSunPosition(new THREE.Vector3(azimuth * radius, elevation * radius, 0));

      // --- Calculate Colors & Atmosphere based on Elevation ---
      let targetSunColor = new THREE.Color('#ffffff');
      let targetAmbientColor = new THREE.Color('#ffffff');
      let targetIntensity = 0.5;
      let targetRayleigh = 0.5;
      let targetFogColor = new THREE.Color('#ffffff');

      if (elevation > 0.2) {
          // DAY
          targetSunColor.set('#fff7cd'); 
          targetIntensity = 0.7;
          targetRayleigh = 0.3; 
          
          // Season adjustments for Day
          if (season === 'winter') {
              targetAmbientColor.set('#ddeeff'); 
              targetFogColor.set('#e2e8f0'); // White mist
              targetIntensity = 0.8; 
          } else if (season === 'autumn') {
              targetAmbientColor.set('#ffedd5');
              targetFogColor.set('#fdba74'); // Orange mist
              targetIntensity = 0.6;
          } else if (season === 'summer') {
              targetAmbientColor.set('#b0d6ff'); 
              targetFogColor.set('#bae6fd'); // Clear blueish
          } else {
              // Spring
              targetAmbientColor.set('#dcfce7'); 
              targetFogColor.set('#e0f2fe');
          }

      } else if (elevation > -0.1) {
          // DAWN / DUSK
          targetSunColor.set('#ff7b00'); 
          targetAmbientColor.set('#6a4c93'); 
          targetFogColor.set('#4c1d95'); // Purple fog
          targetIntensity = 0.3;
          targetRayleigh = 3.0; 
      } else {
          // NIGHT
          targetSunColor.set('#000000'); 
          targetAmbientColor.set('#020617'); 
          targetFogColor.set('#020617'); // Dark fog matches night sky
          targetIntensity = 0.1;
          targetRayleigh = 0.1;
      }

      setSunColor(prev => prev.lerp(targetSunColor, 0.05));
      setAmbientColor(prev => prev.lerp(targetAmbientColor, 0.05));
      setAmbientIntensity(prev => THREE.MathUtils.lerp(prev, targetIntensity, 0.05));
      setSkyRayleigh(prev => THREE.MathUtils.lerp(prev, targetRayleigh, 0.02));
      setFogColor(prev => prev.lerp(targetFogColor, 0.02));
    }

    // Update Fog Settings based on config
    const fogDensityMultiplier = season === 'winter' ? 0.6 : (season === 'autumn' ? 0.8 : 1.0);
    setFogNear(10);
    setFogFar(size * fogDensityMultiplier); 

    // 2. Flashlight
    if (flashlightEnabled && lightRef.current && terrainRef.current) {
        state.raycaster.setFromCamera(state.pointer, state.camera);
        const intersects = state.raycaster.intersectObject(terrainRef.current, false);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            lightRef.current.position.set(point.x, point.y + 20, point.z);
            lightRef.current.intensity = flashlightIntensity; 
        } else {
            lightRef.current.intensity = 0; 
        }
    }
  });

  return (
    <group>
      {/* Dynamic Fog */}
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      {/* Set background to fog color to blend horizon */}
      <color attach="background" args={[fogColor.r, fogColor.g, fogColor.b]} />

      {/* Environment */}
      <ambientLight color={ambientColor} intensity={ambientIntensity} />
      
      <directionalLight 
        position={sunPosition} 
        color={sunColor}
        intensity={sunPosition.y > 0 ? 1.5 : 0} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0001}
        shadow-camera-left={-size/1.5}
        shadow-camera-right={size/1.5}
        shadow-camera-top={size/1.5}
        shadow-camera-bottom={-size/1.5}
      />
      
      {/* Only render Sky if not too foggy/night */}
      {dayNightSpeed > 0 && (
          <Sky 
            sunPosition={sunPosition} 
            turbidity={season === 'winter' ? 20 : 10} 
            rayleigh={skyRayleigh} 
            mieCoefficient={season === 'autumn' ? 0.05 : 0.005} 
            mieDirectionalG={0.8} 
          />
      )}
      
      <Stars 
        radius={300} 
        depth={50} 
        count={5000} 
        factor={4} 
        saturation={0} 
        fade 
        speed={0.5} 
      />

      {flashlightEnabled && (
        <pointLight 
            ref={lightRef} 
            distance={150} 
            decay={1.5} 
            color="#fff7ed" 
            castShadow 
        />
      )}

      {/* Main Terrain Mesh */}
      <mesh ref={terrainRef} receiveShadow castShadow geometry={geometry}>
        <meshStandardMaterial 
            vertexColors 
            flatShading 
            roughness={0.8} 
            metalness={0.05}
            side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Instanced Objects (Trees, Rocks) */}
      <TerrainObjects data={pines} type="pine" showHitboxes={showHitboxes} season={season} />
      <TerrainObjects data={broadleafs} type="broadleaf" showHitboxes={showHitboxes} season={season} />
      <TerrainObjects data={rocks} type="rock" showHitboxes={showHitboxes} season={season} />

      {/* Special Hitbox Layers (Water & Peaks) */}
      <HitboxLayer 
          instances={waterInstances} 
          color="#06b6d4" // Cyan
          size={segmentSize} 
          visible={showHitboxes} 
      />
      <HitboxLayer 
          instances={peakInstances} 
          color="#f97316" // Orange
          size={segmentSize} 
          visible={showHitboxes} 
      />


      {/* Water Plane */}
       <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[size * 1.5, size * 1.5]} />
        <meshStandardMaterial 
          color={season === 'winter' ? '#94a3b8' : '#3b82f6'} 
          transparent 
          opacity={0.7} 
          roughness={0.05} 
          metalness={0.5} 
        />
      </mesh>
      
      {/* Map Boundary Walls (Hitboxes) */}
      <group>
        {boundaries.map((b, i) => (
             <mesh key={`boundary-${i}`} position={new THREE.Vector3(...b.pos)}>
                <boxGeometry args={[b.args[0], b.args[1], b.args[2]]} />
                <meshBasicMaterial 
                    color="red" 
                    wireframe 
                    visible={showHitboxes} 
                    transparent={!showHitboxes} 
                    opacity={showHitboxes ? 1 : 0} 
                />
             </mesh>
        ))}
      </group>

      {/* Floor Hitbox visual */}
      {showHitboxes && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -10, 0]}>
            <boxGeometry args={[size, size, 1]} />
            <meshBasicMaterial color="yellow" wireframe />
        </mesh>
      )}
    </group>
  );
};