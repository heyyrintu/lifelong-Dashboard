'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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

  useEffect(() => {
    // Check for OAuth callback first
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const secret = urlParams.get('secret');
    
    if (userId && secret) {
      // Handle OAuth callback
      account.createSession(userId, secret)
        .then(() => {
          return account.get();
        })
        .then(async (currentUser) => {
          setUser(currentUser);
          await checkAdminStatus();
          setLoading(false);
          // Clean up URL
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((error) => {
          console.error('OAuth callback error:', error);
          setLoading(false);
        });
    } else {
      checkUser();
    }
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error) {
      setUser(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    try {
      await account.createEmailPasswordSession(email, password);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    }
  }, [checkAdminStatus]);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    try {
      await account.create('unique()', email, password, name);
      await account.createEmailPasswordSession(email, password);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      throw new Error(error.message || 'Registration failed');
    }
  }, [checkAdminStatus]);

  const sendEmailOTP = useCallback(async (email: string) => {
    try {
      const token = await account.createEmailToken('unique()', email);
      return token;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to send email OTP');
    }
  }, []);

  const verifyEmailOTP = useCallback(async (userId: string, secret: string) => {
    try {
      await account.createSession(userId, secret);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      throw new Error(error.message || 'Invalid OTP');
    }
  }, [checkAdminStatus]);

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
      throw new Error(error.message || 'Failed to send phone OTP');
    }
  }, []);

  const verifyPhoneOTP = useCallback(async (userId: string, secret: string) => {
    try {
      await account.createSession(userId, secret);
      const currentUser = await account.get();
      setUser(currentUser);
      await checkAdminStatus();
    } catch (error: any) {
      throw new Error(error.message || 'Invalid OTP');
    }
  }, [checkAdminStatus]);

  const loginWithGoogle = useCallback(async () => {
    try {
      const successUrl = `${window.location.origin}/summary`;
      const failureUrl = `${window.location.origin}/login`;
      
      account.createOAuth2Session(OAuthProvider.Google, successUrl, failureUrl);
    } catch (error: any) {
      throw new Error(error.message || 'Google login failed');
    }
  }, []);

  const loginWithMicrosoft = useCallback(async () => {
    try {
      const successUrl = `${window.location.origin}/summary`;
      const failureUrl = `${window.location.origin}/login`;
      
      account.createOAuth2Session(OAuthProvider.Microsoft, successUrl, failureUrl);
    } catch (error: any) {
      throw new Error(error.message || 'Microsoft login failed');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession('current');
      setUser(null);
      setIsAdmin(false);
    } catch (error: any) {
      throw new Error(error.message || 'Logout failed');
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
  }), [user, loading, isAdmin, login, register, sendEmailOTP, verifyEmailOTP, sendPhoneOTP, verifyPhoneOTP, loginWithGoogle, loginWithMicrosoft, logout]);

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

