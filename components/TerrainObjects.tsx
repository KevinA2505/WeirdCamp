import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { ObjectInstance, Season } from '../types';

interface InstancedProps {
  data: ObjectInstance[];
  type: 'pine' | 'broadleaf' | 'rock';
  showHitboxes: boolean;
  season: Season;
  shadowsEnabled: boolean;
}

export const TerrainObjects: React.FC<InstancedProps> = ({ data, type, showHitboxes, season, shadowsEnabled }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Calculate colors based on season
  const { geometry, material, color } = useMemo(() => {
    let baseColor = new THREE.Color('#ffffff');

    if (type === 'pine') {
      const geo = new THREE.ConeGeometry(1.5, 5, 5);
      const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
      
      switch (season) {
        case 'winter': baseColor.set('#e2e8f0'); break; // Snowy pine
        case 'autumn': baseColor.set('#1e3a29'); break; // Darker green
        default: baseColor.set('#15803d'); // Classic green
      }
      return { geometry: geo, material: mat, color: baseColor };

    } else if (type === 'broadleaf') {
      const geo = new THREE.IcosahedronGeometry(2, 0);
      const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });

      switch (season) {
        case 'spring': baseColor.set('#84cc16'); break; // Lime green (flowers/buds)
        case 'summer': baseColor.set('#4d7c0f'); break; // Lush green
        case 'autumn': baseColor.set('#d97706'); break; // Orange/Red
        case 'winter': baseColor.set('#a8a29e'); break; // Bare wood color / snowy
      }
      return { geometry: geo, material: mat, color: baseColor };

    } else {
      // Rocks
      const geo = new THREE.DodecahedronGeometry(1.5, 0);
      const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
      
      if (season === 'winter') {
         baseColor.set('#475569'); // Darker wet rock
      } else {
         baseColor.set('#57534e');
      }
      return { geometry: geo, material: mat, color: baseColor };
    }
  }, [type, season]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;

    data.forEach((obj, i) => {
      dummy.position.set(obj.x, obj.y, obj.z);
      
      // Adjust pivot for different types
      if (type === 'pine') dummy.position.y += 2.5 * obj.scale;
      if (type === 'broadleaf') dummy.position.y += 2 * obj.scale; 
      
      dummy.scale.set(obj.scale, obj.scale, obj.scale);
      
      // Random rotation
      dummy.rotation.y = Math.random() * Math.PI * 2;
      
      if (type === 'rock') {
          dummy.rotation.x = Math.random() * Math.PI;
          dummy.rotation.z = Math.random() * Math.PI;
      }

      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, color);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [data, dummy, color, type]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, data.length]}
        castShadow={shadowsEnabled}
        receiveShadow={shadowsEnabled}
      />
      
      {/* Hitbox Visualization */}
      {showHitboxes && data.map((obj) => (
         <mesh key={obj.id} position={[obj.x, obj.y + 2, obj.z]}>
            <boxGeometry args={[3 * obj.scale, 5 * obj.scale, 3 * obj.scale]} />
            <meshBasicMaterial color="red" wireframe />
         </mesh>
      ))}
    </group>
  );
};