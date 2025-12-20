
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Job, EstimateData, Settings, InventoryItem, EstimateItem, ServiceMasterItem, InsuranceLog } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { 
    Save, Plus, Trash2, Calculator, Printer, Lock, X, MessageSquare, 
    Activity, Palette, Search, Package, Box, Tag, AlertCircle, 
    CheckCircle2, ChevronRight, Hash, Layers, MapPin, UserCheck
} from 'lucide-react';
import { generateEstimationPDF } from '../../utils/pdfGenerator';
import { collection, getDocs, query, orderBy, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, SERVICES_MASTER_COLLECTION, SERVICE_JOBS_COLLECTION } from '../../services/firebase';

interface EstimateEditorProps {
  job: Job;
  ppnPercentage: number;
  insuranceOptions: { name: string; jasa: number; part: number }[];
  onSave: (jobId: string, data: EstimateData, saveType: 'estimate' | 'wo') => Promise<string>;
  onCancel: () => void;
  settings: Settings;
  creatorName: string;
  inventoryItems: InventoryItem[];
  showNotification: (msg: string, type: string) => void;
}

const EstimateEditor: React.FC<EstimateEditorProps> = ({ 
  job, ppnPercentage, insuranceOptions, onSave, onCancel, settings, creatorName, inventoryItems, showNotification 
}) => {
  const [jasaItems, setJasaItems] = useState<EstimateItem[]>(job.estimateData?.jasaItems || []);
  const [partItems, setPartItems] = useState<EstimateItem[]>(job.estimateData?.partItems || []);
  
  const [discountJasa, setDiscountJasa] = useState(job.estimateData?.discountJasa || 0);
  const [discountPart, setDiscountPart] = useState(job.estimateData?.discountPart || 0);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceMasterList, setServiceMasterList] = useState<ServiceMasterItem[]>([]);

  // Search Picker State
  const [activeSearch, setActiveSearch] = useState<{ type: 'jasa' | 'part', index: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  // Status & Position Local State
  const [currentStatus, setCurrentStatus] = useState(job.statusKendaraan);
  const [currentPosisi, setCurrentPosisi] = useState(job.posisiKendaraan || 'Di Bengkel');

  // Detect special color surcharge
  const specialColorRate = useMemo(() => {
      return (settings.specialColorRates || []).find(r => r.colorName === job.warnaMobil);
  }, [job.warnaMobil, settings.specialColorRates]);

  const [newLogNote, setNewLogNote] = useState('');
  const isLocked = job.isClosed;

  useEffect(() => {
      if (!job.estimateData && job.namaAsuransi) {
          const ins = insuranceOptions.find(i => i.name === job.namaAsuransi);
          if (ins) {
              setDiscountJasa(ins.jasa);
              setDiscountPart(ins.part);
          }
      }
      loadServices();
  }, [job.namaAsuransi, insuranceOptions, job.estimateData]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
              setActiveSearch(null);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadServices = async () => {
      try {
          const q = query(collection(db, SERVICES_MASTER_COLLECTION), orderBy('serviceName'));
          const snap = await getDocs(q);
          setServiceMasterList(snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceMasterItem)));
      } catch (e) { console.error(e); }
  };

  const handleUpdateCheckIn = async (field: 'statusKendaraan' | 'posisiKendaraan', value: string) => {
      if (isLocked) return;
      try {
          if (field === 'statusKendaraan') setCurrentStatus(value);
          if (field === 'posisiKendaraan') setCurrentPosisi(value);

          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
              [field]: value, 
              updatedAt: serverTimestamp() 
          });
          showNotification(`Update ${field === 'posisiKendaraan' ? 'Posisi Unit' : 'Status Control'} Berhasil`, "success");
      } catch (e) {
          showNotification("Gagal update status", "error");
      }
  };

  const calculateFinalServicePrice = (basePrice: number, panelValue: number) => {
      if (!specialColorRate) return basePrice;
      const surcharge = Math.round(panelValue * specialColorRate.surchargePerPanel);
      return basePrice + surcharge;
  };

  const addItem = (type: 'jasa' | 'part') => {
    if (isLocked) return;
    const newItem: EstimateItem = type === 'jasa' ? { name: '', price: 0, workType: 'KC' } : { name: '', price: 0, qty: 1, number: '' };
    if (type === 'jasa') setJasaItems([...jasaItems, newItem]);
    else setPartItems([...partItems, newItem]);
  };

  const selectService = (index: number, service: ServiceMasterItem) => {
      const newItems = [...jasaItems];
      newItems[index] = {
          ...newItems[index],
          number: service.serviceCode || '',
          name: service.serviceName,
          panelCount: service.panelValue,
          workType: service.workType,
          price: calculateFinalServicePrice(service.basePrice, service.panelValue)
      };
      setJasaItems(newItems);
      setActiveSearch(null);
  };

  const selectPart = (index: number, part: InventoryItem) => {
      const newItems = [...partItems];
      newItems[index] = {
          ...newItems[index],
          number: part.code,
          name: part.name,
          price: part.sellPrice,
          inventoryId: part.id,
          qty: newItems[index].qty || 1
      };
      setPartItems(newItems);
      setActiveSearch(null);
  };

  const updateItemRaw = (type: 'jasa' | 'part', index: number, field: keyof EstimateItem, value: any) => {
    if (isLocked) return;
    const items = type === 'jasa' ? [...jasaItems] : [...partItems];
    items[index] = { ...items[index], [field]: value };
    type === 'jasa' ? setJasaItems(items) : setPartItems(items);
  };

  const removeItem = (type: 'jasa' | 'part', index: number) => {
    if (isLocked) return;
    type === 'jasa' ? setJasaItems(jasaItems.filter((_, i) => i !== index)) : setPartItems(partItems.filter((_, i) => i !== index));
  };

  const filteredServices = useMemo(() => {
      if (!searchQuery) return serviceMasterList.slice(0, 10);
      const q = searchQuery.toLowerCase();
      return serviceMasterList.filter(s => 
          s.serviceName.toLowerCase().includes(q) || 
          (s.serviceCode && s.serviceCode.toLowerCase().includes(q))
      ).slice(0, 15);
  }, [serviceMasterList, searchQuery]);

  const filteredParts = useMemo(() => {
      if (!searchQuery) return inventoryItems.filter(i => i.category === 'sparepart').slice(0, 10);
      const q = searchQuery.toLowerCase();
      return inventoryItems.filter(i => 
          i.category === 'sparepart' && (
            i.name.toLowerCase().includes(q) || 
            (i.code && i.code.toLowerCase().includes(q))
          )
      ).slice(0, 15);
  }, [inventoryItems, searchQuery]);

  const prepareEstimateData = (estimationNumber?: string): EstimateData => {
      const subtotalJasa = jasaItems.reduce((acc, i) => acc + (Number(i.price) || 0), 0);
      const subtotalPart = partItems.reduce((acc, i) => acc + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0);
      const discountJasaAmount = Math.round((subtotalJasa * discountJasa) / 100);
      const discountPartAmount = Math.round((subtotalPart * discountPart) / 100);
      const dpp = (subtotalJasa - discountJasaAmount) + (subtotalPart - discountPartAmount);
      const ppnAmount = Math.round(dpp * (ppnPercentage / 100));
      const grandTotal = dpp + ppnAmount;

      return {
          estimationNumber: estimationNumber || job.estimateData?.estimationNumber,
          grandTotal, jasaItems, partItems,
          discountJasa, discountPart, discountJasaAmount, discountPartAmount,
          ppnAmount, subtotalJasa, subtotalPart, estimatorName: creatorName
      };
  };

  const totals = prepareEstimateData();

  const handleSaveAction = async (saveType: 'estimate' | 'wo') => {
      setIsSubmitting(true);
      try {
          const data = prepareEstimateData();
          // onSave returns the new WO Number or Estimation Number
          const resultNumber = await onSave(job.id, data, saveType);
          
          // AUTO DOWNLOAD TRIGGER: If it's a Work Order save/update, generate PDF immediately
          if (saveType === 'wo' && resultNumber) {
              const finalJobForPdf = { ...job, woNumber: resultNumber };
              const finalDataForPdf = { ...data, estimationNumber: resultNumber };
              generateEstimationPDF(finalJobForPdf, finalDataForPdf, settings, creatorName);
          }
      } catch (e) { 
          console.error(e); 
          showNotification("Gagal menyimpan data", "error");
      } finally { 
          setIsSubmitting(false); 
      }
  };

  return (
    <div className="space-y-6">
      {/* CHECK-IN & STATUS CONTROL CENTER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-indigo-100 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row gap-6 items-center">
              <div className="shrink-0 flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md"><UserCheck size={24}/></div>
                  <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">SA Check-In Control</h4>
                      <p className="text-[10px] text-indigo-500 font-bold">Penentuan Lokasi Unit & Alur Admin</p>
                  </div>
              </div>

              <div className="h-10 w-px bg-gray-100 hidden md:block"></div>

              <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  {/* FISIK CONTROL */}
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1">
                          <MapPin size={10}/> Posisi Fisik Unit
                      </label>
                      <div className="flex bg-gray-100 p-1 rounded-xl">
                          <button 
                            type="button"
                            onClick={() => handleUpdateCheckIn('posisiKendaraan', 'Di Bengkel')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${currentPosisi === 'Di Bengkel' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                              INAP (BENGKEL)
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleUpdateCheckIn('posisiKendaraan', 'Di Pemilik')}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${currentPosisi === 'Di Pemilik' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                              BAWA PULANG
                          </button>
                      </div>
                  </div>

                  {/* STATUS CONTROL */}
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1">
                          <Activity size={10}/> Status Administrasi
                      </label>
                      <select 
                        value={currentStatus} 
                        onChange={e => handleUpdateCheckIn('statusKendaraan', e.target.value)}
                        className="w-full p-2 bg-indigo-50 border-none rounded-xl text-xs font-black text-indigo-700 focus:ring-2 ring-indigo-200"
                      >
                          {settings.statusKendaraanOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                  </div>
              </div>
          </div>

          <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm flex items-center justify-between">
              {specialColorRate ? (
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-rose-600 text-white rounded-xl animate-pulse"><Palette size={20}/></div>
                      <div>
                          <p className="text-[10px] font-black text-rose-400 uppercase">Premium Color</p>
                          <p className="text-xs font-black text-rose-900 truncate max-w-[120px]">{job.warnaMobil}</p>
                          <p className="text-[9px] text-rose-500 font-bold">Auto-Surcharge Active</p>
                      </div>
                  </div>
              ) : (
                  <div className="flex items-center gap-3 opacity-40">
                      <div className="p-2 bg-gray-200 text-gray-500 rounded-xl"><Palette size={20}/></div>
                      <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase">Standard Color</p>
                          <p className="text-xs font-black text-gray-600">{job.warnaMobil}</p>
                      </div>
                  </div>
              )}
              {job.namaAsuransi !== 'Umum / Pribadi' && (
                  <div className="text-right">
                      <button 
                        onClick={() => {
                            const note = prompt("Catatan Log Negosiasi:");
                            if (note) {
                                const newLog: InsuranceLog = { date: new Date().toISOString(), user: creatorName, note };
                                updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { insuranceNegotiationLog: arrayUnion(newLog) });
                                showNotification("Log negosiasi ditambahkan", "success");
                            }
                        }}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Tambah Log Negosiasi"
                      >
                          <MessageSquare size={20}/>
                      </button>
                  </div>
              )}
          </div>
      </div>

      {isLocked && (<div className="bg-red-50 p-3 rounded flex items-center gap-2 text-red-700 font-bold"><Lock size={18}/> WO ini terkunci (Closed).</div>)}

      {/* JASA SECTION */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                  <h4 className="font-black text-gray-800 tracking-tight">A. JASA PERBAIKAN</h4>
                  {specialColorRate && <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-black border border-rose-200">PREMIUM COLOR AUTO-PRICE</span>}
              </div>
              <button onClick={() => addItem('jasa')} disabled={isLocked} className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-xl font-black hover:bg-indigo-100 disabled:opacity-50 transition-all active:scale-95"><Plus size={16}/> TAMBAH JASA</button>
          </div>
          
          <div className="overflow-x-visible">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                  <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <th className="px-4 py-2 w-10 text-center">No</th>
                          <th className="px-4 py-2 w-32">Kode</th>
                          <th className="px-4 py-2 w-16 text-center">Jenis</th>
                          <th className="px-4 py-2">Nama Pekerjaan</th>
                          <th className="px-4 py-2 w-16 text-center">Panel</th>
                          <th className="px-4 py-2 w-40 text-right">Biaya (Final)</th>
                          <th className="px-4 py-2 w-10"></th>
                      </tr>
                  </thead>
                  <tbody>
                      {jasaItems.map((item, i) => (
                          <tr key={i} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-center text-gray-400 font-bold bg-gray-50/50 rounded-l-xl border-y border-l border-gray-100">{i+1}</td>
                              <td className="px-4 py-3 relative border-y border-gray-100">
                                  <div className="relative group/input">
                                      <input 
                                        type="text" 
                                        value={item.number || ''} 
                                        onFocus={() => { setActiveSearch({ type: 'jasa', index: i }); setSearchQuery(item.number || ''); }}
                                        onChange={e => { setSearchQuery(e.target.value); updateItemRaw('jasa', i, 'number', e.target.value); }}
                                        className="w-full p-2 bg-gray-50 border-none rounded-lg uppercase font-mono text-xs font-bold focus:ring-2 ring-indigo-500 transition-all" 
                                        placeholder="CARI..." 
                                        disabled={isLocked}
                                      />
                                  </div>
                              </td>
                              <td className="px-4 py-3 text-center border-y border-gray-100">
                                  <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-black border ${item.workType === 'KC' ? 'bg-orange-50 text-orange-600 border-orange-200' : item.workType === 'GTC' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                      {item.workType || '-'}
                                  </span>
                              </td>
                              <td className="px-4 py-3 relative border-y border-gray-100">
                                  <div className="relative">
                                      <input 
                                        type="text" 
                                        value={item.name} 
                                        onFocus={() => { setActiveSearch({ type: 'jasa', index: i }); setSearchQuery(item.name); }}
                                        onChange={e => { setSearchQuery(e.target.value); updateItemRaw('jasa', i, 'name', e.target.value); }}
                                        className="w-full p-2 bg-gray-50 border-none rounded-lg font-bold text-gray-700 focus:ring-2 ring-indigo-500 transition-all" 
                                        placeholder="KETIK NAMA PEKERJAAN..." 
                                        disabled={isLocked}
                                      />
                                      {activeSearch?.type === 'jasa' && activeSearch.index === i && (
                                          <div ref={searchRef} className="absolute left-0 top-full mt-2 w-[450px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-gray-200 z-[999] max-h-[400px] overflow-y-auto animate-pop-in scrollbar-thin">
                                              <div className="p-3 bg-indigo-900 text-white flex items-center gap-2 sticky top-0 z-10">
                                                  <Layers size={14}/>
                                                  <span className="text-[10px] font-black uppercase tracking-widest">Master Katalog Jasa</span>
                                              </div>
                                              {filteredServices.length > 0 ? filteredServices.map(s => (
                                                  <div 
                                                    key={s.id} 
                                                    onClick={() => selectService(i, s)}
                                                    className="p-4 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 transition-colors flex items-center justify-between group/item"
                                                  >
                                                      <div className="flex flex-col gap-1">
                                                          <div className="flex items-center gap-2">
                                                              <span className="font-black text-xs text-indigo-600 font-mono tracking-tighter bg-indigo-50 px-1.5 py-0.5 rounded">{s.serviceCode || 'NO-CODE'}</span>
                                                              <span className={`px-2 py-0.5 rounded-[4px] text-[9px] font-black border ${s.workType === 'KC' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>{s.workType}</span>
                                                          </div>
                                                          <span className="text-sm font-bold text-gray-800 uppercase leading-tight group-hover/item:text-indigo-700">{s.serviceName}</span>
                                                      </div>
                                                      <div className="text-right flex flex-col items-end">
                                                          <div className="flex items-center gap-1 text-[10px] font-black text-gray-400 mb-1">
                                                              <Hash size={10}/> {s.panelValue} PANEL
                                                          </div>
                                                          <div className="text-sm font-black text-emerald-600">
                                                              {formatCurrency(calculateFinalServicePrice(s.basePrice, s.panelValue))}
                                                          </div>
                                                      </div>
                                                  </div>
                                              )) : (
                                                  <div className="p-10 text-center flex flex-col items-center gap-3">
                                                      <Search size={32} className="text-gray-200"/>
                                                      <p className="text-gray-400 text-xs italic font-medium">Data tidak ditemukan dalam database.</p>
                                                  </div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              </td>
                              <td className="px-4 py-3 text-center border-y border-gray-100">
                                  <div className="bg-white border-2 border-gray-100 rounded-lg py-1 px-3 font-black text-gray-900 text-xs inline-block">
                                      {item.panelCount || 0}
                                  </div>
                              </td>
                              <td className="px-4 py-3 text-right border-y border-gray-100">
                                  <input 
                                    type="number" 
                                    value={item.price} 
                                    onChange={e => updateItemRaw('jasa', i, 'price', Number(e.target.value))} 
                                    className={`w-full p-2 bg-gray-50 border-none rounded-lg text-right font-black ${specialColorRate ? 'text-rose-600' : 'text-indigo-900'} focus:ring-2 ring-indigo-500`} 
                                    disabled={isLocked}
                                  />
                              </td>
                              <td className="px-4 py-3 text-center bg-gray-50/50 border-y border-r border-gray-100 rounded-r-xl">
                                  <button onClick={() => removeItem('jasa', i)} disabled={isLocked} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30"><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          <div className="flex justify-end items-center gap-4 mt-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Diskon Jasa (%)</span>
                  <input type="number" value={discountJasa} onChange={e => setDiscountJasa(Number(e.target.value))} className="w-20 p-2 bg-white border border-gray-200 rounded-xl text-center font-black text-indigo-700" disabled={isLocked}/>
              </div>
              <div className="h-8 w-px bg-gray-200 mx-2"></div>
              <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase">Subtotal Jasa</p>
                  <p className="text-lg font-black text-gray-800 tracking-tight">{formatCurrency(totals.subtotalJasa - totals.discountJasaAmount)}</p>
              </div>
          </div>
      </div>

      {/* PARTS SECTION */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
              <h4 className="font-black text-gray-800 tracking-tight">B. SPAREPART & BAHAN</h4>
              <button onClick={() => addItem('part')} disabled={isLocked} className="flex items-center gap-1 text-sm bg-orange-50 text-orange-700 px-4 py-1.5 rounded-xl font-black hover:bg-orange-100 disabled:opacity-50 transition-all active:scale-95"><Plus size={16}/> TAMBAH PART</button>
          </div>
          
          <div className="overflow-x-visible relative">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                  <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <th className="px-4 py-2 w-10 text-center">No</th>
                          <th className="px-4 py-2 w-56">Nomor Part (Kode)</th>
                          <th className="px-4 py-2">Nama Sparepart</th>
                          <th className="px-4 py-2 w-20 text-center">Qty</th>
                          <th className="px-4 py-2 w-36 text-right">Harga</th>
                          <th className="px-4 py-2 w-40 text-right">Total</th>
                          <th className="px-4 py-2 w-10"></th>
                      </tr>
                  </thead>
                  <tbody>
                      {partItems.map((item, i) => (
                          <tr key={i} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-center text-gray-400 font-bold bg-gray-50/50 rounded-l-xl border-y border-l border-gray-100">{i+1}</td>
                              <td className="px-4 py-3 relative border-y border-gray-100">
                                  <input 
                                    type="text" 
                                    value={item.number} 
                                    onFocus={() => { setActiveSearch({ type: 'part', index: i }); setSearchQuery(item.number || ''); }}
                                    onChange={e => { setSearchQuery(e.target.value); updateItemRaw('part', i, 'number', e.target.value); }}
                                    className="w-full p-2 bg-gray-50 border-none rounded-lg uppercase font-mono text-xs font-bold focus:ring-2 ring-orange-500 transition-all" 
                                    placeholder="CARI KODE PART..." 
                                    disabled={isLocked}
                                  />
                              </td>
                              <td className="px-4 py-3 relative border-y border-gray-100">
                                  <div className="relative">
                                      <input 
                                        type="text" 
                                        value={item.name} 
                                        onFocus={() => { setActiveSearch({ type: 'part', index: i }); setSearchQuery(item.name); }}
                                        onChange={e => { setSearchQuery(e.target.value); updateItemRaw('part', i, 'name', e.target.value); }}
                                        className="w-full p-2 bg-gray-50 border-none rounded-lg font-bold text-gray-700 focus:ring-2 ring-orange-500 transition-all" 
                                        placeholder="KETIK NAMA BARANG..." 
                                        disabled={isLocked}
                                      />
                                      {activeSearch?.type === 'part' && activeSearch.index === i && (
                                          <div ref={searchRef} className="absolute left-0 top-full mt-2 w-[550px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-gray-200 z-[999] max-h-[400px] overflow-y-auto animate-pop-in scrollbar-thin">
                                              <div className="p-3 bg-orange-600 text-white flex items-center gap-2 sticky top-0 z-10 shadow-sm">
                                                  <Package size={14}/>
                                                  <span className="text-[10px] font-black uppercase tracking-widest">Katalog Sparepart & Bahan Produksi</span>
                                              </div>
                                              {filteredParts.length > 0 ? filteredParts.map(p => (
                                                  <div 
                                                    key={p.id} 
                                                    onClick={() => selectPart(i, p)}
                                                    className="p-4 hover:bg-orange-50 cursor-pointer border-b border-gray-100 transition-colors flex items-center justify-between group/item"
                                                  >
                                                      <div className="flex flex-col gap-1 flex-1">
                                                          <div className="flex items-center gap-2">
                                                              <span className="font-black text-xs text-orange-600 font-mono tracking-tighter bg-orange-50 px-1.5 py-0.5 rounded">{p.code || 'NO-CODE'}</span>
                                                              <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black border bg-white ${p.category === 'sparepart' ? 'text-indigo-600 border-indigo-200' : 'text-orange-600 border-orange-200'}`}>{p.category.toUpperCase()}</span>
                                                          </div>
                                                          <span className="text-sm font-bold text-gray-800 uppercase tracking-tight group-hover/item:text-orange-700 leading-tight">{p.name}</span>
                                                          <div className="flex items-center gap-3">
                                                              {p.location && <div className="text-[10px] text-gray-400 flex items-center gap-1 font-medium"><Tag size={10}/> RAK: {p.location}</div>}
                                                              {p.brand && <div className="text-[10px] text-gray-400 flex items-center gap-1 font-medium"><Box size={10}/> {p.brand}</div>}
                                                          </div>
                                                      </div>
                                                      <div className="text-right flex flex-col items-end gap-1.5">
                                                          <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${p.stock > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                              {p.stock > 0 ? <CheckCircle2 size={10}/> : <AlertCircle size={10}/>}
                                                              {p.stock} {p.unit}
                                                          </div>
                                                          <div className="text-sm font-black text-indigo-900">
                                                              {formatCurrency(p.sellPrice)}
                                                          </div>
                                                      </div>
                                                  </div>
                                              )) : (
                                                  <div className="p-10 text-center flex flex-col items-center gap-3">
                                                      <Package size={32} className="text-gray-200"/>
                                                      <p className="text-gray-400 text-xs italic font-medium">Barang tidak terdaftar di Master Stok.</p>
                                                  </div>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              </td>
                              <td className="px-4 py-3 text-center border-y border-gray-100">
                                  <input 
                                    type="number" 
                                    value={item.qty} 
                                    onChange={e => updateItemRaw('part', i, 'qty', Number(e.target.value))} 
                                    className="w-full p-2 bg-gray-50 border-none rounded-lg text-center font-black text-gray-700" 
                                    disabled={isLocked}
                                  />
                              </td>
                              <td className="px-4 py-3 text-right border-y border-gray-100">
                                  <input 
                                    type="number" 
                                    value={item.price} 
                                    onChange={e => updateItemRaw('part', i, 'price', Number(e.target.value))} 
                                    className="w-full p-2 bg-gray-50 border-none rounded-lg text-right font-black text-gray-800" 
                                    disabled={isLocked}
                                  />
                              </td>
                              <td className="px-4 py-3 text-right font-black text-emerald-600 border-y border-gray-100">
                                  {formatCurrency((item.price || 0) * (item.qty || 1))}
                              </td>
                              <td className="px-4 py-3 text-center bg-gray-50/50 border-y border-r border-gray-100 rounded-r-xl">
                                  <button onClick={() => removeItem('part', i)} disabled={isLocked} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30"><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          <div className="flex justify-end items-center gap-4 mt-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Diskon Sparepart (%)</span>
                  <input type="number" value={discountPart} onChange={e => setDiscountPart(Number(e.target.value))} className="w-20 p-2 bg-white border border-gray-200 rounded-xl text-center font-black text-orange-700" disabled={isLocked}/>
              </div>
              <div className="h-8 w-px bg-gray-200 mx-2"></div>
              <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase">Subtotal Part & Bahan</p>
                  <p className="text-lg font-black text-gray-800 tracking-tight">{formatCurrency(totals.subtotalPart - totals.discountPartAmount)}</p>
              </div>
          </div>
      </div>

      {/* SUMMARY & ACTIONS */}
      <div className="bg-slate-900 text-white p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center shadow-2xl relative overflow-hidden ring-4 ring-indigo-50/50">
          <div className="absolute right-0 top-0 p-4 opacity-5 rotate-12 scale-150"><Calculator size={150}/></div>
          <div className="flex gap-3 relative z-10">
              <button onClick={() => generateEstimationPDF(job, prepareEstimateData(), settings, creatorName)} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-2xl font-black transition-all active:scale-95 shadow-lg"><Printer size={20}/> CETAK ESTIMASI</button>
          </div>
          <div className="flex items-center gap-8 mt-6 md:mt-0 relative z-10">
              <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pajak PPN ({ppnPercentage}%)</p>
                  <p className="font-bold text-slate-200">{formatCurrency(totals.ppnAmount)}</p>
              </div>
              <div className="h-12 w-px bg-slate-700"></div>
              <div className="text-right">
                  <p className="text-xs font-black text-emerald-400 uppercase tracking-[0.3em] mb-1">GRAND TOTAL</p>
                  <p className="text-4xl font-black text-white drop-shadow-md tracking-tighter">{formatCurrency(totals.grandTotal)}</p>
              </div>
          </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
          <button onClick={onCancel} className="px-8 py-3 bg-gray-100 text-gray-500 rounded-2xl hover:bg-gray-200 font-black transition-all">BATAL / TUTUP</button>
          {!isLocked && (
              <>
                  <button onClick={() => handleSaveAction('estimate')} disabled={isSubmitting} className="px-8 py-3 border-2 border-indigo-600 text-indigo-700 rounded-2xl hover:bg-indigo-50 font-black transition-all">SIMPAN ESTIMASI</button>
                  <button onClick={() => handleSaveAction('wo')} disabled={isSubmitting} className="flex items-center gap-2 px-12 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-black shadow-xl shadow-indigo-100 transition-all transform active:scale-95"><Save size={20}/> {job.woNumber ? 'UPDATE WORK ORDER' : 'TERBITKAN WO'}</button>
              </>
          )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pop-in {
          0% { transform: scale(0.95); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in {
          animation: pop-in 0.2s ease-out forwards;
        }
      ` }} />
    </div>
  );
};

export default EstimateEditor;
