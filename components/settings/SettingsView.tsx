
import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, updateDoc, deleteDoc, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, SETTINGS_COLLECTION, SERVICES_MASTER_COLLECTION, USERS_COLLECTION } from '../../services/firebase';
import { Settings, UserPermissions, UserProfile, Supplier, ServiceMasterItem } from '../../types';
import { Save, Plus, Trash2, Building, Phone, Mail, Percent, Target, Calendar, User, Shield, CreditCard, MessageSquare, Database, Download, Upload, Layers, Edit2, Loader2, RefreshCw, AlertTriangle, ShieldCheck, Search, Info, Palette } from 'lucide-react';
import * as XLSX from 'xlsx';
import { mazdaColors } from '../../utils/constants';

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
  
  // State for Service Master
  const [services, setServices] = useState<ServiceMasterItem[]>([]);
  const [serviceForm, setServiceForm] = useState<Partial<ServiceMasterItem>>({ serviceCode: '', workType: 'KC', panelValue: 1.0 });
  const [isEditingService, setIsEditingService] = useState(false);

  useEffect(() => {
    setLocalSettings(currentSettings);
  }, [currentSettings]);

  useEffect(() => {
      if (activeTab === 'services') {
          loadServices();
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

  // Filtered Services based on search
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
    const arr = [...(localSettings[field] as any[])];
    arr[index] = value;
    setLocalSettings(prev => ({ ...prev, [field]: arr }));
  };

  const addItem = (field: keyof Settings, initialValue: any) => {
    const arr = [...(localSettings[field] as any[])];
    arr.push(initialValue);
    setLocalSettings(prev => ({ ...prev, [field]: arr }));
  };

  const removeItem = (field: keyof Settings, index: number) => {
    const arr = [...(localSettings[field] as any[])];
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

  const handleCleanupDuplicates = async () => {
      if (!isManager) return;
      setIsLoading(true);
      try {
          const seen = new Set<string>();
          const toDelete: string[] = [];
          
          const sorted = [...services].sort((a, b) => {
              const tA = a.createdAt?.seconds || 0;
              const tB = b.createdAt?.seconds || 0;
              return tA - tB;
          });

          for (const s of sorted) {
              const key = `${s.serviceName.trim().toLowerCase()}_${s.workType}`;
              if (seen.has(key)) {
                  toDelete.push(s.id);
              } else {
                  seen.add(key);
              }
          }

          if (toDelete.length === 0) {
              showNotification("Screening Selesai: Tidak ditemukan data duplikat.", "success");
              return;
          }

          if (window.confirm(`Ditemukan ${toDelete.length} data duplikat. Hapus data duplikat tersebut?`)) {
              for (const id of toDelete) {
                  await deleteDoc(doc(db, SERVICES_MASTER_COLLECTION, id));
              }
              showNotification(`Pembersihan Berhasil: ${toDelete.length} data duplikat telah dihapus.`, "success");
              loadServices();
          }
      } catch (e: any) {
          showNotification("Gagal melakukan screening: " + e.message, "error");
      } finally {
          setIsLoading(false);
      }
  };

  const handleSaveService = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isManager) return;
      
      const serviceName = serviceForm.serviceName?.trim() || '';
      const workType = serviceForm.workType || 'KC';

      if (!serviceName || !serviceForm.panelValue) {
          showNotification("Nama dan Nilai Panel wajib diisi.", "error");
          return;
      }

      const isDuplicate = services.some(s => 
          s.id !== serviceForm.id && 
          s.serviceName.trim().toLowerCase() === serviceName.toLowerCase() &&
          s.workType === workType
      );

      if (isDuplicate) {
          showNotification(`Gagal: Pekerjaan "${serviceName}" dengan jenis "${workType}" sudah ada.`, "error");
          return;
      }

      setIsLoading(true);
      try {
          const payload = {
              ...serviceForm,
              serviceName: serviceName,
              serviceCode: serviceForm.serviceCode?.toUpperCase() || ''
          };

          if (serviceForm.id) {
              await updateDoc(doc(db, SERVICES_MASTER_COLLECTION, serviceForm.id), payload);
              showNotification("Data Jasa diperbarui", "success");
          } else {
              await addDoc(collection(db, SERVICES_MASTER_COLLECTION), {
                  ...payload,
                  createdAt: serverTimestamp()
              });
              showNotification("Jasa baru ditambahkan", "success");
          }
          setServiceForm({ serviceCode: '', workType: 'KC', panelValue: 1.0 });
          setIsEditingService(false);
          loadServices();
      } catch (e: any) {
          showNotification("Gagal: " + e.message, "error");
      } finally {
          setIsLoading(false);
      }
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
      const sampleData = services.length > 0 ? services.map(s => [s.serviceCode || '', s.serviceName, s.workType, s.panelValue, s.basePrice]) : [
          ['EXT-01', 'Bumper Depan', 'KC', 1.0, 600000],
          ['BD-02', 'Pintu Depan Kanan', 'GTC', 1.0, 850000]
      ];
      
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
              const wsname = wb.SheetNames[0];
              const ws = wb.Sheets[wsname];
              const data = XLSX.utils.sheet_to_json(ws);
              
              let newCount = 0;
              let updateCount = 0;
              
              // Map existing for lookup
              const existingMap = new Map<string, ServiceMasterItem>();
              services.forEach(s => {
                  existingMap.set(`${s.serviceName.trim().toLowerCase()}_${s.workType}`, s);
              });

              for (const row of data as any[]) {
                  const serviceName = (row['Nama Jasa'] || row['nama jasa'] || row['Service Name'] || '').toString().trim();
                  const workType = (row['Jenis Pekerjaan (KC/GTC/BP)'] || row['Jenis'] || 'KC').toString().trim().toUpperCase();
                  
                  if (serviceName) {
                      const key = `${serviceName.toLowerCase()}_${workType}`;
                      const existing = existingMap.get(key);

                      const itemData = {
                          serviceCode: String(row['Kode Jasa'] || row['Kode'] || row['Code'] || '').toUpperCase(),
                          serviceName: serviceName,
                          workType: workType as any,
                          panelValue: Number(row['Nilai Panel'] || row['Panel'] || 0),
                          basePrice: Number(row['Harga Dasar'] || row['Harga'] || 0),
                      };

                      if (existing) {
                          // UPDATE LOGIC (Upsert)
                          await updateDoc(doc(db, SERVICES_MASTER_COLLECTION, existing.id), {
                              ...itemData,
                              updatedAt: serverTimestamp()
                          });
                          updateCount++;
                      } else {
                          // INSERT LOGIC
                          await addDoc(collection(db, SERVICES_MASTER_COLLECTION), {
                              ...itemData,
                              createdAt: serverTimestamp()
                          });
                          newCount++;
                      }
                  }
              }
              
              showNotification(`Selesai: ${newCount} data baru, ${updateCount} harga/data diperbarui.`, "success");
              loadServices();
          } catch (err: any) {
              console.error(err);
              showNotification("Gagal import: " + err.message, "error");
          } finally {
              setIsLoading(false);
              e.target.value = '';
          }
      };
      reader.readAsBinaryString(file);
  };

  const RestrictedOverlay = () => (
      !isManager ? (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
              <div className="bg-white p-4 rounded-lg shadow-lg border border-red-100 flex items-center gap-3">
                  <Shield className="text-red-500" size={24}/>
                  <div>
                      <p className="font-bold text-gray-800">Akses Terbatas</p>
                      <p className="text-xs text-gray-500">Hanya Manager yang dapat mengubah pengaturan ini.</p>
                  </div>
              </div>
          </div>
      ) : null
  );

  const restrictedClass = !isManager ? "pointer-events-none opacity-80 relative" : "relative";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Pengaturan Sistem</h1>
          <button 
            onClick={saveSettings} 
            disabled={isLoading || !isManager}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 shadow-lg font-bold disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
            Simpan Perubahan
          </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-x-auto">
          {['general', 'database', 'whatsapp', 'services'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 text-sm font-bold capitalize transition-colors border-b-2 flex-shrink-0 ${activeTab === tab ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                  {tab === 'general' && 'Bengkel & Target'}
                  {tab === 'database' && 'Data Master'}
                  {tab === 'whatsapp' && 'WhatsApp & Pesan'}
                  {tab === 'services' && 'Master Jasa & Panel'}
              </button>
          ))}
      </div>

      <div className="bg-white p-6 rounded-b-xl border border-t-0 border-gray-200 shadow-sm relative min-h-[500px]">
          
          {/* MASTER SERVICES TAB */}
          {activeTab === 'services' && (
              <div className="space-y-8 animate-fade-in">
                  <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 ${restrictedClass}`}>
                    <RestrictedOverlay />
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                            <h3 className="text-lg font-bold text-gray-800">Daftar Master Jasa (Standar Panel)</h3>
                            <div className="flex flex-wrap gap-2">
                                <button 
                                    onClick={handleCleanupDuplicates}
                                    className="flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1.5 rounded border border-amber-200 hover:bg-amber-100 text-xs font-bold"
                                    title="Hapus duplikasi Nama+Jenis"
                                >
                                    <ShieldCheck size={14}/> Cleanup
                                </button>
                                <button 
                                    onClick={handleDownloadServiceTemplate} 
                                    className="flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-200 text-xs font-bold"
                                    title="Export data untuk diedit harganya"
                                >
                                    <Download size={14}/> Template/Export
                                </button>
                                <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100 text-xs font-bold">
                                    <Upload size={14}/> Import & Update
                                    <input disabled={!isManager} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleImportServices} />
                                </label>
                            </div>
                        </div>

                        {/* SEARCH BAR */}
                        <div className="mb-4 relative group">
                            <Search className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18}/>
                            <input 
                                type="text" 
                                placeholder="Cari Nama Pekerjaan atau Kode..." 
                                value={serviceSearchQuery}
                                onChange={e => setServiceSearchQuery(e.target.value)}
                                className="w-full pl-10 p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                            />
                        </div>
                        
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2 mb-4">
                            <Info size={16} className="text-blue-600 mt-0.5"/>
                            <div className="text-[11px] text-blue-700 leading-relaxed font-medium">
                                <p><strong>Tips Update Massal:</strong> Download template/data jasa, edit harga pada Excel, lalu upload kembali. Sistem akan otomatis memperbarui harga pada item yang cocok.</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 uppercase sticky top-0 z-20">
                                    <tr>
                                        <th className="px-4 py-3">Kode</th>
                                        <th className="px-4 py-3">Nama Pekerjaan</th>
                                        <th className="px-4 py-3">Jenis</th>
                                        <th className="px-4 py-3 text-center">Panel</th>
                                        <th className="px-4 py-3 text-right">Harga Dasar</th>
                                        <th className="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredServices.map(s => (
                                        <tr key={s.id} className="hover:bg-gray-50 group">
                                            <td className="px-4 py-2 font-mono text-xs font-bold text-gray-400 group-hover:text-indigo-600">{s.serviceCode || '-'}</td>
                                            <td className="px-4 py-2 font-bold text-gray-700 uppercase tracking-tight">{s.serviceName}</td>
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                                    s.workType === 'KC' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                                                    s.workType === 'GTC' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    'bg-gray-50 text-gray-600 border-gray-200'
                                                }`}>
                                                    {s.workType}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-center font-black text-gray-900">{s.panelValue}</td>
                                            <td className="px-4 py-2 text-right font-black text-emerald-600">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(s.basePrice)}</td>
                                            <td className="px-4 py-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button disabled={!isManager} onClick={() => { setServiceForm(s); setIsEditingService(true); }} className="text-indigo-500 hover:text-indigo-700 bg-white p-1 rounded border shadow-sm"><Edit2 size={14}/></button>
                                                <button disabled={!isManager} onClick={() => handleDeleteService(s.id)} className="text-red-500 hover:text-red-700 bg-white p-1 rounded border shadow-sm"><Trash2 size={14}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredServices.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="text-center py-20 text-gray-400 italic">
                                                {serviceSearchQuery ? `Data "${serviceSearchQuery}" tidak ditemukan.` : 'Belum ada data master jasa.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit flex flex-col sticky top-4">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Layers className="text-indigo-600" size={20}/> {isEditingService ? 'Edit Jasa' : 'Input Jasa Baru'}
                        </h3>
                        <form onSubmit={handleSaveService} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Kode Jasa</label>
                                <input disabled={!isManager} type="text" value={serviceForm.serviceCode || ''} onChange={e => setServiceForm({...serviceForm, serviceCode: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-mono uppercase font-bold text-indigo-900" placeholder="EXT-01"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nama Pekerjaan *</label>
                                <input disabled={!isManager} required type="text" value={serviceForm.serviceName || ''} onChange={e => setServiceForm({...serviceForm, serviceName: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold" placeholder="Bumper Depan"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Jenis Pekerjaan</label>
                                <select disabled={!isManager} value={serviceForm.workType || 'KC'} onChange={e => setServiceForm({...serviceForm, workType: e.target.value as any})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-bold">
                                    <option value="KC">Ketok & Cat (KC)</option>
                                    <option value="GTC">Ganti & Cat (GTC)</option>
                                    <option value="BP">Bongkar Pasang (BP)</option>
                                    <option value="Lainnya">Lainnya</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nilai Panel</label>
                                    <input disabled={!isManager} type="number" step="0.1" value={serviceForm.panelValue || 0} onChange={e => setServiceForm({...serviceForm, panelValue: Number(e.target.value)})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-black text-indigo-900"/>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Harga Dasar</label>
                                    <input disabled={!isManager} type="number" value={serviceForm.basePrice || 0} onChange={e => setServiceForm({...serviceForm, basePrice: Number(e.target.value)})} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-50 font-black text-emerald-600"/>
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                {isEditingService && <button disabled={!isManager} type="button" onClick={() => { setServiceForm({serviceCode: '', workType: 'KC', panelValue: 1.0}); setIsEditingService(false); }} className="w-1/3 bg-gray-100 text-gray-600 py-3 rounded-xl hover:bg-gray-200 font-bold transition-all">Batal</button>}
                                <button disabled={isLoading || !isManager} type="submit" className="flex-grow bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 shadow-lg font-black tracking-wide transition-all transform active:scale-95">{isLoading ? 'Proses...' : (isEditingService ? 'UPDATE DATA' : 'SIMPAN DATA')}</button>
                            </div>
                        </form>
                    </div>
                  </div>

                  {/* SPECIAL COLOR RATES MANAGEMENT */}
                  <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 ${restrictedClass}`}>
                      <RestrictedOverlay />
                      <div className="flex items-center gap-3 mb-6 border-b pb-4">
                          <div className="p-2 bg-rose-100 text-rose-600 rounded-lg"><Palette size={24}/></div>
                          <div>
                              <h3 className="text-lg font-bold text-gray-800">Manajemen Warna Spesial (Premium)</h3>
                              <p className="text-xs text-gray-500 font-medium italic">Sistem otomatis menambahkan surcharge ke harga dasar saat item jasa diinput di WO.</p>
                          </div>
                          <button 
                              onClick={() => addItem('specialColorRates', { colorName: '', surchargePerPanel: 0 })}
                              className="ml-auto flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-rose-700 transition-all"
                          >
                              <Plus size={16}/> Tambah Warna Spesial
                          </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {(localSettings.specialColorRates || []).map((rate, idx) => (
                              <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-200 relative group transition-all hover:border-rose-300 hover:bg-rose-50/30">
                                  <div className="space-y-4">
                                      <div>
                                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pilih / Nama Warna</label>
                                          <select 
                                              value={rate.colorName} 
                                              onChange={e => {
                                                  const newRates = [...(localSettings.specialColorRates || [])];
                                                  newRates[idx] = { ...rate, colorName: e.target.value };
                                                  setLocalSettings(prev => ({ ...prev, specialColorRates: newRates }));
                                              }}
                                              className="w-full p-2.5 bg-white border border-gray-200 rounded-lg font-bold text-xs focus:ring-2 focus:ring-rose-500"
                                          >
                                              <option value="">-- Pilih Warna --</option>
                                              {mazdaColors.map(c => <option key={c} value={c}>{c}</option>)}
                                              <option value="Custom">Manual Input...</option>
                                          </select>
                                          {rate.colorName === 'Custom' && (
                                              <input 
                                                  type="text" 
                                                  placeholder="Nama Warna Kustom..." 
                                                  className="mt-2 w-full p-2.5 bg-white border border-gray-200 rounded-lg font-bold text-xs"
                                                  onChange={e => {
                                                      const newRates = [...(localSettings.specialColorRates || [])];
                                                      newRates[idx] = { ...rate, colorName: e.target.value };
                                                      setLocalSettings(prev => ({ ...prev, specialColorRates: newRates }));
                                                  }}
                                              />
                                          )}
                                      </div>
                                      <div>
                                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Surcharge (Per 1.0 Panel)</label>
                                          <div className="relative">
                                              <span className="absolute left-2.5 top-2.5 text-rose-500 font-bold text-xs">Rp</span>
                                              <input 
                                                  type="number" 
                                                  value={rate.surchargePerPanel}
                                                  onChange={e => {
                                                      const newRates = [...(localSettings.specialColorRates || [])];
                                                      newRates[idx] = { ...rate, surchargePerPanel: Number(e.target.value) };
                                                      setLocalSettings(prev => ({ ...prev, specialColorRates: newRates }));
                                                  }}
                                                  className="w-full pl-8 p-2.5 bg-white border border-gray-200 rounded-lg font-black text-rose-600 text-sm"
                                              />
                                          </div>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={() => removeItem('specialColorRates', idx)}
                                      className="absolute -top-2 -right-2 p-1.5 bg-white border border-red-200 text-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                  >
                                      <Trash2 size={14}/>
                                  </button>
                              </div>
                          ))}
                          {(localSettings.specialColorRates || []).length === 0 && (
                              <div className="col-span-full py-10 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 italic text-sm">
                                  <Palette size={32} className="mb-2 opacity-20"/>
                                  Belum ada aturan warna spesial.
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          )}
          
          {/* TAB CONTENT OTHERS - STAY AS IS (SKIP FOR BREVITY) */}
          {activeTab === 'general' && (
              <div className={`space-y-8 ${restrictedClass}`}>
                  <RestrictedOverlay/>
                  
                  <section>
                      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Building className="text-indigo-500"/> Informasi Bengkel</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <label className="block text-sm font-medium mb-1">Nama Bengkel</label>
                              <input type="text" className="w-full p-2 border rounded" value={localSettings.workshopName} onChange={e => handleChange('workshopName', e.target.value)} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Email</label>
                              <input type="email" className="w-full p-2 border rounded" value={localSettings.workshopEmail} onChange={e => handleChange('workshopEmail', e.target.value)} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Nomor Telepon</label>
                              <input type="text" className="w-full p-2 border rounded" value={localSettings.workshopPhone} onChange={e => handleChange('workshopPhone', e.target.value)} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Alamat Lengkap</label>
                              <textarea className="w-full p-2 border rounded" rows={2} value={localSettings.workshopAddress} onChange={e => handleChange('workshopAddress', e.target.value)} />
                          </div>
                      </div>
                  </section>

                  <section>
                      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Target className="text-red-500"/> Target & Pajak</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                              <label className="block text-sm font-medium mb-1">PPN (%)</label>
                              <div className="relative">
                                  <input type="number" className="w-full p-2 border rounded pl-8" value={localSettings.ppnPercentage} onChange={e => handleChange('ppnPercentage', Number(e.target.value))} />
                                  <Percent size={14} className="absolute left-3 top-3 text-gray-400"/>
                              </div>
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Target Bulanan (Rp)</label>
                              <input type="number" className="w-full p-2 border rounded" value={localSettings.monthlyTarget} onChange={e => handleChange('monthlyTarget', Number(e.target.value))} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium mb-1">Target Mingguan (Rp)</label>
                              <input type="number" className="w-full p-2 border rounded" value={localSettings.weeklyTarget} onChange={e => handleChange('weeklyTarget', Number(e.target.value))} />
                          </div>
                      </div>
                  </section>
              </div>
          )}

          {activeTab === 'database' && (
              <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 ${restrictedClass}`}>
                  <RestrictedOverlay/>
                  
                  {/* MEKANIK LIST */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                          <h4 className="font-bold text-gray-700 flex items-center gap-2"><User size={16}/> Daftar Mekanik</h4>
                          <button onClick={() => addItem('mechanicNames', '')} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200"><Plus size={12}/> Tambah</button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                          {localSettings.mechanicNames.map((mech, idx) => (
                              <div key={idx} className="flex gap-2">
                                  <input type="text" className="flex-grow p-1.5 border rounded text-sm" value={mech} onChange={e => handleArrayChange('mechanicNames', idx, e.target.value)} />
                                  <button onClick={() => removeItem('mechanicNames', idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* SA LIST */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                          <h4 className="font-bold text-gray-700 flex items-center gap-2"><User size={16}/> Service Advisor (SA)</h4>
                          <button onClick={() => addItem('serviceAdvisors', '')} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200"><Plus size={12}/> Tambah</button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                          {localSettings.serviceAdvisors.map((sa, idx) => (
                              <div key={idx} className="flex gap-2">
                                  <input type="text" className="flex-grow p-1.5 border rounded text-sm" value={sa} onChange={e => handleArrayChange('serviceAdvisors', idx, e.target.value)} />
                                  <button onClick={() => removeItem('serviceAdvisors', idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* INSURANCE LIST */}
                  <div className="lg:col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                          <h4 className="font-bold text-gray-700 flex items-center gap-2"><Shield size={16}/> Rekanan Asuransi & Diskon Default</h4>
                          <button onClick={() => addItem('insuranceOptions', {name: '', jasa: 0, part: 0})} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200"><Plus size={12}/> Tambah</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {localSettings.insuranceOptions.map((ins, idx) => (
                              <div key={idx} className="bg-white p-3 rounded border flex flex-col gap-2 relative group">
                                  <input type="text" placeholder="Nama Asuransi" className="font-bold text-sm border-b p-1" value={ins.name} onChange={e => {
                                      const newArr = [...localSettings.insuranceOptions];
                                      newArr[idx] = { ...ins, name: e.target.value };
                                      setLocalSettings(prev => ({ ...prev, insuranceOptions: newArr }));
                                  }} />
                                  <div className="flex gap-2 text-xs">
                                      <div className="flex-1">
                                          <label className="text-gray-500 block">Disc Jasa %</label>
                                          <input type="number" className="w-full bg-gray-50 rounded p-1" value={ins.jasa} onChange={e => {
                                              const newArr = [...localSettings.insuranceOptions];
                                              newArr[idx] = { ...ins, jasa: Number(e.target.value) };
                                              setLocalSettings(prev => ({ ...prev, insuranceOptions: newArr }));
                                          }} />
                                      </div>
                                      <div className="flex-1">
                                          <label className="text-gray-500 block">Disc Part %</label>
                                          <input type="number" className="w-full bg-gray-50 rounded p-1" value={ins.part} onChange={e => {
                                              const newArr = [...localSettings.insuranceOptions];
                                              newArr[idx] = { ...ins, part: Number(e.target.value) };
                                              setLocalSettings(prev => ({ ...prev, insuranceOptions: newArr }));
                                          }} />
                                      </div>
                                  </div>
                                  <button onClick={() => removeItem('insuranceOptions', idx)} className="absolute top-2 right-2 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                              </div>
                          ))}
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
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Template: Reminder Booking</label>
                              <textarea className="w-full p-2 border rounded text-sm" rows={2} value={localSettings.whatsappTemplates.bookingReminder} onChange={e => setLocalSettings(prev => ({ ...prev, whatsappTemplates: { ...prev.whatsappTemplates, bookingReminder: e.target.value } }))} />
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Template: Follow Up (After Service)</label>
                              <textarea className="w-full p-2 border rounded text-sm" rows={2} value={localSettings.whatsappTemplates.afterService} onChange={e => setLocalSettings(prev => ({ ...prev, whatsappTemplates: { ...prev.whatsappTemplates, afterService: e.target.value } }))} />
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Template: Unit Selesai (Ready)</label>
                              <textarea className="w-full p-2 border rounded text-sm" rows={2} value={localSettings.whatsappTemplates.readyForPickup} onChange={e => setLocalSettings(prev => ({ ...prev, whatsappTemplates: { ...prev.whatsappTemplates, readyForPickup: e.target.value } }))} />
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default SettingsView;
