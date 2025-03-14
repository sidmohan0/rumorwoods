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
const CharacterController = ({ speed = 0.25, showCollisions = false }) => {
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
    attack: false,
  })
  const { camera } = useThree()
  const cameraOffsetRef = useRef(new THREE.Vector3(0, 3.5, 7))
  const cameraAngleRef = useRef(Math.PI) // Initial camera angle (behind character)
  const cameraElevationRef = useRef(0) // Camera elevation angle
  const rotationSpeed = 0.03 // Camera rotation speed
  const collisionSystem = useCollisionSystem()
  const [isRunning, setIsRunning] = useState(false)
  const [isAttacking, setIsAttacking] = useState(false)
  const [animationFrame, setAnimationFrame] = useState(0)
  const [attackFrame, setAttackFrame] = useState(0)
  const animationTimer = useRef<number | null>(null)
  const attackTimer = useRef<number | null>(null)
  const characterRadius = 1.0 // Increased from 0.5 to 1.0 for better collision detection
  const [isDragging, setIsDragging] = useState(false)
  const lastMousePosition = useRef({ x: 0, y: 0 })
  const [modelLoaded, setModelLoaded] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [isBlocking, setIsBlocking] = useState(false)
  
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
        const characterPos = new THREE.Vector3(0, 0, -25); // Initial position
        const collisionObj = {
          position: characterPos,
          radius: characterRadius
        };
        
        // Log but don't actually register (to avoid self-collisions)
        console.log('Character collision object:', collisionObj);
      }
    }
  }, [characterRadius, showCollisions]);

  // Animation frames
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

  // Attack animation
  useEffect(() => {
    if (isAttacking) {
      // Start attack animation
      setAttackFrame(0)
      attackTimer.current = window.setInterval(() => {
        setAttackFrame((prev) => {
          if (prev >= 5) {
            // End attack animation after 6 frames
            clearInterval(attackTimer.current!)
            attackTimer.current = null
            setIsAttacking(false)
            return 0
          }
          return prev + 1
        })
      }, 100) // Faster animation for attack
    }

    return () => {
      if (attackTimer.current) {
        clearInterval(attackTimer.current)
      }
    }
  }, [isAttacking])

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
      'E': 'rotateRight',
      ' ': 'attack'
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if this key is mapped to an action
      const action = keyMap[e.key];
      if (action) {
        console.log(`Key down: ${e.key} -> ${action}`);
        
        // Handle attack separately due to the isAttacking state
        if (action === 'attack' && !isAttacking) {
          setKeys(prev => ({ ...prev, [action]: true }));
          setIsAttacking(true);
        } else if (action !== 'attack') {
          setKeys(prev => ({ ...prev, [action]: true }));
        }
      }
      
      // Handle other keys
      if (e.key === "Shift") setIsRunning(true);
      if (e.key === "Enter") setIsBlocking(true);
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
      if (e.key === "Enter") setIsBlocking(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isAttacking, keys]);

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

    // Calculate movement direction
    let moveX = 0
    let moveZ = 0
    const currentSpeed = isRunning ? speed * 1.8 : speed

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

    // Apply movement if keys are pressed and not attacking
    if ((moveX !== 0 || moveZ !== 0) && !isAttacking) {
      // Calculate target position
      const targetPosition = new THREE.Vector3(
        character.position.x + moveX,
        character.position.y,
        character.position.z + moveZ,
      );

      // Check if there would be a collision at the target position
      const wouldCollide = collisionSystem.checkCollision(targetPosition, characterRadius);
      
      if (wouldCollide) {
        // Use ref instead of state to avoid re-renders
        lastCollisionRef.current = `Collision at [${targetPosition.x.toFixed(2)}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(2)}]`;
        collisionCountRef.current += 1;
        console.log('Collision detected at target position:', targetPosition);
      }

      // Use the collision system to get a valid position
      const validPosition = collisionSystem.getValidPosition(
        character.position,
        targetPosition,
        characterRadius
      );

      // Check if we actually moved
      const didMove = !validPosition.equals(character.position);
      if (!didMove && wouldCollide) {
        console.log('Movement blocked by collision');
      }

      // Calculate movement direction for rotation
      const movementDirection = new THREE.Vector3(moveX, 0, moveZ).normalize();
      
      // Only rotate if there's actual movement
      if (movementDirection.length() > 0) {
        // Calculate the angle based on movement direction
        const targetRotation = Math.atan2(movementDirection.x, movementDirection.z);
        
        // Apply rotation to the character
        character.rotation.y = targetRotation;
      }

      // Update position with the valid position
      character.position.copy(validPosition);

      // Add a slight swaying motion when moving
      if (modelRef.current) {
        modelRef.current.rotation.z = Math.sin(time * 5) * 0.05;
      }
    } else {
      if (!isAttacking) {
        setIsRunning(false);
        // Reset the swaying when not moving
        if (modelRef.current) {
          modelRef.current.rotation.z = 0;
        }
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
    const horizontalDistance = 7 * Math.cos(cameraElevationRef.current)
    cameraOffsetRef.current.set(
      Math.sin(cameraAngleRef.current) * horizontalDistance,
      2.5 + 4 * Math.sin(cameraElevationRef.current),
      Math.cos(cameraAngleRef.current) * horizontalDistance,
    )

    // Always update camera position to follow character
    camera.position.x = character.position.x + cameraOffsetRef.current.x
    camera.position.y = character.position.y + cameraOffsetRef.current.y + 1
    camera.position.z = character.position.z + cameraOffsetRef.current.z
    camera.lookAt(character.position.x, character.position.y + 1, character.position.z)

    // Update sword animation if attacking
    if (isAttacking && modelRef.current) {
      // You would animate the sword here if the model has a sword
      // This depends on the structure of your GLB model
    }
  })

  // Calculate sword rotation based on attack animation
  const swordRotation = useMemo(() => {
    if (!isAttacking) return [0, 0, 0]

    // Sword slashing animation
    const progress = attackFrame / 5
    const swingAngle = Math.sin(progress * Math.PI) * Math.PI * 0.75

    return [swingAngle, 0, 0]
  }, [isAttacking, attackFrame])

  return (
    <group ref={characterRef} position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
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
        {/* Body */}
        <mesh castShadow position={[0, 1, 0]}>
          <boxGeometry args={[0.8, 1.5, 0.5]} />
          <meshStandardMaterial color="#4CAF50" />
        </mesh>

        {/* Head */}
        <mesh castShadow position={[0, 2.1, 0]}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial color="#ffdbac" />
        </mesh>

        {/* Hat */}
        <mesh castShadow position={[0, 2.5, 0]}>
          <coneGeometry args={[0.5, 0.8, 16]} />
          <meshStandardMaterial color="#4CAF50" />
        </mesh>

        {/* Arms */}
        <mesh castShadow position={[0.6, 1, 0]}>
          <boxGeometry args={[0.3, 1.2, 0.3]} />
          <meshStandardMaterial color="#4CAF50" />
        </mesh>
        <mesh castShadow position={[-0.6, 1, 0]}>
          <boxGeometry args={[0.3, 1.2, 0.3]} />
          <meshStandardMaterial color="#4CAF50" />
        </mesh>

        {/* Legs */}
        <mesh castShadow position={[0.25, -0.2, 0]}>
          <boxGeometry args={[0.3, 1, 0.3]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
        <mesh castShadow position={[-0.25, -0.2, 0]}>
          <boxGeometry args={[0.3, 1, 0.3]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>

        {/* Sword (always visible but animated when attacking) */}
        <mesh
          castShadow
          position={[0.8, 1.2, 0.3]}
          rotation={isAttacking ? [swordRotation[0], swordRotation[1], swordRotation[2]] : [0, 0, 0]}
        >
          <boxGeometry args={[0.1, 1, 0.1]} />
          <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Sword handle */}
        <mesh
          castShadow
          position={[0.8, 0.7, 0.3]}
          rotation={isAttacking ? [swordRotation[0], swordRotation[1], swordRotation[2]] : [0, 0, 0]}
        >
          <boxGeometry args={[0.15, 0.3, 0.15]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>

        {/* Shield (with mirror-like material) */}
        <mesh castShadow position={[-0.8, 1.2, isBlocking ? 0.5 : 0.3]} rotation={[0, isBlocking ? Math.PI / 6 : 0, 0]}>
          <boxGeometry args={[0.1, 0.8, 0.6]} />
          <meshStandardMaterial color="#4169E1" metalness={0.9} roughness={0.1} envMapIntensity={1} />
        </mesh>

        {/* Shield border */}
        <mesh
          castShadow
          position={[-0.8, 1.2, isBlocking ? 0.5 : 0.3]}
          rotation={[0, isBlocking ? Math.PI / 6 : 0, 0]}
          scale={[1.1, 1.1, 1.05]}
        >
          <boxGeometry args={[0.1, 0.8, 0.6]} />
          <meshStandardMaterial color="#FFD700" />
        </mesh>

        {/* Shield mirror surface */}
        <mesh
          castShadow
          position={[-0.8, 1.2, isBlocking ? 0.55 : 0.35]}
          rotation={[0, isBlocking ? Math.PI / 6 : 0, 0]}
        >
          <planeGeometry args={[0.7, 0.7]} />
          <meshStandardMaterial color="#C0C0C0" metalness={1} roughness={0} envMapIntensity={1.5} />
        </mesh>

        {/* Name Tag */}
        <sprite position={[0, 3, 0]} scale={[4, 1, 1]}>
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
                    context.font = "bold 36px Arial"
                    context.textAlign = "center"
                    context.fillStyle = "#ffffff"
                    context.fillText("Player1", canvas.width / 2, canvas.height / 2 + 12)
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

// Ground component with texture
const Ground = ({ scale = 1 }: { scale?: number }) => {
  const grassTexture = useTexture("/placeholder.svg")

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.5, 0]} scale={scale}>
      <planeGeometry args={[50, 50, 32, 32]} />
      <meshStandardMaterial map={grassTexture} color="#2e8b57" roughness={0.8} metalness={0.1} />
    </mesh>
  )
}

// Rock Wall component for the outer boundary
const RockWall = ({ radius = 20, height = 4, segments = 32 }) => {
  const rockTexture = useTexture("/placeholder.svg")

  return (
    <mesh position={[0, height / 2 - 0.5, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, segments, 1, true]} />
      <meshStandardMaterial map={rockTexture} color="#808080" side={THREE.BackSide} roughness={1} metalness={0} />
    </mesh>
  )
}

// Path component for the sandy paths
const Path = ({
  points,
  width = 2,
  color = "#d2b48c",
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

// Grass Patch component
const GrassPatch = ({ position, size }: { position: [number, number, number]; size: number }) => {
  const grassTexture = useTexture("/placeholder.svg")

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <circleGeometry args={[size, 32]} />
      <meshStandardMaterial map={grassTexture} color="#7cfc00" roughness={0.8} metalness={0} />
    </mesh>
  )
}

// Fairy component
const Fairy = ({ position }: { position: [number, number, number] }) => {
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
        <meshStandardMaterial color="#aaddff" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, 0, -0.05]} rotation={[0, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.2, 0.1]} />
        <meshStandardMaterial color="#aaddff" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Fairy light */}
      <pointLight ref={lightRef} distance={3} intensity={1.5} color="#88ccff" />
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

// Main scene component
const RumorWoodsScene = () => {
  const collisionSystem = useCollisionSystem()
  const mapRadius = 40 // Doubled map radius
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
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      {/* Base terrain */}
      <Ground scale={2} /> {/* Scale up the ground */}
      {/* Water features */}
      <WaterPond position={[10, -0.3, 0]} size={[30, 20]} />
      {/* Tree houses - repositioned to not block the billboard */}
      <TreeHouse position={[-20, 0, -10]} variant={0} />
      <TreeHouse position={[20, 0, -10]} variant={1} />
      <TreeHouse position={[20, 0, 20]} variant={2} />
      <TreeHouse position={[-20, 0, 20]} variant={1} />
      <TreeHouse position={[-15, 0, -25]} variant={2} />
      <TreeHouse position={[15, 0, -25]} variant={0} />
      {/* Giant Billboard - centered and prominent */}
      <Billboard position={[0, 8, -30]} rotation={0} width={16} height={10} />
      {/* Saria NPC standing below the billboard */}
      <SariaNPC position={[0, 0, -25]} showCollisions={showCollisions} />
      {/* Charunia (Goron-like character) standing under the billboard */}
      <GoronCharacter position={[5, 0, -25]} rotation={-Math.PI * 0.25} name="Charunia" showCollisions={showCollisions} />
      {/* Paths - adjusted to avoid blocking billboard */}
      <Path
        points={[
          [-20, -10],
          [0, 0],
          [20, 20],
          [0, 30],
        ]}
      />
      {/* Decorative elements - spread out */}
      <GrassPatch position={[-10, 0, 0]} size={5} />
      <GrassPatch position={[10, 0, 10]} size={4} />
      <GrassPatch position={[-10, 0, -10]} size={4.5} />
      {/* Fairies for ambient lighting/atmosphere */}
      <Fairy position={[10, 1, 10]} />
      <Fairy position={[-10, 1.5, -10]} />
      <Fairy position={[20, 2, -16]} />
      <Fairy position={[-16, 1, 16]} />
      <Fairy position={[0, 2, 0]} />
      {/* Lost Woods entrance - moved to the side */}
      <LostWoodsEntrance position={[-25, 0, -25]} rotation={Math.PI * 0.75} scale={1.5} />
      {/* Boundary walls */}
      <RockWall radius={mapRadius} height={6} />
      {/* Character */}
      <CharacterController showCollisions={showCollisions} />
      {/* Add visible boundary for debugging */}
      <MapBoundary radius={mapRadius} visible={showCollisions} />
      {/* Example usage of PhysicalObject */}
      <PhysicalObject 
        position={[10, 1, 5]} 
        size={[2, 2, 2]} 
        visible={showCollisions} // Toggle visibility with showCollisions
      />
      
      {/* Add Plant Characters (Makar-style) */}
      <PlantCharacter position={[5, 0, -20]} rotation={Math.PI * 0.25} scale={0.8} showCollisions={showCollisions} />
      <PlantCharacter position={[-5, 0, -20]} rotation={-Math.PI * 0.25} scale={0.9} showCollisions={showCollisions} />
      <PlantCharacter position={[8, 0, -18]} rotation={Math.PI * 0.5} scale={0.7} showCollisions={showCollisions} />
      <PlantCharacter position={[-8, 0, -18]} rotation={-Math.PI * 0.5} scale={1.0} showCollisions={showCollisions} />
      <PlantCharacter position={[0, 0, -15]} rotation={0} scale={0.85} showCollisions={showCollisions} />
      
      {/* Add more plant characters around the map */}
      <PlantCharacter position={[15, 0, 15]} rotation={Math.PI * 0.75} scale={0.9} showCollisions={showCollisions} />
      <PlantCharacter position={[-15, 0, 15]} rotation={-Math.PI * 0.75} scale={0.8} showCollisions={showCollisions} />
      <PlantCharacter position={[15, 0, -5]} rotation={Math.PI * 0.3} scale={0.75} showCollisions={showCollisions} />
      <PlantCharacter position={[-15, 0, -5]} rotation={-Math.PI * 0.3} scale={0.95} showCollisions={showCollisions} />
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
  // Create instructions panel with inline styles
  useEffect(() => {
    // Create container with inline styles for maximum compatibility
    const instructionsPanel = document.createElement("div");
    
    // Use inline styles instead of classes to avoid any CSS conflicts
    Object.assign(instructionsPanel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '8px',
      maxWidth: '300px',
      zIndex: '10000',
      fontFamily: 'Arial, sans-serif',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
    });
    
    // Add content with inline styles
    instructionsPanel.innerHTML = `
      <div style="position: relative;">
        <button id="toggle-instructions" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; background-color: #555; border-radius: 50%; border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold;">−</button>
        <div id="instructions-content">
          <h3 style="font-size: 18px; margin-bottom: 10px; padding-right: 30px; font-weight: bold;">Controls:</h3>
          <ul style="padding-left: 20px; margin: 0; font-size: 14px; line-height: 1.4;">
            <li>WASD / Arrow Keys: Move character</li>
            <li>Mouse Drag: Rotate camera</li>
            <li>Q/E: Rotate camera left/right</li>
            <li>Space: Attack</li>
            <li>Shift: Run</li>
            <li>Enter: Block with shield</li>
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
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.body.removeChild(instructionsPanel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        shadows
        camera={{
          position: [0, 25, 35],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
      >
        <Suspense fallback={null}>
          <RumorWoodsScene />
          <Sky distance={450000} sunPosition={[1, 0.5, 0]} />
          <CameraControls defaultDistance={35} />
        </Suspense>
        <Stats />
      </Canvas>
    </div>
  )
}

export default RumorWoods

