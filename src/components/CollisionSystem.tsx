import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

// Define collision object type
export type CollisionObject = {
  position: THREE.Vector3;
  radius: number;
};

// Collision system context
export class CollisionSystem {
  private static instance: CollisionSystem;
  private objects: CollisionObject[] = [];
  private mapRadius: number = 20; // Adjust this value to match your map size
  private waterAreas: THREE.Box3[] = []; // Store water areas as bounding boxes
  private physicalObjects: THREE.Box3[] = []; // Store physical objects as bounding boxes

  private constructor() {
    console.log('Collision system initialized');
  }

  public static getInstance(): CollisionSystem {
    if (!CollisionSystem.instance) {
      CollisionSystem.instance = new CollisionSystem();
    }
    return CollisionSystem.instance;
  }

  public registerObject(object: CollisionObject): void {
    this.objects.push(object);
    console.log('Object registered, total:', this.objects.length);
  }

  public unregisterObject(object: CollisionObject): void {
    const index = this.objects.findIndex(obj => 
      obj.position.equals(object.position) && obj.radius === object.radius
    );
    
    if (index !== -1) {
      this.objects.splice(index, 1);
      console.log('Object unregistered, remaining:', this.objects.length);
    }
  }

  public registerWaterArea(min: THREE.Vector3, max: THREE.Vector3): void {
    const box = new THREE.Box3(min, max);
    this.waterAreas.push(box);
    console.log('Water area registered, total:', this.waterAreas.length);
  }

  public registerPhysicalObject(min: THREE.Vector3, max: THREE.Vector3): THREE.Box3 {
    const box = new THREE.Box3(min, max);
    this.physicalObjects.push(box);
    console.log('Physical object registered, total:', this.physicalObjects.length);
    return box;
  }

  public checkCollision(position: THREE.Vector3, radius: number): boolean {
    // Add debug logging for collision check
    console.log(`Checking collision at [${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}] with radius ${radius}`);
    console.log(`Total registered objects: ${this.objects.length}, physical objects: ${this.physicalObjects.length}`);
    
    // Check existing object collisions
    for (const obj of this.objects) {
      // Skip self-collision by checking if positions are very close
      if (position.distanceTo(obj.position) < 0.001) {
        continue;
      }
      
      const distance = position.distanceTo(obj.position);
      if (distance < (radius + obj.radius)) {
        console.log('Collision with object at', obj.position, 'distance:', distance);
        return true;
      }
    }

    // Check water area collisions
    const characterSphere = new THREE.Sphere(position, radius);
    for (const waterBox of this.waterAreas) {
      if (waterBox.intersectsSphere(characterSphere)) {
        console.log('Collision with water area', waterBox);
        return true;
      }
    }

    // Check physical object collisions with improved detection
    for (const physicalBox of this.physicalObjects) {
      // Use a significantly larger collision check for NPCs to prevent getting too close
      const expandedSphere = new THREE.Sphere(position, radius * 1.5); // Increased from 1.2 to 1.5
      
      if (physicalBox.intersectsSphere(expandedSphere)) {
        console.log('Collision with physical object', physicalBox);
        return true;
      }
      
      // Additional check for near-misses with greater buffer
      const closestPoint = new THREE.Vector3();
      physicalBox.clampPoint(position, closestPoint);
      const distanceToBox = position.distanceTo(closestPoint);
      
      if (distanceToBox < radius + 1.0) { // Increased buffer from 0.5 to 1.0
        console.log('Near collision with physical object, distance:', distanceToBox);
        return true;
      }
    }

    // Stricter map boundary collision check
    const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
    if (distanceFromCenter >= (this.mapRadius - radius - 0.5)) {  // Added buffer of 0.5
      console.log('Collision with map boundary, distance from center:', distanceFromCenter);
      return true;
    }

    return false;
  }

  public getValidPosition(
    currentPosition: THREE.Vector3,
    targetPosition: THREE.Vector3,
    radius: number
  ): THREE.Vector3 {
    // Add debug logging
    console.log('Current position:', currentPosition);
    console.log('Target position:', targetPosition);
    
    // Check if target position would be outside boundary
    const distanceFromCenter = Math.sqrt(
      targetPosition.x * targetPosition.x + 
      targetPosition.z * targetPosition.z
    );
    
    if (distanceFromCenter >= (this.mapRadius - radius - 0.5)) {
      // If outside, clamp to boundary
      const angle = Math.atan2(targetPosition.x, targetPosition.z);
      const maxRadius = this.mapRadius - radius - 0.5;
      
      const boundaryPosition = new THREE.Vector3(
        Math.sin(angle) * maxRadius,
        targetPosition.y,
        Math.cos(angle) * maxRadius
      );
      
      console.log('Boundary collision, clamped to:', boundaryPosition);
      return boundaryPosition;
    }

    // Check other collisions
    if (!this.checkCollision(targetPosition, radius)) {
      console.log('No collision, moving to target position');
      return targetPosition;
    }
    
    console.log('Collision detected, attempting to slide');

    // If there's a collision, try to slide along the direction
    // First, try sliding in the X direction
    const slideX = new THREE.Vector3(
      currentPosition.x,
      targetPosition.y,
      targetPosition.z
    );
    
    if (!this.checkCollision(slideX, radius)) {
      console.log('Sliding along X axis');
      return slideX;
    }
    
    // Then try sliding in the Z direction
    const slideZ = new THREE.Vector3(
      targetPosition.x,
      targetPosition.y,
      currentPosition.z
    );
    
    if (!this.checkCollision(slideZ, radius)) {
      console.log('Sliding along Z axis');
      return slideZ;
    }

    // Try diagonal sliding (new)
    const diagonalSlide = new THREE.Vector3(
      currentPosition.x + (targetPosition.x - currentPosition.x) * 0.5,
      targetPosition.y,
      currentPosition.z + (targetPosition.z - currentPosition.z) * 0.5
    );
    
    if (!this.checkCollision(diagonalSlide, radius)) {
      console.log('Sliding diagonally');
      return diagonalSlide;
    }

    // If all else fails, try moving a smaller distance in the same direction
    const direction = new THREE.Vector3().subVectors(targetPosition, currentPosition).normalize();
    
    // Try multiple step sizes
    for (let stepFactor = 0.8; stepFactor > 0.1; stepFactor -= 0.1) { // Smaller steps (0.1 instead of 0.2)
      const partialPosition = new THREE.Vector3().addVectors(
        currentPosition,
        direction.clone().multiplyScalar(radius * stepFactor)
      );
      
      if (!this.checkCollision(partialPosition, radius)) {
        console.log(`Moving a smaller distance (${stepFactor} of radius)`);
        return partialPosition;
      }
    }

    console.log('All movement attempts failed, staying at current position');
    // If all else fails, stay at current position
    return currentPosition;
  }
  
  // For debugging
  public getObjectCount(): number {
    return this.objects.length;
  }
  
  // Reset all collision objects (useful when remounting)
  public reset(): void {
    this.objects = [];
    this.waterAreas = [];
    this.physicalObjects = [];
    console.log('Collision system reset');
  }

  // Add method to set map radius
  public setMapRadius(radius: number): void {
    this.mapRadius = radius;
  }

  public unregisterPhysicalObject(min: THREE.Vector3, max: THREE.Vector3): void {
    // Find the index of the physical object to remove using approximate matching
    const index = this.physicalObjects.findIndex(box => 
      min.distanceTo(box.min) < 0.001 && max.distanceTo(box.max) < 0.001
    );
    
    if (index !== -1) {
      this.physicalObjects.splice(index, 1);
      console.log('Physical object unregistered, remaining:', this.physicalObjects.length);
    }
  }
}

// Hook to use the collision system
export const useCollisionSystem = () => {
  return CollisionSystem.getInstance();
};

// Component to register a collision object
export const CollisionObject = ({ 
  position, 
  radius,
  visible = false
}: { 
  position: [number, number, number]; 
  radius: number;
  visible?: boolean;
}) => {
  const collisionSystem = useCollisionSystem();
  const objRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    const collisionObj: CollisionObject = {
      position: new THREE.Vector3(...position),
      radius
    };
    
    collisionSystem.registerObject(collisionObj);
    
    return () => {
      collisionSystem.unregisterObject(collisionObj);
    };
  }, [position, radius, collisionSystem]);
  
  return (
    <mesh ref={objRef} position={position} visible={visible}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color="red" wireframe transparent opacity={0.3} />
    </mesh>
  );
};

// Water area component
export const WaterCollision = ({
  position,
  size,
  visible = false
}: {
  position: [number, number, number];
  size: [number, number];
  visible?: boolean;
}) => {
  const collisionSystem = useCollisionSystem();
  const meshRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    const halfWidth = size[0] / 2;
    const halfLength = size[1] / 2;
    const min = new THREE.Vector3(
      position[0] - halfWidth,
      position[1] - 0.5,
      position[2] - halfLength
    );
    const max = new THREE.Vector3(
      position[0] + halfWidth,
      position[1] + 0.5,
      position[2] + halfLength
    );
    
    collisionSystem.registerWaterArea(min, max);
    
    // No need to unregister as the water areas are static
  }, [position, size, collisionSystem]);
  
  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]} visible={visible}>
      <planeGeometry args={[size[0], size[1]]} />
      <meshBasicMaterial color="blue" wireframe transparent opacity={0.3} />
    </mesh>
  );
};

// Optional: Add a visible boundary component for debugging
export const MapBoundary = ({ radius = 20, visible = false }) => {
  const segments = 64;
  const meshRef = useRef<THREE.Mesh>(null);
  
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} visible={visible}>
      <ringGeometry args={[radius - 0.1, radius, segments]} />
      <meshBasicMaterial color="red" wireframe transparent opacity={0.3} />
    </mesh>
  );
};

// Physical object component
export const PhysicalObject = ({
  position,
  size,
  visible = false
}: {
  position: [number, number, number];
  size: [number, number, number];
  visible?: boolean;
}) => {
  const collisionSystem = useCollisionSystem();
  const meshRef = useRef<THREE.Mesh>(null);
  const physicalBoxRef = useRef<THREE.Box3 | null>(null);

  // Register once on mount and store the returned box.
  useEffect(() => {
    const halfWidth = size[0] / 2;
    const halfHeight = size[1] / 2;
    const halfDepth = size[2] / 2;

    const initialPos = new THREE.Vector3(...position);
    const min = new THREE.Vector3(
      initialPos.x - halfWidth,
      initialPos.y - halfHeight,
      initialPos.z - halfDepth
    );
    const max = new THREE.Vector3(
      initialPos.x + halfWidth,
      initialPos.y + halfHeight,
      initialPos.z + halfDepth
    );

    physicalBoxRef.current = collisionSystem.registerPhysicalObject(min, max);
    console.log(`Registered physical object at [${position}] with size [${size}]`);

    return () => {
      collisionSystem.unregisterPhysicalObject(min, max);
      console.log(`Unregistered physical object at [${position}]`);
    };
  }, [position, size, collisionSystem]);

  // Update the collision box every frame to follow the mesh's world position.
  useFrame(() => {
    if (meshRef.current && physicalBoxRef.current) {
      meshRef.current.updateMatrixWorld();
      const worldPos = new THREE.Vector3();
      meshRef.current.getWorldPosition(worldPos);
      const halfWidth = size[0] / 2;
      const halfHeight = size[1] / 2;
      const halfDepth = size[2] / 2;

      physicalBoxRef.current.min.set(
        worldPos.x - halfWidth,
        worldPos.y - halfHeight,
        worldPos.z - halfDepth
      );
      physicalBoxRef.current.max.set(
        worldPos.x + halfWidth,
        worldPos.y + halfHeight,
        worldPos.z + halfDepth
      );
    }
  });

  return (
    <mesh ref={meshRef} position={position} visible={visible}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="orange" wireframe transparent opacity={0.5} />
    </mesh>
  );
};

export default CollisionSystem;
