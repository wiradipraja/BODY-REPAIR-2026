import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem, UsageLogItem, Supplier } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { Search, Truck, PaintBucket, CheckCircle, History, Save, ArrowRight, AlertTriangle, Info, Package, XCircle } from 'lucide-react';

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

  // Selected Job Reference
  const selectedJob = useMemo(() => activeJobs.find(j => j.id === selectedJobId), [activeJobs, selectedJobId]);
  
  // History filtered by type
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
    return activeJobs.filter(j => 
        (j.woNumber && j.woNumber.toLowerCase().includes(lowerFilter)) || 
        (j.policeNumber && j.policeNumber.toLowerCase().includes(lowerFilter))
    );
  }, [activeJobs, filterWo]);

  const materialInventory = useMemo(() => {
      return inventoryItems.filter(i => i.category === 'material');
  }, [inventoryItems]);

  // RESET local state when context changes
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

  // --- HANDLER: PAKAI BAHAN ---
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

    if (!window.confirm(`Gunakan ${qty} ${selectedUnit || item.unit} ${item.name} untuk WO ${selectedJob.woNumber}?`)) return;

    setIsSubmitting(true);
    try {
        const itemSnap = await getDoc(doc(db, SPAREPART_COLLECTION, item.id));
        const currentStock = itemSnap.exists() ? Number(itemSnap.data().stock || 0) : 0;

        if (item.isStockManaged !== false && currentStock < finalDeductQty) {
            throw new Error(`Stok tidak cukup di Gudang. Tersedia: ${currentStock} ${item.unit}`);
        }

        const cost = (Number(item.buyPrice) || 0) * finalDeductQty;
        
        // CRITICAL FIX: Use cleanObject and provide fallbacks for all fields
        const logEntry: UsageLogItem = cleanObject({
            itemId: item.id,
            itemName: item.name,
            itemCode: item.code || '-',
            qty: finalDeductQty,
            inputQty: qty,
            inputUnit: selectedUnit || item.unit || 'Unit',
            costPerUnit: Number(item.buyPrice) || 0,
            totalCost: cost,
            category: 'material',
            notes: notes || 'Pemakaian Bahan',
            issuedAt: new Date().toISOString(),
            issuedBy: userPermissions.role || 'Staff'
        });

        // Update Stok
        await updateDoc(doc(db, SPAREPART_COLLECTION, item.id), {
            stock: increment(-finalDeductQty),
            updatedAt: serverTimestamp()
        });

        // Update WO
        await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), {
            'costData.hargaModalBahan': increment(cost),
            usageLog: arrayUnion(logEntry)
        });

        showNotification("Berhasil! Bahan telah dibebankan.", "success");
        setMaterialSearchTerm('');
        setInputQty('');
        onRefreshData();
    } catch (err: any) {
        showNotification(err.message, "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- HANDLER: KELUAR PART (Sesuai Estimasi) ---
  const handlePartIssuance = async (estItem: EstimateItem, idx: number) => {
    if (!selectedJob) return;

    const inv = inventoryItems.find(i => 
        (estItem.inventoryId && i.id === estItem.inventoryId) || 
        (estItem.number && i.code && i.code.toUpperCase().trim() === estItem.number.toUpperCase().trim())
    );

    if (!inv) {
        showNotification("Part ini belum terhubung ke Master Stok.", "error");
        return;
    }

    const reqQty = Number(estItem.qty || 1);
    
    setIsSubmitting(true);
    try {
        const invSnap = await getDoc(doc(db, SPAREPART_COLLECTION, inv.id));
        const stockNow = invSnap.exists() ? Number(invSnap.data().stock || 0) : 0;

        if (stockNow < reqQty) {
            throw new Error(`Stok ${inv.name} di Gudang tidak cukup! (Sisa: ${stockNow})`);
        }

        if (!window.confirm(`Keluarkan ${reqQty} ${inv.unit} ${inv.name} untuk WO ini?`)) {
            setIsSubmitting(false);
            return;
        }

        const cost = (Number(inv.buyPrice) || 0) * reqQty;

        // Potong Stok
        await updateDoc(doc(db, SPAREPART_COLLECTION, inv.id), {
            stock: increment(-reqQty),
            updatedAt: serverTimestamp()
        });

        // Update Job Data
        const currentPartItems = [...(selectedJob.estimateData?.partItems || [])];
        currentPartItems[idx] = { ...currentPartItems[idx], hasArrived: true };

        // CRITICAL FIX: Use cleanObject and provide fallbacks
        const log: UsageLogItem = cleanObject({
            itemId: inv.id, 
            itemName: inv.name, 
            itemCode: inv.code || '-',
            qty: reqQty, 
            costPerUnit: Number(inv.buyPrice) || 0, 
            totalCost: cost,
            category: 'sparepart', 
            notes: 'Sesuai Estimasi WO',
            issuedAt: new Date().toISOString(), 
            issuedBy: userPermissions.role || 'Staff'
        });

        await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), {
            'estimateData.partItems': currentPartItems,
            'costData.hargaBeliPart': increment(cost),
            usageLog: arrayUnion(log)
        });

        showNotification("Part berhasil dikeluarkan.", "success");
        onRefreshData();
    } catch (err: any) {
        showNotification(err.message, "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleCancelIssuance = async (log: UsageLogItem) => {
    if (!selectedJob || !userPermissions.role.includes('Manager')) return;
    if (!window.confirm("Batalkan pengeluaran barang ini? Stok akan dikembalikan ke Gudang.")) return;

    setIsSubmitting(true);
    try {
        // Kembalikan stok
        await updateDoc(doc(db, SPAREPART_COLLECTION, log.itemId), { stock: increment(log.qty) });
        
        // Hapus dari log
        const newLog = (selectedJob.usageLog || []).filter(l => !(l.itemId === log.itemId && l.issuedAt === log.issuedAt));
        const field = log.category === 'material' ? 'costData.hargaModalBahan' : 'costData.hargaBeliPart';
        
        const payload: any = { 
            usageLog: newLog, 
            [field]: increment(-log.totalCost) 
        };
        
        if (log.category === 'sparepart') {
            const parts = [...(selectedJob.estimateData?.partItems || [])];
            const pIdx = parts.findIndex(p => p.inventoryId === log.itemId && p.hasArrived);
            if (pIdx >= 0) parts[pIdx].hasArrived = false;
            payload['estimateData.partItems'] = parts;
        }

        await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), cleanObject(payload));
        showNotification("Berhasil dibatalkan.", "success");
        onRefreshData();
    } catch (e: any) {
        showNotification("Gagal batal: " + e.message, "error");
    } finally {
        setIsSubmitting(false);
    }
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
    <div className="max-w-6xl mx-auto space-y-6 p-4 animate-fade-in pb-12">
        {/* MODZ HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-5">
                <div className={`p-4 rounded-2xl shadow-lg ${issuanceType === 'sparepart' ? 'bg-indigo-600' : 'bg-orange-500'} text-white`}>
                    {issuanceType === 'sparepart' ? <Truck size={36}/> : <PaintBucket size={36}/>}
                </div>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase leading-none">
                        {issuanceType === 'sparepart' ? 'Keluar Part (WO)' : 'Pakai Bahan Baku'}
                    </h1>
                    <p className="text-gray-500 font-medium mt-1">Alokasi stok gudang untuk kebutuhan operasional unit.</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <div className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                    <span className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Total Biaya WO Ini</span>
                    <span className="text-xl font-black text-indigo-700">{formatCurrency(totalUsageCost)}</span>
                </div>
            </div>
        </div>

        {/* SEARCH WORK ORDER */}
        <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><Search size={20} className="text-gray-500"/></div>
                <label className="text-sm font-black text-gray-700 uppercase tracking-tight">Pilih Work Order atau Nomor Polisi</label>
            </div>
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Contoh: WO2501... atau B1234ABC..." 
                    value={filterWo} 
                    onChange={e => { setFilterWo(e.target.value); if(!e.target.value) setSelectedJobId(''); }}
                    className="w-full p-5 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 text-2xl font-mono font-bold uppercase transition-all shadow-inner bg-gray-50/50"
                />
                {filterWo && !selectedJobId && (
                    <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 max-h-80 overflow-y-auto divide-y divide-gray-50">
                        {filteredJobs.length > 0 ? filteredJobs.map(job => (
                            <button 
                                key={job.id}
                                onClick={() => { setSelectedJobId(job.id); setFilterWo(job.woNumber || job.policeNumber); }}
                                className="w-full text-left p-5 hover:bg-indigo-50 flex justify-between items-center group transition-colors"
                            >
                                <div>
                                    <span className="font-black text-indigo-700 block text-lg">{job.woNumber || 'DRAFT'}</span>
                                    <span className="text-sm text-gray-600 font-bold">{job.policeNumber} — {job.carModel}</span>
                                    <span className="text-xs text-gray-400 block">{job.customerName}</span>
                                </div>
                                <ArrowRight size={24} className="text-gray-200 group-hover:text-indigo-600 transition-all transform group-hover:translate-x-1" />
                            </button>
                        )) : <div className="p-10 text-center text-gray-400 font-medium italic">Data WO tidak ditemukan</div>}
                    </div>
                )}
            </div>

            {selectedJob && (
                <div className="mt-6 p-6 bg-indigo-600 rounded-2xl border-2 border-indigo-700 flex justify-between items-center shadow-lg animate-fade-in">
                    <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl"><Package className="text-white" size={24}/></div>
                        <div>
                            <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">UNIT TERPILIH</span>
                            <h3 className="text-2xl font-black text-white leading-tight">{selectedJob.woNumber}</h3>
                            <p className="text-indigo-100 font-bold text-sm uppercase">{selectedJob.policeNumber} • {selectedJob.carModel} • {selectedJob.namaAsuransi}</p>
                        </div>
                    </div>
                    <button onClick={() => { setSelectedJobId(''); setFilterWo(''); }} className="bg-white/10 hover:bg-white/20 px-5 py-2.5 rounded-xl text-xs font-black text-white border border-white/20 transition-all active:scale-95">GANTI WO</button>
                </div>
            )}
        </div>

        {/* MODAL SPAREPART LIST */}
        {issuanceType === 'sparepart' && selectedJob && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-6 border-b bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Truck size={24} className="text-indigo-600"/>
                        <h3 className="font-black text-gray-800 uppercase tracking-tight">Daftar Kebutuhan Part Sesuai Estimasi</h3>
                    </div>
                    <span className="text-xs font-bold text-gray-400 italic">Data ditarik dari WO SA</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 text-[11px] font-black text-gray-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-8 py-5">Item Part / Nomor Part</th>
                                <th className="px-8 py-5 text-center">Estimasi</th>
                                <th className="px-8 py-5 text-center">Stok Gudang</th>
                                <th className="px-8 py-5 text-right">Aksi</th>
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
                                    <tr key={idx} className={`${isIssued ? 'bg-emerald-50/50' : 'hover:bg-indigo-50/30'} transition-all`}>
                                        <td className="px-8 py-6">
                                            <div className="font-black text-gray-800 text-base">{item.name}</div>
                                            <div className="text-xs font-mono text-gray-400 mt-1">{item.number || 'TANPA KODE'}</div>
                                        </td>
                                        <td className="px-8 py-6 text-center font-black text-indigo-900 text-xl">{reqQty}</td>
                                        <td className="px-8 py-6 text-center">
                                            {inv ? (
                                                <div className={`inline-flex flex-col items-center px-4 py-2 rounded-2xl ${readyStock >= reqQty ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'} border border-current opacity-80`}>
                                                    <span className="text-base font-black">{readyStock}</span>
                                                    <span className="text-[10px] uppercase font-bold tracking-tighter">{inv.unit}</span>
                                                </div>
                                            ) : <span className="text-gray-300 text-xs italic font-medium">Not Linked</span>}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            {isIssued ? (
                                                <div className="flex items-center justify-end gap-2 text-emerald-600 font-black text-xs uppercase bg-emerald-100 px-4 py-2 rounded-xl inline-flex shadow-sm">
                                                    <CheckCircle size={18}/> Dikeluarkan
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handlePartIssuance(item, idx)}
                                                    disabled={isSubmitting || !inv || readyStock < reqQty}
                                                    className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase shadow-md hover:bg-indigo-700 disabled:opacity-20 transition-all active:scale-95 flex items-center gap-2 ml-auto"
                                                >
                                                    {isSubmitting ? '...' : <><Save size={18}/> Keluarkan</>}
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

        {/* MATERIAL FORM (Pakai Bahan) */}
        {issuanceType === 'material' && selectedJob && (
            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-8 animate-fade-in">
                <div className="flex items-center gap-3">
                    <PaintBucket size={24} className="text-orange-500"/>
                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Input Pemakaian Bahan Baku</h3>
                </div>
                
                <form onSubmit={handleMaterialIssuance} className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <label className="text-sm font-black text-gray-600 uppercase tracking-widest">Cari Bahan di Stok</label>
                            <div className="relative">
                                <Search className="absolute left-5 top-5 text-gray-400" size={22}/>
                                <input 
                                    list="mat-list"
                                    type="text" 
                                    placeholder="Ketik Nama atau Kode Bahan..."
                                    value={materialSearchTerm}
                                    onChange={e => setMaterialSearchTerm(e.target.value)}
                                    className="w-full pl-14 p-5 border-2 border-gray-100 rounded-2xl focus:border-orange-500 font-bold bg-gray-50/50"
                                />
                                <datalist id="mat-list">
                                    {materialInventory.map(m => <option key={m.id} value={m.name}>{m.code} | Stok: {m.stock} {m.unit}</option>)}
                                </datalist>
                            </div>
                            {currentItem && (
                                <div className="flex justify-between items-center p-5 bg-orange-50 border-2 border-orange-100 rounded-2xl shadow-inner animate-pulse-once">
                                    <div className="text-sm font-black text-orange-800 uppercase">{currentItem.name}</div>
                                    <div className="text-lg font-black text-orange-900 bg-white px-4 py-1 rounded-xl border border-orange-200">GUDANG: {currentItem.stock} {currentItem.unit}</div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-black text-gray-600 uppercase tracking-widest">Jumlah yang Digunakan</label>
                            <div className="flex gap-3">
                                <input 
                                    type="number" step="0.01" required
                                    value={inputQty}
                                    onChange={e => setInputQty(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0.00"
                                    className="flex-grow p-5 border-2 border-gray-100 rounded-2xl focus:border-orange-500 text-3xl font-black text-center text-orange-700 bg-gray-50/50 shadow-inner"
                                />
                                <select 
                                    value={selectedUnit} 
                                    onChange={e => setSelectedUnit(e.target.value)}
                                    className="w-40 p-5 border-2 border-gray-100 rounded-2xl bg-white font-black text-center text-lg shadow-sm"
                                >
                                    {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-black text-gray-600 uppercase tracking-widest">Catatan Tambahan</label>
                        <input 
                            type="text" 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Contoh: Pemakaian untuk panel pintu depan..."
                            className="w-full p-5 border-2 border-gray-100 rounded-2xl focus:border-orange-500 font-medium"
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting || !materialSearchTerm || !inputQty}
                        className="w-full py-6 bg-orange-500 text-white rounded-2xl font-black text-2xl shadow-xl hover:bg-orange-600 disabled:opacity-20 active:scale-[0.98] transition-all flex items-center justify-center gap-4 uppercase tracking-tight"
                    >
                        {isSubmitting ? 'SEDANG MEMPROSES...' : <><Save size={32}/> Simpan Pemakaian Bahan</>}
                    </button>
                </form>
            </div>
        )}

        {/* LOG HISTORY */}
        {selectedJob && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
                    <h3 className="font-black text-gray-800 uppercase tracking-tight flex items-center gap-3"><History size={24} className="text-gray-400"/> Riwayat Keluar Barang (WO Ini)</h3>
                    <div className="text-2xl font-black text-indigo-700 bg-indigo-50 px-5 py-1.5 rounded-2xl border border-indigo-100">{formatCurrency(totalUsageCost)}</div>
                </div>
                {usageHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 font-black text-gray-500 text-[11px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-8 py-5">Tanggal & Jam</th>
                                    <th className="px-8 py-5">Deskripsi Barang</th>
                                    <th className="px-8 py-5 text-center">Qty</th>
                                    <th className="px-8 py-5 text-right">Biaya Modal</th>
                                    <th className="px-8 py-5 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {usageHistory.map((log, i) => (
                                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-8 py-5 text-gray-400 font-medium">{formatDateIndo(log.issuedAt)} <span className="text-[10px] ml-1 opacity-50">{new Date(log.issuedAt).toLocaleTimeString()}</span></td>
                                        <td className="px-8 py-5">
                                            <div className="font-black text-gray-800">{log.itemName}</div>
                                            <div className="text-[10px] text-gray-400 font-mono uppercase mt-0.5">{log.itemCode} | {log.notes}</div>
                                        </td>
                                        <td className="px-8 py-5 text-center font-black text-indigo-900 bg-indigo-50/30">
                                            {log.inputQty || log.qty} {log.inputUnit || ''}
                                        </td>
                                        <td className="px-8 py-5 text-right font-black text-emerald-600">{formatCurrency(log.totalCost)}</td>
                                        <td className="px-8 py-5 text-center">
                                            {userPermissions.role.includes('Manager') ? (
                                                <button onClick={() => handleCancelIssuance(log)} className="bg-red-50 text-red-500 p-2 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"><XCircle size={18}/></button>
                                            ) : <span className="text-[10px] text-gray-300 font-bold uppercase italic">Locked</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="p-20 text-center text-gray-300 italic font-medium">Belum ada barang yang dibebankan ke WO ini.</div>}
            </div>
        )}
    </div>
  );
};

export default MaterialIssuanceView;