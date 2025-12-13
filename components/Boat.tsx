import React from 'react';
import * as THREE from 'three';

export class Boat {
  id: string;
  position: THREE.Vector3;
  rotation: number;
  velocity: THREE.Vector3;
  maxPassengers: number;
  currentPassengers: number;
  lastWaterPosition: THREE.Vector3;

  constructor(id: string, position: THREE.Vector3, rotation: number) {
    this.id = id;
    this.position = position;
    this.rotation = rotation;
    this.velocity = new THREE.Vector3();
    this.maxPassengers = 2;
    this.currentPassengers = 0;
    this.lastWaterPosition = position.clone();
  }

  canBoard(count: number = 1) {
    return this.currentPassengers + count <= this.maxPassengers;
  }

  board(count: number = 1) {
    if (!this.canBoard(count)) return false;
    this.currentPassengers += count;
    return true;
  }

  canDisembark(count: number = 1) {
    return this.currentPassengers - count >= 0;
  }

  disembark(count: number = 1) {
    if (!this.canDisembark(count)) return false;
    this.currentPassengers -= count;
    return true;
  }
}

export const BoatMesh: React.FC<{ boat: Boat }> = ({ boat }) => {
  const hullColor = '#8b5a2b';
  const accentColor = '#a16207';
  const baseLength = 4;
  const baseWidth = 2.1;
  const wallHeight = 0.8;
  const wallThickness = 0.18;

  return (
    <group position={boat.position.toArray()} rotation={[0, boat.rotation, 0]}>
      {/* Base */}
      <mesh position={[0, -wallThickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[baseLength, wallThickness, baseWidth]} />
        <meshStandardMaterial color={hullColor} roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Walls */}
      <mesh position={[0, wallHeight / 2, (baseWidth - wallThickness) / 2]} castShadow receiveShadow>
        <boxGeometry args={[baseLength, wallHeight, wallThickness]} />
        <meshStandardMaterial color={hullColor} />
      </mesh>
      <mesh position={[0, wallHeight / 2, -(baseWidth - wallThickness) / 2]} castShadow receiveShadow>
        <boxGeometry args={[baseLength, wallHeight, wallThickness]} />
        <meshStandardMaterial color={hullColor} />
      </mesh>
      <mesh position={[(baseLength - wallThickness) / 2, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, baseWidth - wallThickness * 2]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>
      <mesh position={[-(baseLength - wallThickness) / 2, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallThickness, wallHeight, baseWidth - wallThickness * 2]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>
    </group>
  );
};
