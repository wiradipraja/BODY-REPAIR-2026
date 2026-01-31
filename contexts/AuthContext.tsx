
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, ADMIN_UID, USERS_COLLECTION } from '../services/supabase';
import { UserProfile, UserPermissions, Settings } from '../types';
import { initialSettingsState } from '../utils/constants';

interface AuthContextType {
  user: any | null;
  userData: UserProfile;
  userPermissions: UserPermissions;
  settings: Settings;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userData, setUserData] = useState<UserProfile>({ uid: '', email: '', displayName: '' });
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({ role: 'Guest', hasFinanceAccess: false });
  const [settings, setSettings] = useState<Settings>(initialSettingsState);
  const [loading, setLoading] = useState(true);

  // Initialize Supabase Auth Listener
  useEffect(() => {
    const unsubscribe = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user;
      setUser(currentUser);
      
      if (currentUser) {
        try {
          // 1. Check if user is Super Admin
          const isSuperAdmin = currentUser.id === ADMIN_UID;
          
          let role = 'Staff'; // Default role
          let supabaseDisplayName = '';
          
          if (isSuperAdmin) {
               role = 'Manager';
               
               // Sync Admin Role to Supabase
               try {
                   const { data: existingUser, error: fetchError } = await supabase
                       .from(USERS_COLLECTION)
                       .select('*')
                       .eq('uid', currentUser.id)
                       .single();
                   
                   if (fetchError || !existingUser || existingUser.role !== 'Manager') {
                       const { error: upsertError } = await supabase
                           .from(USERS_COLLECTION)
                           .upsert({
                               uid: currentUser.id,
                               email: currentUser.email,
                               display_name: currentUser.user_metadata?.name || 'Super Admin',
                               role: 'Manager',
                               created_at: new Date().toISOString()
                           }, { onConflict: 'uid' });
                       
                       if (upsertError) throw upsertError;
                   }
                   
                   if (existingUser) {
                       supabaseDisplayName = existingUser.display_name;
                   }
               } catch (err: any) {
                   console.error("Failed to sync admin role to Supabase.", err);
               }
          } else {
               // 2. Fetch Role from Supabase 'users' table
               try {
                   const { data: userRecord, error: userError } = await supabase
                       .from(USERS_COLLECTION)
                       .select('*')
                       .eq('uid', currentUser.id)
                       .single();
                   
                   // Fallback: Check by Email if UID doesn't exist
                   if (userError && currentUser.email) {
                       const { data: userByEmail } = await supabase
                           .from(USERS_COLLECTION)
                           .select('*')
                           .eq('email', currentUser.email.toLowerCase())
                           .single();
                       
                       if (userByEmail) {
                           role = userByEmail.role || 'Staff';
                           supabaseDisplayName = userByEmail.display_name;
                       }
                   } else if (userRecord) {
                       role = userRecord.role || 'Staff';
                       supabaseDisplayName = userRecord.display_name;
                   }
               } catch (error) {
                   console.error("Error fetching user role:", error);
               }
          }

          // Logic Akses Finance: Manager atau Admin Bengkel
          const hasFinanceAccess = role === 'Manager' || role === 'Admin Bengkel';

          // Set User Data
          setUserData({
              uid: currentUser.id,
              email: currentUser.email,
              displayName: supabaseDisplayName || currentUser.user_metadata?.name || 'User',
              jobdesk: role,
              role: role
          });
          
          setUserPermissions({
              role: role,
              hasFinanceAccess: hasFinanceAccess 
          });
        } catch (error) {
          console.error("Error setting up user context:", error);
          setUserData({ uid: '', email: '', displayName: '' });
          setUserPermissions({ role: 'Guest', hasFinanceAccess: false });
        }
      } else {
        setUserData({ uid: '', email: '', displayName: '' });
        setUserPermissions({ role: 'Guest', hasFinanceAccess: false });
      }
      setLoading(false);
    });

    return () => {
      unsubscribe.data?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password?: string) => {
    if (!password) throw new Error("Password required");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, userData, userPermissions, settings, loading, login, logout }}>
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
