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
  pauseTimer?: number;
}

interface HumanAgentProps {
  agentId: string;
  runtimeRef: React.MutableRefObject<Map<string, HumanRuntime>>;
  showHitboxes: boolean;
}

export const HumanAgent: React.FC<HumanAgentProps> = ({ agentId, runtimeRef, showHitboxes }) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmGroup = useRef<THREE.Group>(null);
  const rightArmGroup = useRef<THREE.Group>(null);
  const headGroup = useRef<THREE.Group>(null);
  const bobRef = useRef(0);
  const headMotionRef = useRef(0);

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

    const stepRate = agent.mode === 'running' ? 10 : 6;
    bobRef.current += delta * stepRate;
    const bobOffset = Math.sin(bobRef.current) * 0.05;

    groupRef.current.position.set(agent.position.x, agent.position.y + bobOffset, agent.position.z);
    groupRef.current.rotation.y = agent.heading;

    const swingAmplitude = agent.mode === 'running' ? 0.9 : 0.55;
    const leftSwing = Math.sin(bobRef.current) * swingAmplitude;
    const rightSwing = -Math.sin(bobRef.current) * swingAmplitude;

    if (leftArmGroup.current) {
      leftArmGroup.current.rotation.x = THREE.MathUtils.lerp(
        leftArmGroup.current.rotation.x,
        leftSwing,
        0.18
      );
    }

    if (rightArmGroup.current) {
      rightArmGroup.current.rotation.x = THREE.MathUtils.lerp(
        rightArmGroup.current.rotation.x,
        rightSwing,
        0.18
      );
    }

    const pauseTimer = (agent as HumanRuntime & { pauseTimer?: number }).pauseTimer ?? 0;
    const isPaused = pauseTimer > 0;

    const targetHeadYaw = isPaused ? Math.sin(headMotionRef.current * 0.6) * 0.45 : 0;
    const targetHeadPitch = isPaused ? Math.sin(headMotionRef.current * 0.4) * 0.15 : 0;
    headMotionRef.current = isPaused ? headMotionRef.current + delta : 0;

    if (headGroup.current) {
      headGroup.current.rotation.y = THREE.MathUtils.lerp(headGroup.current.rotation.y, targetHeadYaw, 0.1);
      headGroup.current.rotation.x = THREE.MathUtils.lerp(headGroup.current.rotation.x, targetHeadPitch, 0.1);
    }
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

      <group ref={headGroup} position={[0, headCenterY, 0]}>
        <mesh castShadow receiveShadow material={skinMaterial}>
          <sphereGeometry args={[headRadius, 16, 16]} />
        </mesh>

        <mesh castShadow receiveShadow material={accentMaterial} position={[0, hatCenterY - headCenterY, 0]}>
          <cylinderGeometry args={[agentRadius * 1.05, agentRadius * 1.15, agentHeight * 0.15, 12]} />
        </mesh>
      </group>

      <group ref={leftArmGroup} position={[armOffsetX, shoulderHeight, 0]} rotation={[0, 0, Math.PI * 0.01]}>
        <mesh
          castShadow
          receiveShadow
          material={skinMaterial}
          position={[0, armCenterY - shoulderHeight, 0]}
        >
          <capsuleGeometry args={[armRadius, Math.max(armLength - armRadius * 2, armRadius * 0.8), 6, 10]} />
        </mesh>
      </group>

      <group ref={rightArmGroup} position={[-armOffsetX, shoulderHeight, 0]} rotation={[0, 0, -Math.PI * 0.01]}>
        <mesh
          castShadow
          receiveShadow
          material={skinMaterial}
          position={[0, armCenterY - shoulderHeight, 0]}
        >
          <capsuleGeometry args={[armRadius, Math.max(armLength - armRadius * 2, armRadius * 0.8), 6, 10]} />
        </mesh>
      </group>

      {showHitboxes && (
        <mesh position={[0, halfHeight, 0]}>
          <capsuleGeometry args={[hitboxRadius, hitboxLength, 4, 8]} />
          <meshBasicMaterial color="cyan" wireframe transparent opacity={0.65} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};
