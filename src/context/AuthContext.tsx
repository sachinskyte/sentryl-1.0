import React, { createContext, useContext, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Profile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  email: string | null;
  avatar_url: string | null;
  role?: string;
};

type LocalUser = {
  id: string;
  email: string;
  app_metadata: { provider: string };
  user_metadata: { full_name: string };
  aud: string;
  created_at: string;
};

type AuthContextType = {
  user: LocalUser | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: { user: LocalUser | null; session: { user: LocalUser } | null }; error: null | Error }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: { user: LocalUser | null; session: null }; error: null | Error }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
};

// ─── Storage Helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'sentryl_auth';
const USERS_KEY = 'sentryl_users';

function getStoredUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getStoredUsers(): Array<{ user: LocalUser; profile: Profile; password: string }> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getProfileByUserId(userId: string): Profile | null {
  const users = getStoredUsers();
  const found = users.find(u => u.user.id === userId);
  return found ? found.profile : null;
}

// ─── Built-in accounts ────────────────────────────────────────────────────────

const ADMIN_USER: LocalUser = {
  id: 'admin-id',
  email: 'admin@sentryl.com',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Admin User' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

const ADMIN_PROFILE: Profile = {
  id: 'admin-id',
  full_name: 'Admin User',
  bio: 'System administrator',
  email: 'admin@sentryl.com',
  avatar_url: 'avatar-admin',
  role: 'admin',
};

const DEMO_USER: LocalUser = {
  id: 'demo-id',
  email: 'demo@example.com',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Demo User' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

const DEMO_PROFILE: Profile = {
  id: 'demo-id',
  full_name: 'Demo User',
  bio: 'This is a demo account',
  email: 'demo@example.com',
  avatar_url: 'avatar-5',
  role: 'user',
};

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) {
      // Always use the canonical ADMIN_USER/DEMO_USER objects (handles stale cache)
      if (storedUser.id === 'admin-id') {
        setUser(ADMIN_USER);
        setProfile(ADMIN_PROFILE);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ADMIN_USER));
      } else if (storedUser.id === 'demo-id') {
        setUser(DEMO_USER);
        setProfile(DEMO_PROFILE);
      } else {
        setUser(storedUser);
        const p = getProfileByUserId(storedUser.id);
        setProfile(p);
      }
    }
    setIsLoading(false);
  }, []);

  // ── signIn ────────────────────────────────────────────────────────────────

  const signIn = async (email: string, password: string) => {
    // Admin login
    if (
      (email === 'admin@sentryl.com' || email === 'sentryl@example.com') &&
      password === 'admin123'
    ) {
      setUser(ADMIN_USER);
      setProfile(ADMIN_PROFILE);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ADMIN_USER));
      toast({ title: 'Admin Access Granted', description: 'Welcome to the admin dashboard' });
      return { data: { user: ADMIN_USER, session: { user: ADMIN_USER } }, error: null };
    }

    // Demo shortcut
    if (email === 'demo' && password === 'demo123') {
      setUser(DEMO_USER);
      setProfile(DEMO_PROFILE);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_USER));
      toast({ title: 'Demo Mode', description: 'You are now using the demo account' });
      return { data: { user: DEMO_USER, session: { user: DEMO_USER } }, error: null };
    }

    // Regular registered user
    const users = getStoredUsers();
    const found = users.find(u => u.user.email === email && u.password === password);
    if (found) {
      setUser(found.user);
      setProfile(found.profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(found.user));
      toast({ title: 'Welcome back!', description: 'You have successfully signed in' });
      return { data: { user: found.user, session: { user: found.user } }, error: null };
    }

    const err = new Error('Invalid email or password');
    toast({ title: 'Error signing in', description: err.message, variant: 'destructive' });
    return { data: { user: null, session: null }, error: err };
  };

  // ── signUp ────────────────────────────────────────────────────────────────

  const signUp = async (email: string, password: string, fullName: string) => {
    const users = getStoredUsers();
    if (users.some(u => u.user.email === email)) {
      const err = new Error('The email address is already registered');
      toast({ title: 'Error signing up', description: err.message, variant: 'destructive' });
      return { data: { user: null, session: null }, error: err };
    }

    const newUser: LocalUser = {
      id: `user-${Date.now()}`,
      email,
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: fullName },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    };

    const newProfile: Profile = {
      id: newUser.id,
      full_name: fullName,
      bio: null,
      email,
      avatar_url: null,
      role: 'user',
    };

    users.push({ user: newUser, profile: newProfile, password });
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    toast({ title: 'Welcome!', description: 'Account created successfully' });
    return { data: { user: newUser, session: null }, error: null };
  };

  // ── signOut ───────────────────────────────────────────────────────────────

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    localStorage.removeItem(STORAGE_KEY);
    toast({ title: 'Signed out', description: 'You have been signed out successfully' });
  };

  // ── updateProfile ─────────────────────────────────────────────────────────

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error('No user logged in');

    if (user.id === 'admin-id' || user.id === 'demo-id') {
      toast({ title: 'Demo Mode', description: "Profile updates aren't saved in demo mode." });
      return;
    }

    const users = getStoredUsers();
    const idx = users.findIndex(u => u.user.id === user.id);
    if (idx !== -1) {
      users[idx].profile = { ...users[idx].profile, ...updates };
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    setProfile(prev => (prev ? { ...prev, ...updates } : null));
    toast({ title: 'Profile updated', description: 'Your profile has been updated successfully' });
  };

  const value: AuthContextType = { user, profile, isLoading, signIn, signUp, signOut, updateProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
