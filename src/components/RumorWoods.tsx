/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

"use client"

import { useRef, useState, useEffect, Suspense, useMemo } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Sky, useGLTF, Stats, useTexture } from "@react-three/drei"
import * as THREE from "three"
import { MapBoundary, PhysicalObject, useCollisionSystem } from "./CollisionSystem"

// Collision object component
const CollisionObject = ({
  position,
  radius,
  visible = false,
}: { position: [number, number, number]; radius: number; visible?: boolean }) => {
  const mesh = useRef<THREE.Mesh>(null)
  const collisionSystem = useCollisionSystem()

  useEffect(() => {
    if (mesh.current) {
      const pos = new THREE.Vector3(...position)
      const collisionObj = {
        position: pos,
        radius
      }
      
      collisionSystem.registerObject(collisionObj)
      
      return () => {
        collisionSystem.unregisterObject(collisionObj)
      }
    }
  }, [position, radius, collisionSystem])

  if (!visible) return null

  return (
    <mesh ref={mesh} position={position}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color="red" wireframe opacity={0.5} transparent />
    </mesh>
  )
}

// Loading component
const LoadingScreen = () => {
  return (
    <div className="absolute inset-0 bg-black/80 flex justify-center items-center text-white text-2xl">
      <div className="flex flex-col items-center">
        <div className="mb-4 text-3xl font-bold text-green-400">Loading RumorWoods...</div>
        <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 animate-[progress_2s_ease-in-out_infinite]"
            style={{ width: "70%" }}
          ></div>
        </div>
      </div>
    </div>
  )
}

// Character controller component
const CharacterController = ({ speed = 0.45, showCollisions = false, playerName = "Korok" }) => {
  const characterRef = useRef<THREE.Group>(null)
  const modelRef = useRef<THREE.Group>(null)
  const { nodes, materials, scene } = useGLTF("/link.glb") as any
  const [keys, setKeys] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
    rotateLeft: false,
    rotateRight: false,
    jump: false,
  })
  const { camera } = useThree()
  const cameraOffsetRef = useRef(new THREE.Vector3(0, 4.2, 8.4)) // 20% further out (original values were 3.5 and 7)
  const cameraAngleRef = useRef(Math.PI) // Initial camera angle (behind character)
  const cameraElevationRef = useRef(0) // Camera elevation angle
  const rotationSpeed = 0.03 // Camera rotation speed
  const cameraDistance = 8.4 // Base camera distance (20% more than original 7)
  const collisionSystem = useCollisionSystem()
  const [isRunning, setIsRunning] = useState(false)
  const [animationFrame, setAnimationFrame] = useState(0)
  const animationTimer = useRef<number | null>(null)
  const characterRadius = 0.8 // Adjusted to fit Korok size
  const [isDragging, setIsDragging] = useState(false)
  const lastMousePosition = useRef({ x: 0, y: 0 })
  const [modelLoaded, setModelLoaded] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  
  // Physics state for vertical movement
  const verticalVelocityRef = useRef(0)
  const isJumpingRef = useRef(false)
  const isFallingRef = useRef(false) // Track if we're falling to apply different gravity
  const jumpHeight = 7.5 // Maximum jump height (5x the original 1.5)
  const riseGravity = 0.05 // Gravity strength when rising
  const fallGravity = 0.03 // Gravity strength when falling (slower to allow more "float" time)
  const groundLevel = 0 // Y position of the ground
  
  // Use refs for collision debug info to avoid re-renders
  const lastCollisionRef = useRef<string | null>(null)
  const collisionCountRef = useRef(0)
  // Keep state for display purposes only, updated less frequently
  const [lastCollision, setLastCollision] = useState<string | null>(null)
  const [collisionCount, setCollisionCount] = useState(0)
  
  // Update collision display periodically
  useEffect(() => {
    const updateInterval = setInterval(() => {
      if (lastCollisionRef.current !== lastCollision) {
        setLastCollision(lastCollisionRef.current);
      }
      if (collisionCountRef.current !== collisionCount) {
        setCollisionCount(collisionCountRef.current);
      }
    }, 500); // Update every 500ms
    
    return () => clearInterval(updateInterval);
  }, [lastCollision, collisionCount]);
  
  // Register the character with the collision system for debugging
  useEffect(() => {
    if (characterRef.current) {
      // Add a debug message
      console.log('Character controller initialized with radius:', characterRadius);
      
      // Add a collision object for the character (for debugging only)
      if (showCollisions) {
        const characterPos = new THREE.Vector3(0, 0, -45); // Initial position (far from central tree, facing it)
        const collisionObj = {
          position: characterPos,
          radius: characterRadius
        };
        
        // Log but don't actually register (to avoid self-collisions)
        console.log('Character collision object:', collisionObj);
      }
    }
  }, [characterRadius, showCollisions]);

  // Animation frames for running and parachute bobbing
  useEffect(() => {
    if (isRunning) {
      animationTimer.current = window.setInterval(() => {
        setAnimationFrame((prev) => (prev + 1) % 8)
      }, 150)
    } else {
      if (animationTimer.current) {
        clearInterval(animationTimer.current)
        animationTimer.current = null
      }
      setAnimationFrame(0)
    }

    return () => {
      if (animationTimer.current) {
        clearInterval(animationTimer.current)
      }
    }
  }, [isRunning])
  
  // Add gentle bobbing animation to the parachute
  const parachuteRef = useRef<THREE.Group>(null)
  
  useFrame(({ clock }) => {
    if (parachuteRef.current) {
      const t = clock.getElapsedTime()
      
      // Adjust parachute based on jumping state
      if (isJumpingRef.current) {
        // Set intensity based on velocity instead of jump count
        const jumpIntensity = 1.5; // Fixed higher intensity for more dramatic effect
        const velocity = Math.abs(verticalVelocityRef.current);
        
        if (isFallingRef.current) {
          // When falling, expand the parachute more to show slowing effect
          parachuteRef.current.position.y = 2.2 + Math.sin(t * 2) * 0.2 + 0.5;
          parachuteRef.current.rotation.x = Math.sin(t * 1.5) * 0.2 * jumpIntensity;
          parachuteRef.current.rotation.z = Math.sin(t * 1.8) * 0.2 * jumpIntensity;
          // Larger parachute during falling for dramatic effect
          const scaleValue = 1.35;
          parachuteRef.current.scale.set(scaleValue, scaleValue, scaleValue);
        } else {
          // When rising, make parachute more active with fluttering animation
          parachuteRef.current.position.y = 2.2 + Math.sin(t * 6) * 0.3 + 0.3;
          parachuteRef.current.rotation.x = Math.sin(t * 3) * 0.15 * jumpIntensity;
          parachuteRef.current.rotation.z = Math.sin(t * 4) * 0.15 * jumpIntensity;
          // More compact during rising
          const scaleValue = 0.9;
          parachuteRef.current.scale.set(scaleValue, scaleValue, scaleValue);
        }
      } else {
        // Normal gentle bobbing when not jumping
        parachuteRef.current.position.y = Math.sin(t * 0.8) * 0.1 + 2.2;
        parachuteRef.current.rotation.x = Math.sin(t * 0.5) * 0.03;
        parachuteRef.current.rotation.z = Math.sin(t * 0.7) * 0.03;
        parachuteRef.current.scale.set(1, 1, 1);
      } 
    }
  })

  // No attack animation anymore

  // Set up key listeners
  useEffect(() => {
    // Create a map of key codes to their corresponding actions
    const keyMap: Record<string, keyof typeof keys> = {
      'w': 'forward',
      'W': 'forward',
      'ArrowUp': 'forward',
      's': 'backward',
      'S': 'backward',
      'ArrowDown': 'backward',
      'a': 'left',
      'A': 'left',
      'ArrowLeft': 'left',
      'd': 'right',
      'D': 'right',
      'ArrowRight': 'right',
      'q': 'rotateLeft',
      'Q': 'rotateLeft',
      'e': 'rotateRight',
      'E': 'rotateRight'
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if this key is mapped to an action
      const action = keyMap[e.key];
      if (action) {
        console.log(`Key down: ${e.key} -> ${action}`);
        setKeys(prev => ({ ...prev, [action]: true }));
      }
      
      // Handle other keys
      if (e.key === "Shift") setIsRunning(true);
      
      // Handle spacebar for jumping
      if (e.key === " ") {
        // Allow jumping from anywhere, anytime - unlimited flight!
        console.log("Jump initiated");
        isJumpingRef.current = true;
        isFallingRef.current = false; // Always reset to rising when jumping
        
        // Add upward velocity (always the same boost regardless of current state)
        verticalVelocityRef.current = Math.sqrt(2 * riseGravity * jumpHeight);
        
        setKeys(prev => ({ ...prev, jump: true }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Check if this key is mapped to an action
      const action = keyMap[e.key];
      if (action) {
        console.log(`Key up: ${e.key} -> ${action}`);
        setKeys(prev => ({ ...prev, [action]: false }));
      }
      
      // Handle other keys
      if (e.key === "Shift") setIsRunning(false);
      
      // Handle spacebar release
      if (e.key === " ") {
        setKeys(prev => ({ ...prev, jump: false }));
        // We don't reset isJumpingRef here - that happens when we hit the ground
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [keys]); // Remove isAttacking from dependency array

  // Set up mouse listeners for camera control
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - lastMousePosition.current.x;
        const deltaY = e.clientY - lastMousePosition.current.y;

        // Horizontal rotation
        cameraAngleRef.current -= deltaX * 0.01;

        // Vertical elevation (with limits)
        cameraElevationRef.current -= deltaY * 0.01;
        cameraElevationRef.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraElevationRef.current));

        // Update last position without triggering a re-render
        lastMousePosition.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]); // Only depend on isDragging, not lastMousePosition

  // Update character position based on keys
  useFrame(({ clock }) => {
    if (!characterRef.current) return

    const character = characterRef.current
    const time = clock.getElapsedTime()

    // Apply gravity and vertical velocity - with proper type checking
    if ((character.position?.y ?? 0) > groundLevel || verticalVelocityRef.current !== 0) {
      // Detect transition from rising to falling
      if (verticalVelocityRef.current <= 0 && !isFallingRef.current) {
        console.log('Peak of jump reached, now falling');
        isFallingRef.current = true;
      }
      
      // Apply appropriate gravity based on rising or falling
      if (isFallingRef.current) {
        // Slower gravity when falling
        verticalVelocityRef.current -= fallGravity;
      } else {
        // Normal gravity when rising
        verticalVelocityRef.current -= riseGravity;
      }
      
      // Calculate new vertical position
      const currentY = character.position?.y ?? 0;
      const newY = currentY + verticalVelocityRef.current;
      
      // Check if we've hit the ground
      if (newY <= groundLevel && verticalVelocityRef.current < 0) {
        if (character.position) {
          character.position.y = groundLevel;
        }
        verticalVelocityRef.current = 0;
        
        // Only set jumping to false, but don't prevent more jumps
        isJumpingRef.current = false;
        isFallingRef.current = false;
        
        console.log('Landed on ground');
      } else {
        if (character.position) {
          character.position.y = newY;
        }
      }
    }

    // Calculate movement direction
    let moveX = 0
    let moveZ = 0
    const currentSpeed = isRunning ? speed * 2.2 : speed

    // Get input direction
    const inputDirection = new THREE.Vector3(0, 0, 0);
    if (keys.forward) inputDirection.z -= 1;
    if (keys.backward) inputDirection.z += 1;
    if (keys.left) inputDirection.x -= 1;
    if (keys.right) inputDirection.x += 1;
    
    // Normalize input if we're moving in multiple directions
    if (inputDirection.length() > 1) {
      inputDirection.normalize();
    }
    
    // Apply camera rotation to input direction to make movement relative to camera
    const cameraAngle = cameraAngleRef.current;
    const rotatedInputX = inputDirection.x * Math.cos(cameraAngle) + inputDirection.z * Math.sin(cameraAngle);
    const rotatedInputZ = -inputDirection.x * Math.sin(cameraAngle) + inputDirection.z * Math.cos(cameraAngle);
    
    // Scale by speed
    moveX = rotatedInputX * currentSpeed;
    moveZ = rotatedInputZ * currentSpeed;

    // Apply movement if keys are pressed
    if (moveX !== 0 || moveZ !== 0) {
      // Calculate target position (with proper type checking)
      const targetPosition = new THREE.Vector3(
        (character.position?.x ?? 0) + moveX,
        character.position?.y ?? 0,
        (character.position?.z ?? 0) + moveZ,
      );

      // Check if there would be a collision at the target position
      const wouldCollide = collisionSystem.checkCollision(targetPosition, characterRadius);
      
      if (wouldCollide) {
        // Use ref instead of state to avoid re-renders
        lastCollisionRef.current = `Collision at [${targetPosition.x.toFixed(2)}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(2)}]`;
        collisionCountRef.current += 1;
        console.log('Collision detected at target position:', targetPosition);
      }

      // Create a safe copy of the current position
      const currentPosition = character.position ? new THREE.Vector3(
        character.position.x,
        character.position.y,
        character.position.z
      ) : new THREE.Vector3(0, 0, 0);

      // Use the collision system to get a valid position
      const validPosition = collisionSystem.getValidPosition(
        currentPosition,
        targetPosition,
        characterRadius
      );

      // Check if we actually moved
      const didMove = !validPosition.equals(currentPosition);
      if (!didMove && wouldCollide) {
        console.log('Movement blocked by collision');
      }

      // Calculate movement direction for rotation
      const movementDirection = new THREE.Vector3(moveX, 0, moveZ).normalize();
      
      // Only rotate if there's actual movement
      if (movementDirection.length() > 0 && character.rotation) {
        // Calculate the angle based on movement direction
        const targetRotation = Math.atan2(movementDirection.x, movementDirection.z);
        
        // Apply rotation to the character
        character.rotation.y = targetRotation;
      }

      // Update position with the valid position if position exists
      if (character.position) {
        character.position.copy(validPosition);
      }

      // Add a slight swaying motion when moving
      if (modelRef.current) {
        modelRef.current.rotation.z = Math.sin(time * 5) * 0.05;
      }
    } else {
      setIsRunning(false);
      // Reset the swaying when not moving
      if (modelRef.current) {
        modelRef.current.rotation.z = 0;
      }
    }

    // Handle camera rotation from keyboard
    if (keys.rotateLeft) {
      cameraAngleRef.current += rotationSpeed
    }
    if (keys.rotateRight) {
      cameraAngleRef.current -= rotationSpeed
    }

    // Update camera offset based on camera angle and elevation
    // Using cameraDistance (20% increased from original 7)
    const horizontalDistance = cameraDistance * Math.cos(cameraElevationRef.current)
    cameraOffsetRef.current.set(
      Math.sin(cameraAngleRef.current) * horizontalDistance,
      3.0 + 4.8 * Math.sin(cameraElevationRef.current), // 20% increase from original 2.5 and 4
      Math.cos(cameraAngleRef.current) * horizontalDistance,
    )

    // Always update camera position to follow character (with proper type checking)
    if (character.position) {
      camera.position.x = character.position.x + cameraOffsetRef.current.x
      camera.position.y = character.position.y + cameraOffsetRef.current.y + 1.2 // Slightly higher vertical offset
      camera.position.z = character.position.z + cameraOffsetRef.current.z
      // Adjust the look target to be slightly higher as well
      camera.lookAt(character.position.x, character.position.y + 1.2, character.position.z)
    }

    // No weapon animations anymore
  })

  // No weapon rotation needed

  return (
    <group ref={characterRef} position={[0, 0, -45]} rotation={[0, 0, 0]}>
      {/* Add collision debug sphere */}
      {showCollisions && (
        <>
          <mesh position={[0, 1, 0]}>
            <sphereGeometry args={[characterRadius, 16, 16]} />
            <meshBasicMaterial color="red" wireframe transparent opacity={0.3} />
          </mesh>
          {lastCollision && (
            <sprite position={[0, 3.5, 0]} scale={[4, 1, 1]}>
              <spriteMaterial>
                <canvasTexture
                  attach="map"
                  args={[
                    (() => {
                      const canvas = document.createElement("canvas")
                      canvas.width = 256
                      canvas.height = 64
                      const context = canvas.getContext("2d")
                      if (context) {
                        context.fillStyle = "#000000"
                        context.fillRect(0, 0, canvas.width, canvas.height)
                        context.font = "bold 16px Arial"
                        context.textAlign = "center"
                        context.fillStyle = "#ff0000"
                        context.fillText(`Collisions: ${collisionCount}`, canvas.width / 2, canvas.height / 2 - 10)
                        context.fillText(lastCollision, canvas.width / 2, canvas.height / 2 + 10)
                      }
                      return canvas
                    })(),
                  ]}
                />
              </spriteMaterial>
            </sprite>
          )}
        </>
      )}
      <group ref={modelRef} scale={[1, 1, 1]} position={[0, 0, 0]}>
        {/* Korok Body - small stumpy body */}
        <mesh castShadow position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.4, 0.6, 1, 8]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
        </mesh>

        {/* Korok Face - mask-like face */}
        <mesh castShadow position={[0, 1.1, 0.2]}>
          <sphereGeometry args={[0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          <meshStandardMaterial color="#f5e8cb" roughness={0.7} />
        </mesh>

        {/* Korok Eyes */}
        <mesh position={[0.15, 1.1, 0.45]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        <mesh position={[-0.15, 1.1, 0.45]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#000000" />
        </mesh>

        {/* Korok Mouth */}
        <mesh position={[0, 0.95, 0.45]}>
          <boxGeometry args={[0.1, 0.05, 0.01]} />
          <meshBasicMaterial color="#000000" />
        </mesh>

        {/* Small leaf on head */}
        <mesh castShadow position={[0, 1.6, 0]} rotation={[0.2, 0, 0]} scale={[0.7, 0.7, 0.7]}>
          <coneGeometry args={[0.3, 0.6, 5]} />
          <meshStandardMaterial color="#a8cf8e" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>

        {/* Korok Arms - raised to hold the parachute leaf */}
        <mesh castShadow position={[0.3, 0.8, 0]} rotation={[0, 0, Math.PI * 0.5]}>
          <cylinderGeometry args={[0.07, 0.05, 0.5, 6]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[-0.3, 0.8, 0]} rotation={[0, 0, -Math.PI * 0.5]}>
          <cylinderGeometry args={[0.07, 0.05, 0.5, 6]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
        </mesh>

        {/* Korok Legs - tiny stumpy legs */}
        <mesh castShadow position={[0.2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.1, 0.3, 6]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[-0.2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.1, 0.3, 6]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
        </mesh>
        
        {/* Parachute Leaf - large leaf held above head */}
        <group ref={parachuteRef} position={[0, 2.2, 0]}>
          {/* Main leaf - concave shape */}
          <mesh castShadow position={[0, 0, 0]}>
            <sphereGeometry args={[0.8, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial 
              color={
                isJumpingRef.current 
                  ? (isFallingRef.current 
                      // Brighter color when falling
                      ? "#e5ffc0" 
                      : "#c4f0a8") 
                  : "#a8cf8e"
              } 
              emissive={isJumpingRef.current ? "#a0ff80" : "#000000"}
              emissiveIntensity={isJumpingRef.current ? 0.3 : 0}
              roughness={0.8} 
              side={THREE.DoubleSide} 
            />
          </mesh>
          
          {/* Leaf underside details - veins */}
          <mesh castShadow position={[0, -0.05, 0]}>
            <sphereGeometry args={[0.75, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.4]} />
            <meshStandardMaterial color="#b6dcac" roughness={0.8} transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
          
          {/* Leaf stem */}
          <mesh castShadow position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.4, 6]} />
            <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
          </mesh>
          
          {/* Jump effect particles - different for rising vs falling */}
          {isJumpingRef.current && (
            <>
              {isFallingRef.current ? (
                // Falling particles - wider spread, more floating look
                [...Array(12)].map((_, i) => (
                  <mesh key={i} castShadow position={[
                    Math.sin(i * Math.PI / 6) * 1.2,
                    Math.cos(i * Math.PI / 6) * 0.4 - 0.3,
                    Math.cos(i * Math.PI / 6) * 1.2
                  ]}>
                    <sphereGeometry args={[0.05, 8, 8]} />
                    <meshStandardMaterial color="#e5ffcf" emissive="#c0ffa0" emissiveIntensity={0.6} />
                  </mesh>
                ))
              ) : (
                // Rising particles - tighter formation, more energetic
                [...Array(8)].map((_, i) => (
                  <mesh key={i} castShadow position={[
                    Math.sin(i * Math.PI / 4) * 1.0,
                    Math.cos(i * Math.PI / 4) * 0.3 - 0.2,
                    Math.cos(i * Math.PI / 4) * 1.0
                  ]}>
                    <sphereGeometry args={[0.06, 8, 8]} />
                    <meshStandardMaterial color="#d8f0c8" emissive="#a8ff8e" emissiveIntensity={0.5} />
                  </mesh>
                ))
              )}
              
              {/* Parachute energy particles - shows when actively jumping/floating */}
              {isJumpingRef.current && (
                <group position={[0, 0.8, 0]}>
                  {[...Array(12)].map((_, i) => (
                    <mesh key={i} position={[
                      // Arrange in a full circle around the leaf
                      Math.sin(i * Math.PI / 6) * 0.7,
                      Math.cos(i * Math.PI / 6) * 0.2 + 0.4,
                      Math.cos(i * Math.PI / 6) * 0.7
                    ]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshStandardMaterial 
                        color="#ffffff" 
                        emissive={isFallingRef.current ? "#ffff80" : "#80ff80"} 
                        emissiveIntensity={0.8} 
                        transparent
                        opacity={0.8}
                      />
                    </mesh>
                  ))}
                </group>
              )}
            </>
          )}
        </group>

        {/* Korok Name Tag */}
        <sprite position={[0, 3.2, 0]} scale={[3, 0.8, 1]}>
          <spriteMaterial>
            <canvasTexture
              attach="map"
              args={[
                (() => {
                  const canvas = document.createElement("canvas")
                  canvas.width = 256
                  canvas.height = 64
                  const context = canvas.getContext("2d")
                  if (context) {
                    context.fillStyle = "rgba(0, 0, 0, 0.5)"
                    context.fillRect(0, 0, canvas.width, canvas.height)
                    context.font = "bold 32px Arial"
                    context.textAlign = "center"
                    context.fillStyle = "#f5e8cb"
                    context.fillText(playerName, canvas.width / 2, canvas.height / 2 + 12)
                  }
                  return canvas
                })(),
              ]}
            />
          </spriteMaterial>
        </sprite>
      </group>
    </group>
  )
}

// Ground component with forest floor texture - much lighter shade
const Ground = ({ scale = 1 }: { scale?: number }) => {
  const forestTexture = useTexture("/placeholder.svg")

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.5, 0]} scale={scale}>
      <planeGeometry args={[120, 120, 64, 64]} />
      <meshStandardMaterial map={forestTexture} color="#a8cf8e" roughness={0.8} metalness={0.05} />
    </mesh>
  )
}

// Wooden Platform component
const WoodenPlatform = ({ 
  position = [0, 0, 0], 
  rotation = 0,
  size = [10, 1, 7]
}: { 
  position: [number, number, number]; 
  rotation?: number;
  size?: [number, number, number];
}) => {
  const woodTexture = useTexture("/placeholder.svg");
  
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Main platform */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial map={woodTexture} color="#8B4513" roughness={0.9} />
      </mesh>
      
      {/* Support beam underneath */}
      <mesh castShadow receiveShadow position={[-size[0]/3, -size[1] - 1, 0]}>
        <boxGeometry args={[size[0]/3, 2, size[2]/2]} />
        <meshStandardMaterial map={woodTexture} color="#6B4226" roughness={0.9} />
      </mesh>
      
      {/* Platform edge details - wooden railing posts */}
      {[...Array(6)].map((_, i) => (
        <mesh 
          key={`rail-${i}`} 
          castShadow 
          position={[
            (i < 3) ? (size[0]/2 - 0.5) : (-size[0]/2 + 0.5),
            size[1]/2 + 1, 
            ((i % 3) - 1) * (size[2]/2 - 0.5)
          ]}
        >
          <boxGeometry args={[0.5, 2, 0.5]} />
          <meshStandardMaterial color="#8B4513" roughness={0.9} />
        </mesh>
      ))}
      
      {/* Horizontal railings connecting posts */}
      <mesh castShadow position={[size[0]/2 - 0.5, size[1]/2 + 1.5, 0]}>
        <boxGeometry args={[0.25, 0.25, size[2] - 1]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      
      <mesh castShadow position={[-size[0]/2 + 0.5, size[1]/2 + 1.5, 0]}>
        <boxGeometry args={[0.25, 0.25, size[2] - 1]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      
      {/* Add physics collision box for the platform */}
      <PhysicalObject 
        position={[0, 0, 0]} 
        size={size} 
        visible={false} 
      />
    </group>
  );
};

// Great Central Tree component
const CentralTree = ({ position = [0, 0, 0], scale = 1 }: { position?: [number, number, number]; scale?: number }) => {
  const barkTexture = useTexture("/placeholder.svg")
  const leavesTexture = useTexture("/placeholder.svg")
  
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Massive trunk - much taller */}
      <mesh castShadow position={[0, 40, 0]}>
        <cylinderGeometry args={[8, 14, 80, 16]} />
        <meshStandardMaterial map={barkTexture} color="#c6a589" roughness={0.9} metalness={0.1} />
      </mesh>
      
      {/* No root logs, tree emerges directly from the ground */}
      
      {/* Middle trunk reinforcement */}
      <mesh castShadow position={[0, 20, 0]}>
        <cylinderGeometry args={[10, 12, 10, 16]} />
        <meshStandardMaterial map={barkTexture} color="#c6a589" roughness={0.9} metalness={0.1} />
      </mesh>
      
      {/* First wooden platform at a height reachable with a single jump */}
      <WoodenPlatform 
        position={[0, 3, 15]} // Position it in front of the tree at a height of 3 units
        rotation={Math.PI} // Facing toward character start position
        size={[12, 1, 8]} // Slightly larger for easier landing
      />
      
      {/* Second wooden platform higher up - requires mastering multiple jumps to reach */}
      <WoodenPlatform 
        position={[-16, 70, 8]} // Position it on the opposite side and higher
        rotation={Math.PI * 0.7} // Different angle
        size={[8, 1, 6]} // Slightly smaller
      />
      
      {/* Add a fairy on the higher platform as a reward */}
      <Fairy position={[-16, 72, 8]} />
      
      {/* Large bottom canopy - much higher */}
      <mesh castShadow position={[0, 60, 0]}>
        {/* Position raised */}
        <sphereGeometry args={[35, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        {/* Larger canopy */}
        <meshStandardMaterial map={leavesTexture} color="#c4e2a9" roughness={0.8} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Upper trunk - raised and longer */}
      <mesh castShadow position={[0, 90, 0]}>
        {/* Position raised */}
        <cylinderGeometry args={[7, 10, 40, 16]} />
        {/* Longer trunk */}
        <meshStandardMaterial map={barkTexture} color="#d4b49e" roughness={0.9} metalness={0.1} />
      </mesh>
      
      {/* Upper canopy - much higher and larger */}
      <mesh castShadow position={[0, 120, 0]}>
        {/* Position raised */}
        <sphereGeometry args={[30, 32, 32]} />
        {/* Larger canopy */}
        <meshStandardMaterial map={leavesTexture} color="#b6dcac" roughness={0.8} metalness={0.1} />
      </mesh>
      
      {/* Additional top canopy - crown of the tree */}
      <mesh castShadow position={[0, 140, 0]}>
        <sphereGeometry args={[15, 24, 24]} />
        <meshStandardMaterial map={leavesTexture} color="#d8f0c8" roughness={0.7} metalness={0.1} />
      </mesh>
      
      {/* Add lower branch structures */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={i}>
          <mesh
            castShadow
            position={[
              Math.sin((i * Math.PI) / 3) * 20,
              50,
              Math.cos((i * Math.PI) / 3) * 20
            ]}
            rotation={[0, (i * Math.PI) / 3, Math.PI / 6]}
          >
            <cylinderGeometry args={[1.5, 2.5, 16, 8]} />
            <meshStandardMaterial map={barkTexture} color="#d4b49e" roughness={0.9} metalness={0.1} />
          </mesh>
          <mesh
            castShadow
            position={[
              Math.sin((i * Math.PI) / 3) * 30,
              55,
              Math.cos((i * Math.PI) / 3) * 30
            ]}
          >
            <sphereGeometry args={[8, 20, 20]} />
            <meshStandardMaterial map={leavesTexture} color="#b6dcac" roughness={0.8} metalness={0.1} />
          </mesh>
        </group>
      ))}
      
      {/* Add middle branch structures */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={`mid-${i}`}>
          <mesh
            castShadow
            position={[
              Math.sin((i * Math.PI) / 3 + 0.3) * 16,
              80,
              Math.cos((i * Math.PI) / 3 + 0.3) * 16
            ]}
            rotation={[0, (i * Math.PI) / 3, Math.PI / 5]}
          >
            <cylinderGeometry args={[1.2, 2, 14, 7]} />
            <meshStandardMaterial map={barkTexture} color="#d4b49e" roughness={0.9} metalness={0.1} />
          </mesh>
          <mesh
            castShadow
            position={[
              Math.sin((i * Math.PI) / 3 + 0.3) * 25,
              85,
              Math.cos((i * Math.PI) / 3 + 0.3) * 25
            ]}
          >
            <sphereGeometry args={[7, 18, 18]} />
            <meshStandardMaterial map={leavesTexture} color="#b6dcac" roughness={0.8} metalness={0.1} />
          </mesh>
        </group>
      ))}
      
      {/* Add upper branch structures */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <group key={`upper-${i}`}>
          <mesh
            castShadow
            position={[
              Math.sin((i * Math.PI) / 3 + 0.6) * 12,
              110,
              Math.cos((i * Math.PI) / 3 + 0.6) * 12
            ]}
            rotation={[0, (i * Math.PI) / 3, Math.PI / 4]}
          >
            <cylinderGeometry args={[1, 1.8, 12, 6]} />
            <meshStandardMaterial map={barkTexture} color="#d4b49e" roughness={0.9} metalness={0.1} />
          </mesh>
          <mesh
            castShadow
            position={[
              Math.sin((i * Math.PI) / 3 + 0.6) * 18,
              115,
              Math.cos((i * Math.PI) / 3 + 0.6) * 18
            ]}
          >
            <sphereGeometry args={[6, 16, 16]} />
            <meshStandardMaterial map={leavesTexture} color="#c4e2a9" roughness={0.8} metalness={0.1} />
          </mesh>
        </group>
      ))}
      
      {/* Physics collision for the massive tree trunk */}
      <PhysicalObject 
        position={[0, 40, 0]} 
        size={[20, 80, 20]} 
        visible={false} 
      />
      
      {/* Physics collision for the middle trunk */}
      <PhysicalObject 
        position={[0, 20, 0]} 
        size={[24, 10, 24]} 
        visible={false} 
      />
      
      {/* Physics collision for the upper trunk */}
      <PhysicalObject 
        position={[0, 90, 0]} 
        size={[16, 40, 16]} 
        visible={false} 
      />
      
      {/* Main trunk base collision - narrower without roots */}
      <PhysicalObject 
        position={[0, 1, 0]} 
        size={[15, 2, 15]} 
        visible={false} 
      />
    </group>
  )
}

// Rock Wall component for the outer boundary - much higher
const RockWall = ({ radius = 20, height = 120, segments = 32 }) => { // Default height increased significantly
  const rockTexture = useTexture("/placeholder.svg")

  return (
    <mesh position={[0, height / 2 - 0.5, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, segments, 1, true]} />
      <meshStandardMaterial map={rockTexture} color="#808080" side={THREE.BackSide} roughness={1} metalness={0} />
    </mesh>
  )
}

// Path component for the sandy paths - lighter color
const Path = ({
  points,
  width = 2,
  color = "#f5e8cb",
}: {
  points: [number, number][]
  width?: number
  color?: string
}) => {
  const pathTexture = useTexture("/placeholder.svg")

  const curve = new THREE.CatmullRomCurve3(
    points.map((point: [number, number]) => new THREE.Vector3(point[0], -0.49, point[1])),
  )

  const tubeGeometry = new THREE.TubeGeometry(curve, 64, width / 2, 8, false)

  return (
    <mesh geometry={tubeGeometry} receiveShadow>
      <meshStandardMaterial map={pathTexture} color={color} roughness={1} metalness={0} />
    </mesh>
  )
}

// Tree House component
const TreeHouse = ({
  position,
  rotation = 0,
  variant = 0,
}: { position: [number, number, number]; rotation?: number; variant?: number }) => {
  const woodTexture = useTexture("/placeholder.svg")
  const roofTexture = useTexture("/placeholder.svg")

  // Different house styles based on variant
  const houseColors = ["#D2B48C", "#C19A6B", "#E6CCB2"]
  const roofColors = ["#8B0000", "#A52A2A", "#800000"]
  const trunkColors = ["#8B4513", "#A0522D", "#6B4226"]

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Tree Trunk */}
      <mesh castShadow position={[0, 2, 0]}>
        <cylinderGeometry args={[1, 1.2, 5]} />
        <meshStandardMaterial map={woodTexture} color={trunkColors[variant % 3]} roughness={0.9} metalness={0} />
      </mesh>

      {/* Tree Roots */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[Math.sin((i * Math.PI) / 3) * 1.5, -0.3, Math.cos((i * Math.PI) / 3) * 1.5]}
          rotation={[Math.PI / 4, 0, 0]}
        >
          <cylinderGeometry args={[0.2, 0.4, 0.8, 6]} />
          <meshStandardMaterial color={trunkColors[variant % 3]} />
        </mesh>
      ))}

      {/* Ladder */}
      <mesh castShadow position={[0, 2, 1.5]} rotation={[Math.PI / 6, 0, 0]}>
        <boxGeometry args={[0.1, 4, 0.1]} />
        <meshStandardMaterial color="#A0522D" />
      </mesh>

      {/* Ladder rungs */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <mesh key={i} castShadow position={[0, 0.5 + i * 0.5, 1.5 - i * 0.15]} rotation={[Math.PI / 6, 0, 0]}>
          <boxGeometry args={[0.5, 0.05, 0.05]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
      ))}

      {/* House Platform */}
      <mesh castShadow position={[0, 4, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 0.5, 8]} />
        <meshStandardMaterial map={woodTexture} color="#A0522D" roughness={0.8} metalness={0} />
      </mesh>

      {/* House */}
      <mesh castShadow position={[0, 5, 0]}>
        <cylinderGeometry args={[2, 2, 2, 8]} />
        <meshStandardMaterial map={woodTexture} color={houseColors[variant % 3]} roughness={0.7} metalness={0} />
      </mesh>

      {/* Roof */}
      <mesh castShadow position={[0, 6.5, 0]}>
        <coneGeometry args={[2.5, 1.5, 8]} />
        <meshStandardMaterial map={roofTexture} color={roofColors[variant % 3]} roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Door */}
      <mesh castShadow position={[0, 4.5, 2.01]}>
        <boxGeometry args={[0.8, 1.2, 0.1]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>

      {/* Windows */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          castShadow
          position={[
            Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 1.99,
            5,
            Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 1.99,
          ]}
          rotation={[0, (i * Math.PI) / 2 + Math.PI / 4, 0]}
        >
          <boxGeometry args={[0.5, 0.5, 0.1]} />
          <meshStandardMaterial color="#87CEEB" />
        </mesh>
      ))}

      {/* Replace the old collision object with a physical object */}
      <PhysicalObject 
        position={[0, 2.5, 0]} 
        size={[3, 5, 3]} 
        visible={false} // Set to true for debugging
      />
    </group>
  )
}

// Water Pond component
const WaterPond = ({ position, size }: { position: [number, number, number]; size: [number, number] }) => {
  // Define a custom type for the mesh with shader material
  type WaterMesh = THREE.Mesh & {
    material: THREE.ShaderMaterial & {
      uniforms: {
        time: { value: number }
        color: { value: THREE.Color }
      }
    }
  }

  const waterRef = useRef<WaterMesh>(null)

  // Animate water
  useFrame(({ clock }) => {
    if (waterRef.current) {
      const time = clock.getElapsedTime()
      waterRef.current.material.uniforms.time.value = time
    }
  })

  // Custom water shader
  const waterShader = {
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color("#4682B4") },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      
      void main() {
        vec2 p = vUv * 6.0 - 3.0;
        float brightness = 0.7 + 0.3 * sin(time * 0.5);
        vec3 finalColor = color * brightness;
        
        // Add ripple effect
        float dist = length(p);
        float ripple = sin(dist * 10.0 - time * 2.0) * 0.1;
        finalColor += ripple;
        
        gl_FragColor = vec4(finalColor, 0.8);
      }
    `,
  }

  return (
    <mesh ref={waterRef} rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <planeGeometry args={[...size, 32, 32]} />
      <shaderMaterial attach="material" args={[waterShader]} transparent={true} />
    </mesh>
  )
}

// Stone Steps component
const StoneSteps = ({
  position,
  rotation = 0,
  steps = 5,
}: { position: [number, number, number]; rotation?: number; steps?: number }) => {
  const stoneTexture = useTexture("/placeholder.svg")

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: steps }).map((_, i) => (
        <mesh key={i} position={[0, -0.45 + i * 0.05, i * 0.5]} receiveShadow castShadow>
          <boxGeometry args={[1.5, 0.1, 0.5]} />
          <meshStandardMaterial map={stoneTexture} color="#a9a9a9" roughness={0.9} metalness={0.1} />
        </mesh>
      ))}
    </group>
  )
}

// Grass Patch component - with lighter color
const GrassPatch = ({ position, size }: { position: [number, number, number]; size: number }) => {
  const grassTexture = useTexture("/placeholder.svg")

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <circleGeometry args={[size, 32]} />
      <meshStandardMaterial map={grassTexture} color="#d5f5bf" roughness={0.8} metalness={0} />
    </mesh>
  )
}

// Fairy component
const Fairy = ({ position, color = "#88ccff" }: { position: [number, number, number], color?: string }) => {
  const fairyRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const initialPosition = useRef(new THREE.Vector3(...position))

  useFrame(({ clock }) => {
    if (fairyRef.current && lightRef.current) {
      const time = clock.getElapsedTime()

      // Fairy movement - hovering in a small area
      fairyRef.current.position.x = initialPosition.current.x + Math.sin(time * 1.5) * 0.5
      fairyRef.current.position.y = initialPosition.current.y + Math.sin(time * 2.0) * 0.3 + 0.2
      fairyRef.current.position.z = initialPosition.current.z + Math.cos(time * 1.8) * 0.5

      // Light intensity pulsing
      lightRef.current.intensity = 1 + Math.sin(time * 4) * 0.3
    }
  })

  return (
    <group ref={fairyRef} position={position}>
      {/* Fairy body */}
      <mesh castShadow>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>

      {/* Fairy wings */}
      <mesh castShadow position={[0, 0, -0.05]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.2, 0.1]} />
        <meshStandardMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, 0, -0.05]} rotation={[0, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.2, 0.1]} />
        <meshStandardMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Fairy light */}
      <pointLight ref={lightRef} distance={3} intensity={1.5} color={color} />
    </group>
  )
}

// Visual guide component - floating arrow pointing to platforms
const JumpGuide = ({ position, targetPosition }: { position: [number, number, number], targetPosition: [number, number, number] }) => {
  const guideRef = useRef<THREE.Group>(null)
  const initialPosition = useRef(new THREE.Vector3(...position))
  
  // Calculate direction to the target for the arrow to point at
  const direction = new THREE.Vector3(
    targetPosition[0] - position[0],
    targetPosition[1] - position[1],
    targetPosition[2] - position[2]
  ).normalize()
  
  // Calculate rotation to make the arrow point at the target
  const rotationY = Math.atan2(direction.x, direction.z)
  const rotationX = Math.atan2(direction.y, Math.sqrt(direction.x * direction.x + direction.z * direction.z))
  
  useFrame(({ clock }) => {
    if (guideRef.current) {
      const time = clock.getElapsedTime()
      
      // Bobbing motion
      guideRef.current.position.y = initialPosition.current.y + Math.sin(time * 1.5) * 0.5
      
      // Slight rotation
      guideRef.current.rotation.z = Math.sin(time * 0.8) * 0.1
    }
  })
  
  return (
    <group ref={guideRef} position={position} rotation={[rotationX, rotationY, 0]}>
      {/* Arrow body */}
      <mesh castShadow>
        <cylinderGeometry args={[0.2, 0.2, 1.5, 8]} />
        <meshStandardMaterial color="#f0f0f0" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      
      {/* Arrow head */}
      <mesh castShadow position={[0, 1.0, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.4, 0.8, 8]} />
        <meshStandardMaterial color="#f0f0f0" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      
      {/* Guide text - shows when player gets close */}
      <sprite position={[0, -1, 0]} scale={[2, 0.7, 1]}>
        <spriteMaterial>
          <canvasTexture
            attach="map"
            args={[
              (() => {
                const canvas = document.createElement("canvas")
                canvas.width = 256
                canvas.height = 64
                const context = canvas.getContext("2d")
                if (context) {
                  context.fillStyle = "rgba(0, 0, 0, 0.5)"
                  context.fillRect(0, 0, canvas.width, canvas.height)
                  context.font = "bold 18px Arial"
                  context.textAlign = "center"
                  context.fillStyle = "#ffffff"
                  context.fillText("Press SPACE to jump!", canvas.width / 2, canvas.height / 2 + 6)
                }
                return canvas
              })(),
            ]}
          />
        </spriteMaterial>
      </sprite>
      
      {/* Small guiding light */}
      <pointLight distance={5} intensity={0.8} color="#ffffff" />
    </group>
  )
}

// Lost Woods entrance
const LostWoodsEntrance = ({
  position,
  rotation = 0,
  scale = 1,
}: { position: [number, number, number]; rotation?: number; scale?: number }) => {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {/* Entrance arch */}
      <mesh castShadow position={[0, 3, 0]}>
        <torusGeometry args={[3, 0.5, 16, 32, Math.PI]} />
        <meshStandardMaterial color="#654321" />
      </mesh>

      {/* Left pillar */}
      <mesh castShadow position={[-3, 1.5, 0]}>
        <cylinderGeometry args={[0.7, 0.9, 3, 8]} />
        <meshStandardMaterial color="#654321" />
      </mesh>

      {/* Right pillar */}
      <mesh castShadow position={[3, 1.5, 0]}>
        <cylinderGeometry args={[0.7, 0.9, 3, 8]} />
        <meshStandardMaterial color="#654321" />
      </mesh>

      {/* Vines */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} castShadow position={[-3 + i * 1.5, 3 + Math.sin(i) * 0.5, 0.1]}>
          <boxGeometry args={[0.1, 1 + Math.sin(i) * 0.5, 0.1]} />
          <meshStandardMaterial color="#228B22" />
        </mesh>
      ))}

      {/* Replace the old collision object with a physical object */}
      <PhysicalObject 
        position={[0, 1.5, 0]} 
        size={[7, 3, 2]} 
        visible={false} // Set to true for debugging
      />
    </group>
  )
}

// Billboard component with price display
const Billboard = ({ position = [0, 5, -15], rotation = 0, width = 10, height = 6 }) => {
  const [priceData, setPriceData] = useState<{
    open: string
    high: string
    low: string
    close: string
    timestamp: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch price data
  useEffect(() => {
    const fetchPriceData = async () => {
      try {
        setLoading(true)
        const response = await fetch("https://api.kraken.com/0/public/OHLC?pair=BTCUSD&interval=5", {
          method: "GET",
          headers: { Accept: "application/json" },
        })

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`)
        }

        const data = await response.json()

        // Extract the candles array
        const candles = data.result.XXBTZUSD
        if (!candles || candles.length === 0) {
          throw new Error("No candle data returned from Kraken.")
        }

        // Get the latest candle
        const latestCandle = candles[candles.length - 1]

        // Format the data
        setPriceData({
          open: Number.parseFloat(latestCandle[1]).toFixed(2),
          high: Number.parseFloat(latestCandle[2]).toFixed(2),
          low: Number.parseFloat(latestCandle[3]).toFixed(2),
          close: Number.parseFloat(latestCandle[4]).toFixed(2),
          timestamp: new Date(latestCandle[0] * 1000).toLocaleTimeString(),
        })

        setError(null)
      } catch (err) {
        console.error("Error fetching price data:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    // Initial fetch
    fetchPriceData()

    // Set up interval to refresh data every 30 seconds
    const intervalId = setInterval(fetchPriceData, 30000)

    return () => clearInterval(intervalId)
  }, [])

  // Create dynamic texture for the billboard
  const canvasTexture = useMemo(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 1024
    canvas.height = 512
    const context = canvas.getContext("2d")

    if (context) {
      // Fill background
      context.fillStyle = "#222222"
      context.fillRect(0, 0, canvas.width, canvas.height)

      // Draw border
      context.strokeStyle = "#444444"
      context.lineWidth = 10
      context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)

      // Set text styles
      context.fillStyle = "#ffffff"
      context.font = "bold 48px Arial"
      context.textAlign = "center"

      // Draw title
      context.fillText("BITCOIN PRICE (BTCUSD)", canvas.width / 2, 80)

      if (loading) {
        context.fillText("Loading price data...", canvas.width / 2, canvas.height / 2)
      } else if (error) {
        context.fillStyle = "#ff0000"
        context.fillText("Error loading data", canvas.width / 2, canvas.height / 2 + 50)
        context.font = "32px Arial"
        context.fillText(error, canvas.width / 2, canvas.height / 2 + 100)
      } else if (priceData) {
        // Draw price data
        context.font = "bold 64px Arial"
        context.fillStyle = "#00ff00"
        context.fillText(`$${priceData.close}`, canvas.width / 2, canvas.height / 2)

        context.font = "36px Arial"
        context.fillStyle = "#ffffff"
        context.fillText(
          `O: $${priceData.open}   H: $${priceData.high}   L: $${priceData.low}`,
          canvas.width / 2,
          canvas.height / 2 + 80,
        )

        context.font = "24px Arial"
        context.fillText(`Last Updated: ${priceData.timestamp}`, canvas.width / 2, canvas.height - 50)
      }
    }

    return new THREE.CanvasTexture(canvas)
  }, [priceData, loading, error])

  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, rotation, 0]}>
      {/* Screen */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[width, height, 0.2]} />
        <meshStandardMaterial map={canvasTexture} emissive="#222222" emissiveIntensity={0.5} />
      </mesh>

      {/* Frame */}
      <mesh castShadow position={[0, 0, -0.1]}>
        <boxGeometry args={[width + 0.5, height + 0.5, 0.3]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>

      {/* Support beams */}
      <mesh castShadow position={[-width / 2 - 0.5, -height / 2 - 2, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 4, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>

      <mesh castShadow position={[width / 2 + 0.5, -height / 2 - 2, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 4, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
    </group>
  )
}

const SariaNPC = ({ position = [0, 0, -25] as [number, number, number], showCollisions = false }) => {
  const npcRef = useRef<THREE.Group>(null);

  // Simple bobbing animation without triggering re-renders
  useFrame(({ clock }) => {
    if (npcRef.current) {
      const time = clock.getElapsedTime();
      const newBobOffset = Math.sin(time * 0.5) * 0.05;
      npcRef.current.position.y = position[1] + newBobOffset;
    }
  });

  return (
    <group ref={npcRef} position={position}>
      {/* Body */}
      <mesh castShadow position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.6, 0.4, 2, 8]} />
        <meshStandardMaterial color="#228B22" />
      </mesh>

      {/* Head */}
      <mesh castShadow position={[0, 2.8, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="#98FB98" />
      </mesh>

      {/* Hair/Leaves */}
      <mesh castShadow position={[0, 3.2, 0]}>
        <coneGeometry args={[0.6, 0.8, 8]} />
        <meshStandardMaterial color="#228B22" />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.2, 2.9, 0.4]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.2, 2.9, 0.4]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* Mouth */}
      <mesh position={[0, 2.7, 0.4]}>
        <boxGeometry args={[0.3, 0.05, 0.1]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* Arms */}
      <mesh castShadow position={[0.7, 1.8, 0]} rotation={[0, 0, -0.3]}>
        <cylinderGeometry args={[0.15, 0.15, 0.8, 8]} />
        <meshStandardMaterial color="#228B22" />
      </mesh>
      <mesh castShadow position={[-0.7, 1.8, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.15, 0.15, 0.8, 8]} />
        <meshStandardMaterial color="#228B22" />
      </mesh>

      {/* Collision box */}
      <PhysicalObject 
        position={[0, 1.5, 0]} 
        size={[2, 3, 2]} 
        visible={showCollisions}
      />
    </group>
  );
};


// Plant Character component (Makar-style)
const PlantCharacter = ({ position = [0, 0, 0] as [number, number, number], rotation = 0, scale = 1, showCollisions = false }) => {
  const characterRef = useRef<THREE.Group>(null);
  const bobOffsetRef = useRef(0);

  // Simple bobbing animation
  useFrame(({ clock }) => {
    if (characterRef.current) {
      const time = clock.getElapsedTime();
      const newBobOffset = Math.sin(time * 0.5 + position[0] * 0.5) * 0.05;
      bobOffsetRef.current = newBobOffset;
      characterRef.current.position.y = position[1] + newBobOffset;
    }
  });

  return (
    <group 
      ref={characterRef} 
      position={[position[0], position[1], position[2]]} 
      rotation={[0, rotation, 0]}
      scale={[scale, scale, scale]}
    >
      {/* Base/Body (light green) */}
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 0.6, 8]} />
        <meshStandardMaterial color="#d8e0a3" />
      </mesh>
      
      {/* Feet/Legs */}
      <mesh castShadow position={[0.3, 0, 0.3]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#d8e0a3" />
      </mesh>
      <mesh castShadow position={[-0.3, 0, 0.3]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#d8e0a3" />
      </mesh>
      <mesh castShadow position={[0.3, 0, -0.3]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#d8e0a3" />
      </mesh>
      <mesh castShadow position={[-0.3, 0, -0.3]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#d8e0a3" />
      </mesh>
      
      {/* Face (darker green) */}
      <mesh castShadow position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.6, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
      
      {/* Leaf top */}
      <mesh castShadow position={[0, 1.2, 0]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.3, 0.8, 4]} />
        <meshStandardMaterial color="#8BC34A" />
      </mesh>
      
      {/* Side leaves */}
      <mesh castShadow position={[0.5, 0.7, 0]} rotation={[0, 0, Math.PI * 0.25]}>
        <coneGeometry args={[0.2, 0.6, 4]} />
        <meshStandardMaterial color="#8BC34A" />
      </mesh>
      <mesh castShadow position={[-0.5, 0.7, 0]} rotation={[0, 0, -Math.PI * 0.25]}>
        <coneGeometry args={[0.2, 0.6, 4]} />
        <meshStandardMaterial color="#8BC34A" />
      </mesh>
      
      {/* Eyes (black) */}
      <mesh position={[0.2, 0.8, 0.4]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.2, 0.8, 0.4]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      
      {/* Mouth (black) */}
      <mesh position={[0, 0.6, 0.5]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.3, 0.1, 0.1]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      
      {/* Improved collision for the plant character */}
      <PhysicalObject 
        position={[0, 0.5, 0]} 
        size={[1.5, 1.8, 1.5]} 
        visible={showCollisions} // Use showCollisions prop
      />
    </group>
  );
};

// Goron-like Character component
const GoronCharacter = ({ position = [0, 0, 0] as [number, number, number], rotation = 0, name = "Goron", showCollisions = false }) => {
  const characterRef = useRef<THREE.Group>(null);
  const breatheOffsetRef = useRef(0);

  // Breathing animation
  useFrame(({ clock }) => {
    if (characterRef.current) {
      const time = clock.getElapsedTime();
      const newBreatheOffset = Math.sin(time * 0.3) * 0.03;
      breatheOffsetRef.current = newBreatheOffset;
      
      // Apply subtle breathing animation to the body
      if (characterRef.current.children[0]) {
        characterRef.current.children[0].scale.set(
          1 + newBreatheOffset, 
          1 + newBreatheOffset, 
          1 + newBreatheOffset
        );
      }
    }
  });

  // Create a canvas texture for the name tag
  const nameTagTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");

    if (context) {
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = "bold 36px Arial";
      context.textAlign = "center";
      context.fillStyle = "#ffffff";
      context.fillText(name, canvas.width / 2, canvas.height / 2 + 12);
    }

    return new THREE.CanvasTexture(canvas);
  }, [name]);

  return (
    <group ref={characterRef} position={position} rotation={[0, rotation, 0]}>
      {/* Body (golden/yellow) */}
      <mesh castShadow position={[0, 1.2, 0]}>
        <sphereGeometry args={[1.2, 24, 24]} />
        <meshStandardMaterial color="#D4AF37" roughness={0.7} metalness={0.3} />
      </mesh>
      
      {/* Head/Face (same color as body) */}
      <mesh castShadow position={[0, 2.6, 0]}>
        <sphereGeometry args={[0.8, 24, 24]} />
        <meshStandardMaterial color="#D4AF37" roughness={0.7} metalness={0.3} />
      </mesh>
      
      {/* Eyes (black with white highlights) */}
      <mesh position={[0.3, 2.7, 0.6]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[-0.3, 2.7, 0.6]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      
      {/* Eye highlights */}
      <mesh position={[0.35, 2.75, 0.7]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[-0.25, 2.75, 0.7]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      
      {/* Mouth (dark line) */}
      <mesh position={[0, 2.4, 0.7]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.1, 0.1]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      
      {/* Arms (thick and muscular) */}
      <mesh castShadow position={[1.3, 1.2, 0]} rotation={[0, 0, -0.3]}>
        <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
        <meshStandardMaterial color="#D4AF37" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh castShadow position={[-1.3, 1.2, 0]} rotation={[0, 0, 0.3]}>
        <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
        <meshStandardMaterial color="#D4AF37" roughness={0.7} metalness={0.3} />
      </mesh>
      
      {/* Hands (large fists) */}
      <mesh castShadow position={[1.8, 0.8, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial color="#C9A227" roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[-1.8, 0.8, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial color="#C9A227" roughness={0.8} metalness={0.2} />
      </mesh>
      
      {/* Legs (short and stout) */}
      <mesh castShadow position={[0.5, 0.4, 0]}>
        <capsuleGeometry args={[0.35, 0.5, 8, 16]} />
        <meshStandardMaterial color="#D4AF37" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh castShadow position={[-0.5, 0.4, 0]}>
        <capsuleGeometry args={[0.35, 0.5, 8, 16]} />
        <meshStandardMaterial color="#D4AF37" roughness={0.7} metalness={0.3} />
      </mesh>
      
      {/* Feet */}
      <mesh castShadow position={[0.5, 0.15, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color="#C9A227" roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[-0.5, 0.15, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color="#C9A227" roughness={0.8} metalness={0.2} />
      </mesh>
      
      {/* Back spikes (star-shaped top) */}
      <mesh castShadow position={[0, 2.6, -0.5]} rotation={[Math.PI * 0.2, 0, 0]}>
        <coneGeometry args={[0.4, 0.8, 5]} />
        <meshStandardMaterial color="#FFD700" roughness={0.6} metalness={0.4} />
      </mesh>
      
      {/* Body spikes/details */}
      <mesh castShadow position={[0.8, 1.5, -0.6]} rotation={[0, Math.PI * 0.25, 0]}>
        <coneGeometry args={[0.3, 0.6, 5]} />
        <meshStandardMaterial color="#FFD700" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[-0.8, 1.5, -0.6]} rotation={[0, -Math.PI * 0.25, 0]}>
        <coneGeometry args={[0.3, 0.6, 5]} />
        <meshStandardMaterial color="#FFD700" roughness={0.6} metalness={0.4} />
      </mesh>
      
      {/* Name tag */}
      <sprite position={[0, 3.8, 0]} scale={[3, 0.7, 1]}>
        <spriteMaterial map={nameTagTexture} />
      </sprite>
      
      {/* Improved collision for the Goron character */}
      <PhysicalObject 
        position={[0, 1.5, 0]} 
        size={[3.5, 3.5, 3.5]} 
        visible={showCollisions} // Use showCollisions prop
      />
    </group>
  );
};

// Rain particle system
const Rain = ({ count = 5000, area = 100, intensity = 1.0, color = '#88ccff' }) => {
  const mesh = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * area;
      positions[i * 3 + 1] = Math.random() * 150; // Rain starts high up
      positions[i * 3 + 2] = (Math.random() - 0.5) * area;
    }
    return positions;
  }, [count, area]);
  
  const speeds = useMemo(() => {
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      speeds[i] = 0.1 + Math.random() * 0.3; // Random speeds
    }
    return speeds;
  }, [count]);
  
  // Custom shader for elongated raindrops with alpha fade
  const rainMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        color: { value: new THREE.Color(color) },
        pointTexture: { value: new THREE.TextureLoader().load('/placeholder.svg') }
      },
      vertexShader: `
        attribute float speed;
        varying float vSpeed;
        void main() {
          vSpeed = speed;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 2.0 * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D pointTexture;
        varying float vSpeed;
        void main() {
          float opacity = 0.3 + vSpeed * 0.5;
          gl_FragColor = vec4(color, opacity) * texture2D(pointTexture, gl_PointCoord);
        }
      `,
    });
  }, [color]);
  
  useFrame(() => {
    if (mesh.current) {
      const positions = mesh.current.geometry.attributes.position.array as Float32Array;
      const speeds = mesh.current.geometry.attributes.speed.array as Float32Array;
      
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] -= speeds[i] * intensity;
        // Reset raindrops that go below the ground
        if (positions[i * 3 + 1] < -1) {
          positions[i * 3 + 1] = 150;
          positions[i * 3] = (Math.random() - 0.5) * area;
          positions[i * 3 + 2] = (Math.random() - 0.5) * area;
        }
      }
      
      mesh.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  
  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-speed"
          count={count}
          array={speeds}
          itemSize={1}
          args={[speeds, 1]}
        />
      </bufferGeometry>
      <primitive attach="material" object={rainMaterial} />
    </points>
  );
};

// Mist component
const Mist = ({ count = 20, color = '#d8f0e0' }) => {
  const group = useRef<THREE.Group>(null);
  const mistParts = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      position: [
        (Math.random() - 0.5) * 100,
        Math.random() * 20 + 1, // Low hanging mist
        (Math.random() - 0.5) * 100
      ] as [number, number, number],
      scale: Math.random() * 20 + 15,
      rotation: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.001 + 0.0005,
    }));
  }, [count]);
  
  useFrame(({ clock }) => {
    if (group.current) {
      const time = clock.getElapsedTime();
      group.current.children.forEach((child, i) => {
        const mistPart = mistParts[i];
        // Gentle floating motion
        child.position.y = mistPart.position[1] + Math.sin(time * 0.2 + i) * 0.5;
        // Slow rotation
        child.rotation.z = mistPart.rotation + time * mistPart.speed;
      });
    }
  });
  
  return (
    <group ref={group}>
      {mistParts.map((props, i) => (
        <mesh key={i} position={props.position} rotation={[Math.PI / 2, 0, props.rotation]}>
          <planeGeometry args={[props.scale, props.scale]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15 + Math.random() * 0.1}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
};

// Main scene component
const RumorWoodsScene = ({ playerName = "Korok" }: { playerName?: string }) => {
  const collisionSystem = useCollisionSystem()
  const mapRadius = 56 // Increased map radius by 40% (40 * 1.4 = 56)
  const [showCollisions, setShowCollisions] = useState(false); // State for toggling collision visibility
  const [collisionDebug, setCollisionDebug] = useState<string | null>(null); // State for collision debug info

  useEffect(() => {
    // Reset the collision system to clear any stale objects
    collisionSystem.reset()
    
    // Set the map radius to match your RockWall radius
    collisionSystem.setMapRadius(mapRadius)

    // Log the collision system state
    console.log('Collision system initialized with map radius:', mapRadius);
    
    // Add key listener for toggling collision visibility (press 'C' to toggle)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        setShowCollisions(prev => !prev);
        console.log('Collision visibility toggled:', !showCollisions);
      }
      
      // Add debug key (press 'D' to log collision system state)
      if (e.key === 'd' || e.key === 'D') {
        const objectCount = collisionSystem.getObjectCount();
        const debug = `Collision objects: ${objectCount}`;
        console.log(debug);
        setCollisionDebug(debug);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [collisionSystem, mapRadius, showCollisions]);

  return (
    <>
      {/* Dimmer lighting for rainy atmosphere */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[20, 150, 20]} intensity={0.8} castShadow color="#aabbcc" /> {/* Blueish tint for rain */}
      
      {/* Tree lighting */}
      <pointLight position={[0, 40, 0]} intensity={0.7} color="#c8e8d4" distance={70} />
      <pointLight position={[0, 90, 0]} intensity={0.6} color="#c8e8d4" distance={70} /> {/* Middle tree light */}
      <pointLight position={[0, 140, 0]} intensity={0.5} color="#c8e8d4" distance={60} /> {/* Top tree light */}
      
      {/* Additional atmospheric lighting */}
      <fog attach="fog" args={['#aabbcc', 10, 150]} /> {/* Add fog for rainy feel */}
      {/* Base terrain - forest floor */}
      <Ground scale={1} />
      
      {/* Great Central Tree */}
      <CentralTree position={[0, 0, 0]} scale={1} />
      
      {/* Decorative elements - forest floor details */}
      <GrassPatch position={[-25, 0, -25]} size={8} />
      <GrassPatch position={[25, 0, 25]} size={7} />
      <GrassPatch position={[-25, 0, 25]} size={6} />
      <GrassPatch position={[25, 0, -25]} size={6.5} />
      
      {/* Small water pond near the tree */}
      <WaterPond position={[20, -0.3, -10]} size={[15, 10]} />
      
      {/* Main path from character to central tree */}
      <Path
        points={[
          [0, -45],
          [0, -30],
          [0, -15],
          [0, 0],
          [0, 15],
        ]}
        width={4}
      />
      
      {/* Branching paths around the central tree */}
      <Path
        points={[
          [-30, -30],
          [-15, -15],
          [0, 0],
          [15, 15],
          [30, 30],
        ]}
        width={3}
      />
      <Path
        points={[
          [-30, 30],
          [-15, 15],
          [0, 0],
          [15, -15],
          [30, -30],
        ]}
        width={3}
      />
      
      {/* Fairies for ambient lighting/atmosphere around the tree - now reaching much higher */}
      <Fairy position={[0, 15, 0]} />
      <Fairy position={[10, 25, 10]} />
      <Fairy position={[-10, 20, -10]} />
      <Fairy position={[15, 30, -5]} />
      <Fairy position={[-15, 35, 5]} />
      <Fairy position={[0, 40, 0]} />
      <Fairy position={[5, 50, 5]} />
      <Fairy position={[-5, 45, -5]} />
      
      {/* Higher fairies around the massive tree */}
      <Fairy position={[0, 70, 0]} />
      <Fairy position={[8, 75, 8]} />
      <Fairy position={[-8, 80, -8]} />
      <Fairy position={[10, 85, -10]} />
      <Fairy position={[-10, 90, 10]} />
      <Fairy position={[0, 95, 0]} />
      
      {/* Top canopy fairies */}
      <Fairy position={[5, 110, 5]} />
      <Fairy position={[-5, 115, -5]} />
      <Fairy position={[0, 120, 0]} />
      <Fairy position={[3, 130, 3]} />
      <Fairy position={[-3, 135, -3]} />
      <Fairy position={[0, 140, 0]} />
      
      {/* Forest floor fairies - path to the tree */}
      <Fairy position={[0, 1, -35]} />
      <Fairy position={[0, 1.5, -25]} />
      <Fairy position={[0, 2, -15]} />
      <Fairy position={[0, 2.5, -5]} />
      
      {/* Perimeter fairies */}
      <Fairy position={[30, 2, 30]} />
      <Fairy position={[-30, 1.5, -30]} />
      <Fairy position={[30, 2, -30]} />
      <Fairy position={[-30, 1.5, 30]} />
      
      {/* Special platform fairies with different colors */}
      <Fairy position={[0, 5, 15]} color="#ffcc00" /> {/* Golden fairy at first platform */}
      <Fairy position={[-16, 72, 8]} color="#ff88ff" /> {/* Pink fairy at higher platform - reward */}
      
      {/* Jump guide arrows pointing to platforms */}
      <JumpGuide 
        position={[0, 2, 0]} 
        targetPosition={[0, 3, 15]} 
      />
      <JumpGuide 
        position={[0, 5, 15]} 
        targetPosition={[-16, 70, 8]} 
      />
      
      {/* Boundary walls - much higher */}
      <RockWall radius={mapRadius} height={120} />
      {/* Character */}
      <CharacterController playerName={playerName} showCollisions={showCollisions} />
      {/* Add visible boundary for debugging - much higher */}
      <MapBoundary radius={mapRadius} height={120} visible={showCollisions} />
      
      {/* Add rain effect */}
      <Rain count={7000} area={110} intensity={1.2} color="#aaddff" />
      
      {/* Add mist effect */}
      <Mist count={30} color="#d8f0e0" />
      
      {/* Additional mist around tree base */}
      <Mist count={15} color="#e8f8f0" />
      
      {/* Example usage of PhysicalObject */}
      <PhysicalObject 
        position={[10, 1, 5]} 
        size={[2, 2, 2]} 
        visible={showCollisions} // Toggle visibility with showCollisions
      />
    </>
  )
}

// Fix the CameraControls component to work properly with R3F
const CameraControls = ({ defaultDistance = 35 }) => {
  const [distance, setDistance] = useState(defaultDistance)
  const orbitControlsRef = useRef<any>(null)

  // Update orbit controls when distance changes
  useEffect(() => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.target.set(0, 0, 0)
      orbitControlsRef.current.minDistance = 5
      orbitControlsRef.current.maxDistance = 50
      orbitControlsRef.current.update()
    }
  }, [orbitControlsRef])

  // Create DOM element for the slider
  useEffect(() => {
    const sliderContainer = document.createElement("div")
    sliderContainer.className =
      "absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 p-2 rounded-lg flex items-center"
    sliderContainer.style.zIndex = "1000"

    const label = document.createElement("span")
    label.className = "text-white mr-2 text-sm"
    label.textContent = "Zoom:"

    const slider = document.createElement("input")
    slider.type = "range"
    slider.min = "10"
    slider.max = "50"
    slider.value = distance.toString()
    slider.className = "w-32"

    slider.addEventListener("input", (e) => {
      const newDistance = Number((e.target as HTMLInputElement).value)
      setDistance(newDistance)

      if (orbitControlsRef.current) {
        orbitControlsRef.current.dollyTo(newDistance, true)
      }
    })

    sliderContainer.appendChild(label)
    sliderContainer.appendChild(slider)
    document.body.appendChild(sliderContainer)

    return () => {
      document.body.removeChild(sliderContainer)
    }
  }, [distance])

  return (
    <OrbitControls
      ref={orbitControlsRef}
      maxPolarAngle={Math.PI / 2}
      minDistance={5}
      maxDistance={50}
      enableDamping
      dampingFactor={0.1}
    />
  )
}

// Main component that wraps the scene in a Canvas
const RumorWoods = () => {
  const [playerName, setPlayerName] = useState("Korok")
  const [showNameModal, setShowNameModal] = useState(true)
  const [gameStarted, setGameStarted] = useState(false)
  
  // Handle name submission
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setShowNameModal(false)
    setGameStarted(true)
  }
  
  // Create instructions panel with inline styles
  useEffect(() => {
    // Create container with inline styles for maximum compatibility
    const instructionsPanel = document.createElement("div");
    
    // Use inline styles instead of classes to avoid any CSS conflicts
    Object.assign(instructionsPanel.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      color: "white",
      padding: "10px",
      borderRadius: "8px",
      maxWidth: "300px",
      zIndex: "10000",
      fontFamily: "Arial, sans-serif",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)"
    });
    
    // Add content with inline styles
    instructionsPanel.innerHTML = `
      <div style="position: relative;">
        <button id="toggle-instructions" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; background-color: #555; border-radius: 50%; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold;">−</button>
        <div id="instructions-content">
          <h3 style="font-size: 18px; margin-bottom: 10px; padding-right: 30px; font-weight: bold;">Controls:</h3>
          <ul style="padding-left: 20px; margin: 0; font-size: 14px; line-height: 1.4;">
            <li>WASD / Arrow Keys: Move Korok</li>
            <li>Mouse Drag: Rotate camera</li>
            <li>Q/E: Rotate camera left/right</li>
            <li>Shift: Run</li>
            <li>Space: Jump/Fly (press repeatedly to float upward)</li>
            <li>C: Toggle collision boxes</li>
            <li>D: Debug collision system</li>
            <li>I: Toggle this help</li>
          </ul>
          <div style="margin-top: 10px; font-size: 12px; color: #aaa;">Press I or click − to collapse</div>
        </div>
        <div id="instructions-collapsed" style="display: none; padding: 5px;">
          <span style="font-size: 14px; font-weight: bold;">Controls (click + to expand)</span>
        </div>
      </div>
    `;
    
    document.body.appendChild(instructionsPanel);
    
    // Add toggle functionality
    const toggleButton = document.getElementById("toggle-instructions");
    const content = document.getElementById("instructions-content");
    const collapsed = document.getElementById("instructions-collapsed");
    
    toggleButton?.addEventListener("click", () => {
      if (content && collapsed) {
        if (content.style.display === "none") {
          // Expand
          content.style.display = "block";
          collapsed.style.display = "none";
          if (toggleButton) toggleButton.textContent = "−";
        } else {
          // Collapse
          content.style.display = "none";
          collapsed.style.display = "block";
          if (toggleButton) toggleButton.textContent = "+";
        }
      }
    });
    
    // Keyboard shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') {
        toggleButton?.click();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      document.body.removeChild(instructionsPanel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      {showNameModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          zIndex: 1000,
          backdropFilter: "blur(8px)",
        }}>
          <div style={{
            backgroundColor: "#a8cf8e",
            padding: "30px",
            borderRadius: "15px",
            boxShadow: "0 5px 25px rgba(0, 0, 0, 0.5)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            maxWidth: "400px",
            border: "3px solid #8a5a3c",
          }}>
            <h2 style={{
              color: "#5d4037",
              marginTop: 0,
              marginBottom: "20px",
              fontFamily: "Arial, sans-serif",
              fontSize: "28px",
              textAlign: "center",
            }}>
              Welcome to Rumor Woods!
            </h2>
            <p style={{
              color: "#5d4037",
              marginBottom: "20px",
              fontFamily: "Arial, sans-serif",
              fontSize: "16px",
              textAlign: "center",
              lineHeight: "1.5",
            }}>
              You&apos;ll be playing as a little Korok forest spirit exploring a magical realm.
              <br />
              Please enter your name:
            </p>
            <form onSubmit={handleNameSubmit} style={{ width: "100%" }}>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  marginBottom: "20px",
                  boxSizing: "border-box",
                  border: "2px solid #8a5a3c",
                  borderRadius: "5px",
                  fontSize: "16px",
                  backgroundColor: "#f5e8cb",
                  color: "#5d4037",
                }}
                autoFocus
                maxLength={20}
              />
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "#8a5a3c",
                  color: "#f5e8cb",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "18px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition: "background-color 0.2s",
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#6d4c33"}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#8a5a3c"}
              >
                Start Adventure
              </button>
            </form>
            <div style={{
              marginTop: "20px",
              fontSize: "14px",
              color: "#5d4037",
              fontStyle: "italic",
              textAlign: "center",
            }}>
              Use WASD to move and Mouse to look around!
            </div>
          </div>
        </div>
      )}
      
      <Canvas
        shadows
        camera={{
          position: [0, 25, -65], // Higher and further back to see more height
          fov: 70, // Wider field of view
          near: 0.1,
          far: 1500, // Increased for visibility of distant elements
        }}
      >
        <Suspense fallback={null}>
          <RumorWoodsScene playerName={playerName} />
          <Sky distance={450000} sunPosition={[0.2, 0.3, 0.8]} rayleigh={3} turbidity={10} /> {/* Overcast/rainy sky */}
          <CameraControls defaultDistance={45} />
        </Suspense>
        <Stats />
      </Canvas>
    </div>
  )
}

export default RumorWoods

