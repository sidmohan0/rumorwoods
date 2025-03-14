'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Loading component
const LoadingScreen = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <h1 className="text-2xl mb-4">Loading RumorWoods...</h1>
      <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 animate-pulse rounded-full"></div>
      </div>
    </div>
  );
};

// Dynamically import the RumorWoods component with no SSR
// This is necessary because Three.js requires the window object
const RumorWoods = dynamic(
  () => import('@/components/RumorWoods'),
  { 
    ssr: false,
    loading: () => <LoadingScreen />
  }
);

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      {isMounted ? <RumorWoods /> : <LoadingScreen />}
    </main>
  );
}
