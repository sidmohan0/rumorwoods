# Rumor Woods: A Vertical Climbing Adventure

A mystical climbing adventure where players ascend an ancient, colossal tree using magical parachute abilities. Inspired by *The Legend of Zelda* and *Journey*, with a dreamlike, painterly aesthetic.

## Game Overview & Lore

### Core Concept
Rumor Woods is a vertical climbing adventure where players ascend an ancient, colossal tree using mystical parachute abilities. With a dreamlike, painterly aesthetic and characters inspired by The Legend of Zelda, the game follows a meditative journey from the tree's roots to its flowering crown, exploring themes of growth, renewal, and symbiotic relationships.

### Game Sections

#### 1. The Root Basin
In the shallow depression formed by massive, gnarled roots, players awaken with no memory of their arrival. Ancient carvings glow with soft light, and seedling companions respond to the player's first calls. Elder Darunia tends a small forge built into a hollow root, strengthening the player's equipment with "root ember," while the shy historian Maca collects dawn sap and shares fragments of the tree's memories. The Great Deku Sprout provides guidance, and Makar teaches the player their first "call" ability, allowing them to activate dormant tree magic.

#### 2. The Lower Canopy
Emerging from the roots, players discover scattered moss-covered platforms among the lower branches. Here, they find their parachute ability, learning to harness gentle updrafts and collect luminous sap that enhances their powers. Saria teaches parachute basics, while the excitable Hestu trades collected seeds for upgrades. The first major bark carvings appear, revealing glimpses of the tree's ancient history and the cycles of climbers who came before.

#### 3. The Hollow Trunk
A massive opening leads into the tree's interior, where bioluminescent fungi and insects create a surreal, glowing landscape. Players navigate internal chambers by riding flowing sap currents and activating living mechanisms within the tree. The scholarly Medli studies the inner workings, while the grumpy but knowledgeable Ezlo reveals secrets about the heartwood. Deep within, players experience their first vision of the tree's memories, witnessing fragments of past climbers and the tree's long history.

#### 4. The Middle Canopy
Returning to the exterior halfway up the tree, players find themselves amid expansive leaf platforms and stronger winds. Giant seed pods act as natural launchers, while butterfly-like pollinator beings help carry the player higher. The enthusiastic merchant Beedle offers specialized equipment from his branch-suspended shop, and the time-conscious Rito Mailman provides crucial information about changing weather patterns. As players climb, they witness the first rainfall, transforming the environment and revealing new paths.

#### 5. The Withered Section
The tree's vibrant green gives way to a sickly gray-brown area of decay and parasitic growth. Players discover that parts of the tree are afflicted by a mysterious ailment, forcing them to navigate withered branches while avoiding energy-draining parasitic entities. The mischievous Skull Kid appears, sometimes hindering and sometimes helping, while the analytical spirit Fi provides clinical assessments of the tree's condition. Players gain new abilities to heal small sections of the tree, restoring life to platforms that enable further ascent.

#### 6. The Storm Canopy
Near the upper reaches, fierce winds, rain, and lightning create a challenging environment. The player's parachute becomes less effective when wet, requiring strategic shelter-seeking and timing. The eccentric mapmaker Tingle offers storm navigation routes from his weather-monitoring station, while the musical Kass plays songs that temporarily calm the tempest, creating safe passage windows. This section tests all previously learned skills as players struggle against the elements in their final approach to the crown.

#### 7. The Crown/Transcendence
Breaking through the storm layer, players emerge into a breathtaking realm of golden sunlight and flowering branches. Their parachute abilities reach full potential, allowing unprecedented freedom of movement. The spiritual guide Zelda appears in visions, explaining the player's role in the tree's lifecycle, while the dramatic Fairy Queen prepares for the grand flowering ritual. As players reach the ultimate apex, they participate in triggering the tree's magnificent bloom, releasing a burst of light and energy.

#### 8. The Return/Seeds Journey
Rather than ending at the summit, players begin a graceful descent alongside thousands of glowing seeds released from the crown. The collective consciousness of Korok Seeds accompanies them, while the wise Impa explains the cyclical nature of their journey. Players guide seeds to fertile ground below, ensuring new growth. Upon reaching the roots again, they discover subtle changes - new sprouts emerging, previously withered sections renewed - suggesting that while their journey is complete, the larger cycle continues.

### World Lore

#### The Great Tree's Origin
Rumor Woods centers around an immense tree that grew from a seed of the primordial World Tree. It serves as a conduit between realms, with roots reaching into the underworld and branches touching the sky. The tree exists simultaneously as a physical entity and as a living memory vessel, storing experiences of all beings who have interacted with it across centuries.

#### The Climber's Purpose
Players embody a "Seedling" - beings who appear mysteriously during critical moments in the tree's lifecycle. They are drawn to the tree when its flowering cycle is threatened, serving as catalysts for renewal. The Shepherds themselves may be transformed ascended beings from previous cycles, though they arrive with no memory of this past.

#### The Whispering Sap
The luminous sap flowing throughout the tree contains concentrated memories and magic. By collecting and communing with different colored sap varieties, players unlock abilities and glimpse fragments of past climbers' journeys. The sap's whispers guide genuine seekers but remain silent to those with harmful intentions.

#### The Withering and Renewal
The parasitic withering affecting sections of the tree is revealed to be part of a natural, necessary cycle - a pruning that strengthens the whole when properly managed. Without intervention from Seedlings, however, the withering would spread unchecked. The healing abilities players gain represent the tree's own regenerative power, channeled through a symbiotic relationship.

#### The Guardians
NPCs encountered throughout Rumor Woods are manifestations of the tree's guardian spirits, taking familiar forms that resonate with the Seedling's subconscious expectations. Some were once climbers themselves who chose to remain and serve the tree after reaching the crown. They maintain distinct personalities and purposes while collectively ensuring the tree's continued survival.

#### The Wider World
Glimpses through fog and clouds reveal that the great tree stands amid a vast forest of similar but smaller trees, suggesting successful past flowering cycles. Distant silhouettes of other massive trees hint at a network of ancient sentinels, each with their own Shepherds and guardians, maintaining balance across the greater world.

## Features

- Immersive 3D environment with a massive central tree
- Series of jumpable platforms leading up the tree
- WASD keyboard controls for navigation
- Collision detection to prevent moving through objects
- Dynamic lighting and shadows
- Responsive design that works on various screen sizes

## Getting Started

### Prerequisites

- Node.js 18.0 or later

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/rumorwoods.git
cd rumorwoods
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

## Controls

- **W / Up Arrow**: Move forward
- **S / Down Arrow**: Move backward
- **A / Left Arrow**: Move left
- **D / Right Arrow**: Move right
- **Space**: Jump (to reach the platforms)

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [Three.js](https://threejs.org/) - 3D library
- [React Three Fiber](https://github.com/pmndrs/react-three-fiber) - React renderer for Three.js
- [React Three Drei](https://github.com/pmndrs/drei) - Useful helpers for React Three Fiber
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript

## Project Structure

- `src/components/RumorWoods.tsx` - Main 3D scene component
- `src/components/CollisionSystem.tsx` - Collision detection system
- `src/app/page.tsx` - Main page that renders the 3D scene

## Future Enhancements

- Parachute ability for gliding between platforms
- Interactive NPCs based on the game lore
- Dynamic weather and time of day
- Collectible luminous sap
- Healing mechanics for withered tree sections
- Sound effects and ambient music

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by *The Legend of Zelda* series and *Journey*
- Built with Next.js and Three.js