import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem, UsageLogItem, Supplier } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { Search, Truck, PaintBucket, CheckCircle, History, Save, ArrowRight, AlertTriangle, Info, Package, XCircle, Clock, Zap, Target } from 'lucide-react';

interface MaterialIssuanceViewProps {
  activeJobs: Job[];
  inventoryItems: InventoryItem[];
  suppliers: Supplier[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  onRefreshData: () => void;
  issuanceType: 'sparepart' | 'material';
}

const MaterialIssuanceView: React.FC<MaterialIssuanceViewProps> = ({ 
  activeJobs, inventoryItems, userPermissions, showNotification, onRefreshData, issuanceType
}) => {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [filterWo, setFilterWo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for Material Mode
  const [materialSearchTerm, setMaterialSearchTerm] = useState(''); 
  const [inputQty, setInputQty] = useState<number | ''>(''); 
  const [notes, setNotes] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>(''); 

  // --- LOGIC: FIFO Stock Allocation & Recommendation Engine ---
  const recommendations = useMemo(() => {
    // Clone stock for virtual allocation
    const stockMap: Record<string, number> = {};
    inventoryItems.forEach(item => { stockMap[item.id] = item.stock; });

    // Filter relevant jobs (WIP only: must have WO and not closed)
    const wipJobs = activeJobs.filter(j => !j.isClosed && j.woNumber);

    // Sort by Date (FIFO)
    wipJobs.sort((a, b) => {
        const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return dateA - dateB;
    });

    const readyForPart: Job[] = [];
    const missingMaterial: Job[] = [];

    wipJobs.forEach(job => {
        // Part Checking
        const parts = job.estimateData?.partItems || [];
        if (parts.length > 0) {
            let allReady = true;
            let hasUnissued = false;

            parts.forEach(p => {
                if (!p.hasArrived) {
                    hasUnissued = true;
                    const reqQty = p.qty || 1;
                    if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) {
                        stockMap[p.inventoryId] -= reqQty;
                    } else {
                        allReady = false;
                    }
                }
            });

            if (allReady && hasUnissued) readyForPart.push(job);
        }

        // Material Checking
        const hasMaterialLog = job.usageLog?.some(log => log.category === 'material');
        if (!hasMaterialLog) missingMaterial.push(job);
    });

    return { readyForPart, missingMaterial };
  }, [activeJobs, inventoryItems]);

  const selectedJob = useMemo(() => activeJobs.find(j => j.id === selectedJobId), [activeJobs, selectedJobId]);
  
  const usageHistory = useMemo(() => {
      if (!selectedJob || !selectedJob.usageLog) return [];
      return [...selectedJob.usageLog]
        .filter(log => log.category === issuanceType)
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [selectedJob, issuanceType]);

  const totalUsageCost = useMemo(() => {
      return usageHistory.reduce((acc, curr) => acc + curr.totalCost, 0);
  }, [usageHistory]);

  const filteredJobs = useMemo(() => {
    if (!filterWo) return [];
    const lowerFilter = filterWo.toLowerCase().trim();
    // Only search in active WIP units for issuance
    return activeJobs.filter(j => 
        j.woNumber && !j.isClosed && (
            j.woNumber.toLowerCase().includes(lowerFilter) || 
            j.policeNumber.toLowerCase().includes(lowerFilter)
        )
    );
  }, [activeJobs, filterWo]);

  const materialInventory = useMemo(() => {
      return inventoryItems.filter(i => i.category === 'material');
  }, [inventoryItems]);

  useEffect(() => {
      setMaterialSearchTerm('');
      setInputQty('');
      setNotes('');
      setSelectedUnit('');
  }, [selectedJobId, issuanceType]);

  const findItem = (term: string) => {
      const t = term.trim().toLowerCase();
      if (!t) return null;
      return inventoryItems.find(i => 
          i.name.toLowerCase().trim() === t || 
          (i.code && i.code.toLowerCase().trim() === t)
      );
  };

  const handleMaterialIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    const item = findItem(materialSearchTerm);
    if (!item) {
        showNotification("Bahan tidak ditemukan di Master Stok.", "error");
        return;
    }

    const qty = Number(inputQty);
    if (!qty || qty <= 0) {
        showNotification("Masukkan jumlah pemakaian.", "error");
        return;
    }

    let finalDeductQty = qty;
    if (selectedUnit === 'ML' || selectedUnit === 'Gram') finalDeductQty = qty / 1000;

    setIsSubmitting(true);
    try {
        const itemSnap = await getDoc(doc(db, SPAREPART_COLLECTION, item.id));
        const currentStock = itemSnap.exists() ? Number(itemSnap.data().stock || 0) : 0;

        if (item.isStockManaged !== false && currentStock < finalDeductQty) {
            throw new Error(`Stok tidak cukup! Tersedia: ${currentStock} ${item.unit}`);
        }

        const cost = (Number(item.buyPrice) || 0) * finalDeductQty;
        const logEntry: UsageLogItem = cleanObject({
            itemId: item.id, itemName: item.name, itemCode: item.code || '-',
            qty: finalDeductQty, inputQty: qty, inputUnit: selectedUnit || item.unit || 'Unit',
            costPerUnit: Number(item.buyPrice) || 0, totalCost: cost,
            category: 'material', notes: notes || 'Pemakaian Bahan',
            issuedAt: new Date().toISOString(), issuedBy: userPermissions.role || 'Staff'
        });

        await updateDoc(doc(db, SPAREPART_COLLECTION, item.id), { stock: increment(-finalDeductQty), updatedAt: serverTimestamp() });
        await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), { 'costData.hargaModalBahan': increment(cost), usageLog: arrayUnion(logEntry) });

        showNotification("Bahan berhasil dibebankan.", "success");
        setMaterialSearchTerm('');
        setInputQty('');
        onRefreshData();
    } catch (err: any) {
        showNotification(err.message, "error");
    } finally { setIsSubmitting(false); }
  };

  const handlePartIssuance = async (estItem: EstimateItem, idx: number) => {
    if (!selectedJob) return;

    const inv = inventoryItems.find(i => 
        (estItem.inventoryId && i.id === estItem.inventoryId) || 
        (estItem.number && i.code && i.code.toUpperCase().trim() === estItem.number.toUpperCase().trim())
    );

    if (!inv) { showNotification("Part belum terhubung ke Master Stok.", "error"); return; }
    const reqQty = Number(estItem.qty || 1);
    
    setIsSubmitting(true);
    try {
        const invSnap = await getDoc(doc(db, SPAREPART_COLLECTION, inv.id));
        const stockNow = invSnap.exists() ? Number(invSnap.data().stock || 0) : 0;

        if (stockNow < reqQty) throw new Error(`Stok ${inv.name} tidak cukup! (Sisa: ${stockNow})`);

        const cost = (Number(inv.buyPrice) || 0) * reqQty;
        await updateDoc(doc(db, SPAREPART_COLLECTION, inv.id), { stock: increment(-reqQty), updatedAt: serverTimestamp() });

        const currentPartItems = [...(selectedJob.estimateData?.partItems || [])];
        currentPartItems[idx] = { ...currentPartItems[idx], hasArrived: true };

        const log: UsageLogItem = cleanObject({
            itemId: inv.id, itemName: inv.name, itemCode: inv.code || '-',
            qty: reqQty, costPerUnit: Number(inv.buyPrice) || 0, totalCost: cost,
            category: 'sparepart', notes: 'Sesuai Estimasi WO',
            issuedAt: new Date().toISOString(), issuedBy: userPermissions.role || 'Staff'
        });

        await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), {
            'estimateData.partItems': currentPartItems,
            'costData.hargaBeliPart': increment(cost),
            usageLog: arrayUnion(log)
        });

        showNotification("Part berhasil dikeluarkan.", "success");
        onRefreshData();
    } catch (err: any) { showNotification(err.message, "error"); } 
    finally { setIsSubmitting(false); }
  };

  const handleCancelIssuance = async (log: UsageLogItem) => {
    if (!selectedJob || !userPermissions.role.includes('Manager')) return;
    if (!window.confirm("Batalkan pengeluaran barang ini?")) return;

    setIsSubmitting(true);
    try {
        await updateDoc(doc(db, SPAREPART_COLLECTION, log.itemId), { stock: increment(log.qty) });
        const newLog = (selectedJob.usageLog || []).filter(l => !(l.itemId === log.itemId && l.issuedAt === log.issuedAt));
        const field = log.category === 'material' ? 'costData.hargaModalBahan' : 'costData.hargaBeliPart';
        const payload: any = { usageLog: newLog, [field]: increment(-log.totalCost) };
        if (log.category === 'sparepart') {
            const parts = [...(selectedJob.estimateData?.partItems || [])];
            const pIdx = parts.findIndex(p => p.inventoryId === log.itemId && p.hasArrived);
            if (pIdx >= 0) parts[pIdx].hasArrived = false;
            payload['estimateData.partItems'] = parts;
        }
        await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), cleanObject(payload));
        showNotification("Berhasil dibatalkan.", "success");
        onRefreshData();
    } catch (e: any) { showNotification(e.message, "error"); } 
    finally { setIsSubmitting(false); }
  };

  const currentItem = findItem(materialSearchTerm);
  const unitOptions = useMemo(() => {
      const base = currentItem?.unit || 'Pcs';
      const opts = [base];
      if (base === 'Liter') opts.push('ML');
      if (base === 'Kg') opts.push('Gram');
      return opts;
  }, [currentItem]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6 animate-fade-in pb-20">
        
        {/* HEADER SECTION - ENTERPRISE LOOK */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-64 h-64 opacity-[0.03] -mr-20 -mt-20 pointer-events-none ${issuanceType === 'sparepart' ? 'text-indigo-600' : 'text-orange-600'}`}>
                {issuanceType === 'sparepart' ? <Truck size={256}/> : <PaintBucket size={256}/>}
            </div>
            
            <div className="flex items-center gap-6 relative z-10">
                <div className={`p-5 rounded-[1.8rem] shadow-xl ${issuanceType === 'sparepart' ? 'bg-indigo-600' : 'bg-orange-500'} text-white`}>
                    {issuanceType === 'sparepart' ? <Truck size={42}/> : <PaintBucket size={42}/>}
                </div>
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase leading-none">
                        {issuanceType === 'sparepart' ? 'Logistics / Keluar Part' : 'Supply / Pakai Bahan'}
                    </h1>
                    <p className="text-gray-400 font-bold mt-2 flex items-center gap-2 text-sm">
                        <Package size={16} className="text-indigo-500/50"/> Manajemen Alokasi Stok Gudang & Bahan Produksi
                    </p>
                </div>
            </div>

            <div className="flex flex-col items-end gap-1 relative z-10">
                <div className="bg-gray-50/80 backdrop-blur-sm px-6 py-4 rounded-[1.5rem] border border-gray-100 shadow-inner">
                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">TOTAL BIAYA WO INI</span>
                    <span className={`text-3xl font-black ${issuanceType === 'sparepart' ? 'text-indigo-700' : 'text-orange-700'} tracking-tighter`}>{formatCurrency(totalUsageCost)}</span>
                </div>
            </div>
        </div>

        {/* RECOMMENDATION AREA - FIFO DRIVEN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 rounded-xl"><Zap size={20} className="text-indigo-600"/></div>
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Rekomendasi Ready (FIFO)</h3>
                    </div>
                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Priority Queue</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {recommendations.readyForPart.length > 0 ? recommendations.readyForPart.map(job => (
                        <button 
                            key={job.id} 
                            onClick={() => { setSelectedJobId(job.id); setFilterWo(job.woNumber || ''); }}
                            className="shrink-0 bg-gray-50 border border-gray-100 p-5 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all group text-left min-w-[220px] shadow-sm hover:shadow-indigo-200"
                        >
                            <span className="block text-[9px] font-black opacity-40 group-hover:text-white/60 mb-1 uppercase tracking-widest">UNIT PRIORITAS</span>
                            <span className="block font-black text-xl leading-tight group-hover:text-white">{job.policeNumber}</span>
                            <span className="block text-xs font-bold opacity-60 mt-1">{job.woNumber}</span>
                        </button>
                    )) : (
                        <div className="py-12 text-center w-full text-xs text-gray-400 font-black uppercase italic tracking-widest bg-gray-50/50 rounded-2xl border border-dashed">No priority units ready</div>
                    )}
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-orange-50 rounded-xl"><Target size={20} className="text-orange-600"/></div>
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Belum Ada Record Bahan</h3>
                    </div>
                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Action Required</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {recommendations.missingMaterial.length > 0 ? recommendations.missingMaterial.map(job => (
                        <button 
                            key={job.id} 
                            onClick={() => { setSelectedJobId(job.id); setFilterWo(job.woNumber || ''); }}
                            className="shrink-0 bg-gray-50 border border-gray-100 p-5 rounded-2xl hover:bg-orange-600 hover:text-white transition-all group text-left min-w-[220px] shadow-sm hover:shadow-orange-200"
                        >
                            <span className="block text-[9px] font-black opacity-40 group-hover:text-white/60 mb-1 uppercase tracking-widest">INPUT DIBUTUHKAN</span>
                            <span className="block font-black text-xl leading-tight group-hover:text-white">{job.policeNumber}</span>
                            <span className="block text-xs font-bold opacity-60 mt-1">{job.woNumber}</span>
                        </button>
                    )) : (
                        <div className="py-12 text-center w-full text-xs text-gray-400 font-black uppercase italic tracking-widest bg-gray-50/50 rounded-2xl border border-dashed">All units logged</div>
                    )}
                </div>
            </div>
        </div>

        {/* WORK ORDER SELECTION */}
        <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
                <div className="bg-gray-100 p-3 rounded-[1.2rem]"><Search size={24} className="text-gray-500"/></div>
                <label className="text-lg font-black text-gray-900 uppercase tracking-tight">Cari Work Order Aktif (WIP)</label>
            </div>
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Contoh: WO2501... atau B1234ABC..." 
                    value={filterWo} 
                    onChange={e => { setFilterWo(e.target.value); if(!e.target.value) setSelectedJobId(''); }}
                    className="w-full p-8 border-2 border-gray-100 rounded-[2.2rem] focus:border-indigo-500 text-4xl font-mono font-black uppercase transition-all shadow-inner bg-gray-50/50 placeholder-gray-300 tracking-tighter"
                />
                {filterWo && !selectedJobId && (
                    <div className="absolute top-full left-0 right-0 mt-6 bg-white border border-gray-200 rounded-[2.5rem] shadow-2xl z-50 max-h-[30rem] overflow-y-auto divide-y divide-gray-50 p-4">
                        {filteredJobs.length > 0 ? filteredJobs.map(job => (
                            <button 
                                key={job.id}
                                onClick={() => { setSelectedJobId(job.id); setFilterWo(job.woNumber || job.policeNumber); }}
                                className="w-full text-left p-6 hover:bg-indigo-50 flex justify-between items-center group transition-all rounded-3xl"
                            >
                                <div>
                                    <span className="font-black text-indigo-700 block text-3xl tracking-tighter leading-none">{job.woNumber}</span>
                                    <div className="flex gap-3 mt-2 items-center">
                                        <span className="text-base text-gray-900 font-black tracking-tight">{job.policeNumber}</span>
                                        <div className="w-1 h-1 rounded-full bg-gray-300"></div>
                                        <span className="text-sm text-gray-400 font-bold uppercase">{job.carModel}</span>
                                    </div>
                                </div>
                                <div className="bg-white p-3 rounded-2xl shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all transform group-hover:translate-x-2">
                                    <ArrowRight size={28} />
                                </div>
                            </button>
                        )) : <div className="p-16 text-center text-gray-400 font-black uppercase text-sm italic tracking-[0.3em]">Unit WIP tidak ditemukan</div>}
                    </div>
                )}
            </div>

            {selectedJob && (
                <div className={`mt-10 p-10 rounded-[3rem] border-4 flex flex-col md:flex-row justify-between items-center shadow-2xl animate-fade-in transition-all ${issuanceType === 'sparepart' ? 'bg-indigo-700 border-indigo-800 text-white' : 'bg-orange-600 border-orange-700 text-white'}`}>
                    <div className="flex items-center gap-8 mb-6 md:mb-0">
                        <div className="bg-white/10 p-6 rounded-[2rem] backdrop-blur-xl border border-white/20 shadow-inner"><Package size={40}/></div>
                        <div>
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.5em] mb-2 block">CONTEXT TERPILIH</span>
                            <h3 className="text-5xl font-black leading-none tracking-tighter">{selectedJob.woNumber}</h3>
                            <p className="text-white/60 font-black text-sm uppercase mt-4 tracking-widest flex items-center gap-3">
                                {selectedJob.policeNumber} <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div> {selectedJob.carModel} <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div> {selectedJob.namaAsuransi}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => { setSelectedJobId(''); setFilterWo(''); }} className="bg-white/10 hover:bg-white text-white hover:text-gray-900 px-10 py-4 rounded-[1.5rem] text-xs font-black uppercase border border-white/30 transition-all active:scale-95 shadow-xl backdrop-blur-lg">Ganti Unit</button>
                </div>
            )}
        </div>

        {/* SPAREPART GRID - PRECISION LOOK */}
        {issuanceType === 'sparepart' && selectedJob && (
            <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-10 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-indigo-100 rounded-[1.2rem]"><Truck size={28} className="text-indigo-600"/></div>
                        <div>
                            <h3 className="font-black text-gray-900 uppercase tracking-tight text-2xl leading-none">Daftar Kebutuhan Part</h3>
                            <p className="text-xs text-gray-400 font-bold mt-2 uppercase tracking-widest">Sinkronisasi Real-time dengan Estimasi SA</p>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
                            <tr>
                                <th className="px-10 py-8">Detail Suku Cadang</th>
                                <th className="px-10 py-8 text-center">Req. Qty</th>
                                <th className="px-10 py-8 text-center">Stok Gudang</th>
                                <th className="px-10 py-8 text-right">Aksi Logistik</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {(selectedJob.estimateData?.partItems || []).map((item, idx) => {
                                const inv = inventoryItems.find(i => 
                                    (item.inventoryId && i.id === item.inventoryId) || 
                                    (item.number && i.code && i.code.toUpperCase().trim() === item.number.toUpperCase().trim())
                                );
                                const isIssued = !!item.hasArrived;
                                const readyStock = Number(inv?.stock || 0);
                                const reqQty = Number(item.qty || 1);

                                return (
                                    <tr key={idx} className={`${isIssued ? 'bg-emerald-50/30' : 'hover:bg-indigo-50/20'} transition-all`}>
                                        <td className="px-10 py-10">
                                            <div className="font-black text-gray-900 text-xl leading-tight tracking-tight">{item.name}</div>
                                            <div className="text-xs font-mono text-indigo-400 mt-2 font-black tracking-[0.1em] uppercase bg-indigo-50 inline-block px-2 py-0.5 rounded-md">{item.number || 'TANPA NOMOR PART'}</div>
                                        </td>
                                        <td className="px-10 py-10 text-center">
                                            <span className="text-3xl font-black text-indigo-950 tracking-tighter">{reqQty}</span>
                                        </td>
                                        <td className="px-10 py-10 text-center">
                                            {inv ? (
                                                <div className={`inline-flex flex-col items-center px-8 py-4 rounded-[1.5rem] border-2 shadow-sm ${readyStock >= reqQty ? 'bg-white border-blue-100 text-blue-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                                                    <span className="text-2xl font-black leading-none">{readyStock}</span>
                                                    <span className="text-[10px] uppercase font-black mt-2 tracking-widest opacity-60">{inv.unit}</span>
                                                </div>
                                            ) : <span className="text-gray-300 text-[10px] font-black uppercase italic tracking-[0.2em] bg-gray-50 px-3 py-1 rounded-full">Link Lost</span>}
                                        </td>
                                        <td className="px-10 py-10 text-right">
                                            {isIssued ? (
                                                <div className="flex items-center justify-end gap-3 text-emerald-600 font-black text-[10px] uppercase bg-emerald-100/40 px-8 py-4 rounded-[1.2rem] inline-flex border border-emerald-200 shadow-sm">
                                                    <CheckCircle size={20}/> Already Issued
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handlePartIssuance(item, idx)}
                                                    disabled={isSubmitting || !inv || readyStock < reqQty}
                                                    className="px-12 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-sm uppercase shadow-2xl shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-20 transition-all active:scale-95 flex items-center gap-3 ml-auto"
                                                >
                                                    {isSubmitting ? 'Processing' : <><Save size={22}/> Keluarkan Part</>}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* MATERIAL FORM - PRECISION LOOK */}
        {issuanceType === 'material' && selectedJob && (
            <div className="bg-white p-12 rounded-[3rem] border border-gray-100 shadow-sm space-y-12 animate-fade-in">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-orange-100 rounded-[1.2rem]"><PaintBucket size={28} className="text-orange-600"/></div>
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight leading-none">Input Alokasi Bahan Baku</h3>
                        <p className="text-xs text-gray-400 font-bold mt-2 uppercase tracking-widest">Pastikan takaran unit & satuan sesuai pemakaian riil</p>
                    </div>
                </div>
                
                <form onSubmit={handleMaterialIssuance} className="space-y-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="space-y-5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-2">Cari Katalog Bahan</label>
                            <div className="relative">
                                <Search className="absolute left-8 top-8 text-gray-300" size={28}/>
                                <input 
                                    list="mat-list"
                                    type="text" 
                                    placeholder="Ketik Nama atau Kode Bahan..."
                                    value={materialSearchTerm}
                                    onChange={e => setMaterialSearchTerm(e.target.value)}
                                    className="w-full pl-20 p-8 border-2 border-gray-100 rounded-[2.2rem] focus:border-orange-500 font-black bg-gray-50/50 text-2xl tracking-tight"
                                />
                                <datalist id="mat-list">
                                    {materialInventory.map(m => <option key={m.id} value={m.name}>{m.code} | Stok: {m.stock} {m.unit}</option>)}
                                </datalist>
                            </div>
                            {currentItem && (
                                <div className="flex justify-between items-center p-8 bg-orange-50/50 border-2 border-orange-100 rounded-[2rem] shadow-inner animate-fade-in">
                                    <div className="text-sm font-black text-orange-900 uppercase tracking-tight">{currentItem.name}</div>
                                    <div className="text-2xl font-black text-orange-950 bg-white px-8 py-3 rounded-[1.2rem] border border-orange-100 shadow-sm">GUDANG: {currentItem.stock} {currentItem.unit}</div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-2">Takaran / Qty Digunakan</label>
                            <div className="flex gap-5">
                                <input 
                                    type="number" step="0.01" required
                                    value={inputQty}
                                    onChange={e => setInputQty(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0.00"
                                    className="flex-grow p-8 border-2 border-gray-100 rounded-[2.2rem] focus:border-orange-500 text-5xl font-black text-center text-orange-950 bg-gray-50/50 shadow-inner tracking-tighter"
                                />
                                <div className="relative">
                                    <select 
                                        value={selectedUnit} 
                                        onChange={e => setSelectedUnit(e.target.value)}
                                        className="w-56 h-full p-8 border-2 border-gray-100 rounded-[2.2rem] bg-white font-black text-center text-2xl shadow-sm appearance-none cursor-pointer hover:border-orange-200 transition-colors uppercase"
                                    >
                                        {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-20"><ArrowRight className="rotate-90"/></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-2">Catatan Operasional</label>
                        <input 
                            type="text" 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Contoh: Pemakaian untuk panel pintu depan & bumper..."
                            className="w-full p-8 border-2 border-gray-100 rounded-[2rem] focus:border-orange-500 font-bold text-xl placeholder-gray-300 shadow-sm bg-white"
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting || !materialSearchTerm || !inputQty}
                        className="w-full py-9 bg-orange-500 text-white rounded-[2.5rem] font-black text-3xl shadow-[0_20px_50px_rgba(249,115,22,0.3)] hover:bg-orange-600 disabled:opacity-20 active:scale-[0.98] transition-all flex items-center justify-center gap-6 uppercase tracking-tighter"
                    >
                        {isSubmitting ? 'MENYIMPAN ALOKASI...' : <><Save size={40}/> Konfirmasi Pemakaian Bahan</>}
                    </button>
                </form>
            </div>
        )}

        {/* LOG HISTORY - PRECISION DATA TABLE */}
        {selectedJob && (
            <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-10 bg-gray-50/80 border-b border-gray-100 flex justify-between items-center backdrop-blur-md">
                    <h3 className="font-black text-gray-900 uppercase tracking-tight flex items-center gap-5 text-2xl"><History size={30} className="text-gray-300"/> Riwayat Pembebanan Unit</h3>
                    <div className="text-3xl font-black text-indigo-700 bg-white px-10 py-4 rounded-[1.5rem] border-2 border-indigo-50 shadow-sm tracking-tighter">{formatCurrency(totalUsageCost)}</div>
                </div>
                {usageHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-100 font-black text-gray-400 text-[11px] uppercase tracking-[0.3em]">
                                <tr>
                                    <th className="px-12 py-8">Timestamp</th>
                                    <th className="px-12 py-8">Deskripsi Item</th>
                                    <th className="px-12 py-8 text-center">Qty</th>
                                    <th className="px-12 py-8 text-right">Biaya Modal</th>
                                    <th className="px-12 py-8 text-center w-32">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {usageHistory.map((log, i) => (
                                    <tr key={i} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-12 py-8 text-gray-400 font-bold text-[11px] uppercase tracking-wider">
                                            {formatDateIndo(log.issuedAt)} 
                                            <span className="block text-[10px] mt-1 opacity-50 font-mono tracking-tight">{new Date(log.issuedAt).toLocaleTimeString()}</span>
                                        </td>
                                        <td className="px-12 py-8">
                                            <div className="font-black text-gray-900 text-lg leading-tight tracking-tight">{log.itemName}</div>
                                            <div className="text-[10px] text-gray-400 font-black uppercase mt-1 tracking-widest bg-gray-100/50 inline-block px-2 py-0.5 rounded-md">{log.itemCode} | {log.notes}</div>
                                        </td>
                                        <td className="px-12 py-8 text-center">
                                            <span className="bg-white text-indigo-900 px-6 py-2 rounded-2xl font-black text-base border-2 border-indigo-50 shadow-sm inline-block tracking-tighter">
                                                {log.inputQty || log.qty} {log.inputUnit || ''}
                                            </span>
                                        </td>
                                        <td className="px-12 py-8 text-right font-black text-emerald-600 text-xl tracking-tighter">{formatCurrency(log.totalCost)}</td>
                                        <td className="px-12 py-8 text-center">
                                            {userPermissions.role.includes('Manager') ? (
                                                <button onClick={() => handleCancelIssuance(log)} className="bg-red-50 text-red-500 p-4 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100 flex items-center justify-center mx-auto group-hover:scale-110"><XCircle size={24}/></button>
                                            ) : <div className="p-3 bg-gray-50 rounded-2xl text-gray-300 inline-block"><Clock size={20}/></div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="p-32 text-center text-gray-300 font-black uppercase text-sm italic tracking-[0.4em] bg-gray-50/30">No issuance records yet</div>}
            </div>
        )}
    </div>
  );
};

export default MaterialIssuanceView;