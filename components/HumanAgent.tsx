import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface HumanRuntime {
  id: string;
  position: THREE.Vector3;
  heading: number;
  mode: 'walking' | 'running';
  color: string;
  height: number;
  radius: number;
}

interface HumanAgentProps {
  agentId: string;
  runtimeRef: React.MutableRefObject<Map<string, HumanRuntime>>;
  showHitboxes: boolean;
}

export const HumanAgent: React.FC<HumanAgentProps> = ({ agentId, runtimeRef, showHitboxes }) => {
  const groupRef = useRef<THREE.Group>(null);
  const bobRef = useRef(0);

  const runtimeAgent = runtimeRef.current.get(agentId);
  const agentHeight = runtimeAgent?.height ?? 2.2;
  const agentRadius = runtimeAgent?.radius ?? 0.45;
  const baseColor = runtimeAgent?.color ?? '#fbbf24';
  const clothingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.55,
        metalness: 0.08,
      }),
    [baseColor]
  );

  const skinMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f2c9a0',
        roughness: 0.4,
        metalness: 0.02,
      }),
    []
  );

  const accentMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.65,
        metalness: 0.12,
      }),
    []
  );

  useFrame((_, delta) => {
    const agent = runtimeRef.current.get(agentId);
    if (!agent || !groupRef.current) return;

    bobRef.current += delta * (agent.mode === 'running' ? 8 : 4);
    const bobOffset = Math.sin(bobRef.current) * 0.05;

    groupRef.current.position.set(agent.position.x, agent.position.y + bobOffset, agent.position.z);
    groupRef.current.rotation.y = agent.heading;
  });

  const halfHeight = agentHeight / 2;
  const headRadius = agentRadius * 0.82;
  const neckHeight = agentHeight * 0.04;
  const torsoHeight = Math.max(agentHeight - headRadius * 2 - neckHeight, agentRadius * 2.6);
  const torsoRadius = agentRadius * 0.92;
  const torsoLength = Math.max(torsoHeight - torsoRadius * 2, torsoRadius * 0.6);
  const headCenterY = torsoHeight + neckHeight + headRadius;
  const hatCenterY = headCenterY - headRadius * 0.4;
  const shoulderHeight = torsoHeight * 0.86;
  const armLength = agentHeight * 0.48;
  const armRadius = agentRadius * 0.26;
  const armOffsetX = torsoRadius + armRadius * 1.4;
  const armCenterY = Math.max(shoulderHeight - armLength / 2, armRadius);
  const hitboxRadius = agentRadius * 1.1;
  const hitboxLength = Math.max(agentHeight - hitboxRadius * 2, torsoLength);

  return (
    <group ref={groupRef}>
      <mesh castShadow receiveShadow material={clothingMaterial} position={[0, torsoHeight / 2, 0]}>
        <capsuleGeometry args={[torsoRadius, torsoLength, 6, 12]} />
      </mesh>

      <mesh castShadow receiveShadow material={skinMaterial} position={[0, headCenterY, 0]}>
        <sphereGeometry args={[headRadius, 16, 16]} />
      </mesh>

      <mesh castShadow receiveShadow material={accentMaterial} position={[0, hatCenterY, 0]}>
        <cylinderGeometry args={[agentRadius * 1.05, agentRadius * 1.15, agentHeight * 0.15, 12]} />
      </mesh>

      <mesh
        castShadow
        receiveShadow
        material={skinMaterial}
        position={[armOffsetX, armCenterY, 0]}
        rotation={[0, 0, Math.PI * 0.01]}
      >
        <capsuleGeometry args={[armRadius, Math.max(armLength - armRadius * 2, armRadius * 0.8), 6, 10]} />
      </mesh>

      <mesh
        castShadow
        receiveShadow
        material={skinMaterial}
        position={[-armOffsetX, armCenterY, 0]}
        rotation={[0, 0, -Math.PI * 0.01]}
      >
        <capsuleGeometry args={[armRadius, Math.max(armLength - armRadius * 2, armRadius * 0.8), 6, 10]} />
      </mesh>

      {showHitboxes && (
        <mesh position={[0, halfHeight, 0]}>
          <capsuleGeometry args={[hitboxRadius, hitboxLength, 4, 8]} />
          <meshBasicMaterial color="cyan" wireframe transparent opacity={0.65} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};
