
import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem, UsageLogItem, Supplier } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
// Added missing ArrowRight import
import { Search, Truck, PaintBucket, CheckCircle, History, XCircle, Package, AlertCircle, Save, ArrowRight } from 'lucide-react';

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
  const [inputQty, setInputQty] = useState(0); 
  const [notes, setNotes] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>(''); 

  // Derived Data
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
    const lowerFilter = filterWo.toLowerCase();
    return activeJobs.filter(j => 
        (j.woNumber && j.woNumber.toLowerCase().includes(lowerFilter)) || 
        (j.policeNumber && j.policeNumber.toLowerCase().includes(lowerFilter))
    );
  }, [activeJobs, filterWo]);

  const materialInventory = useMemo(() => {
      return inventoryItems.filter(i => i.category === 'material');
  }, [inventoryItems]);

  // Reset states when changing WO or mode
  useEffect(() => {
      setMaterialSearchTerm('');
      setInputQty(0);
      setNotes('');
      setSelectedUnit('');
  }, [selectedJobId, issuanceType]);

  // --- LOGIC: Cari Item di Master ---
  const findItemInInventory = (term: string) => {
      const lowerTerm = term.toLowerCase().trim();
      return inventoryItems.find(i => 
          i.name.toLowerCase() === lowerTerm || 
          (i.code && i.code.toLowerCase() === lowerTerm)
      );
  };

  // --- HANDLER: PEMBEBANAN BAHAN (MATERIAL) ---
  const handleMaterialIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedJob) {
        showNotification("Pilih Work Order (WO) terlebih dahulu.", "error");
        return;
    }

    // Resolusi Item
    const item = findItemInInventory(materialSearchTerm);
    if (!item) {
        showNotification("Bahan tidak ditemukan. Pastikan nama bahan sesuai Master Stok.", "error");
        return;
    }

    if (inputQty <= 0) {
        showNotification("Masukkan jumlah pemakaian yang valid.", "error");
        return;
    }

    let finalQtyToDeduct = Number(inputQty);
    if (selectedUnit === 'ML' || selectedUnit === 'Gram') {
        finalQtyToDeduct = finalQtyToDeduct / 1000;
    }

    // Cek Stok (Hanya jika isStockManaged bukan false)
    if (item.isStockManaged !== false && Number(item.stock) < finalQtyToDeduct) {
        showNotification(`Stok tidak cukup! Tersedia: ${item.stock} ${item.unit}`, "error");
        return;
    }

    if (!window.confirm(`Konfirmasi pembebanan ${inputQty} ${selectedUnit || item.unit} ${item.name}?`)) return;

    setIsSubmitting(true);
    try {
        const itemCostTotal = (Number(item.buyPrice) || 0) * finalQtyToDeduct;
        
        // 1. Potong Stok Master
        const itemRef = doc(db, SPAREPART_COLLECTION, item.id);
        await updateDoc(itemRef, {
            stock: increment(-finalQtyToDeduct),
            updatedAt: serverTimestamp()
        });

        // 2. Buat Record Log
        const usageRecord: UsageLogItem = {
            itemId: item.id,
            itemName: item.name,
            itemCode: item.code || '-',
            qty: finalQtyToDeduct, 
            inputQty: Number(inputQty),
            inputUnit: selectedUnit || item.unit,
            costPerUnit: Number(item.buyPrice),
            totalCost: itemCostTotal,
            category: 'material',
            notes: notes || 'Pemakaian bahan',
            issuedAt: new Date().toISOString(),
            issuedBy: userPermissions.role 
        };

        // 3. Update Job
        const jobRef = doc(db, JOBS_COLLECTION, selectedJob.id);
        await updateDoc(jobRef, {
            'costData.hargaModalBahan': increment(itemCostTotal),
            usageLog: arrayUnion(usageRecord)
        });

        showNotification("Berhasil! Bahan telah dibebankan ke WO.", "success");
        setMaterialSearchTerm('');
        setInputQty(0);
        setNotes('');
        onRefreshData();
    } catch (error: any) {
        console.error("Material Submit Error:", error);
        showNotification("Gagal: " + error.message, "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- HANDLER: PEMBEBANAN PART (SPAREPART) ---
  const handlePartIssuance = async (estItem: EstimateItem, itemIndex: number) => {
      if (!selectedJob) return;

      // Resolusi Item dari Inventory Master
      const invItem = inventoryItems.find(i => 
          (estItem.inventoryId && i.id === estItem.inventoryId) || 
          (estItem.number && i.code && i.code.toUpperCase() === estItem.number.toUpperCase())
      );

      if (!invItem) {
          showNotification("Item tidak terhubung ke Master Stok. Hubungkan di Editor WO.", "error");
          return;
      }

      const qtyToIssue = Number(estItem.qty || 1);
      const readyStock = Number(invItem.stock || 0);

      if (readyStock < qtyToIssue) {
          showNotification(`Stok GUDANG tidak cukup! (Tersedia: ${readyStock})`, "error");
          return;
      }

      if (!window.confirm(`Keluarkan ${qtyToIssue} ${invItem.unit} ${invItem.name}?`)) return;

      setIsSubmitting(true);
      try {
          // 1. Potong Stok Master
          await updateDoc(doc(db, SPAREPART_COLLECTION, invItem.id), {
              stock: increment(-qtyToIssue),
              updatedAt: serverTimestamp()
          });

          const itemCostTotal = (Number(invItem.buyPrice) || 0) * qtyToIssue;

          // 2. Log Record
          const usageRecord: UsageLogItem = {
            itemId: invItem.id,
            itemName: invItem.name,
            itemCode: invItem.code || '-',
            qty: qtyToIssue,
            costPerUnit: Number(invItem.buyPrice),
            totalCost: itemCostTotal,
            category: 'sparepart',
            notes: 'Sesuai Estimasi',
            issuedAt: new Date().toISOString(),
            issuedBy: userPermissions.role
          };

          // 3. Update Status di Array WO
          const newPartItems = [...(selectedJob.estimateData?.partItems || [])];
          newPartItems[itemIndex] = { ...newPartItems[itemIndex], hasArrived: true }; 

          // 4. Update Database
          const jobRef = doc(db, JOBS_COLLECTION, selectedJob.id);
          await updateDoc(jobRef, {
              'estimateData.partItems': newPartItems,
              'costData.hargaBeliPart': increment(itemCostTotal),
              usageLog: arrayUnion(usageRecord)
          });

          showNotification(`Berhasil! Part ${invItem.name} telah dikeluarkan.`, "success");
          onRefreshData();
      } catch (error: any) {
          console.error("Part Issuance Error:", error);
          showNotification("Gagal: " + error.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleCancelIssuance = async (logItem: UsageLogItem) => {
    if (!selectedJob || !userPermissions.role.includes('Manager')) return;
    const reason = window.prompt("Alasan pembatalan:", "Salah input");
    if (!reason) return;

    setIsSubmitting(true);
    try {
        await updateDoc(doc(db, SPAREPART_COLLECTION, logItem.itemId), { stock: increment(logItem.qty) });
        
        const newLog = selectedJob.usageLog?.filter(l => !(l.itemId === logItem.itemId && l.issuedAt === logItem.issuedAt)) || [];
        const costField = logItem.category === 'material' ? 'costData.hargaModalBahan' : 'costData.hargaBeliPart';
        
        const updatePayload: any = {
            usageLog: newLog,
            [costField]: increment(-logItem.totalCost)
        };

        if (logItem.category === 'sparepart') {
            const parts = [...(selectedJob.estimateData?.partItems || [])];
            const idx = parts.findIndex(p => p.inventoryId === logItem.itemId && p.hasArrived);
            if (idx >= 0) {
                parts[idx] = { ...parts[idx], hasArrived: false };
                updatePayload['estimateData.partItems'] = parts;
            }
        }

        await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), updatePayload);
        showNotification("Pembatalan berhasil.", "success");
        onRefreshData();
    } catch (e: any) {
        showNotification("Gagal batal: " + e.message, "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  const currentItem = findItemInInventory(materialSearchTerm);
  const unitOptions = useMemo(() => {
      const base = currentItem?.unit || 'Liter';
      const opts = [base];
      if (base === 'Liter') opts.push('ML');
      if (base === 'Kg') opts.push('Gram');
      if (!opts.includes('Pcs')) opts.push('Pcs');
      return opts;
  }, [currentItem]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in p-4">
        {/* HEADER */}
        <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl shadow-sm ${issuanceType === 'sparepart' ? 'bg-indigo-600 text-white' : 'bg-orange-500 text-white'}`}>
                {issuanceType === 'sparepart' ? <Truck size={32}/> : <PaintBucket size={32}/>}
            </div>
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                    {issuanceType === 'sparepart' ? 'KELUAR PART (WO)' : 'PAKAI BAHAN BAKU'}
                </h1>
                <p className="text-gray-500 font-medium">Manajemen alokasi stok gudang ke unit kerja.</p>
            </div>
        </div>

        {/* SEARCH WO */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
                <Search size={20} className="text-gray-400"/>
                <label className="text-sm font-bold text-gray-700">Cari Nomor WO atau Nomor Polisi</label>
            </div>
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Contoh: WO2412... atau B1234..." 
                    value={filterWo} 
                    onChange={e => {
                        setFilterWo(e.target.value);
                        if(!e.target.value) setSelectedJobId('');
                    }}
                    className="w-full p-4 border-2 border-gray-100 rounded-xl focus:border-indigo-500 focus:ring-0 text-xl font-mono uppercase transition-all"
                />
                
                {filterWo && !selectedJobId && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
                        {filteredJobs.length > 0 ? filteredJobs.map(job => (
                            <button 
                                key={job.id}
                                onClick={() => { setSelectedJobId(job.id); setFilterWo(job.woNumber || job.policeNumber); }}
                                className="w-full text-left p-4 hover:bg-indigo-50 border-b flex justify-between items-center group"
                            >
                                <div>
                                    <span className="font-black text-indigo-700 block">{job.woNumber || 'DRAFT'}</span>
                                    <span className="text-sm text-gray-600 font-bold">{job.policeNumber} - {job.carModel}</span>
                                </div>
                                {/* Added missing ArrowRight component */}
                                <ArrowRight size={18} className="text-gray-300 group-hover:text-indigo-600 transition-all" />
                            </button>
                        )) : <div className="p-4 text-center text-gray-400 font-medium">Data WO tidak ditemukan</div>}
                    </div>
                )}
            </div>

            {selectedJob && (
                <div className="mt-4 p-5 bg-indigo-50 rounded-2xl border-2 border-indigo-100 flex justify-between items-center animate-pulse-once">
                    <div>
                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">UNIT TERPILIH</span>
                        <h3 className="text-2xl font-black text-indigo-900">{selectedJob.woNumber}</h3>
                        <p className="text-indigo-700 font-bold">{selectedJob.policeNumber} | {selectedJob.carModel} | {selectedJob.customerName}</p>
                    </div>
                    <button onClick={() => { setSelectedJobId(''); setFilterWo(''); }} className="bg-white px-4 py-2 rounded-lg text-xs font-bold text-red-500 border border-red-100 hover:bg-red-50 transition-all">GANTI WO</button>
                </div>
            )}
        </div>

        {/* MODE: SPAREPART */}
        {issuanceType === 'sparepart' && selectedJob && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b bg-gray-50 flex items-center gap-2">
                    <Truck size={20} className="text-indigo-600"/>
                    <h3 className="font-black text-gray-800 uppercase tracking-tight">Daftar Kebutuhan Part (Sesuai Estimasi)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Nama Part / No. Part</th>
                                <th className="px-6 py-4 text-center">Qty WO</th>
                                <th className="px-6 py-4 text-center">Stok Gudang</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(selectedJob.estimateData?.partItems || []).map((item, idx) => {
                                const inv = inventoryItems.find(i => 
                                    (item.inventoryId && i.id === item.inventoryId) || 
                                    (item.number && i.code && i.code.toUpperCase() === item.number.toUpperCase())
                                );
                                const isIssued = item.hasArrived;
                                const canIssue = inv && Number(inv.stock) >= (item.qty || 1);

                                return (
                                    <tr key={idx} className={`${isIssued ? 'bg-green-50/50' : 'hover:bg-gray-50'} transition-all`}>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-800">{item.name}</div>
                                            <div className="text-xs font-mono text-gray-500">{item.number || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-black text-indigo-900 text-lg">{item.qty || 1}</td>
                                        <td className="px-6 py-4 text-center">
                                            {inv ? (
                                                <div className={`inline-flex flex-col items-center px-3 py-1 rounded-lg ${Number(inv.stock) > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                                                    <span className="text-sm font-black">{inv.stock}</span>
                                                    <span className="text-[10px] uppercase font-bold">{inv.unit}</span>
                                                </div>
                                            ) : <span className="text-gray-400 text-xs italic">Belum Terhubung</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isIssued ? (
                                                <div className="flex items-center justify-end gap-2 text-green-600 font-black text-xs uppercase">
                                                    <CheckCircle size={16}/> DIKELUARKAN
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handlePartIssuance(item, idx)}
                                                    disabled={isSubmitting || !canIssue}
                                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-md hover:bg-indigo-700 disabled:opacity-20 transition-all active:scale-95"
                                                >
                                                    {isSubmitting ? '...' : 'KELUARKAN'}
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

        {/* MODE: MATERIAL */}
        {issuanceType === 'material' && selectedJob && (
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <PaintBucket size={22} className="text-orange-500"/>
                    <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Input Pemakaian Bahan</h3>
                </div>
                
                <form onSubmit={handleMaterialIssuance} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-600">Nama Bahan Baku</label>
                            <div className="relative">
                                <Search className="absolute left-4 top-4 text-gray-400" size={18}/>
                                <input 
                                    list="mat-list"
                                    type="text" 
                                    placeholder="Ketik nama bahan..."
                                    value={materialSearchTerm}
                                    onChange={e => setMaterialSearchTerm(e.target.value)}
                                    className="w-full pl-11 p-4 border-2 border-gray-100 rounded-xl focus:border-orange-500 font-bold"
                                />
                                <datalist id="mat-list">
                                    {materialInventory.map(m => <option key={m.id} value={m.name}>{m.code} | Stok: {m.stock}</option>)}
                                </datalist>
                            </div>
                            {currentItem && (
                                <div className="flex justify-between items-center p-3 bg-orange-50 border border-orange-100 rounded-xl">
                                    <div className="text-xs font-bold text-orange-800">{currentItem.name}</div>
                                    <div className="text-sm font-black text-orange-900">STOK: {currentItem.stock} {currentItem.unit}</div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-600">Jumlah & Satuan</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" step="0.01" required
                                    value={inputQty || ''}
                                    onChange={e => setInputQty(Number(e.target.value))}
                                    placeholder="0.00"
                                    className="flex-grow p-4 border-2 border-gray-100 rounded-xl focus:border-orange-500 text-2xl font-black text-center"
                                />
                                <select 
                                    value={selectedUnit} 
                                    onChange={e => setSelectedUnit(e.target.value)}
                                    className="w-32 p-4 border-2 border-gray-100 rounded-xl bg-gray-50 font-black text-center"
                                >
                                    {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-600">Catatan (Opsional)</label>
                        <input 
                            type="text" 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Contoh: Pemakaian untuk panel pintu kanan..."
                            className="w-full p-4 border-2 border-gray-100 rounded-xl focus:border-orange-500"
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting || !materialSearchTerm || inputQty <= 0}
                        className="w-full py-5 bg-orange-500 text-white rounded-2xl font-black text-xl shadow-lg hover:bg-orange-600 disabled:opacity-30 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                        {isSubmitting ? 'MEMPROSES...' : <><Save size={24}/> SIMPAN PEMBEBANAN</>}
                    </button>
                </form>
            </div>
        )}

        {/* HISTORY */}
        {selectedJob && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
                    <h3 className="font-black text-gray-800 uppercase tracking-tight flex items-center gap-2"><History size={18}/> Riwayat Keluar Barang (WO Ini)</h3>
                    <div className="text-xl font-black text-indigo-700">{formatCurrency(totalUsageCost)}</div>
                </div>
                {usageHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 font-black text-gray-500 text-[10px] uppercase">
                                <tr>
                                    <th className="px-6 py-4">Tanggal</th>
                                    <th className="px-6 py-4">Nama Barang</th>
                                    <th className="px-6 py-4 text-center">Qty Keluar</th>
                                    <th className="px-6 py-4 text-right">Biaya Modal</th>
                                    <th className="px-6 py-4 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {usageHistory.map((log, i) => (
                                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{formatDateIndo(log.issuedAt)}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-800">{log.itemName}</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{log.itemCode} | {log.notes}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center font-black text-indigo-900">
                                            {log.inputQty || log.qty} {log.inputUnit || ''}
                                        </td>
                                        {/* Fixed: display individual item total cost instead of aggregate totalUsageCost */}
                                        <td className="px-6 py-4 text-right font-bold text-emerald-600">{formatCurrency(log.totalCost)}</td>
                                        <td className="px-6 py-4 text-center">
                                            {userPermissions.role.includes('Manager') && (
                                                <button onClick={() => handleCancelIssuance(log)} className="text-red-500 font-black text-[10px] hover:underline">BATAL</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="p-12 text-center text-gray-400 italic font-medium">Belum ada pengeluaran barang untuk WO ini.</div>}
            </div>
        )}
    </div>
  );
};

export default MaterialIssuanceView;
