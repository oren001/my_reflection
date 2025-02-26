"use client";

import React, { createContext, useEffect, useState } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from "firebase/auth";
import { User } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { setPersistence, browserLocalPersistence } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    let unsubscribe: (() => void) | null = null;

    const initializeAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        
        // Try to restore session from localStorage
        try {
          const savedUser = localStorage.getItem('authUser');
          if (savedUser) {
            const parsedUser = JSON.parse(savedUser);
            setUser(parsedUser);
          }
        } catch (e) {
          console.error('Error restoring auth session:', e);
        }
        
        unsubscribe = auth.onAuthStateChanged((user) => {
          console.log('Auth state changed:', user?.email || 'No user');
          setUser(user);
          setLoading(false);
          
          if (user) {
            try {
              localStorage.setItem('authUser', JSON.stringify(user));
              document.cookie = `session=${user.uid};path=/;max-age=2592000`; // 30 days
            } catch (e) {
              console.error('Error saving auth session:', e);
            }
          } else {
            try {
              localStorage.removeItem('authUser');
              document.cookie = 'session=;path=/;max-age=0';
            } catch (e) {
              console.error('Error clearing auth session:', e);
            }
          }
        }, (error) => {
          console.error('Auth state change error:', error);
          setLoading(false);
        });
      } catch (error) {
        console.error('Auth initialization error:', error);
        setLoading(false);
      }
    };

    if (mounted) {
      initializeAuth();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [mounted]);

  const signInWithGoogle = async (): Promise<void> => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        try {
          localStorage.setItem('authUser', JSON.stringify(result.user));
        } catch (e) {
          console.error('Error saving user after sign in:', e);
        }
      }
    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      try {
        localStorage.removeItem('authUser');
        document.cookie = 'session=;path=/;max-age=0';
      } catch (e) {
        console.error('Error clearing session on sign out:', e);
      }
    } catch (error) {
      console.error("Error signing out", error);
      throw error;
    }
  };

  // Return a consistent structure for both server and client
  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
