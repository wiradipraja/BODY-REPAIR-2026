import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { Search, Package, Truck, AlertTriangle, PaintBucket, CheckCircle, AlertCircle, ArrowRight, DollarSign, Scale } from 'lucide-react';

interface MaterialIssuanceViewProps {
  activeJobs: Job[];
  inventoryItems: InventoryItem[];
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
  const [inputQty, setInputQty] = useState(0); // Raw input
  const [notes, setNotes] = useState('');
  const [useSmallUnit, setUseSmallUnit] = useState(false); // Toggle for Gram/ML vs Liter/Kg

  // Derived Data
  const selectedJob = useMemo(() => activeJobs.find(j => j.id === selectedJobId), [activeJobs, selectedJobId]);
  
  // Filter Jobs
  const filteredJobs = useMemo(() => {
    if (!filterWo) return activeJobs.slice(0, 10);
    const lowerFilter = filterWo.toLowerCase();
    return activeJobs.filter(j => 
        (j.woNumber && j.woNumber.toLowerCase().includes(lowerFilter)) || 
        j.policeNumber.toLowerCase().includes(lowerFilter)
    );
  }, [activeJobs, filterWo]);

  // Filter Inventory (Material Only)
  const materialInventory = useMemo(() => {
      return inventoryItems.filter(i => i.category === 'material');
  }, [inventoryItems]);

  // Reset material form when job changes
  useEffect(() => {
      setMaterialSearchTerm('');
      setSelectedMaterialId('');
      setInputQty(0);
      setNotes('');
      setUseSmallUnit(false);
  }, [selectedJobId, issuanceType]);

  // --- HANDLER: PEMBEBANAN BAHAN (MATERIAL) ---
  const handleMaterialIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Resolve Item
    let targetId = selectedMaterialId;
    if (!targetId && materialSearchTerm) {
        const match = materialInventory.find(i => i.name.toLowerCase() === materialSearchTerm.toLowerCase() || i.code.toLowerCase() === materialSearchTerm.toLowerCase());
        if (match) targetId = match.id;
    }

    if (!selectedJobId || !targetId || inputQty <= 0) {
        showNotification("Mohon pilih bahan dan masukkan jumlah yang valid.", "error");
        return;
    }
    
    const item = inventoryItems.find(i => i.id === targetId);
    if (!item) {
        showNotification("Data bahan tidak ditemukan di database.", "error");
        return;
    }

    // 2. Calculate Final Quantity based on Unit Selection
    // If user checks "Input in Grams" and item unit is Liter/Kg, we divide by 1000
    // Logic assumption: 1 Liter = 1000 ML = 1000 Gram (approx for UI simplicity)
    let finalQty = inputQty;
    let unitLabel = item.unit;

    if (useSmallUnit) {
        finalQty = inputQty / 1000;
        unitLabel = item.unit; // We store in Base Unit
    }

    // 3. Stock Validation (Skip if Vendor Managed / isStockManaged == false)
    const isVendorManaged = item.isStockManaged === false; // Explicit false check
    
    if (!isVendorManaged && item.stock < finalQty) {
        showNotification(`Stok ${item.name} tidak cukup! Tersedia: ${item.stock} ${item.unit}`, "error");
        return;
    }

    if (!window.confirm(`Konfirmasi pemakaian bahan: \n${inputQty} ${useSmallUnit ? (item.unit === 'Liter' ? 'MiliLiter' : 'Gram') : item.unit} ${item.name}? \n\n(Tercatat sistem: ${finalQty} ${item.unit})`)) return;

    setIsSubmitting(true);
    try {
        const itemCostTotal = (item.buyPrice || 0) * finalQty;
        
        // Update Inventory (Allow negative if vendor managed)
        await updateDoc(doc(db, SPAREPART_COLLECTION, targetId), {
            stock: increment(-finalQty),
            updatedAt: serverTimestamp()
        });

        const usageRecord = {
            itemId: targetId,
            itemName: item.name,
            itemCode: item.code,
            qty: finalQty, // Stored in Base Unit (Liter/Kg) for cost calc consistency
            inputQty: inputQty, // Optional: store what user typed for reference
            inputUnit: useSmallUnit ? (item.unit === 'Liter' ? 'ML' : 'Gram') : item.unit,
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
      
      const invItem = inventoryItems.find(i => i.id === linkedInventoryId);
      if (!invItem) {
          showNotification("Data inventory tidak ditemukan.", "error");
          return;
      }

      const qtyToIssue = estItem.qty || 1;

      if (invItem.stock < qtyToIssue) {
          showNotification(`Stok GUDANG tidak cukup! (Butuh: ${qtyToIssue}, Ada: ${invItem.stock})`, "error");
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

  const handleMaterialSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setMaterialSearchTerm(val);
      const match = materialInventory.find(i => i.name === val || i.code === val);
      if (match) setSelectedMaterialId(match.id);
      else setSelectedMaterialId('');
  };

  const currentMaterial = inventoryItems.find(i => i.id === selectedMaterialId);
  const isVendorItem = currentMaterial?.isStockManaged === false;
  
  // Logic to determine units label
  const baseUnit = currentMaterial?.unit || 'Liter';
  const smallUnit = baseUnit === 'Liter' ? 'MiliLiter (ML)' : (baseUnit === 'Kg' ? 'Gram' : 'Unit Kecil');
  const conversionLabel = useSmallUnit ? smallUnit : baseUnit;

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
                <p className="text-gray-500">
                    {issuanceType === 'sparepart' 
                        ? 'Keluarkan part sesuai estimasi WO dan potong stok.' 
                        : 'Input pemakaian bahan (cat, thinner, dll) untuk pembebanan biaya WO.'}
                </p>
            </div>
        </div>

        {/* --- SEARCH WO --- */}
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

        {/* --- CONTENT --- */}
        
        {/* MODE A: SPAREPART */}
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
                                    <th className="p-3 text-right text-emerald-700">H. Beli (Modal)</th>
                                    <th className="p-3 text-right text-indigo-700">H. Jual (Est)</th>
                                    <th className="p-3 text-center">Status Stok</th>
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
                                                <div className="font-bold text-gray-800">{item.name}</div>
                                                <div className="text-xs text-gray-500 font-mono">{item.number || 'No Part #'}</div>
                                            </td>
                                            <td className="p-3 text-center font-bold">{item.qty || 1}</td>
                                            <td className="p-3 text-right font-mono text-gray-600">
                                                {invItem ? formatCurrency(invItem.buyPrice) : '-'}
                                            </td>
                                            <td className="p-3 text-right font-mono font-bold text-gray-800">
                                                {invItem ? formatCurrency(invItem.sellPrice) : formatCurrency(item.price)}
                                            </td>
                                            <td className="p-3 text-center">
                                                {isIssued ? (
                                                    <span className="px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-bold">Sudah Keluar</span>
                                                ) : invItem ? (
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${invItem.stock >= (item.qty || 1) ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                        Gudang: {invItem.stock}
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-gray-100 text-gray-400 rounded text-xs italic">Unlinked</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right">
                                                {!isIssued && invItem && (
                                                    <button 
                                                        onClick={() => handlePartIssuance(item, idx, invItem.id)}
                                                        disabled={isSubmitting || invItem.stock < (item.qty || 1)}
                                                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-xs font-bold shadow-sm"
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

        {/* MODE B: MATERIAL */}
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
                                list="material-datalist"
                                type="text"
                                placeholder="Ketik nama bahan..."
                                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                value={materialSearchTerm}
                                onChange={handleMaterialSearch}
                                autoComplete="off"
                            />
                            <datalist id="material-datalist">
                                {materialInventory.map(item => (
                                    <option key={item.id} value={item.name}>
                                        Kode: {item.code} | Stok: {item.stock} {item.unit}
                                    </option>
                                ))}
                            </datalist>
                        </div>
                        
                        {/* ITEM DETAIL */}
                        {currentMaterial ? (
                            <div className="mt-2 p-3 bg-orange-50 border border-orange-100 rounded-lg flex justify-between items-center text-sm animate-fade-in">
                                <div>
                                    <p className="font-bold text-orange-900">{currentMaterial.name}</p>
                                    <p className="text-xs text-orange-700 font-mono">{currentMaterial.code}</p>
                                    {isVendorItem && (
                                        <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded border border-purple-200">
                                            STOK VENDOR (Ready Use)
                                        </span>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-orange-900 font-bold">
                                        Sisa: {currentMaterial.stock} {currentMaterial.unit}
                                    </p>
                                    <p className="text-xs text-gray-500">HPP: {formatCurrency(currentMaterial.buyPrice)} / {currentMaterial.unit}</p>
                                </div>
                            </div>
                        ) : materialSearchTerm.length > 2 && (
                            <p className="text-xs text-red-400 mt-1 ml-1">Bahan tidak ditemukan.</p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* INPUT QTY WITH UNIT TOGGLE */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-700">Jumlah Pakai</label>
                                {['Liter', 'Kg'].includes(baseUnit) && (
                                    <label className="flex items-center gap-2 cursor-pointer text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">
                                        <input 
                                            type="checkbox" 
                                            checked={useSmallUnit}
                                            onChange={e => setUseSmallUnit(e.target.checked)}
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <Scale size={12}/>
                                        Input dlm {baseUnit === 'Liter' ? 'ML' : 'Gram'}?
                                    </label>
                                )}
                            </div>
                            
                            <div className="relative">
                                <input 
                                    type="number" 
                                    min="0.01" step="0.01"
                                    value={inputQty} 
                                    onChange={e => setInputQty(Number(e.target.value))}
                                    className="w-full p-3 border border-gray-300 rounded-lg text-center font-bold text-lg"
                                />
                                <span className="absolute right-4 top-3.5 text-gray-500 font-bold text-sm">
                                    {conversionLabel}
                                </span>
                            </div>
                            {useSmallUnit && inputQty > 0 && (
                                <p className="text-xs text-gray-500 mt-1 text-center">
                                    Akan tercatat sebagai: <strong>{inputQty / 1000} {baseUnit}</strong>
                                </p>
                            )}
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