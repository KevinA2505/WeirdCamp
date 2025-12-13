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
  const baseColor = runtimeAgent?.color ?? '#fbbf24';
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.5,
        metalness: 0.05,
      }),
    [baseColor]
  );

  const accentMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.7,
        metalness: 0.1,
      }),
    []
  );

  useFrame((_, delta) => {
    const agent = runtimeRef.current.get(agentId);
    if (!agent || !groupRef.current) return;

    bobRef.current += delta * (agent.mode === 'running' ? 8 : 4);
    const bobOffset = Math.sin(bobRef.current) * 0.08;

    groupRef.current.position.set(agent.position.x, agent.position.y + bobOffset, agent.position.z);
    groupRef.current.rotation.y = agent.heading;
  });

  const halfHeight = agentHeight / 2;

  return (
    <group ref={groupRef}>
      <mesh castShadow receiveShadow material={bodyMaterial} position={[0, halfHeight, 0]}>
        <capsuleGeometry args={[0.45, 1.4, 6, 12]} />
      </mesh>

      <mesh castShadow receiveShadow material={accentMaterial} position={[0, halfHeight + 0.9, 0]}>
        <sphereGeometry args={[0.38, 16, 16]} />
      </mesh>

      <mesh castShadow receiveShadow material={accentMaterial} position={[0, halfHeight + 0.3, 0]}>
        <cylinderGeometry args={[0.5, 0.55, 0.4, 12]} />
      </mesh>

      {showHitboxes && (
        <mesh position={[0, halfHeight, 0]}>
          <capsuleGeometry args={[0.5, 1.6, 4, 8]} />
          <meshBasicMaterial color="cyan" wireframe transparent opacity={0.65} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};
