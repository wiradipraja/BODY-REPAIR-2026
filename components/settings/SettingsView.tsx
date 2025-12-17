import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  updateProfile,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider
} from 'firebase/auth';
import { collection, addDoc, updateDoc, doc, deleteDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, SETTINGS_COLLECTION, SUPPLIERS_COLLECTION, USERS_COLLECTION } from '../../services/firebase';
import { Settings, Supplier, UserPermissions } from '../../types';
import * as XLSX from 'xlsx';
import { Save, UserPlus, KeyRound, Upload, Trash2, Edit2, Database, Users, Truck, Plus, Lock, Shield, Ban, Building, CreditCard } from 'lucide-react';

// --- CONFIG FOR SECONDARY AUTH APP (To create user without logging out) ---
// Using the same config as main app
const firebaseConfig = {
  apiKey: "AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ",
  authDomain: "body-repair-system.firebaseapp.com",
  projectId: "body-repair-system",
  storageBucket: "body-repair-system.firebasestorage.app",
  messagingSenderId: "672061097149",
  appId: "1:672061097149:web:2998766b147a4c20a6a3d4"
};

interface SettingsViewProps {
  currentSettings: Settings;
  refreshSettings: () => void;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
}

const SettingsView: React.FC<SettingsViewProps> = ({ currentSettings, refreshSettings, showNotification, userPermissions }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'system' | 'suppliers'>('users');
  const [isLoading, setIsLoading] = useState(false);
  const isManager = userPermissions.role === 'Manager';

  // --- STATE FOR USERS ---
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'Staff' });
  const [resetEmail, setResetEmail] = useState('');
  
  // State for Change Password (Current User)
  const [changePass, setChangePass] = useState({ current: '', new: '', confirm: '' });

  // --- STATE FOR SYSTEM ---
  const [localSettings, setLocalSettings] = useState<Settings>(currentSettings);
  const [newRoleName, setNewRoleName] = useState('');
  
  // --- STATE FOR SUPPLIERS ---
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);

  useEffect(() => {
    setLocalSettings(currentSettings);
    if (activeTab === 'suppliers') fetchSuppliers();
  }, [currentSettings, activeTab]);

  const fetchSuppliers = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, SUPPLIERS_COLLECTION));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
        setSuppliers(data);
    } catch (e) {
        console.error("Fetch suppliers error", e);
    }
  };

  // --- HANDLERS: USER MANAGEMENT ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
    setIsLoading(true);
    try {
        // 1. Init secondary app safely to create user without logging out admin
        let secondaryApp;
        const existingApps = getApps();
        if (existingApps.length > 0 && existingApps.find(app => app.name === "SecondaryApp")) {
            secondaryApp = getApp("SecondaryApp");
        } else {
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        }

        const secondaryAuth = getAuth(secondaryApp);
        
        // 2. Create User in Auth
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
        
        // 3. Update Profile Name
        await updateProfile(userCredential.user, { displayName: newUser.name });

        // 4. Create User Document in Firestore with Role (Using Main DB instance)
        // This requires the current logged-in user (Admin) to have write permissions on 'users' collection
        await setDoc(doc(db, USERS_COLLECTION, userCredential.user.uid), {
            uid: userCredential.user.uid,
            displayName: newUser.name,
            email: newUser.email,
            role: newUser.role,
            createdAt: serverTimestamp()
        });

        // 5. Cleanup (Sign out but keep app instance to avoid re-init errors)
        await secondaryAuth.signOut(); 

        showNotification(`Pengguna ${newUser.name} berhasil dibuat sebagai ${newUser.role}!`, 'success');
        setNewUser({ email: '', password: '', name: '', role: 'Staff' });
    } catch (error: any) {
        console.error("Create User Error:", error);
        if (error.code === 'auth/email-already-in-use') {
            showNotification("Email sudah terdaftar.", 'error');
        } else {
            showNotification(error.message, 'error');
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
    setIsLoading(true);
    try {
        const auth = getAuth(); // Main auth instance
        await sendPasswordResetEmail(auth, resetEmail);
        showNotification(`Email reset password dikirim ke ${resetEmail}`, 'success');
        setResetEmail('');
    } catch (error: any) {
        showNotification(error.message, 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changePass.new !== changePass.confirm) {
        showNotification("Password baru dan konfirmasi tidak cocok.", "error");
        return;
    }
    if (changePass.new.length < 6) {
        showNotification("Password minimal 6 karakter.", "error");
        return;
    }

    setIsLoading(true);
    try {
        const auth = getAuth();
        const user = auth.currentUser;

        if (user && user.email) {
            // 1. Re-authenticate user
            const credential = EmailAuthProvider.credential(user.email, changePass.current);
            await reauthenticateWithCredential(user, credential);

            // 2. Update Password
            await updatePassword(user, changePass.new);
            
            showNotification("Password Anda berhasil diubah.", "success");
            setChangePass({ current: '', new: '', confirm: '' });
        } else {
            showNotification("User tidak ditemukan.", "error");
        }
    } catch (error: any) {
        console.error("Change Password Error:", error);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showNotification("Password saat ini salah.", "error");
        } else {
            showNotification("Gagal mengubah password. Silakan login ulang.", "error");
        }
    } finally {
        setIsLoading(false);
    }
  };

  // --- HANDLERS: SYSTEM SETTINGS (Insurance, Roles, PPN) ---
  const handleSaveSettings = async () => {
    if (!isManager) return;
    setIsLoading(true);
    try {
        const q = await getDocs(collection(db, SETTINGS_COLLECTION));
        let docRef;
        if (q.empty) {
            docRef = doc(collection(db, SETTINGS_COLLECTION));
            await setDoc(docRef, localSettings);
        } else {
            docRef = doc(db, SETTINGS_COLLECTION, q.docs[0].id);
            await updateDoc(docRef, { 
                workshopName: localSettings.workshopName || '',
                workshopAddress: localSettings.workshopAddress || '',
                workshopPhone: localSettings.workshopPhone || '',
                workshopEmail: localSettings.workshopEmail || '',
                ppnPercentage: localSettings.ppnPercentage,
                insuranceOptions: localSettings.insuranceOptions,
                roleOptions: localSettings.roleOptions || []
            });
        }
        showNotification("Pengaturan Sistem Berhasil Disimpan", 'success');
        refreshSettings();
    } catch (error: any) {
        console.error("Save Settings Error:", error);
        showNotification("Gagal menyimpan pengaturan: " + error.message, 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const handleAddRole = () => {
      if(newRoleName && !localSettings.roleOptions.includes(newRoleName)) {
          setLocalSettings(prev => ({
              ...prev,
              roleOptions: [...(prev.roleOptions || []), newRoleName]
          }));
          setNewRoleName('');
      }
  };

  const handleRemoveRole = (role: string) => {
      if(role === 'Manager') {
          showNotification("Role Manager tidak bisa dihapus!", 'error');
          return;
      }
      setLocalSettings(prev => ({
          ...prev,
          roleOptions: prev.roleOptions.filter(r => r !== role)
      }));
  };

  const handleImportInsurance = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isManager) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws); // Expect col headers: name, jasa, part

        const newOptions = data.map((row: any) => ({
            name: row['name'] || row['Nama'] || 'Unknown',
            jasa: Number(row['jasa'] || row['Jasa'] || 0),
            part: Number(row['part'] || row['Part'] || 0)
        }));

        setLocalSettings(prev => ({
            ...prev,
            insuranceOptions: [...prev.insuranceOptions, ...newOptions]
        }));
        showNotification(`Berhasil import ${newOptions.length} asuransi`, 'success');
    };
    reader.readAsBinaryString(file);
  };

  // --- HANDLERS: SUPPLIERS ---
  const handleSaveSupplier = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isManager) return;
      setIsLoading(true);
      try {
          if (supplierForm.id) {
               await updateDoc(doc(db, SUPPLIERS_COLLECTION, supplierForm.id), supplierForm);
               showNotification("Supplier diperbarui", "success");
          } else {
               await addDoc(collection(db, SUPPLIERS_COLLECTION), {
                   ...supplierForm,
                   createdAt: serverTimestamp()
               });
               showNotification("Supplier ditambahkan", "success");
          }
          setSupplierForm({});
          setIsEditingSupplier(false);
          fetchSuppliers();
      } catch (error: any) {
          console.error("Save Supplier Error:", error);
          showNotification("Gagal menyimpan supplier: " + error.message, "error");
      } finally {
          setIsLoading(false);
      }
  };

  const handleDeleteSupplier = async (id: string) => {
      if (!isManager) return;
      if(!window.confirm("Hapus supplier ini?")) return;
      try {
          await deleteDoc(doc(db, SUPPLIERS_COLLECTION, id));
          fetchSuppliers();
          showNotification("Supplier dihapus", "success");
      } catch (e: any) { 
          console.error(e);
          showNotification("Gagal menghapus: " + e.message, "error"); 
      }
  };

  const handleImportSuppliers = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isManager) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws); 
        
        // Headers: name, category, phone, address, picName
        let count = 0;
        for (const row of data as any[]) {
            const newSupp = {
                name: row['name'] || row['Nama'] || '',
                category: row['category'] || row['Kategori'] || 'Umum',
                phone: row['phone'] || row['Telepon'] || '',
                address: row['address'] || row['Alamat'] || '',
                picName: row['picName'] || row['PIC'] || '',
                createdAt: serverTimestamp()
            };
            if(newSupp.name) {
                await addDoc(collection(db, SUPPLIERS_COLLECTION), newSupp);
                count++;
            }
        }
        showNotification(`Berhasil import ${count} supplier`, 'success');
        fetchSuppliers();
    };
    reader.readAsBinaryString(file);
  };

  // UI Helper for disabled sections
  const RestrictedOverlay = () => (
      !isManager ? (
          <div className="absolute inset-0 z-10 bg-gray-50/50 cursor-not-allowed flex items-center justify-center">
              <div className="bg-white p-2 rounded shadow-sm border flex items-center gap-2 text-red-500 font-bold text-xs opacity-100">
                  <Ban size={14} /> Akses Manager Saja
              </div>
          </div>
      ) : null
  );

  const restrictedClass = !isManager ? "opacity-60 pointer-events-none relative" : "relative";

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pengaturan Sistem</h1>
            <p className="text-gray-500 mt-1">Kelola pengguna, database master, dan konfigurasi sistem.</p>
          </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex border-b border-gray-200">
        <button 
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'users' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            <div className="flex items-center gap-2"><Users size={18}/> Manajemen Pengguna</div>
        </button>
        <button 
            onClick={() => setActiveTab('system')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'system' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            <div className="flex items-center gap-2"><Database size={18}/> Database Sistem</div>
        </button>
        <button 
            onClick={() => setActiveTab('suppliers')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'suppliers' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            <div className="flex items-center gap-2"><Truck size={18}/> Data Supplier</div>
        </button>
      </div>

      {/* CONTENT: USERS */}
      {activeTab === 'users' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* CARD 1: TAMBAH USER (RESTRICTED) */}
              <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 ${restrictedClass}`}>
                  <RestrictedOverlay />
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <UserPlus className="text-indigo-600" size={20}/> Tambah Pengguna Baru
                  </h3>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
                          <input disabled={!isManager} type="text" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full p-2 border rounded mt-1 focus:ring-1 ring-indigo-500"/>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Role User / Hak Akses</label>
                          <div className="relative">
                            <select 
                                disabled={!isManager}
                                value={newUser.role} 
                                onChange={e => setNewUser({...newUser, role: e.target.value})} 
                                className="w-full p-2 pl-9 border rounded mt-1 focus:ring-1 ring-indigo-500 appearance-none bg-white"
                            >
                                {(localSettings.roleOptions || []).map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                            <Shield className="absolute left-2.5 top-3.5 text-gray-400" size={16}/>
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Email</label>
                          <input disabled={!isManager} type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full p-2 border rounded mt-1 focus:ring-1 ring-indigo-500"/>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Password Default</label>
                          <input disabled={!isManager} type="password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full p-2 border rounded mt-1 focus:ring-1 ring-indigo-500"/>
                      </div>
                      <button disabled={isLoading || !isManager} type="submit" className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 font-medium shadow-sm">
                          {isLoading ? 'Memproses...' : 'Buat Akun'}
                      </button>
                  </form>
              </div>

              {/* CARD 2: CHANGE MY PASSWORD (OPEN FOR EVERYONE) */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Lock className="text-emerald-600" size={20}/> Ganti Password Saya
                  </h3>
                  <form onSubmit={handleChangeMyPassword} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Password Saat Ini</label>
                          <input 
                            type="password" required 
                            value={changePass.current} 
                            onChange={e => setChangePass({...changePass, current: e.target.value})} 
                            className="w-full p-2 border rounded mt-1 focus:ring-1 ring-emerald-500"
                            placeholder="Verifikasi user..."
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Password Baru</label>
                          <input 
                            type="password" required 
                            value={changePass.new} 
                            onChange={e => setChangePass({...changePass, new: e.target.value})} 
                            className="w-full p-2 border rounded mt-1 focus:ring-1 ring-emerald-500"
                            placeholder="Min. 6 karakter"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Konfirmasi Password</label>
                          <input 
                            type="password" required 
                            value={changePass.confirm} 
                            onChange={e => setChangePass({...changePass, confirm: e.target.value})} 
                            className="w-full p-2 border rounded mt-1 focus:ring-1 ring-emerald-500"
                            placeholder="Ulangi password baru"
                          />
                      </div>
                      <button disabled={isLoading} type="submit" className="w-full bg-emerald-600 text-white py-2 rounded hover:bg-emerald-700 font-medium shadow-sm">
                          {isLoading ? 'Memproses...' : 'Ubah Password'}
                      </button>
                  </form>
              </div>

              {/* CARD 3: RESET OTHER USER (RESTRICTED) */}
              <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit ${restrictedClass}`}>
                  <RestrictedOverlay />
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <KeyRound className="text-orange-500" size={20}/> Reset Password User Lain
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">Link untuk mereset password akan dikirimkan ke email pengguna terkait.</p>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Email Pengguna</label>
                          <input disabled={!isManager} type="email" required value={resetEmail} onChange={e => setResetEmail(e.target.value)} className="w-full p-2 border rounded mt-1 focus:ring-1 ring-orange-500"/>
                      </div>
                      <button disabled={isLoading || !isManager} type="submit" className="w-full bg-orange-500 text-white py-2 rounded hover:bg-orange-600 font-medium shadow-sm">
                          Kirim Link Reset
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* CONTENT: SYSTEM */}
      {activeTab === 'system' && (
          <div className={`space-y-8 ${restrictedClass}`}>
               <RestrictedOverlay />
               
               {/* WORKSHOP IDENTITY (NEW) */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Building size={20} className="text-indigo-600"/> Identitas Bengkel (Kop Surat)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Nama Bengkel</label>
                          <input 
                            disabled={!isManager}
                            type="text" 
                            value={localSettings.workshopName || ''} 
                            onChange={e => setLocalSettings({...localSettings, workshopName: e.target.value})} 
                            className="w-full p-2 border rounded mt-1"
                            placeholder="Contoh: MAZDA RANGER BODY & PAINT"
                          />
                      </div>
                      <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Alamat Lengkap</label>
                          <input 
                            disabled={!isManager}
                            type="text" 
                            value={localSettings.workshopAddress || ''} 
                            onChange={e => setLocalSettings({...localSettings, workshopAddress: e.target.value})} 
                            className="w-full p-2 border rounded mt-1"
                            placeholder="Alamat bengkel untuk kop surat"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">No. Telepon</label>
                          <input 
                            disabled={!isManager}
                            type="text" 
                            value={localSettings.workshopPhone || ''} 
                            onChange={e => setLocalSettings({...localSettings, workshopPhone: e.target.value})} 
                            className="w-full p-2 border rounded mt-1"
                            placeholder="(021) xxxx-xxxx"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Email</label>
                          <input 
                            disabled={!isManager}
                            type="text" 
                            value={localSettings.workshopEmail || ''} 
                            onChange={e => setLocalSettings({...localSettings, workshopEmail: e.target.value})} 
                            className="w-full p-2 border rounded mt-1"
                            placeholder="service@bengkel.com"
                          />
                      </div>
                  </div>
                  <button disabled={!isManager} onClick={handleSaveSettings} className="mt-5 flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
                       <Save size={18}/> Simpan Identitas
                  </button>
               </div>

               {/* ROLE MANAGEMENT */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Manajemen Role User</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                      {(localSettings.roleOptions || []).map((role, idx) => (
                          <div key={idx} className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full flex items-center gap-2 text-sm font-medium border border-indigo-100">
                              {role}
                              {isManager && role !== 'Manager' && (
                                  <button onClick={() => handleRemoveRole(role)} className="hover:text-red-600"><Trash2 size={12}/></button>
                              )}
                          </div>
                      ))}
                  </div>
                  <div className="flex gap-2 max-w-md">
                      <input 
                        disabled={!isManager}
                        type="text" 
                        placeholder="Nama Role Baru (ex: Mekanik)" 
                        value={newRoleName}
                        onChange={e => setNewRoleName(e.target.value)}
                        className="flex-grow p-2 border rounded"
                      />
                      <button disabled={!isManager} onClick={handleAddRole} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"><Plus size={18}/></button>
                  </div>
                  <button disabled={!isManager} onClick={handleSaveSettings} className="mt-5 flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                       <Save size={18}/> Simpan Perubahan Role
                  </button>
               </div>

               {/* TAX SETTINGS */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Pengaturan Pajak</h3>
                  <div className="flex items-center gap-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700">PPN Percentage (%)</label>
                          <input 
                            disabled={!isManager}
                            type="number" 
                            value={localSettings.ppnPercentage} 
                            onChange={e => setLocalSettings({...localSettings, ppnPercentage: Number(e.target.value)})} 
                            className="p-2 border rounded w-32"
                          />
                      </div>
                      <button disabled={!isManager} onClick={handleSaveSettings} className="mt-5 flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                          <Save size={18}/> Simpan
                      </button>
                  </div>
               </div>

               {/* INSURANCE DATA */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                   <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Data Master Asuransi</h3>
                        <div className="flex gap-2">
                             <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100 text-sm font-medium">
                                <Upload size={16}/> Import Excel
                                <input disabled={!isManager} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleImportInsurance} />
                             </label>
                             <button disabled={!isManager} onClick={handleSaveSettings} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded hover:bg-indigo-700 text-sm font-medium">
                                <Save size={16}/> Simpan Perubahan
                             </button>
                        </div>
                   </div>
                   
                   <div className="overflow-x-auto">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50 text-gray-600 uppercase">
                               <tr>
                                   <th className="px-4 py-3">Nama Asuransi</th>
                                   <th className="px-4 py-3">Disc Jasa (%)</th>
                                   <th className="px-4 py-3">Disc Part (%)</th>
                                   <th className="px-4 py-3 w-10">Aksi</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100">
                               {(localSettings.insuranceOptions || []).map((ins, idx) => (
                                   <tr key={idx} className="hover:bg-gray-50">
                                       <td className="px-4 py-2">
                                           <input 
                                            disabled={!isManager}
                                            type="text" 
                                            value={ins.name} 
                                            onChange={(e) => {
                                                const newOpts = [...localSettings.insuranceOptions];
                                                newOpts[idx].name = e.target.value;
                                                setLocalSettings({...localSettings, insuranceOptions: newOpts});
                                            }}
                                            className="w-full p-1 border rounded"
                                           />
                                       </td>
                                       <td className="px-4 py-2">
                                           <input 
                                            disabled={!isManager}
                                            type="number" 
                                            value={ins.jasa} 
                                            onChange={(e) => {
                                                const newOpts = [...localSettings.insuranceOptions];
                                                newOpts[idx].jasa = Number(e.target.value);
                                                setLocalSettings({...localSettings, insuranceOptions: newOpts});
                                            }}
                                            className="w-20 p-1 border rounded"
                                           />
                                       </td>
                                       <td className="px-4 py-2">
                                           <input 
                                            disabled={!isManager}
                                            type="number" 
                                            value={ins.part} 
                                            onChange={(e) => {
                                                const newOpts = [...localSettings.insuranceOptions];
                                                newOpts[idx].part = Number(e.target.value);
                                                setLocalSettings({...localSettings, insuranceOptions: newOpts});
                                            }}
                                            className="w-20 p-1 border rounded"
                                           />
                                       </td>
                                       <td className="px-4 py-2 text-center">
                                           <button 
                                            disabled={!isManager}
                                            onClick={() => {
                                                const newOpts = localSettings.insuranceOptions.filter((_, i) => i !== idx);
                                                setLocalSettings({...localSettings, insuranceOptions: newOpts});
                                            }}
                                            className="text-red-500 hover:text-red-700 disabled:text-gray-300"
                                           >
                                               <Trash2 size={16}/>
                                           </button>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                   <button 
                    disabled={!isManager}
                    onClick={() => setLocalSettings(prev => ({...prev, insuranceOptions: [...prev.insuranceOptions, {name: 'Asuransi Baru', jasa: 0, part: 0}]}))}
                    className="mt-4 w-full py-2 border border-dashed border-gray-300 text-gray-500 rounded hover:bg-gray-50 flex items-center justify-center gap-2"
                   >
                       <Plus size={16}/> Tambah Baris
                   </button>
               </div>
          </div>
      )}

      {/* CONTENT: SUPPLIERS */}
      {activeTab === 'suppliers' && (
          <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 ${restrictedClass}`}>
              <RestrictedOverlay />
              {/* LIST */}
              <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Daftar Supplier</h3>
                        <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100 text-sm font-medium">
                            <Upload size={16}/> Import Excel
                            <input disabled={!isManager} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleImportSuppliers} />
                        </label>
                  </div>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 text-gray-600 uppercase sticky top-0">
                              <tr>
                                  <th className="px-4 py-3">Nama Supplier</th>
                                  <th className="px-4 py-3">Kategori</th>
                                  <th className="px-4 py-3">Kontak & Bank</th>
                                  <th className="px-4 py-3 text-right">Aksi</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {suppliers.map(s => (
                                  <tr key={s.id} className="hover:bg-gray-50">
                                      <td className="px-4 py-2 font-medium">
                                          {s.name}
                                          <div className="text-xs text-gray-500">{s.picName || 'No PIC'}</div>
                                      </td>
                                      <td className="px-4 py-2"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{s.category}</span></td>
                                      <td className="px-4 py-2 text-xs">
                                          <div>{s.phone}</div>
                                          {s.bankName && (
                                              <div className="text-indigo-600 font-medium mt-1">
                                                  {s.bankName} - {s.bankAccountNumber}
                                              </div>
                                          )}
                                      </td>
                                      <td className="px-4 py-2 flex justify-end gap-2">
                                          <button disabled={!isManager} onClick={() => { setSupplierForm(s); setIsEditingSupplier(true); }} className="text-blue-500 hover:text-blue-700"><Edit2 size={16}/></button>
                                          <button disabled={!isManager} onClick={() => handleDeleteSupplier(s.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                                      </td>
                                  </tr>
                              ))}
                              {suppliers.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-400">Belum ada data supplier</td></tr>}
                          </tbody>
                      </table>
                  </div>
              </div>

              {/* FORM */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Truck className="text-indigo-600" size={20}/> {isEditingSupplier ? 'Edit Supplier' : 'Input Supplier Baru'}
                  </h3>
                  <form onSubmit={handleSaveSupplier} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Nama Supplier *</label>
                          <input disabled={!isManager} required type="text" value={supplierForm.name || ''} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} className="w-full p-2 border rounded mt-1"/>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700">Kategori</label>
                          <select disabled={!isManager} value={supplierForm.category || 'Umum'} onChange={e => setSupplierForm({...supplierForm, category: e.target.value})} className="w-full p-2 border rounded mt-1">
                              <option value="Umum">Umum</option>
                              <option value="Sparepart">Sparepart</option>
                              <option value="Cat/Bahan">Cat/Bahan</option>
                              <option value="Jasa Luar">Jasa Luar</option>
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Telepon</label>
                            <input disabled={!isManager} type="text" value={supplierForm.phone || ''} onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})} className="w-full p-2 border rounded mt-1"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nama PIC</label>
                            <input disabled={!isManager} type="text" value={supplierForm.picName || ''} onChange={e => setSupplierForm({...supplierForm, picName: e.target.value})} className="w-full p-2 border rounded mt-1"/>
                        </div>
                      </div>
                      
                      {/* BANK INFO SECTION */}
                      <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 space-y-3">
                          <div className="flex items-center gap-2 text-indigo-800 font-bold text-sm mb-1">
                              <CreditCard size={14}/> Informasi Pembayaran
                          </div>
                          <div>
                              <label className="block text-xs font-medium text-gray-600">Nama Bank</label>
                              <input 
                                disabled={!isManager} type="text" 
                                placeholder="BCA / Mandiri..."
                                value={supplierForm.bankName || ''} 
                                onChange={e => setSupplierForm({...supplierForm, bankName: e.target.value})} 
                                className="w-full p-2 border rounded mt-1 text-sm"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-medium text-gray-600">No. Rekening</label>
                              <input 
                                disabled={!isManager} type="text" 
                                placeholder="1234xxxx"
                                value={supplierForm.bankAccountNumber || ''} 
                                onChange={e => setSupplierForm({...supplierForm, bankAccountNumber: e.target.value})} 
                                className="w-full p-2 border rounded mt-1 text-sm font-mono"
                              />
                          </div>
                           <div>
                              <label className="block text-xs font-medium text-gray-600">Atas Nama (A/N)</label>
                              <input 
                                disabled={!isManager} type="text" 
                                placeholder="Nama Pemilik Rekening"
                                value={supplierForm.bankAccountHolder || ''} 
                                onChange={e => setSupplierForm({...supplierForm, bankAccountHolder: e.target.value})} 
                                className="w-full p-2 border rounded mt-1 text-sm"
                              />
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700">Alamat</label>
                          <textarea disabled={!isManager} rows={2} value={supplierForm.address || ''} onChange={e => setSupplierForm({...supplierForm, address: e.target.value})} className="w-full p-2 border rounded mt-1"/>
                      </div>
                      
                      <div className="flex gap-2">
                          {isEditingSupplier && (
                              <button disabled={!isManager} type="button" onClick={() => { setSupplierForm({}); setIsEditingSupplier(false); }} className="w-1/3 bg-gray-200 text-gray-700 py-2 rounded hover:bg-gray-300 font-medium">Batal</button>
                          )}
                          <button disabled={isLoading || !isManager} type="submit" className="flex-grow bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 font-medium">
                              {isLoading ? 'Menyimpan...' : (isEditingSupplier ? 'Update Data' : 'Simpan Data')}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default SettingsView;