'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Return null on server-side
  if (!mounted) {
    return (
      <nav className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div 
              className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600"
            >
              Voice Clone
            </div>
            <div className="flex space-x-4">
              <div className="px-4 py-2 rounded-lg text-gray-600 transition-colors">
                Speak
              </div>
              <div className="px-4 py-2 rounded-lg text-gray-600 transition-colors">
                Chat
              </div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link 
            href="/"
            className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600"
          >
            Voice Clone
          </Link>
          <div className="flex space-x-4">
            <Link
              href="/speak"
              className={`px-4 py-2 rounded-lg transition-colors ${
                pathname === '/speak'
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              Speak
            </Link>
            <Link
              href="/conversation"
              className={`px-4 py-2 rounded-lg transition-colors ${
                pathname === '/conversation'
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              Chat
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
} 