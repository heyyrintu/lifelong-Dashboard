'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode, useRef } from 'react';
import { account, teams, ADMIN_TEAM_ID } from './appwrite';
import { Models, OAuthProvider } from 'appwrite';

type User = Models.User<Models.Preferences>;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  sendEmailOTP: (email: string) => Promise<Models.Token>;
  verifyEmailOTP: (userId: string, secret: string) => Promise<void>;
  sendPhoneOTP: (phone: string) => Promise<Models.Token>;
  verifyPhoneOTP: (userId: string, secret: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithMicrosoft: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  checkExistingSession: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function formatAuthError(error: any, fallbackMessage: string): string {
  const message = typeof error?.message === 'string' ? error.message : '';

  // In browsers, CORS/mixed-content/DNS failures frequently surface as a generic TypeError: "Failed to fetch".
  if (
    error instanceof TypeError ||
    /Failed to fetch|NetworkError|Load failed/i.test(message)
  ) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const domainHint = origin
      ? ` Add ${origin} in Appwrite Console → Settings → Domains.`
      : ' Add your site domain in Appwrite Console → Settings → Domains.';
    return `Network error contacting Appwrite.${domainHint}`;
  }

  return message || fallbackMessage;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Ref to track if an auth operation is in progress (double-click protection)
  const authInProgress = useRef(false);

  // Check if user is member of admin team
  const checkAdminStatus = useCallback(async () => {
    try {
      // Get user's memberships in the admin team
      const memberships = await teams.listMemberships(ADMIN_TEAM_ID);
      // If user has any membership in admin team, they are admin
      setIsAdmin(memberships.total > 0);
    } catch (error) {
      // User is not in admin team or team doesn't exist
      setIsAdmin(false);
    }
  }, []);

  /**
   * Helper function to check if a session already exists
   * Returns the user if session exists, null otherwise
   */
  const checkExistingSession = useCallback(async (): Promise<User | null> => {
    try {
      // Try to get the current session
      await account.getSession('current');
      // If successful, get the user
      const currentUser = await account.get();
      return currentUser;
    } catch (error) {
      // No active session
      return null;
    }
  }, []);

  /**
   * Helper function to delete current session if exists
   * Used before creating a new session to prevent conflicts
   */
  const deleteExistingSessionIfNeeded = useCallback(async (): Promise<void> => {
    try {
      await account.getSession('current');
      // Session exists, delete it
      await account.deleteSession('current');
    } catch (error) {
      // No session exists, nothing to delete
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // Check for OAuth callback first
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('userId');
        const secret = urlParams.get('secret');

        if (userId && secret) {
          // Handle OAuth callback - but first check if session already exists
          const existingUser = await checkExistingSession();
          if (existingUser) {
            if (isMounted) {
              setUser(existingUser);
              await checkAdminStatus();
              setLoading(false);
              // Clean up URL
              window.history.replaceState({}, '', window.location.pathname);
            }
            return;
          }

          // No existing session, create one from OAuth callback
          try {
            await account.createSession(userId, secret);
            const currentUser = await account.get();
            if (isMounted) {
              setUser(currentUser);
              await checkAdminStatus();
              // Clean up URL
              window.history.replaceState({}, '', window.location.pathname);
            }
          } catch (error: any) {
            // If session already active error, just get the current user
            if (error.message?.includes('session is active') || error.code === 401) {
              const currentUser = await account.get();
              if (isMounted) {
                setUser(currentUser);
                await checkAdminStatus();
                window.history.replaceState({}, '', window.location.pathname);
              }
            } else {
              console.error('OAuth callback error:', error);
            }
          }
        } else {
          // No OAuth callback, check for existing session
          const existingUser = await checkExistingSession();
          if (existingUser) {
            if (isMounted) {
              setUser(existingUser);
              await checkAdminStatus();
            }
          } else {
            if (isMounted) {
              setUser(null);
              setIsAdmin(false);
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (isMounted) {
          setUser(null);
          setIsAdmin(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    // Double-click protection
    if (authInProgress.current) {
      throw new Error('Login already in progress');
    }

    authInProgress.current = true;

    try {
      // First check if a session already exists
      const existingUser = await checkExistingSession();
      if (existingUser) {
        // Already logged in, just update state
        setUser(existingUser);
        await checkAdminStatus();
        return;
      }

      // No session exists, create new one
      await account.createEmailPasswordSession(email, password);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      // Handle "session already active" error gracefully
      if (error.message?.includes('session is active') || error.message?.includes('session is prohibited')) {
        // Try to get the existing user
        try {
          const currentUser = await account.get();
          setUser(currentUser);
          await checkAdminStatus();
          return;
        } catch (getError) {
          // If we can't get user, try to clear session and retry
          await deleteExistingSessionIfNeeded();
          throw new Error('Session error. Please try again.');
        }
      }
      throw new Error(formatAuthError(error, 'Login failed'));
    } finally {
      authInProgress.current = false;
    }
  }, [checkAdminStatus, checkExistingSession, deleteExistingSessionIfNeeded]);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    // Double-click protection
    if (authInProgress.current) {
      throw new Error('Registration already in progress');
    }

    authInProgress.current = true;

    try {
      // First check if a session already exists
      const existingUser = await checkExistingSession();
      if (existingUser) {
        // Already logged in
        setUser(existingUser);
        await checkAdminStatus();
        return;
      }

      await account.create('unique()', email, password, name);
      await account.createEmailPasswordSession(email, password);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      // Handle "session already active" error gracefully
      if (error.message?.includes('session is active') || error.message?.includes('session is prohibited')) {
        try {
          const currentUser = await account.get();
          setUser(currentUser);
          await checkAdminStatus();
          return;
        } catch (getError) {
          await deleteExistingSessionIfNeeded();
          throw new Error('Session error. Please try again.');
        }
      }
      throw new Error(formatAuthError(error, 'Registration failed'));
    } finally {
      authInProgress.current = false;
    }
  }, [checkAdminStatus, checkExistingSession, deleteExistingSessionIfNeeded]);

  const sendEmailOTP = useCallback(async (email: string) => {
    try {
      const token = await account.createEmailToken('unique()', email);
      return token;
    } catch (error: any) {
      throw new Error(formatAuthError(error, 'Failed to send email OTP'));
    }
  }, []);

  const verifyEmailOTP = useCallback(async (userId: string, secret: string) => {
    // Double-click protection
    if (authInProgress.current) {
      throw new Error('Verification already in progress');
    }

    authInProgress.current = true;

    try {
      // First check if a session already exists
      const existingUser = await checkExistingSession();
      if (existingUser) {
        // Already logged in
        setUser(existingUser);
        await checkAdminStatus();
        return;
      }

      await account.createSession(userId, secret);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      // Handle "session already active" error gracefully
      if (error.message?.includes('session is active') || error.message?.includes('session is prohibited')) {
        try {
          const currentUser = await account.get();
          setUser(currentUser);
          await checkAdminStatus();
          return;
        } catch (getError) {
          await deleteExistingSessionIfNeeded();
          throw new Error('Session error. Please try again.');
        }
      }
      throw new Error(formatAuthError(error, 'Invalid OTP'));
    } finally {
      authInProgress.current = false;
    }
  }, [checkAdminStatus, checkExistingSession, deleteExistingSessionIfNeeded]);

  const sendPhoneOTP = useCallback(async (phone: string) => {
    try {
      // Ensure phone number always has +91 country code
      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+91')) {
        // Remove any existing country code and add +91
        formattedPhone = formattedPhone.replace(/^\+?\d{1,3}/, '');
        formattedPhone = '+91' + formattedPhone.replace(/\D/g, '');
      }

      // Ensure it's exactly +91 followed by 10 digits
      const digits = formattedPhone.substring(3).replace(/\D/g, '');
      if (digits.length !== 10) {
        throw new Error('Phone number must be exactly 10 digits after +91');
      }

      formattedPhone = '+91' + digits;

      const token = await account.createPhoneToken('unique()', formattedPhone);
      return token;
    } catch (error: any) {
      throw new Error(formatAuthError(error, 'Failed to send phone OTP'));
    }
  }, []);

  const verifyPhoneOTP = useCallback(async (userId: string, secret: string) => {
    // Double-click protection
    if (authInProgress.current) {
      throw new Error('Verification already in progress');
    }

    authInProgress.current = true;

    try {
      // First check if a session already exists
      const existingUser = await checkExistingSession();
      if (existingUser) {
        // Already logged in
        setUser(existingUser);
        await checkAdminStatus();
        return;
      }

      await account.createSession(userId, secret);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      // Handle "session already active" error gracefully
      if (error.message?.includes('session is active') || error.message?.includes('session is prohibited')) {
        try {
          const currentUser = await account.get();
          setUser(currentUser);
          await checkAdminStatus();
          return;
        } catch (getError) {
          await deleteExistingSessionIfNeeded();
          throw new Error('Session error. Please try again.');
        }
      }
      throw new Error(formatAuthError(error, 'Invalid OTP'));
    } finally {
      authInProgress.current = false;
    }
  }, [checkAdminStatus, checkExistingSession, deleteExistingSessionIfNeeded]);

  const loginWithGoogle = useCallback(async () => {
    try {
      // Check for existing session first
      const existingUser = await checkExistingSession();
      if (existingUser) {
        // Already logged in, redirect to dashboard
        setUser(existingUser);
        window.location.href = '/summary';
        return;
      }

      const successUrl = `${window.location.origin}/summary`;
      const failureUrl = `${window.location.origin}/login`;

      account.createOAuth2Session(OAuthProvider.Google, successUrl, failureUrl);
    } catch (error: any) {
      throw new Error(formatAuthError(error, 'Google login failed'));
    }
  }, [checkExistingSession]);

  const loginWithMicrosoft = useCallback(async () => {
    try {
      // Check for existing session first
      const existingUser = await checkExistingSession();
      if (existingUser) {
        // Already logged in, redirect to dashboard
        setUser(existingUser);
        window.location.href = '/summary';
        return;
      }

      const successUrl = `${window.location.origin}/summary`;
      const failureUrl = `${window.location.origin}/login`;

      account.createOAuth2Session(OAuthProvider.Microsoft, successUrl, failureUrl);
    } catch (error: any) {
      throw new Error(formatAuthError(error, 'Microsoft login failed'));
    }
  }, [checkExistingSession]);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession('current');
      setUser(null);
      setIsAdmin(false);
    } catch (error: any) {
      // Even if logout fails, clear local state
      setUser(null);
      setIsAdmin(false);
      // Only throw if it's not a "no session" error
      if (!error.message?.includes('missing')) {
        throw new Error(formatAuthError(error, 'Logout failed'));
      }
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    user,
    loading,
    isAdmin,
    login,
    register,
    sendEmailOTP,
    verifyEmailOTP,
    sendPhoneOTP,
    verifyPhoneOTP,
    loginWithGoogle,
    loginWithMicrosoft,
    logout,
    isAuthenticated: !!user,
    checkExistingSession,
  }), [user, loading, isAdmin, login, register, sendEmailOTP, verifyEmailOTP, sendPhoneOTP, verifyPhoneOTP, loginWithGoogle, loginWithMicrosoft, logout, checkExistingSession]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

