'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    console.log('[Home] Component mounted');
    
    // Listen for our custom navigation events
    const handleNavStateChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('[Home] Navigation state changed:', customEvent.detail);
    };
    
    window.addEventListener('navigationStateChange', handleNavStateChange);
    
    // Listen for popstate events
    const handlePopState = () => {
      console.log('[Home] PopState event detected');
      console.log('[Home] Current path:', window.location.pathname);
    };
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('navigationStateChange', handleNavStateChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleNavigation = (path: string, e: React.MouseEvent) => {
    if (!mounted) return;
    
    console.log('[Home] Button clicked');
    console.log('[Home] Target path:', path);
    
    e.preventDefault();
    e.stopPropagation();
    
    try {
      console.log('[Home] Attempting to update history');
      window.history.pushState({ path }, '', path);
      console.log('[Home] History updated successfully');
      
      console.log('[Home] Dispatching popstate event');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { path } }));
      
      // Dispatch a custom event for debugging
      const navEvent = new CustomEvent('navigationStateChange', { detail: { path } });
      window.dispatchEvent(navEvent);
      console.log('[Home] Navigation events dispatched');
    } catch (error) {
      console.error('[Home] Error during navigation:', error);
    }
  };

  console.log('[Home] Rendering component');

  return (
    <main className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-100">
      <div className="text-center space-y-8">
        <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">
          Voice Clone
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl">
          Experience natural conversations with your AI companion. Choose between hold-to-speak or continuous chat modes.
        </p>
        <div className="flex justify-center space-x-4">
          <a
            href="/speak"
            onClick={(e) => mounted && handleNavigation('/speak', e)}
            className="px-8 py-4 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors duration-300 shadow-lg"
          >
            Hold to Speak
          </a>
          <a
            href="/conversation"
            onClick={(e) => mounted && handleNavigation('/conversation', e)}
            className="px-8 py-4 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition-colors duration-300 shadow-lg"
          >
            Continuous Chat
          </a>
        </div>
      </div>
    </main>
  );
}
