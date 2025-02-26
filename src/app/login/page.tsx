'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { signInWithGoogle } from '@/lib/firebase/firebaseUtils';
import Image from 'next/image';

function LoginContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      console.log('User authenticated, redirecting...');
      // Get the intended destination or default to /speak
      const from = searchParams?.get('from') || '/speak';
      
      // Add a small delay to ensure Firebase auth state is fully propagated
      setTimeout(() => {
        router.push(from);
        router.refresh();
      }, 500);
    }
  }, [user, loading, router, searchParams]);

  const handleGoogleLogin = async () => {
    if (isSigningIn) return;
    
    try {
      setIsSigningIn(true);
      setError(null);
      console.log('Starting Google sign in...');
      await signInWithGoogle();
      // Note: We don't need to manually redirect here as the useEffect will handle it
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to sign in with Google. Please try again.');
      setIsSigningIn(false);
    }
  };

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-100">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-500">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If user is already logged in, show loading while redirecting
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-100">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-500">Redirecting to app...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">
            Welcome to Voice Clone
          </h1>
          <p className="mt-2 text-gray-600">
            Sign in to create and train your personal voice clone
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isSigningIn}
          className={`w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-md transition-colors ${
            isSigningIn ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-gray-50'
          }`}
        >
          <Image
            src="/google-logo.svg"
            alt="Google Logo"
            width={20}
            height={20}
          />
          <span>{isSigningIn ? 'Signing in...' : 'Continue with Google'}</span>
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-100">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
} 