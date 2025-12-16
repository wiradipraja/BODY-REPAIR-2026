import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, ADMIN_UID } from '../services/firebase';
import { UserProfile, UserPermissions, Settings } from '../types';
import { initialSettingsState } from '../utils/constants';

interface AuthContextType {
  user: User | null;
  userData: UserProfile;
  userPermissions: UserPermissions;
  settings: Settings;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile>({ uid: '', email: '', displayName: '' });
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({ role: 'Guest', hasFinanceAccess: false });
  const [settings, setSettings] = useState<Settings>(initialSettingsState);
  const [loading, setLoading] = useState(true);

  // Initialize Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check privileges
        const isTargetAdmin = currentUser.uid === ADMIN_UID;
        const isAnonymous = currentUser.isAnonymous;
        
        // Grant Manager access to the specific Admin UID OR Anonymous users (for Demo purposes)
        const isManager = isTargetAdmin || isAnonymous;

        // Set User Data
        setUserData({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName || (isAnonymous ? 'Tamu (Demo)' : 'User'),
            jobdesk: isManager ? 'Manager' : 'Staff'
        });
        
        setUserPermissions({
            role: isManager ? 'Manager' : 'Guest',
            hasFinanceAccess: isManager
        });
      } else {
        setUserData({ uid: '', email: '', displayName: '' });
        setUserPermissions({ role: 'Guest', hasFinanceAccess: false });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password?: string) => {
    if (!password) throw new Error("Password required");
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginAnonymously = async () => {
    await signInAnonymously(auth);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, userPermissions, settings, loading, login, loginAnonymously, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};