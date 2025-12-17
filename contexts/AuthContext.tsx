import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, ADMIN_UID, USERS_COLLECTION } from '../services/firebase';
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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 1. Check if user is Super Admin or Anonymous
        const isSuperAdmin = currentUser.uid === ADMIN_UID;
        const isAnonymous = currentUser.isAnonymous;
        
        let role = 'Staff'; // Default role
        
        if (isAnonymous) {
             role = 'Manager'; // Demo user gets full access
        } else if (isSuperAdmin) {
             role = 'Manager';
        } else {
             // 2. Fetch Role from Firestore 'users' collection
             try {
                 const userDocRef = doc(db, USERS_COLLECTION, currentUser.uid);
                 const userDocSnap = await getDoc(userDocRef);
                 
                 if (userDocSnap.exists()) {
                     const data = userDocSnap.data();
                     role = data.role || 'Staff';
                 }
             } catch (error) {
                 console.error("Error fetching user role:", error);
             }
        }

        const isManager = role === 'Manager';

        // Set User Data
        setUserData({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName || (isAnonymous ? 'Tamu (Demo)' : 'User'),
            jobdesk: role,
            role: role
        });
        
        setUserPermissions({
            role: role,
            hasFinanceAccess: isManager // Only Manager has finance access
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