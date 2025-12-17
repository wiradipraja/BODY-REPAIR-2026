import React, { useState, useMemo } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { Search, Package, Truck, AlertTriangle, PaintBucket, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

interface MaterialIssuanceViewProps {
  activeJobs: Job[];
  inventoryItems: InventoryItem[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  onRefreshData: () => void;
  issuanceType: 'sparepart' | 'material'; // New Prop to distinguish modes
}

const MaterialIssuanceView: React.FC<MaterialIssuanceViewProps> = ({ 
  activeJobs, inventoryItems, userPermissions, showNotification, onRefreshData, issuanceType
}) => {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [filterWo, setFilterWo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for Material Mode
  const [selectedItemId, setSelectedItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  // Derived Data
  const selectedJob = useMemo(() => activeJobs.find(j => j.id === selectedJobId), [activeJobs, selectedJobId]);
  
  // Filter Jobs by WO Number (Prioritized) or Police Number
  const filteredJobs = useMemo(() => {
    if (!filterWo) return activeJobs.slice(0, 10); // Show recent 10 if empty
    const lowerFilter = filterWo.toLowerCase();
    return activeJobs.filter(j => 
        (j.woNumber && j.woNumber.toLowerCase().includes(lowerFilter)) || 
        j.policeNumber.toLowerCase().includes(lowerFilter)
    );
  }, [activeJobs, filterWo]);

  // Filter Inventory: Only show Materials for 'material' mode
  const materialInventory = useMemo(() => {
      return inventoryItems.filter(i => i.category === 'material');
  }, [inventoryItems]);

  // --- HANDLER: PEMBEBANAN BAHAN (MATERIAL) - AD HOC ---
  const handleMaterialIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !selectedItemId || qty <= 0) {
        showNotification("Mohon lengkapi data pembebanan bahan.", "error");
        return;
    }
    
    const item = inventoryItems.find(i => i.id === selectedItemId);
    if (!item) return;

    if (item.stock < qty) {
        showNotification(`Stok ${item.name} tidak cukup! Tersedia: ${item.stock}`, "error");
        return;
    }

    if (!window.confirm(`Konfirmasi pemakaian bahan: ${qty} ${item.unit} ${item.name}?`)) return;

    setIsSubmitting(true);
    try {
        const itemCostTotal = (item.buyPrice || 0) * qty;
        
        // 1. Update Inventory
        await updateDoc(doc(db, SPAREPART_COLLECTION, selectedItemId), {
            stock: increment(-qty),
            updatedAt: serverTimestamp()
        });

        // 2. Update Job
        const usageRecord = {
            itemId: selectedItemId,
            itemName: item.name,
            itemCode: item.code,
            qty: qty,
            costPerUnit: item.buyPrice,
            totalCost: itemCostTotal,
            category: 'material',
            notes: notes,
            issuedAt: new Date().toISOString(),
            issuedBy: 'Partman' 
        };

        await updateDoc(doc(db, JOBS_COLLECTION, selectedJobId), {
            'costData.hargaModalBahan': increment(itemCostTotal),
            usageLog: arrayUnion(usageRecord)
        });

        showNotification("Bahan berhasil dibebankan ke WO.", "success");
        setQty(1);
        setNotes('');
        setSelectedItemId('');
        onRefreshData();
    } catch (error: any) {
        console.error("Material Issuance Error:", error);
        showNotification("Gagal: " + error.message, "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- HANDLER: PEMBEBANAN PART (SPAREPART) - SYNC WITH ESTIMATE ---
  const handlePartIssuance = async (estItem: EstimateItem, itemIndex: number) => {
      if (!selectedJob) return;
      
      // 1. Validate Inventory Link
      if (!estItem.inventoryId) {
          showNotification("Item ini tidak terhubung dengan database inventory.", "error");
          return;
      }

      const invItem = inventoryItems.find(i => i.id === estItem.inventoryId);
      if (!invItem) {
          showNotification("Data inventory tidak ditemukan (mungkin terhapus).", "error");
          return;
      }

      const qtyToIssue = estItem.qty || 1;

      // 2. Check Stock
      if (invItem.stock < qtyToIssue) {
          showNotification(`Stok GUDANG tidak cukup untuk item ini! (Butuh: ${qtyToIssue}, Ada: ${invItem.stock})`, "error");
          return;
      }

      // 3. Confirm
      if (!window.confirm(`Keluarkan ${qtyToIssue} ${invItem.unit} ${invItem.name} untuk WO ${selectedJob.woNumber}?`)) return;

      setIsSubmitting(true);
      try {
          // A. Deduct Stock
          await updateDoc(doc(db, SPAREPART_COLLECTION, estItem.inventoryId), {
              stock: increment(-qtyToIssue),
              updatedAt: serverTimestamp()
          });

          // B. Mark Estimate Item as 'Issued' (Need to update the specific array item)
          // Since Firestore array update by index is hard, we replace the whole array usually, or utilize a 'usageLog' to track.
          // Strategy: We will add to usageLog AND update costData. 
          // Note: Assuming cost was NOT added during WO creation (based on new requirement).
          
          const itemCostTotal = (invItem.buyPrice || 0) * qtyToIssue;

          const usageRecord = {
            itemId: invItem.id,
            itemName: invItem.name,
            itemCode: invItem.code,
            qty: qtyToIssue,
            costPerUnit: invItem.buyPrice,
            totalCost: itemCostTotal,
            category: 'sparepart',
            notes: 'Sesuai Estimasi',
            issuedAt: new Date().toISOString(),
            issuedBy: 'Partman'
          };

          // We also want to flag the item in estimateData as "issued" visually.
          // This requires reading, modifying array, writing back.
          const newPartItems = [...(selectedJob.estimateData?.partItems || [])];
          // Simple match by name/inventoryId/index
          if (newPartItems[itemIndex]) {
              newPartItems[itemIndex] = { ...newPartItems[itemIndex], hasArrived: true }; // Using hasArrived as 'Issued' flag or add new field
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${issuanceType === 'sparepart' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                {issuanceType === 'sparepart' ? <Truck size={32}/> : <PaintBucket size={32}/>}
            </div>
            <div>
                <h1 className="text-3xl font-bold text-gray-900">
                    {issuanceType === 'sparepart' ? 'Pembebanan Sparepart' : 'Pembebanan Bahan Baku'}
                </h1>
                <p className="text-gray-500">
                    {issuanceType === 'sparepart' 
                        ? 'Keluarkan part sesuai estimasi WO dan potong stok.' 
                        : 'Input pemakaian bahan (cat, thinner, dll) untuk pembebanan biaya WO.'}
                </p>
            </div>
        </div>

        {/* --- SECTION 1: SEARCH WO (COMMON) --- */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <label className="block text-sm font-bold text-gray-700 mb-2">Cari Nomor Work Order (WO)</label>
            <div className="relative max-w-2xl">
                <Search className="absolute left-3 top-3 text-gray-400" size={20}/>
                <input 
                    type="text" 
                    placeholder="Ketik No. WO (Contoh: WO2410...) atau Nopol" 
                    value={filterWo} 
                    onChange={e => {
                        setFilterWo(e.target.value);
                        if(e.target.value === '') setSelectedJobId('');
                    }}
                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg uppercase font-mono"
                    autoFocus
                />
            </div>
            
            {/* SEARCH RESULTS LIST */}
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
                                className="w-full text-left p-3 hover:bg-indigo-50 border-b last:border-0 flex justify-between items-center group"
                            >
                                <div>
                                    <span className="font-bold text-indigo-700 block">{job.woNumber || 'DRAFT'}</span>
                                    <span className="text-sm text-gray-600">{job.policeNumber} - {job.carModel}</span>
                                </div>
                                <div className="text-xs text-gray-400 group-hover:text-indigo-600">
                                    Pilih <ArrowRight size={12} className="inline"/>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}

            {/* SELECTED JOB INFO */}
            {selectedJob && (
                <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Work Order Terpilih</p>
                        <h3 className="text-xl font-bold text-gray-900">{selectedJob.woNumber}</h3>
                        <p className="text-gray-600">{selectedJob.policeNumber} | {selectedJob.carModel}</p>
                    </div>
                    <button 
                        onClick={() => { setSelectedJobId(''); setFilterWo(''); }}
                        className="text-sm text-red-500 hover:text-red-700 underline"
                    >
                        Ganti WO
                    </button>
                </div>
            )}
        </div>

        {/* --- SECTION 2: CONTENT BASED ON TYPE --- */}
        
        {/* MODE A: SPAREPART (SYNCED WITH ESTIMATE) */}
        {issuanceType === 'sparepart' && selectedJob && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Truck size={20} className="text-indigo-600"/> Daftar Part di Estimasi
                </h3>
                
                {(!selectedJob.estimateData?.partItems || selectedJob.estimateData.partItems.length === 0) ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                        Tidak ada item sparepart dalam estimasi WO ini.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-bold">
                                <tr>
                                    <th className="p-3">No. Part & Nama</th>
                                    <th className="p-3 text-center">Qty Est</th>
                                    <th className="p-3 text-center">Status Stok</th>
                                    <th className="p-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {selectedJob.estimateData.partItems.map((item, idx) => {
                                    // Check if linked inventory exists and gets stock
                                    const invItem = item.inventoryId ? inventoryItems.find(i => i.id === item.inventoryId) : null;
                                    const isIssued = item.hasArrived; // Using hasArrived as "Issued" flag for now
                                    
                                    return (
                                        <tr key={idx} className={isIssued ? "bg-green-50 opacity-70" : "hover:bg-gray-50"}>
                                            <td className="p-3">
                                                <div className="font-bold text-gray-800">{item.name}</div>
                                                <div className="text-xs text-gray-500 font-mono">{item.number || 'No Part #'}</div>
                                            </td>
                                            <td className="p-3 text-center font-bold">{item.qty || 1}</td>
                                            <td className="p-3 text-center">
                                                {isIssued ? (
                                                    <span className="px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-bold">Sudah Keluar</span>
                                                ) : invItem ? (
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${invItem.stock >= (item.qty || 1) ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                        Gudang: {invItem.stock}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">Unlinked</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right">
                                                {!isIssued && invItem && (
                                                    <button 
                                                        onClick={() => handlePartIssuance(item, idx)}
                                                        disabled={isSubmitting || invItem.stock < (item.qty || 1)}
                                                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-xs font-bold shadow-sm"
                                                    >
                                                        Keluarkan
                                                    </button>
                                                )}
                                                {!invItem && !isIssued && (
                                                     <span className="text-xs text-red-400">Hubungkan di Estimasi dulu</span>
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

        {/* MODE B: MATERIAL (AD HOC) */}
        {issuanceType === 'material' && selectedJob && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <PaintBucket size={20} className="text-orange-600"/> Input Pemakaian Bahan
                </h3>
                
                <form onSubmit={handleMaterialIssuance} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cari Bahan (Inventory)</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                            <input 
                                list="material-list"
                                placeholder="Ketik nama bahan (Thinner, Clear, Amplas...)"
                                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                value={selectedItemId}
                                onChange={e => setSelectedItemId(e.target.value)}
                            />
                            {/* CUSTOM DATALIST DISPLAY */}
                            <datalist id="material-list">
                                {materialInventory.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.name} (Stok: {item.stock} {item.unit})
                                    </option>
                                ))}
                            </datalist>
                        </div>
                        {/* Selected Item Detail Preview */}
                        {selectedItemId && inventoryItems.find(i => i.id === selectedItemId) && (
                            <div className="mt-2 p-3 bg-orange-50 border border-orange-100 rounded-lg flex justify-between items-center text-sm">
                                <span className="font-bold text-orange-900">
                                    {inventoryItems.find(i => i.id === selectedItemId)?.name}
                                </span>
                                <span className="text-orange-700">
                                    Sisa Stok: {inventoryItems.find(i => i.id === selectedItemId)?.stock} {inventoryItems.find(i => i.id === selectedItemId)?.unit}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Pakai</label>
                            <input 
                                type="number" 
                                min="0.1" step="0.1"
                                value={qty} 
                                onChange={e => setQty(Number(e.target.value))}
                                className="w-full p-3 border border-gray-300 rounded-lg text-center font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                            <input 
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Keterangan..."
                                className="w-full p-3 border border-gray-300 rounded-lg"
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full bg-orange-600 text-white py-3 rounded-lg hover:bg-orange-700 font-bold shadow-lg disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                        {isSubmitting ? 'Menyimpan...' : <><CheckCircle size={18}/> Simpan Pembebanan</>}
                    </button>
                </form>
            </div>
        )}

        {/* EMPTY STATE */}
        {!selectedJob && (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <AlertCircle className="mx-auto text-gray-400 mb-2" size={48}/>
                <p className="text-gray-500 font-medium">Silakan cari dan pilih Nomor Work Order (WO) terlebih dahulu.</p>
            </div>
        )}
    </div>
  );
};

export default MaterialIssuanceView;