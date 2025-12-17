import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem, UsageLogItem, Supplier } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { Search, Package, Truck, PaintBucket, CheckCircle, AlertCircle, ArrowRight, History, XCircle, Scale } from 'lucide-react';

interface MaterialIssuanceViewProps {
  activeJobs: Job[];
  inventoryItems: InventoryItem[];
  suppliers: Supplier[]; // Kept for prop compatibility but unused in UI
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
  const [selectedMaterialId, setSelectedMaterialId] = useState(''); 
  const [inputQty, setInputQty] = useState(0); 
  const [notes, setNotes] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>(''); 

  // Derived Data
  const selectedJob = useMemo(() => activeJobs.find(j => j.id === selectedJobId), [activeJobs, selectedJobId]);
  
  const usageHistory = useMemo(() => {
      if (!selectedJob || !selectedJob.usageLog) return [];
      return selectedJob.usageLog
        .filter(log => log.category === issuanceType)
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [selectedJob, issuanceType]);

  const totalUsageCost = useMemo(() => {
      return usageHistory.reduce((acc, curr) => acc + curr.totalCost, 0);
  }, [usageHistory]);

  const filteredJobs = useMemo(() => {
    if (!filterWo) return activeJobs.slice(0, 10);
    const lowerFilter = filterWo.toLowerCase();
    return activeJobs.filter(j => 
        (j.woNumber && j.woNumber.toLowerCase().includes(lowerFilter)) || 
        j.policeNumber.toLowerCase().includes(lowerFilter)
    );
  }, [activeJobs, filterWo]);

  const materialInventory = useMemo(() => {
      return inventoryItems.filter(i => i.category === 'material');
  }, [inventoryItems]);

  useEffect(() => {
      setMaterialSearchTerm('');
      setSelectedMaterialId('');
      setInputQty(0);
      setNotes('');
      setSelectedUnit('');
  }, [selectedJobId, issuanceType]);

  // --- HANDLER: PEMBEBANAN BAHAN (MATERIAL) ---
  const handleMaterialIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedJob) return;
    if (selectedJob.isClosed) {
        showNotification("WO sudah closed. Transaksi ditolak.", "error");
        return;
    }

    let targetId = selectedMaterialId;
    if (!targetId && materialSearchTerm) {
        const match = materialInventory.find(i => 
            i.name.toLowerCase() === materialSearchTerm.toLowerCase() || 
            (i.code && i.code.toLowerCase() === materialSearchTerm.toLowerCase())
        );
        if (match) targetId = match.id;
    }

    if (!targetId || inputQty <= 0) {
        showNotification("Pilih bahan dan masukkan jumlah yang valid.", "error");
        return;
    }
    
    const item = inventoryItems.find(i => i.id === targetId);
    if (!item) {
        showNotification("Data bahan tidak ditemukan.", "error");
        return;
    }

    let finalQty = Number(inputQty);
    if (selectedUnit === 'ML' || selectedUnit === 'Gram') {
        finalQty = finalQty / 1000;
    }

    const isVendorManaged = item.isStockManaged === false; 
    if (!isVendorManaged && item.stock < finalQty) {
        showNotification(`Stok ${item.name} tidak cukup! (Tersedia: ${item.stock} ${item.unit})`, "error");
        return;
    }

    if (!window.confirm(`Simpan pembebanan: ${inputQty} ${selectedUnit} ${item.name}?`)) return;

    setIsSubmitting(true);
    try {
        const itemCostTotal = (item.buyPrice || 0) * finalQty;
        
        await updateDoc(doc(db, SPAREPART_COLLECTION, targetId), {
            stock: increment(-finalQty),
            updatedAt: serverTimestamp()
        });

        const usageRecord: UsageLogItem = {
            itemId: targetId,
            itemName: item.name,
            itemCode: item.code || '-',
            qty: finalQty, 
            inputQty: Number(inputQty),
            inputUnit: selectedUnit || item.unit,
            costPerUnit: item.buyPrice,
            totalCost: itemCostTotal,
            category: 'material',
            notes: notes || 'Pemakaian bahan',
            issuedAt: new Date().toISOString(),
            issuedBy: userPermissions.role 
        };

        await updateDoc(doc(db, JOBS_COLLECTION, selectedJobId), {
            'costData.hargaModalBahan': increment(itemCostTotal),
            usageLog: arrayUnion(usageRecord)
        });

        showNotification("Bahan berhasil dibebankan.", "success");
        setInputQty(0);
        setNotes('');
        setMaterialSearchTerm('');
        setSelectedMaterialId('');
        onRefreshData();
    } catch (error: any) {
        console.error("Material Issuance Error:", error);
        showNotification("Gagal: " + error.message, "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- HANDLER: PEMBEBANAN PART (SPAREPART) ---
  const handlePartIssuance = async (estItem: EstimateItem, itemIndex: number, linkedInventoryId: string) => {
      if (!selectedJob) return;
      if (selectedJob.isClosed) {
        showNotification("WO sudah closed.", "error");
        return;
      }

      const invItem = inventoryItems.find(i => i.id === linkedInventoryId);
      if (!invItem) {
          showNotification("Data inventory tidak ditemukan.", "error");
          return;
      }

      const qtyToIssue = Number(estItem.qty || 1);

      if (invItem.stock < qtyToIssue) {
          showNotification(`Stok GUDANG tidak cukup!`, "error");
          return;
      }

      if (!window.confirm(`Keluarkan ${qtyToIssue} ${invItem.unit} ${invItem.name}?`)) return;

      setIsSubmitting(true);
      try {
          await updateDoc(doc(db, SPAREPART_COLLECTION, linkedInventoryId), {
              stock: increment(-qtyToIssue),
              updatedAt: serverTimestamp()
          });

          const itemCostTotal = (invItem.buyPrice || 0) * qtyToIssue;

          const usageRecord: UsageLogItem = {
            itemId: invItem.id,
            itemName: invItem.name,
            itemCode: invItem.code || '-',
            qty: qtyToIssue,
            costPerUnit: invItem.buyPrice,
            totalCost: itemCostTotal,
            category: 'sparepart',
            notes: 'Sesuai Estimasi',
            issuedAt: new Date().toISOString(),
            issuedBy: userPermissions.role
          };

          const newPartItems = [...(selectedJob.estimateData?.partItems || [])];
          if (newPartItems[itemIndex]) {
              newPartItems[itemIndex] = { ...newPartItems[itemIndex], hasArrived: true }; 
          }

          await updateDoc(doc(db, JOBS_COLLECTION, selectedJobId), {
              'estimateData.partItems': newPartItems,
              'costData.hargaBeliPart': increment(itemCostTotal),
              usageLog: arrayUnion(usageRecord)
          });

          showNotification(`Part ${invItem.name} berhasil dikeluarkan.`, "success");
          onRefreshData();
      } catch (error: any) {
          console.error("Part Issuance Error:", error);
          showNotification("Gagal: " + error.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleCancelIssuance = async (logItem: UsageLogItem) => {
      if (!selectedJob || !userPermissions.role.includes('Manager')) {
          showNotification("Akses ditolak.", "error");
          return;
      }
      if (selectedJob.isClosed) {
          showNotification("WO Sudah Closed!", "error");
          return;
      }

      const reason = window.prompt(`Batalkan pembebanan ${logItem.itemName}? Masukkan alasan:`, "Salah input");
      if (reason === null || !reason.trim()) return;

      setIsSubmitting(true);
      try {
          await updateDoc(doc(db, SPAREPART_COLLECTION, logItem.itemId), {
              stock: increment(logItem.qty),
              updatedAt: serverTimestamp()
          });

          const currentLog = selectedJob.usageLog || [];
          const newUsageLog = currentLog.filter(item => 
              !(item.itemId === logItem.itemId && item.issuedAt === logItem.issuedAt)
          );

          const costField = logItem.category === 'material' ? 'costData.hargaModalBahan' : 'costData.hargaBeliPart';
          
          const updatePayload: any = {
              usageLog: newUsageLog,
              [costField]: increment(-logItem.totalCost)
          };

          if (logItem.category === 'sparepart' && selectedJob.estimateData?.partItems) {
              const newParts = [...selectedJob.estimateData.partItems];
              const pIdx = newParts.findIndex(p => p.inventoryId === logItem.itemId && p.hasArrived);
              if (pIdx >= 0) {
                  newParts[pIdx] = { ...newParts[pIdx], hasArrived: false };
                  updatePayload['estimateData.partItems'] = newParts;
              }
          }

          await updateDoc(doc(db, JOBS_COLLECTION, selectedJob.id), updatePayload);
          showNotification("Berhasil dibatalkan.", "success");
          onRefreshData();
      } catch (e: any) {
          showNotification("Gagal: " + e.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleMaterialSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setMaterialSearchTerm(val);
      const match = materialInventory.find(i => i.name === val || i.code === val);
      if (match) {
          setSelectedMaterialId(match.id);
          setSelectedUnit(match.unit);
      } else {
          setSelectedMaterialId('');
          setSelectedUnit('');
      }
  };

  const currentMaterial = inventoryItems.find(i => i.id === selectedMaterialId);
  const baseUnit = currentMaterial?.unit || 'Liter';
  const unitOptions = useMemo(() => {
      const opts = [baseUnit];
      if (baseUnit === 'Liter') opts.push('ML');
      if (baseUnit === 'Kg') opts.push('Gram');
      if (!opts.includes('Pcs')) opts.push('Pcs');
      return opts;
  }, [baseUnit]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${issuanceType === 'sparepart' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                {issuanceType === 'sparepart' ? <Truck size={32}/> : <PaintBucket size={32}/>}
            </div>
            <div>
                <h1 className="text-3xl font-bold text-gray-900">
                    {issuanceType === 'sparepart' ? 'Pembebanan Sparepart' : 'Pembebanan Bahan Baku'}
                </h1>
                <p className="text-gray-500">Input pengeluaran barang dari gudang ke Work Order.</p>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <label className="block text-sm font-bold text-gray-700 mb-2">Cari Nomor WO atau Nopol</label>
            <div className="relative max-w-2xl">
                <Search className="absolute left-3 top-3 text-gray-400" size={20}/>
                <input 
                    type="text" 
                    placeholder="Contoh: WO2410... atau B1234" 
                    value={filterWo} 
                    onChange={e => {
                        setFilterWo(e.target.value);
                        if(e.target.value === '') setSelectedJobId('');
                    }}
                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg uppercase font-mono"
                />
            </div>
            
            {filterWo.length > 1 && !selectedJobId && (
                <div className="mt-2 border rounded-lg bg-white shadow-lg max-h-60 overflow-y-auto absolute z-10 w-full max-w-2xl">
                    {filteredJobs.length === 0 ? (
                        <div className="p-4 text-gray-500 text-center">Data tidak ditemukan</div>
                    ) : (
                        filteredJobs.map(job => (
                            <button 
                                key={job.id}
                                onClick={() => {
                                    setFilterWo(job.woNumber || job.policeNumber);
                                    setSelectedJobId(job.id);
                                }}
                                className="w-full text-left p-3 hover:bg-indigo-50 border-b last:border-0"
                            >
                                <span className="font-bold text-indigo-700 block">{job.woNumber || 'DRAFT'}</span>
                                <span className="text-sm text-gray-600">{job.policeNumber} - {job.carModel}</span>
                            </button>
                        ))
                    )}
                </div>
            )}

            {selectedJob && (
                <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Work Order Terpilih</p>
                        <h3 className="text-xl font-bold text-gray-900">{selectedJob.woNumber}</h3>
                        <p className="text-gray-600">{selectedJob.policeNumber} | {selectedJob.carModel}</p>
                    </div>
                    {selectedJob.isClosed && <div className="px-4 py-2 bg-red-100 text-red-800 rounded-lg font-bold border border-red-200">WO CLOSED</div>}
                    <button onClick={() => { setSelectedJobId(''); setFilterWo(''); }} className="text-sm text-red-500 underline">Ganti WO</button>
                </div>
            )}
        </div>

        {issuanceType === 'sparepart' && selectedJob && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Truck size={20} className="text-indigo-600"/> Daftar Part Estimasi</h3>
                {(!selectedJob.estimateData?.partItems || selectedJob.estimateData.partItems.length === 0) ? (
                    <div className="text-center py-8 text-gray-400 italic bg-gray-50 rounded-lg">Tidak ada item sparepart.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-bold">
                                <tr>
                                    <th className="p-3">Nama Part</th>
                                    <th className="p-3 text-center">Qty</th>
                                    <th className="p-3 text-right">Modal @</th>
                                    <th className="p-3 text-center">Stok Gudang</th>
                                    <th className="p-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {selectedJob.estimateData.partItems.map((item, idx) => {
                                    const invItem = inventoryItems.find(i => 
                                        (item.inventoryId && i.id === item.inventoryId) || 
                                        (item.number && i.code && i.code.toUpperCase() === item.number.toUpperCase())
                                    );
                                    const isIssued = item.hasArrived; 
                                    return (
                                        <tr key={idx} className={isIssued ? "bg-green-50 opacity-70" : "hover:bg-gray-50"}>
                                            <td className="p-3">
                                                <div className="font-bold">{item.name}</div>
                                                <div className="text-xs text-gray-500 font-mono">{item.number || '-'}</div>
                                            </td>
                                            <td className="p-3 text-center font-bold">{item.qty || 1}</td>
                                            <td className="p-3 text-right">{invItem ? formatCurrency(invItem.buyPrice) : '-'}</td>
                                            <td className="p-3 text-center">
                                                {invItem ? <span className={`font-bold ${invItem.stock > 0 ? 'text-blue-600' : 'text-red-500'}`}>{invItem.stock}</span> : '-'}
                                            </td>
                                            <td className="p-3 text-right">
                                                {!isIssued && invItem && !selectedJob.isClosed && (
                                                    <button 
                                                        onClick={() => handlePartIssuance(item, idx, invItem.id)}
                                                        disabled={isSubmitting || invItem.stock < (item.qty || 1)}
                                                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-xs font-bold"
                                                    >
                                                        Keluarkan
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}

        {issuanceType === 'material' && selectedJob && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><PaintBucket size={20} className="text-orange-600"/> Input Pemakaian Bahan</h3>
                {!selectedJob.isClosed ? (
                    <form onSubmit={handleMaterialIssuance} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cari Bahan</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                                    <input 
                                        list="material-datalist"
                                        type="text"
                                        placeholder="Ketik nama bahan..."
                                        className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                        value={materialSearchTerm}
                                        onChange={handleMaterialSearch}
                                    />
                                    <datalist id="material-datalist">
                                        {materialInventory.map(item => (
                                            <option key={item.id} value={item.name}>Stok: {item.stock} {item.unit}</option>
                                        ))}
                                    </datalist>
                                </div>
                                {currentMaterial && (
                                    <div className="mt-2 p-3 bg-orange-50 border border-orange-100 rounded-lg flex justify-between items-center text-sm">
                                        <div><p className="font-bold">{currentMaterial.name}</p><p className="text-xs font-mono">{currentMaterial.code}</p></div>
                                        <div className="text-right font-bold">Tersedia: {currentMaterial.stock} {currentMaterial.unit}</div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah & Satuan</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="number" step="0.01"
                                        value={inputQty || ''} 
                                        onChange={e => setInputQty(Number(e.target.value))}
                                        className="flex-grow p-3 border border-gray-300 rounded-lg text-lg font-bold"
                                        placeholder="0.00"
                                    />
                                    <select 
                                        value={selectedUnit} 
                                        onChange={e => setSelectedUnit(e.target.value)}
                                        className="w-32 p-3 border border-gray-300 rounded-lg bg-gray-50 font-bold"
                                    >
                                        {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                {(selectedUnit === 'ML' || selectedUnit === 'Gram') && inputQty > 0 && <p className="text-xs text-orange-600 mt-1">Konversi: {(inputQty / 1000).toFixed(3)} {baseUnit}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Keterangan pemakaian..." className="w-full p-3 border border-gray-300 rounded-lg"/>
                            </div>
                        </div>
                        <button type="submit" disabled={isSubmitting || !selectedMaterialId} className="w-full bg-orange-600 text-white py-3 rounded-lg hover:bg-orange-700 font-bold shadow-lg disabled:opacity-50">
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Pembebanan Bahan'}
                        </button>
                    </form>
                ) : (
                    <div className="text-center py-6 text-red-500 bg-red-50 border rounded-lg">WO sudah ditutup.</div>
                )}
            </div>
        )}

        {selectedJob && (
             <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                     <h3 className="font-bold text-gray-800 flex items-center gap-2"><History size={18}/> Riwayat Keluar Barang</h3>
                     <span className="text-lg font-bold text-indigo-700">{formatCurrency(totalUsageCost)}</span>
                </div>
                {usageHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 font-bold">
                                <tr>
                                    <th className="px-4 py-3">Tanggal</th>
                                    <th className="px-4 py-3">Item</th>
                                    <th className="px-4 py-3 text-center">Qty</th>
                                    <th className="px-4 py-3 text-right">Total Biaya</th>
                                    <th className="px-4 py-3 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {usageHistory.map((log, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-gray-500">{formatDateIndo(log.issuedAt)}</td>
                                        <td className="px-4 py-2">
                                            <div className="font-medium">{log.itemName}</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{log.itemCode}</div>
                                        </td>
                                        <td className="px-4 py-2 text-center font-bold">{log.qty} {log.inputUnit || ''}</td>
                                        <td className="px-4 py-2 text-right font-bold">{formatCurrency(log.totalCost)}</td>
                                        <td className="px-4 py-2 text-center">
                                            {userPermissions.role.includes('Manager') && !selectedJob.isClosed && (
                                                <button onClick={() => handleCancelIssuance(log)} className="text-red-500 text-xs underline">Batal</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-400 italic">Belum ada pemakaian.</div>
                )}
             </div>
        )}
    </div>
  );
};

export default MaterialIssuanceView;