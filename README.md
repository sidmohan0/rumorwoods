# RumorWoods 3D Sandbox

A 3D sandbox inspired by Kokiri Village from *The Legend of Zelda*, built with Next.js and Three.js.

## Features

- Immersive 3D environment with trees, houses, and water features
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

- Interactive elements (e.g., opening doors, talking to NPCs)
- Dynamic weather and time of day
- Advanced animations
- Extended exploration areas
- Sound effects and background music

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by Kokiri Village from *The Legend of Zelda: Ocarina of Time*
- Built with the amazing Next.js and Three.js libraries
