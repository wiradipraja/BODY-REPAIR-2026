
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Job, EstimateData, Settings, InventoryItem, EstimateItem, ServiceMasterItem, InsuranceLog } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { 
    Save, Plus, Trash2, Calculator, Printer, Lock, X, MessageSquare, 
    Activity, Palette, Search, Package, Box, Tag, AlertCircle, 
    CheckCircle2, ChevronRight, Hash, Layers, MapPin, UserCheck, RefreshCw, AlertTriangle, FileText
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

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        sec_jasa: "A. JASA PERBAIKAN",
        sec_part: "B. SPAREPART & BAHAN",
        btn_add_jasa: "TAMBAH JASA",
        btn_add_part: "TAMBAH PART",
        btn_print_est: "CETAK ESTIMASI",
        btn_print_wo: "CETAK WO",
        btn_save_est: "SIMPAN DATA ESTIMASI",
        btn_save_wo: "TERBITKAN WORK ORDER (WO)",
        btn_update_wo: "UPDATE DATA WO",
        col_code: "Kode",
        col_type: "Jenis",
        col_desc: "Nama Pekerjaan",
        col_panel: "Panel",
        col_cost: "Biaya",
        col_part_no: "No. Part",
        col_part_name: "Nama Sparepart",
        col_qty: "Qty",
        col_price: "Harga Satuan",
        col_total: "Total"
    },
    en: {
        sec_jasa: "A. SERVICE CHARGES",
        sec_part: "B. SPAREPARTS & MATERIALS",
        btn_add_jasa: "ADD SERVICE",
        btn_add_part: "ADD PART",
        btn_print_est: "PRINT ESTIMATE",
        btn_print_wo: "PRINT WO",
        btn_save_est: "SAVE ESTIMATE DATA",
        btn_save_wo: "GENERATE WORK ORDER (WO)",
        btn_update_wo: "UPDATE WO DATA",
        col_code: "Code",
        col_type: "Type",
        col_desc: "Description",
        col_panel: "Panel",
        col_cost: "Cost",
        col_part_no: "Part No",
        col_part_name: "Description",
        col_qty: "Qty",
        col_price: "Unit Price",
        col_total: "Total"
    }
};

const EstimateEditor: React.FC<EstimateEditorProps> = ({ 
  job, ppnPercentage, insuranceOptions, onSave, onCancel, settings, creatorName, inventoryItems, showNotification 
}) => {
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const [jasaItems, setJasaItems] = useState<EstimateItem[]>(job.estimateData?.jasaItems || []);
  const [partItems, setPartItems] = useState<EstimateItem[]>(job.estimateData?.partItems || []);
  
  const [discountJasa, setDiscountJasa] = useState(job.estimateData?.discountJasa || 0);
  const [discountPart, setDiscountPart] = useState(job.estimateData?.discountPart || 0);
  
  // Local state to hold the ID immediately after saving to avoid prop delay
  const [localEstNumber, setLocalEstNumber] = useState(job.estimateData?.estimationNumber || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceMasterList, setServiceMasterList] = useState<ServiceMasterItem[]>([]);

  // Search Picker State
  const [activeSearch, setActiveSearch] = useState<{ type: 'jasa' | 'part', index: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  // Status & Position Local State
  const [currentStatus, setCurrentStatus] = useState(job.statusKendaraan);
  const [currentPosisi, setCurrentPosisi] = useState(job.posisiKendaraan || 'Di Bengkel');

  const specialColorRate = useMemo(() => {
      return (settings.specialColorRates || []).find(r => r.colorName === job.warnaMobil);
  }, [job.warnaMobil, settings.specialColorRates]);

  useEffect(() => {
      // FIX: Cek master asuransi dan terapkan default jika diskon saat ini masih 0
      const ins = insuranceOptions.find(i => i.name === job.namaAsuransi);
      
      if (ins) {
          // Hanya override jika nilai saat ini 0 (indikasi data baru/draft)
          if (discountJasa === 0 && discountPart === 0) {
              setDiscountJasa(ins.jasa);
              setDiscountPart(ins.part);
          }
      }
      loadServices();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.namaAsuransi, insuranceOptions]); 

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
      if (job.isClosed) return;
      try {
          if (field === 'statusKendaraan') setCurrentStatus(value);
          if (field === 'posisiKendaraan') setCurrentPosisi(value);

          // Update real-time hanya untuk visual di form, final update saat Save WO
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
              [field]: value, 
              updatedAt: serverTimestamp() 
          });
          showNotification(`Update Berhasil. ${field === 'statusKendaraan' ? 'Posisi di Papan Kontrol berubah.' : ''}`, "success");
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
    if (job.isClosed) return;
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

  const syncPartPrice = (index: number) => {
      const item = partItems[index];
      if (!item.inventoryId) return;
      const masterItem = inventoryItems.find(i => i.id === item.inventoryId);
      if (masterItem) {
          const newItems = [...partItems];
          newItems[index] = { ...newItems[index], price: masterItem.sellPrice };
          setPartItems(newItems);
          showNotification("Harga disinkronkan ke Master Stok", "success");
      }
  };

  const updateItemRaw = (type: 'jasa' | 'part', index: number, field: keyof EstimateItem, value: any) => {
    if (job.isClosed) return;
    const items = type === 'jasa' ? [...jasaItems] : [...partItems];
    items[index] = { ...items[index], [field]: value };
    type === 'jasa' ? setJasaItems(items) : setPartItems(items);
  };

  const removeItem = (type: 'jasa' | 'part', index: number) => {
    if (job.isClosed) return;
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

  const prepareEstimateData = (estimationNumber?: string): any => {
      const subtotalJasa = jasaItems.reduce((acc, i) => acc + (Number(i.price) || 0), 0);
      const subtotalPart = partItems.reduce((acc, i) => acc + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0);
      const discountJasaAmount = Math.round((subtotalJasa * discountJasa) / 100);
      const discountPartAmount = Math.round((subtotalPart * discountPart) / 100);
      const dpp = (subtotalJasa - discountJasaAmount) + (subtotalPart - discountPartAmount);
      const ppnAmount = Math.round(dpp * (ppnPercentage / 100));
      const grandTotal = dpp + ppnAmount;

      return {
          // Priority: 1. Param arg, 2. Local State (After Save), 3. Prop from DB
          estimationNumber: estimationNumber || localEstNumber || job.estimateData?.estimationNumber,
          grandTotal, jasaItems, partItems,
          discountJasa, discountPart, discountJasaAmount, discountPartAmount,
          ppnAmount, subtotalJasa, subtotalPart, estimatorName: creatorName,
          // Inject current Position to ensure App.tsx logic captures it correctly
          posisiKendaraan: currentPosisi 
      };
  };

  const totals = prepareEstimateData();

  const handleSaveAction = async (saveType: 'estimate' | 'wo') => {
      setIsSubmitting(true);
      try {
          const data = prepareEstimateData();
          const savedId = await onSave(job.id, data, saveType);
          
          // Update local state immediately so if they click Print next, it has the ID
          if (saveType === 'estimate') {
              setLocalEstNumber(savedId);
          }
      } catch (e) { 
          console.error(e); 
          showNotification("Gagal menyimpan data", "error");
      } finally { 
          setIsSubmitting(false); 
      }
  };

  const handlePrint = (type: 'estimate' | 'wo') => {
      // Use current live data from form to generate PDF, ensuring WYSIWYG
      const currentData = prepareEstimateData();
      
      // If we don't have a number yet (e.g. didn't click save), warn user or allow draft
      if (type === 'estimate' && !currentData.estimationNumber) {
          if (!window.confirm("Nomor Estimasi belum dibuat (Anda belum Simpan). Cetak sebagai DRAFT?")) {
              return;
          }
      }

      // If printing WO, ensure we display WO Number if exists
      const docTypeData = {
          ...currentData,
          estimationNumber: type === 'wo' ? (job.woNumber || currentData.estimationNumber) : currentData.estimationNumber
      };
      
      const jobForPdf = {
          ...job,
          // Only force WO number appearance if printing WO type
          woNumber: type === 'wo' ? job.woNumber : undefined 
      };

      generateEstimationPDF(jobForPdf, docTypeData, settings, creatorName);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-indigo-100 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row gap-6 items-center">
              <div className="shrink-0 flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md"><UserCheck size={24}/></div>
                  <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">SA Check-In Control</h4>
                      <p className="text-[10px] text-indigo-500 font-bold">Location & Flow Status</p>
                  </div>
              </div>
              <div className="h-10 w-px bg-gray-100 hidden md:block"></div>
              
              <div className="flex-grow w-full">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1"><MapPin size={10}/> {lang === 'id' ? 'Posisi Fisik Unit' : 'Vehicle Physical Position'}</label>
                      <div className="flex bg-gray-100 p-1 rounded-xl">
                          <button type="button" onClick={() => handleUpdateCheckIn('posisiKendaraan', 'Di Bengkel')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${currentPosisi === 'Di Bengkel' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>{lang === 'id' ? 'INAP' : 'IN-SHOP'}</button>
                          <button type="button" onClick={() => handleUpdateCheckIn('posisiKendaraan', 'Di Pemilik')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${currentPosisi === 'Di Pemilik' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>{lang === 'id' ? 'BAWA PULANG' : 'WITH OWNER'}</button>
                      </div>
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
                      </div>
                  </div>
              ) : (
                  <div className="flex items-center gap-3 opacity-40">
                      <div className="p-2 bg-gray-200 text-gray-500 rounded-xl"><Palette size={20}/></div>
                      <div><p className="text-[10px] font-black text-gray-400 uppercase">Standard Color</p><p className="text-xs font-black text-gray-600">{job.warnaMobil}</p></div>
                  </div>
              )}
              {job.namaAsuransi !== 'Umum / Pribadi' && (
                  <button onClick={() => { const note = prompt("Catatan Log Negosiasi:"); if (note) { const newLog: InsuranceLog = { date: new Date().toISOString(), user: creatorName, note }; updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { insuranceNegotiationLog: arrayUnion(newLog) }); showNotification("Log ditambahkan", "success"); } }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><MessageSquare size={20}/></button>
              )}
          </div>
      </div>

      {job.isClosed && (<div className="bg-red-50 p-3 rounded flex items-center gap-2 text-red-700 font-bold"><Lock size={18}/> {lang === 'id' ? 'WO ini terkunci (Closed).' : 'This WO is Locked (Closed).'}</div>)}

      {/* JASA SECTION */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
              <h4 className="font-black text-gray-800 tracking-tight">{t('sec_jasa')}</h4>
              <button onClick={() => addItem('jasa')} disabled={job.isClosed} className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-xl font-black hover:bg-indigo-100 disabled:opacity-50 transition-all active:scale-95"><Plus size={16}/> {t('btn_add_jasa')}</button>
          </div>
          <div className="relative">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2 min-w-[700px]">
                  <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <th className="px-4 py-2 w-10 text-center">No</th>
                          <th className="px-4 py-2 w-32">{t('col_code')}</th>
                          <th className="px-4 py-2 w-16 text-center">{t('col_type')}</th>
                          <th className="px-4 py-2">{t('col_desc')}</th>
                          <th className="px-4 py-2 w-16 text-center">{t('col_panel')}</th>
                          <th className="px-4 py-2 w-40 text-right">{t('col_cost')}</th>
                          <th className="px-4 py-2 w-10"></th>
                      </tr>
                  </thead>
                  <tbody>
                      {jasaItems.map((item, i) => (
                          <tr key={i} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-center text-gray-400 font-bold bg-gray-50/50 rounded-l-xl border-y border-l border-gray-100">{i+1}</td>
                              <td className="px-4 py-3 border-y border-gray-100">
                                  <input type="text" value={item.number || ''} onFocus={() => { setActiveSearch({ type: 'jasa', index: i }); setSearchQuery(item.number || ''); }} onChange={e => { setSearchQuery(e.target.value); updateItemRaw('jasa', i, 'number', e.target.value); }} className="w-full p-2 bg-gray-50 border-none rounded-lg uppercase font-mono text-xs font-bold focus:ring-2 ring-indigo-500 transition-all" placeholder="CARI..." disabled={job.isClosed} />
                              </td>
                              <td className="px-4 py-3 text-center border-y border-gray-100">
                                  <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-black border ${item.workType === 'KC' ? 'bg-orange-50 text-orange-700 border-orange-200' : item.workType === 'GTC' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{item.workType || '-'}</span>
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 relative">
                                  <div className="relative">
                                      <input type="text" value={item.name} onFocus={() => { setActiveSearch({ type: 'jasa', index: i }); setSearchQuery(item.name); }} onChange={e => { setSearchQuery(e.target.value); updateItemRaw('jasa', i, 'name', e.target.value); }} className="w-full p-2 bg-gray-50 border-none rounded-lg font-bold text-gray-700 focus:ring-2 ring-indigo-500 transition-all" placeholder="SEARCH..." disabled={job.isClosed} />
                                      {activeSearch?.type === 'jasa' && activeSearch.index === i && (
                                          <div ref={searchRef} className={`absolute left-0 ${i > jasaItems.length - 3 && i > 2 ? 'bottom-full mb-2' : 'top-full mt-2'} w-[500px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-indigo-100 z-[100] max-h-[400px] overflow-y-auto animate-pop-in scrollbar-thin backdrop-blur-md bg-white/98`}>
                                              <div className="p-3 bg-indigo-50/50 border-b border-indigo-100 flex justify-between items-center sticky top-0 z-10 backdrop-blur-sm">
                                                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{lang === 'id' ? 'Pilih Item Jasa' : 'Select Service Item'}</span>
                                                  <button onClick={() => setActiveSearch(null)} className="p-1 hover:bg-white rounded-full"><X size={14} className="text-indigo-400"/></button>
                                              </div>
                                              {filteredServices.map(s => (
                                                  <div key={s.id} onClick={() => selectService(i, s)} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 flex justify-between items-center group">
                                                      <div>
                                                          <div className="font-bold text-sm text-gray-800 group-hover:text-indigo-700 transition-colors">{s.serviceName}</div>
                                                          <div className="text-[10px] font-mono text-gray-400">{s.serviceCode} | {s.workType}</div>
                                                      </div>
                                                      <div className="text-right">
                                                          <div className="font-black text-emerald-600 text-sm">{formatCurrency(s.basePrice)}</div>
                                                          <div className="text-[9px] text-gray-400 font-bold">{s.panelValue} Panel</div>
                                                      </div>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-center">
                                  <input type="number" step="0.1" value={item.panelCount || 0} onChange={e => updateItemRaw('jasa', i, 'panelCount', Number(e.target.value))} className="w-16 p-2 text-center bg-gray-50 border-none rounded-lg font-bold text-xs" disabled={job.isClosed} />
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-right">
                                  <input type="number" value={item.price} onChange={e => updateItemRaw('jasa', i, 'price', Number(e.target.value))} className="w-full p-2 text-right bg-gray-50 border-none rounded-lg font-bold text-gray-800" disabled={job.isClosed} />
                              </td>
                              <td className="px-4 py-3 border-y border-r border-gray-100 bg-gray-50/50 rounded-r-xl text-center">
                                  <button onClick={() => removeItem('jasa', i)} className="text-red-300 hover:text-red-500 transition-colors" disabled={job.isClosed}><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {/* PART SECTION */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
              <h4 className="font-black text-gray-800 tracking-tight">{t('sec_part')}</h4>
              <button onClick={() => addItem('part')} disabled={job.isClosed} className="flex items-center gap-1 text-sm bg-orange-50 text-orange-700 px-4 py-1.5 rounded-xl font-black hover:bg-orange-100 disabled:opacity-50 transition-all active:scale-95"><Plus size={16}/> {t('btn_add_part')}</button>
          </div>
          <div className="relative">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2 min-w-[700px]">
                  <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <th className="px-4 py-2 w-10 text-center">No</th>
                          <th className="px-4 py-2 w-40">{t('col_part_no')}</th>
                          <th className="px-4 py-2">{t('col_part_name')}</th>
                          <th className="px-4 py-2 w-20 text-center">{t('col_qty')}</th>
                          <th className="px-4 py-2 w-40 text-right">{t('col_price')}</th>
                          <th className="px-4 py-2 w-40 text-right">{t('col_total')}</th>
                          <th className="px-4 py-2 w-10"></th>
                      </tr>
                  </thead>
                  <tbody>
                      {partItems.map((item, i) => (
                          <tr key={i} className="group hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-center text-gray-400 font-bold bg-gray-50/50 rounded-l-xl border-y border-l border-gray-100">{i+1}</td>
                              <td className="px-4 py-3 border-y border-gray-100">
                                  <input type="text" value={item.number || ''} onFocus={() => { setActiveSearch({ type: 'part', index: i }); setSearchQuery(item.number || ''); }} onChange={e => { setSearchQuery(e.target.value); updateItemRaw('part', i, 'number', e.target.value); }} className="w-full p-2 bg-gray-50 border-none rounded-lg uppercase font-mono text-xs font-bold focus:ring-2 ring-orange-500 transition-all" placeholder="CARI..." disabled={job.isClosed} />
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 relative">
                                  <div className="relative">
                                      <input type="text" value={item.name} onFocus={() => { setActiveSearch({ type: 'part', index: i }); setSearchQuery(item.name); }} onChange={e => { setSearchQuery(e.target.value); updateItemRaw('part', i, 'name', e.target.value); }} className="w-full p-2 bg-gray-50 border-none rounded-lg font-bold text-gray-700 focus:ring-2 ring-orange-500 transition-all" placeholder="SEARCH..." disabled={job.isClosed} />
                                      {activeSearch?.type === 'part' && activeSearch.index === i && (
                                          <div ref={searchRef} className={`absolute left-0 ${i > partItems.length - 3 && i > 2 ? 'bottom-full mb-2' : 'top-full mt-2'} w-[500px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-orange-100 z-[100] max-h-[400px] overflow-y-auto animate-pop-in scrollbar-thin backdrop-blur-md bg-white/98`}>
                                              <div className="p-3 bg-orange-50/50 border-b border-orange-100 flex justify-between items-center sticky top-0 z-10 backdrop-blur-sm">
                                                  <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{lang === 'id' ? 'Pilih Sparepart' : 'Select Sparepart'}</span>
                                                  <button onClick={() => setActiveSearch(null)} className="p-1 hover:bg-white rounded-full"><X size={14} className="text-orange-400"/></button>
                                              </div>
                                              {filteredParts.map(p => (
                                                  <div key={p.id} onClick={() => selectPart(i, p)} className="p-3 hover:bg-orange-50 cursor-pointer border-b border-gray-50 flex justify-between items-center group">
                                                      <div>
                                                          <div className="font-bold text-sm text-gray-800 group-hover:text-orange-700 transition-colors">{p.name}</div>
                                                          <div className="text-[10px] font-mono text-gray-400">{p.code} | Stok: {p.stock} {p.unit}</div>
                                                      </div>
                                                      <div className="text-right">
                                                          <div className="font-black text-emerald-600 text-sm">{formatCurrency(p.sellPrice)}</div>
                                                      </div>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-center">
                                  <input type="number" value={item.qty || 1} onChange={e => updateItemRaw('part', i, 'qty', Number(e.target.value))} className="w-16 p-2 text-center bg-gray-50 border-none rounded-lg font-bold text-xs" disabled={job.isClosed} />
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-right relative group-input">
                                  <input type="number" value={item.price} onChange={e => updateItemRaw('part', i, 'price', Number(e.target.value))} className="w-full p-2 text-right bg-gray-50 border-none rounded-lg font-bold text-gray-800" disabled={job.isClosed} />
                                  {item.inventoryId && (
                                      <button onClick={() => syncPartPrice(i)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-input-hover:opacity-100 p-1 bg-white shadow rounded-full text-indigo-600 hover:scale-110 transition-all" title="Reset ke Harga Master"><RefreshCw size={12}/></button>
                                  )}
                              </td>
                              <td className="px-4 py-3 border-y border-gray-100 text-right font-black text-gray-900">
                                  {formatCurrency((item.price || 0) * (item.qty || 1))}
                              </td>
                              <td className="px-4 py-3 border-y border-r border-gray-100 bg-gray-50/50 rounded-r-xl text-center">
                                  <button onClick={() => removeItem('part', i)} className="text-red-300 hover:text-red-500 transition-colors" disabled={job.isClosed}><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {/* SUMMARY */}
      <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                      <span className="text-xs font-bold text-indigo-200 uppercase">Total Jasa</span>
                      <span className="font-black text-lg">{formatCurrency(totals.subtotalJasa)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 w-24">Diskon Jasa %</span>
                      <input type="number" value={discountJasa} onChange={e => setDiscountJasa(Number(e.target.value))} className="bg-white/10 border-none rounded-lg w-20 text-center font-bold text-sm focus:ring-2 ring-indigo-500" disabled={job.isClosed} />
                      <span className="text-xs font-mono text-red-400">- {formatCurrency(totals.discountJasaAmount)}</span>
                  </div>
                  
                  <div className="h-px bg-white/10 w-full my-2"></div>

                  <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                      <span className="text-xs font-bold text-orange-200 uppercase">Total Part</span>
                      <span className="font-black text-lg">{formatCurrency(totals.subtotalPart)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 w-24">Diskon Part %</span>
                      <input type="number" value={discountPart} onChange={e => setDiscountPart(Number(e.target.value))} className="bg-white/10 border-none rounded-lg w-20 text-center font-bold text-sm focus:ring-2 ring-orange-500" disabled={job.isClosed} />
                      <span className="text-xs font-mono text-red-400">- {formatCurrency(totals.discountPartAmount)}</span>
                  </div>
              </div>

              <div className="flex flex-col justify-between">
                  <div className="space-y-2 text-right">
                      <p className="text-xs font-bold text-gray-400 uppercase">PPN ({ppnPercentage}%)</p>
                      <p className="text-xl font-bold text-white">{formatCurrency(totals.ppnAmount)}</p>
                  </div>
                  <div className="mt-6 pt-6 border-t border-white/20 text-right">
                      <p className="text-sm font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Grand Total Estimasi</p>
                      <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-200">{formatCurrency(totals.grandTotal)}</p>
                  </div>
              </div>
          </div>
          
          <div className="mt-8 flex flex-wrap gap-3 justify-end border-t border-white/10 pt-6">
              <button onClick={onCancel} className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-colors">Batal</button>
              <div className="flex gap-2 bg-white/10 p-1 rounded-xl">
                  <button onClick={() => handlePrint('estimate')} disabled={isSubmitting} className="px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 bg-white/5 hover:bg-white/20 transition-all text-indigo-200"><Printer size={16}/> {t('btn_print_est')}</button>
                  <button onClick={() => handlePrint('wo')} disabled={isSubmitting} className="px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 bg-white/5 hover:bg-white/20 transition-all text-emerald-200"><Printer size={16}/> {t('btn_print_wo')}</button>
              </div>
              <button onClick={() => handleSaveAction('estimate')} disabled={isSubmitting || job.isClosed} className="px-6 py-3 bg-white text-indigo-900 rounded-xl font-black shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-2 transform active:scale-95 disabled:opacity-50">
                  {isSubmitting ? 'Menyimpan...' : <><Save size={18}/> {t('btn_save_est')}</>}
              </button>
              <button onClick={() => handleSaveAction('wo')} disabled={isSubmitting || job.isClosed} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-xl hover:bg-indigo-500 transition-all flex items-center gap-2 transform active:scale-95 disabled:opacity-50 border border-indigo-400">
                  {isSubmitting ? 'Memproses...' : <><FileText size={18}/> {job.woNumber ? t('btn_update_wo') : t('btn_save_wo')}</>}
              </button>
          </div>
      </div>
    </div>
  );
};

export default EstimateEditor;
