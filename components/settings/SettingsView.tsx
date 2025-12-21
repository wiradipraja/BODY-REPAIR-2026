
import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, updateDoc, deleteDoc, addDoc, getDocs, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth, SETTINGS_COLLECTION, SERVICES_MASTER_COLLECTION, USERS_COLLECTION, SERVICE_JOBS_COLLECTION, PURCHASE_ORDERS_COLLECTION } from '../../services/firebase';
import { Settings, UserPermissions, UserProfile, Supplier, ServiceMasterItem, Job, PurchaseOrder } from '../../types';
import { Save, Plus, Trash2, Building, Phone, Mail, Percent, Target, Calendar, User, Users, Shield, CreditCard, MessageSquare, Database, Download, Upload, Layers, Edit2, Loader2, RefreshCw, AlertTriangle, ShieldCheck, Search, Info, Palette, Wrench, Activity, ClipboardCheck, Car, Tag, UserPlus, Key, MailCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../ui/Modal';

interface SettingsViewProps {
  currentSettings: Settings;
  refreshSettings: () => Promise<void>;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
  realTimeSuppliers: Supplier[];
}

const SettingsView: React.FC<SettingsViewProps> = ({ currentSettings, refreshSettings, showNotification, userPermissions, realTimeSuppliers }) => {
  const [localSettings, setLocalSettings] = useState<Settings>(currentSettings);
  const [activeTab, setActiveTab] = useState('general');
  const [isLoading, setIsLoading] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const isManager = userPermissions.role === 'Manager';
  
  const [services, setServices] = useState<ServiceMasterItem[]>([]);
  const [serviceForm, setServiceForm] = useState<Partial<ServiceMasterItem>>({ serviceCode: '', workType: 'KC', panelValue: 1.0 });
  const [isEditingService, setIsEditingService] = useState(false);

  // User Management State
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState({
      email: '',
      displayName: '',
      role: 'Staff'
  });

  useEffect(() => {
    setLocalSettings(currentSettings);
  }, [currentSettings]);

  useEffect(() => {
      if (activeTab === 'services') {
          loadServices();
      }
      if (activeTab === 'database') {
          loadUsers();
      }
  }, [activeTab]);

  const loadServices = async () => {
      try {
          const q = query(collection(db, SERVICES_MASTER_COLLECTION), orderBy('serviceName'));
          const snap = await getDocs(q);
          setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceMasterItem)));
      } catch (e) {
          console.error("Load services error", e);
      }
  };

  const loadUsers = async () => {
      try {
          const q = query(collection(db, USERS_COLLECTION));
          const snap = await getDocs(q);
          setSystemUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      } catch (e) {
          console.error("Load users error", e);
      }
  };

  const filteredServices = useMemo(() => {
      if (!serviceSearchQuery) return services;
      const term = serviceSearchQuery.toLowerCase();
      return services.filter(s => 
          s.serviceName.toLowerCase().includes(term) || 
          (s.serviceCode && s.serviceCode.toLowerCase().includes(term))
      );
  }, [services, serviceSearchQuery]);

  const handleChange = (field: keyof Settings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: keyof Settings, index: number, value: any) => {
    const currentArray = Array.isArray(localSettings[field]) ? (localSettings[field] as any[]) : [];
    const arr = [...currentArray];
    arr[index] = value;
    setLocalSettings(prev => ({ ...prev, [field]: arr }));
  };

  const addItem = (field: keyof Settings, initialValue: any) => {
    const currentArray = Array.isArray(localSettings[field]) ? (localSettings[field] as any[]) : [];
    const arr = [...currentArray];
    arr.push(initialValue);
    setLocalSettings(prev => ({ ...prev, [field]: arr }));
  };

  const removeItem = (field: keyof Settings, index: number) => {
    const currentArray = Array.isArray(localSettings[field]) ? (localSettings[field] as any[]) : [];
    const arr = [...currentArray];
    arr.splice(index, 1);
    setLocalSettings(prev => ({ ...prev, [field]: arr }));
  };

  const saveSettings = async () => {
    if (!isManager) {
        showNotification("Akses Ditolak: Hanya Manager yang dapat menyimpan pengaturan.", "error");
        return;
    }
    setIsLoading(true);
    try {
      const q = await getDocs(collection(db, SETTINGS_COLLECTION));
      if (q.empty) {
        await addDoc(collection(db, SETTINGS_COLLECTION), localSettings);
      } else {
        await updateDoc(doc(db, SETTINGS_COLLECTION, q.docs[0].id), localSettings as any);
      }
      showNotification("Pengaturan berhasil disimpan.", "success");
      refreshSettings();
    } catch (e: any) {
      showNotification("Gagal menyimpan: " + e.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // --- USER MANAGEMENT HANDLERS ---
  const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isManager) return;
      setIsLoading(true);
      try {
          const userRef = doc(collection(db, USERS_COLLECTION));
          await updateDoc(doc(db, USERS_COLLECTION, userForm.email.toLowerCase()), {
              email: userForm.email.toLowerCase(),
              displayName: userForm.displayName,
              role: userForm.role,
              createdAt: serverTimestamp()
          });
          showNotification(`User ${userForm.displayName} didaftarkan di database.`, "success");
          setIsUserModalOpen(false);
          loadUsers();
      } catch (e: any) {
          try {
              const uRef = doc(db, USERS_COLLECTION, userForm.email.toLowerCase());
              await addDoc(collection(db, USERS_COLLECTION), {
                  email: userForm.email.toLowerCase(),
                  displayName: userForm.displayName,
                  role: userForm.role,
                  createdAt: serverTimestamp()
              });
              showNotification("User ditambahkan.", "success");
              setIsUserModalOpen(false);
              loadUsers();
          } catch (err) {
              showNotification("Gagal menambah user.", "error");
          }
      } finally {
          setIsLoading(false);
      }
  };

  const handleResetPassword = async (email: string) => {
      if (!window.confirm(`Kirim email reset password ke ${email}?`)) return;
      try {
          await sendPasswordResetEmail(auth, email);
          showNotification("Email reset password telah dikirim.", "success");
      } catch (e: any) {
          showNotification("Gagal: " + e.message, "error");
      }
  };

  const handleDeleteUser = async (uid: string) => {
      if (!window.confirm("Hapus akses user ini?")) return;
      try {
          await deleteDoc(doc(db, USERS_COLLECTION, uid));
          showNotification("User dihapus dari database akses.", "success");
          loadUsers();
      } catch (e) {
          showNotification("Gagal menghapus.", "error");
      }
  };

  const handleSyncSystemData = async () => {
      if (!isManager) return;
      if (!window.confirm("Gunakan Fitur ini untuk merapikan data lama agar sinkron dengan logika baru (Admin Control & Logistik). Proses ini akan memindai seluruh WO Aktif. Lanjutkan?")) return;

      setIsLoading(true);
      try {
          const jobsSnap = await getDocs(collection(db, SERVICE_JOBS_COLLECTION));
          const poSnap = await getDocs(collection(db, PURCHASE_ORDERS_COLLECTION));
          const allJobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Job)).filter(j => !j.isClosed && !j.isDeleted);
          const allPOs = poSnap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder));
          const batch = writeBatch(db);
          let updatedCount = 0;

          allJobs.forEach(job => {
              let hasChanged = false;
              const currentJobData = { ...job };
              if (currentJobData.namaAsuransi !== 'Umum / Pribadi' && currentJobData.estimateData?.estimationNumber && currentJobData.statusKendaraan === 'Tunggu Estimasi') {
                  currentJobData.statusKendaraan = 'Tunggu SPK Asuransi';
                  hasChanged = true;
              }
              const parts = [...(currentJobData.estimateData?.partItems || [])];
              let anyPartUpdated = false;
              if (parts.length > 0) {
                  parts.forEach((part, idx) => {
                      const isOrderedInPO = allPOs.some(po => (po.status !== 'Draft' && po.status !== 'Rejected') && po.items.some(item => item.refJobId === job.id && item.refPartIndex === idx));
                      if (isOrderedInPO && !part.isOrdered) {
                          parts[idx] = { ...part, isOrdered: true };
                          anyPartUpdated = true;
                          hasChanged = true;
                      }
                  });
              }
              if (parts.length > 0) {
                  const allOrdered = parts.every(p => p.isOrdered);
                  if (allOrdered && currentJobData.posisiKendaraan === 'Di Pemilik' && currentJobData.statusKendaraan !== 'Unit di Pemilik (Tunggu Part)') {
                      currentJobData.statusKendaraan = 'Unit di Pemilik (Tunggu Part)';
                      hasChanged = true;
                  }
              }
              if (hasChanged) {
                  const jobRef = doc(db, SERVICE_JOBS_COLLECTION, job.id);
                  const updatePayload: any = { statusKendaraan: currentJobData.statusKendaraan, updatedAt: serverTimestamp() };
                  if (anyPartUpdated) updatePayload['estimateData.partItems'] = parts;
                  batch.update(jobRef, updatePayload);
                  updatedCount++;
              }
          });
          if (updatedCount > 0) {
              await batch.commit();
              showNotification(`Berhasil merapikan ${updatedCount} data unit.`, "success");
          } else {
              showNotification("Seluruh data sudah rapi & sinkron.", "success");
          }
      } catch (e: any) {
          console.error(e);
          showNotification("Gagal sinkronisasi: " + e.message, "error");
      } finally {
          setIsLoading(false);
      }
  };

  const handleCleanupDuplicates = async () => {
      if (!isManager) return;
      setIsLoading(true);
      try {
          const seen = new Set<string>();
          const toDelete: string[] = [];
          const sorted = [...services].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
          for (const s of sorted) {
              const key = `${s.serviceName.trim().toLowerCase()}_${s.workType}`;
              if (seen.has(key)) toDelete.push(s.id);
              else seen.add(key);
          }
          if (toDelete.length === 0) { showNotification("Screening Selesai: Tidak ditemukan data duplikat.", "success"); return; }
          if (window.confirm(`Ditemukan ${toDelete.length} data duplikat. Hapus data duplikat tersebut?`)) {
              for (const id of toDelete) await deleteDoc(doc(db, SERVICES_MASTER_COLLECTION, id));
              showNotification(`Pembersihan Berhasil: ${toDelete.length} data duplikat telah dihapus.`, "success");
              loadServices();
          }
      } catch (e: any) { showNotification("Gagal melakukan screening: " + e.message, "error"); } finally { setIsLoading(false); }
  };

  const handleSaveService = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isManager) return;
      const serviceName = serviceForm.serviceName?.trim() || '';
      const workType = serviceForm.workType || 'KC';
      if (!serviceName || !serviceForm.panelValue) { showNotification("Nama dan Nilai Panel wajib diisi.", "error"); return; }
      const isDuplicate = services.some(s => s.id !== serviceForm.id && s.serviceName.trim().toLowerCase() === serviceName.toLowerCase() && s.workType === workType);
      if (isDuplicate) { showNotification(`Gagal: Pekerjaan "${serviceName}" dengan jenis "${workType}" sudah ada.`, "error"); return; }
      setIsLoading(true);
      try {
          const payload = { ...serviceForm, serviceName: serviceName, serviceCode: serviceForm.serviceCode?.toUpperCase() || '' };
          if (serviceForm.id) await updateDoc(doc(db, SERVICES_MASTER_COLLECTION, serviceForm.id), payload);
          else await addDoc(collection(db, SERVICES_MASTER_COLLECTION), { ...payload, createdAt: serverTimestamp() });
          showNotification("Data Jasa diperbarui", "success");
          setServiceForm({ serviceCode: '', workType: 'KC', panelValue: 1.0 });
          setIsEditingService(false);
          loadServices();
      } catch (e: any) { showNotification("Gagal: " + e.message, "error"); } finally { setIsLoading(false); }
  };

  const handleDeleteService = async (id: string) => {
      if (!isManager) return;
      if(!window.confirm("Hapus item jasa ini?")) return;
      try {
          await deleteDoc(doc(db, SERVICES_MASTER_COLLECTION, id));
          showNotification("Jasa dihapus", "success");
          loadServices();
      } catch(e) { showNotification("Gagal hapus", "error"); }
  };

  const handleDownloadServiceTemplate = () => {
      const headers = [['Kode Jasa', 'Nama Jasa', 'Jenis Pekerjaan (KC/GTC/BP)', 'Nilai Panel', 'Harga Dasar']];
      const sampleData = services.length > 0 ? services.map(s => [s.serviceCode || '', s.serviceName, s.workType, s.panelValue, s.basePrice]) : [['EXT-01', 'Bumper Depan', 'KC', 1.0, 600000]];
      const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleData]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Master Jasa");
      XLSX.writeFile(wb, "Master_Jasa_Panel.xlsx");
  };

  const handleImportServices = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isManager) return;
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
          setIsLoading(true);
          try {
              const bstr = evt.target?.result;
              const wb = XLSX.read(bstr, { type: 'binary' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const data = XLSX.utils.sheet_to_json(ws);
              let newCount = 0, updateCount = 0;
              const existingMap = new Map<string, ServiceMasterItem>();
              services.forEach(s => existingMap.set(`${s.serviceName.trim().toLowerCase()}_${s.workType}`, s));
              for (const row of data as any[]) {
                  const serviceName = (row['Nama Jasa'] || row['nama jasa'] || row['Service Name'] || '').toString().trim();
                  const workType = (row['Jenis Pekerjaan (KC/GTC/BP)'] || row['Jenis'] || 'KC').toString().trim().toUpperCase();
                  if (serviceName) {
                      const existing = existingMap.get(`${serviceName.toLowerCase()}_${workType}`);
                      const itemData = { serviceCode: String(row['Kode Jasa'] || row['Kode'] || row['Code'] || '').toUpperCase(), serviceName, workType: workType as any, panelValue: Number(row['Nilai Panel'] || row['Panel'] || 0), basePrice: Number(row['Harga Dasar'] || row['Harga'] || 0) };
                      if (existing) { await updateDoc(doc(db, SERVICES_MASTER_COLLECTION, existing.id), { ...itemData, updatedAt: serverTimestamp() }); updateCount++; }
                      else { await addDoc(collection(db, SERVICES_MASTER_COLLECTION), { ...itemData, createdAt: serverTimestamp() }); newCount++; }
                  }
              }
              showNotification(`Selesai: ${newCount} data baru, ${updateCount} diperbarui.`, "success");
              loadServices();
          } catch (err: any) { showNotification("Gagal import: " + err.message, "error"); } finally { setIsLoading(false); e.target.value = ''; }
      };
      reader.readAsBinaryString(file);
  };

  const RestrictedOverlay = () => (!isManager ? (<div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl"><div className="bg-white p-4 rounded-lg shadow-lg border border-red-100 flex items-center gap-3"><Shield className="text-red-500" size={24}/><div><p className="font-bold text-gray-800">Akses Terbatas</p><p className="text-xs text-gray-500">Hanya Manager yang dapat mengubah pengaturan ini.</p></div></div></div>) : null);
  const restrictedClass = !isManager ? "pointer-events-none opacity-80 relative" : "relative";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Pengaturan Sistem</h1>
          <div className="flex gap-3">
              {isManager && (<button onClick={handleSyncSystemData} disabled={isLoading} className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-lg hover:bg-amber-100 border border-amber-200 font-bold disabled:opacity-50 transition-all" title="Rapikan data lama agar sesuai logika baru">{isLoading ? <Loader2 className="animate-spin" size={18}/> : <RefreshCw size={18}/>} Data Doctor (Sync)</button>)}
              <button onClick={saveSettings} disabled={isLoading || !isManager} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 shadow-lg font-bold disabled:opacity-50">{isLoading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} Simpan Perubahan</button>
          </div>
      </div>

      <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-x-auto">
          {[
            { id: 'general', label: 'Bengkel & Target' },
            { id: 'database', label: 'Data Master' },
            { id: 'unit_catalog', label: 'Katalog Unit' },
            { id: 'whatsapp', label: 'WhatsApp & Pesan' },
            { id: 'services', label: 'Master Jasa & Panel' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-4 text-sm font-bold capitalize transition-colors border-b-2 flex-shrink-0 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
      </div>

      <div className="bg-white p-6 rounded-b-xl border border-t-0 border-gray-200 shadow-sm relative min-h-[500px]">
          {activeTab === 'unit_catalog' && (
              <div className={`space-y-10 animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay />
                  
                  {/* CAR BRANDS */}
                  <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs"><Car size={16} className="text-indigo-500"/> Master Merk Kendaraan</h4>
                          <button onClick={() => addItem('carBrands', '')} className="text-[10px] bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-700"><Plus size={14}/> Tambah Merk</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(localSettings.carBrands || []).map((brand, idx) => (
                              <div key={idx} className="flex gap-1 group">
                                  <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-indigo-500" value={brand} onChange={e => handleArrayChange('carBrands', idx, e.target.value)} />
                                  <button onClick={() => removeItem('carBrands', idx)} className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </section>

                  {/* CAR MODELS */}
                  <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs"><Layers size={16} className="text-blue-500"/> Katalog Model / Tipe</h4>
                          <button onClick={() => addItem('carModels', '')} className="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-blue-700"><Plus size={14}/> Tambah Tipe</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(localSettings.carModels || []).map((model, idx) => (
                              <div key={idx} className="flex gap-1 group">
                                  <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500" value={model} onChange={e => handleArrayChange('carModels', idx, e.target.value)} />
                                  <button onClick={() => removeItem('carModels', idx)} className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </section>

                  {/* CAR COLORS */}
                  <section className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs"><Palette size={16} className="text-rose-500"/> Katalog Warna Kendaraan</h4>
                          <button onClick={() => addItem('carColors', '')} className="text-[10px] bg-rose-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-rose-700"><Plus size={14}/> Tambah Warna</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(localSettings.carColors || []).map((color, idx) => (
                              <div key={idx} className="flex gap-1 group">
                                  <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:ring-2 focus:ring-rose-500" value={color} onChange={e => handleArrayChange('carColors', idx, e.target.value)} />
                                  <button onClick={() => removeItem('carColors', idx)} className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </section>
              </div>
          )}

          {activeTab === 'services' && (
              <div className="space-y-8 animate-fade-in">
                  <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 ${restrictedClass}`}>
                    <RestrictedOverlay />
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                            <h3 className="text-lg font-bold text-gray-800">Daftar Master Jasa (Standar Panel)</h3>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={handleCleanupDuplicates} className="flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1.5 rounded border border-amber-200 hover:bg-amber-100 text-xs font-bold" title="Hapus duplikasi Nama+Jenis"><ShieldCheck size={14}/> Cleanup</button>
                                <button onClick={handleDownloadServiceTemplate} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-200 text-xs font-bold" title="Export data untuk diedit harganya"><Download size={14}/> Template/Export</button>
                                <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100 text-xs font-bold"><Upload size={14}/> Import & Update<input disabled={!isManager} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleImportServices} /></label>
                            </div>
                        </div>
                        <div className="mb-4 relative group"><Search className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18}/><input type="text" placeholder="Cari Nama Pekerjaan atau Kode..." value={serviceSearchQuery} onChange={e => setServiceSearchQuery(e.target.value)} className="w-full pl-10 p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-50 outline-none transition-all"/></div>
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
                            <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-600 uppercase sticky top-0 z-20"><tr><th className="px-4 py-3">Kode</th><th className="px-4 py-3">Nama Pekerjaan</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3 text-center">Panel</th><th className="px-4 py-3 text-right">Harga Dasar</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredServices.map(s => (<tr key={s.id} className="hover:bg-gray-50 group"><td className="px-4 py-2 font-mono text-xs font-bold text-gray-400 group-hover:text-indigo-600">{s.serviceCode || '-'}</td><td className="px-4 py-2 font-bold text-gray-700 uppercase tracking-tight">{s.serviceName}</td><td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-black border ${s.workType === 'KC' ? 'bg-orange-50 text-orange-700 border-orange-200' : s.workType === 'GTC' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>{s.workType}</span></td><td className="px-4 py-2 text-center font-black text-gray-900">{s.panelValue}</td><td className="px-4 py-2 text-right font-black text-emerald-600">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(s.basePrice)}</td><td className="px-4 py-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={!isManager} onClick={() => { setServiceForm(s); setIsEditingService(true); }} className="text-indigo-500 hover:text-indigo-700 bg-white p-1 rounded border shadow-sm"><Edit2 size={14}/></button><button disabled={!isManager} onClick={() => handleDeleteService(s.id)} className="text-red-500 hover:text-red-700 bg-white p-1 rounded border shadow-sm"><Trash2 size={14}/></button></td></tr>))}{filteredServices.length === 0 && (<tr><td colSpan={6} className="text-center py-20 text-gray-400 italic">No data.</td></tr>)}</tbody></table>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit flex flex-col sticky top-4"><h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Layers className="text-indigo-600" size={20}/> {isEditingService ? 'Edit Jasa' : 'Input Jasa Baru'}</h3><form onSubmit={handleSaveService} className="space-y-4"><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Kode Jasa</label><input disabled={!isManager} type="text" value={serviceForm.serviceCode || ''} onChange={e => setServiceForm({...serviceForm, serviceCode: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-mono uppercase font-bold text-indigo-900" placeholder="EXT-01"/></div><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nama Pekerjaan *</label><input disabled={!isManager} required type="text" value={serviceForm.serviceName || ''} onChange={e => setServiceForm({...serviceForm, serviceName: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="Bumper Depan"/></div><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Jenis Pekerjaan</label><select disabled={!isManager} value={serviceForm.workType || 'KC'} onChange={e => setServiceForm({...serviceForm, workType: e.target.value as any})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold"><option value="KC">Ketok & Cat (KC)</option><option value="GTC">Ganti & Cat (GTC)</option><option value="BP">Bongkar Pasang (BP)</option><option value="Lainnya">Lainnya</option></select></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nilai Panel</label><input disabled={!isManager} type="number" step="0.1" value={serviceForm.panelValue || 0} onChange={e => setServiceForm({...serviceForm, panelValue: Number(e.target.value)})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-black text-indigo-900"/></div><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Harga Dasar</label><input disabled={!isManager} type="number" value={serviceForm.basePrice || 0} onChange={e => setServiceForm({...serviceForm, basePrice: Number(e.target.value)})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-black text-emerald-600"/></div></div><div className="flex gap-2 pt-2">{isEditingService && <button disabled={!isManager} type="button" onClick={() => { setServiceForm({serviceCode: '', workType: 'KC', panelValue: 1.0}); setIsEditingService(false); }} className="w-1/3 bg-gray-100 text-gray-600 py-3 rounded-xl hover:bg-gray-200 font-bold transition-all">Batal</button>}<button disabled={isLoading || !isManager} type="submit" className="flex-grow bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 shadow-lg font-black tracking-wide transition-all transform active:scale-95">{isLoading ? 'Proses...' : (isEditingService ? 'UPDATE DATA' : 'SIMPAN DATA')}</button></div></form></div>
                  </div>
              </div>
          )}
          
          {activeTab === 'general' && (
              <div className={`space-y-8 ${restrictedClass}`}>
                  <RestrictedOverlay/><section><h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Building className="text-indigo-500"/> Informasi Bengkel</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="block text-sm font-medium mb-1">Nama Bengkel</label><input type="text" className="w-full p-2 border rounded" value={localSettings.workshopName} onChange={e => handleChange('workshopName', e.target.value)} /></div><div><label className="block text-sm font-medium mb-1">Email</label><input type="email" className="w-full p-2 border rounded" value={localSettings.workshopEmail} onChange={e => handleChange('workshopEmail', e.target.value)} /></div><div><label className="block text-sm font-medium mb-1">Nomor Telepon</label><input type="text" className="w-full p-2 border rounded" value={localSettings.workshopPhone} onChange={e => handleChange('workshopPhone', e.target.value)} /></div><div><label className="block text-sm font-medium mb-1">Alamat Lengkap</label><textarea className="w-full p-2 border rounded" rows={2} value={localSettings.workshopAddress} onChange={e => handleChange('workshopAddress', e.target.value)} /></div></div></section><section><h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Target className="text-red-500"/> Target & Pajak</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div><label className="block text-sm font-medium mb-1">PPN (%)</label><div className="relative"><input type="number" className="w-full p-2 border rounded pl-8" value={localSettings.ppnPercentage} onChange={e => handleChange('ppnPercentage', Number(e.target.value))} /><Percent size={14} className="absolute left-3 top-3 text-gray-400"/></div></div><div><label className="block text-sm font-medium mb-1">Target Bulanan (Rp)</label><input type="number" className="w-full p-2 border rounded" value={localSettings.monthlyTarget} onChange={e => handleChange('monthlyTarget', Number(e.target.value))} /></div><div><label className="block text-sm font-medium mb-1">Target Mingguan (Rp)</label><input type="number" className="w-full p-2 border rounded" value={localSettings.weeklyTarget} onChange={e => handleChange('weeklyTarget', Number(e.target.value))} /></div></div></section>
              </div>
          )}

          {activeTab === 'database' && (
              <div className={`space-y-10 animate-fade-in ${restrictedClass}`}>
                  <RestrictedOverlay/>
                  
                  {/* EXISTING: MECHANIC */}
                  <div className="grid grid-cols-1 gap-8">
                      <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                          <div className="flex justify-between items-center mb-4">
                              <h4 className="font-bold text-gray-700 flex items-center gap-2"><Wrench size={16}/> Daftar Mekanik</h4>
                              <button onClick={() => addItem('mechanicNames', '')} className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-200"><Plus size={14}/> Tambah</button>
                          </div>
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                              {(localSettings.mechanicNames || []).map((mech, idx) => (
                                  <div key={idx} className="flex gap-2 group animate-fade-in">
                                      <input type="text" className="flex-grow p-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500" value={mech} onChange={e => handleArrayChange('mechanicNames', idx, e.target.value)} />
                                      <button onClick={() => removeItem('mechanicNames', idx)} className="text-red-300 hover:text-red-600 transition-opacity opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>

                  {/* RESTORED: USER MANAGEMENT SECTION */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
                          <div>
                              <h4 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-widest text-xs"><Users size={18} className="text-indigo-600"/> Manajemen Akses User</h4>
                              <p className="text-[10px] text-gray-400 font-bold mt-1">Daftar Akun yang memiliki akses ke sistem bengkel</p>
                          </div>
                          <button 
                            onClick={() => setIsUserModalOpen(true)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                          >
                              <UserPlus size={16}/> DAFTARKAN USER
                          </button>
                      </div>
                      
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                              <thead className="bg-white border-b text-gray-400 uppercase text-[10px] font-black">
                                  <tr>
                                      <th className="px-6 py-4">Informasi User</th>
                                      <th className="px-6 py-4">Role Akses</th>
                                      <th className="px-6 py-4">Status</th>
                                      <th className="px-6 py-4 text-center">Aksi</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {systemUsers.map(u => (
                                      <tr key={u.uid} className="hover:bg-gray-50 transition-colors group">
                                          <td className="px-6 py-4">
                                              <div className="flex items-center gap-3">
                                                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">
                                                      {(u.displayName || 'U')[0].toUpperCase()}
                                                  </div>
                                                  <div>
                                                      <p className="font-bold text-gray-900 leading-none">{u.displayName || 'Tanpa Nama'}</p>
                                                      <p className="text-[10px] text-gray-400 font-mono mt-1">{u.email}</p>
                                                  </div>
                                              </div>
                                          </td>
                                          <td className="px-6 py-4">
                                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-tighter ${u.role === 'Manager' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                  {u.role || 'Staff'}
                                              </span>
                                          </td>
                                          <td className="px-6 py-4">
                                              <div className="flex items-center gap-1.5 text-emerald-600 font-black text-[10px]">
                                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                  ACTIVE
                                              </div>
                                          </td>
                                          <td className="px-6 py-4">
                                              <div className="flex justify-center gap-2">
                                                  <button 
                                                    onClick={() => handleResetPassword(u.email!)}
                                                    className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-100"
                                                    title="Reset Password (Kirim Email)"
                                                  >
                                                      <Key size={16}/>
                                                  </button>
                                                  <button 
                                                    onClick={() => handleDeleteUser(u.uid)}
                                                    className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Hapus Akses"
                                                  >
                                                      <Trash2 size={16}/>
                                                  </button>
                                              </div>
                                          </td>
                                      </tr>
                                  ))}
                                  {systemUsers.length === 0 && (
                                      <tr><td colSpan={4} className="p-12 text-center text-gray-400 italic">Memuat data user...</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'whatsapp' && (
              <div className={`space-y-6 ${restrictedClass}`}>
                  <RestrictedOverlay/>
                  <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                      <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2"><MessageSquare size={18}/> Konfigurasi Pesan</h3>
                      <div className="space-y-4">
                          <div><label className="block text-sm font-bold text-gray-700 mb-1">Template: Reminder Booking</label><textarea className="w-full p-2 border rounded text-sm" rows={2} value={localSettings.whatsappTemplates.bookingReminder} onChange={e => setLocalSettings(prev => ({ ...prev, whatsappTemplates: { ...prev.whatsappTemplates, bookingReminder: e.target.value } }))} /></div>
                          <div><label className="block text-sm font-bold text-gray-700 mb-1">Template: Follow Up (After Service)</label><textarea className="w-full p-2 border rounded text-sm" rows={2} value={localSettings.whatsappTemplates.afterService} onChange={e => setLocalSettings(prev => ({ ...prev, whatsappTemplates: { ...prev.whatsappTemplates, afterService: e.target.value } }))} /></div>
                          <div><label className="block text-sm font-bold text-gray-700 mb-1">Template: Unit Selesai (Ready)</label><textarea className="w-full p-2 border rounded text-sm" rows={2} value={localSettings.whatsappTemplates.readyForPickup} onChange={e => setLocalSettings(prev => ({ ...prev, whatsappTemplates: { ...prev.whatsappTemplates, readyForPickup: e.target.value } }))} /></div>
                      </div>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 mt-6">
                      <h3 className="font-bold text-indigo-800 mb-4 flex items-center gap-2"><ClipboardCheck size={18}/> Indikator Survey CSI / CSAT</h3>
                      <div className="bg-white p-4 rounded-lg border border-indigo-100">
                          <div className="flex justify-between items-center mb-4">
                              <p className="text-xs text-gray-500 font-medium">Poin-poin di bawah ini akan muncul saat CRC melakukan input hasil survey pelanggan.</p>
                              <button onClick={() => addItem('csiIndicators', '')} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-700"><Plus size={14}/> Tambah Poin</button>
                          </div>
                          <div className="space-y-2">
                              {(localSettings.csiIndicators || []).map((indicator, idx) => (
                                  <div key={idx} className="flex gap-2 group">
                                      <div className="flex-grow relative">
                                          <input type="text" placeholder="Contoh: Kualitas Hasil Cat..." className="w-full p-2.5 border border-gray-200 rounded-lg text-sm font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500" value={indicator} onChange={e => handleArrayChange('csiIndicators', idx, e.target.value)} />
                                          <span className="absolute right-3 top-2.5 text-[10px] font-black text-gray-300">#{idx+1}</span>
                                      </div>
                                      <button onClick={() => removeItem('csiIndicators', idx)} className="text-red-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18}/></button>
                                  </div>
                              ))}
                              {(localSettings.csiIndicators || []).length === 0 && <div className="text-center py-6 text-gray-400 italic text-sm">Belum ada indikator survey.</div>}
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* USER CREATION MODAL */}
      <Modal 
        isOpen={isUserModalOpen} 
        onClose={() => setIsUserModalOpen(false)} 
        title="Daftarkan User Baru"
      >
          <form onSubmit={handleCreateUser} className="space-y-5">
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3">
                  <Info className="text-amber-600 shrink-0 mt-0.5" size={18}/>
                  <div className="text-xs text-amber-800 leading-relaxed">
                      <strong>Catatan Penting:</strong> <br/>
                      Input ini mendaftarkan profil akses ke database bengkel. User harus melakukan registrasi/login menggunakan email yang sama di halaman login untuk mengaktifkan akun mereka.
                  </div>
              </div>

              <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Aktif *</label>
                  <input 
                    type="email" required 
                    value={userForm.email} 
                    onChange={e => setUserForm({...userForm, email: e.target.value})}
                    className="w-full p-3 bg-gray-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 font-bold"
                    placeholder="nama@mazdaranger.com"
                  />
              </div>

              <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nama Tampilan *</label>
                  <input 
                    type="text" required 
                    value={userForm.displayName} 
                    onChange={e => setUserForm({...userForm, displayName: e.target.value})}
                    className="w-full p-3 bg-gray-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 font-bold uppercase"
                    placeholder="Contoh: Admin Accounting"
                  />
              </div>

              <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Role Akses</label>
                  <select 
                    value={userForm.role} 
                    onChange={e => setUserForm({...userForm, role: e.target.value})}
                    className="w-full p-3 bg-gray-50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-100 font-black text-indigo-700"
                  >
                      {localSettings.roleOptions.map(role => (
                          <option key={role} value={role}>{role}</option>
                      ))}
                  </select>
              </div>

              <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsUserModalOpen(false)} className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-600 transition-colors">BATAL</button>
                  <button 
                    type="submit" disabled={isLoading}
                    className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 transform active:scale-95 disabled:opacity-50"
                  >
                      {isLoading ? <Loader2 className="animate-spin" size={20}/> : <><UserPlus size={20}/> SIMPAN USER</>}
                  </button>
              </div>
          </form>
      </Modal>
    </div>
  );
};

export default SettingsView;
