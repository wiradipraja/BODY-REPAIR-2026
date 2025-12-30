
import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem, UsageLogItem, Supplier } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp, getDoc, writeBatch } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { Search, Truck, PaintBucket, CheckCircle, History, Save, ArrowRight, AlertTriangle, Info, Package, XCircle, Clock, Zap, Target, Link, MousePointerClick, CheckSquare, Square } from 'lucide-react';
import Modal from '../ui/Modal';

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
  
  // Selection State for Bulk Issuance
  const [selectedPartIndices, setSelectedPartIndices] = useState<number[]>([]);

  // Material Form States
  const [materialSearchTerm, setMaterialSearchTerm] = useState(''); 
  const [inputQty, setInputQty] = useState<number | ''>(''); 
  const [notes, setNotes] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>(''); 

  // Part Linking Modal States
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ estItem: EstimateItem, idx: number } | null>(null);
  const [partSearchTerm, setPartSearchTerm] = useState('');

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
    return activeJobs.filter(j => 
        (j.woNumber && j.woNumber.toLowerCase().includes(lowerFilter)) || 
        (j.policeNumber && j.policeNumber.toLowerCase().includes(lowerFilter))
    );
  }, [activeJobs, filterWo]);

  const materialInventory = useMemo(() => {
      return inventoryItems.filter(i => i.category === 'material');
  }, [inventoryItems]);

  // Filtered Parts for Linking Modal
  const linkingCandidates = useMemo(() => {
      if (!partSearchTerm) return [];
      const term = partSearchTerm.toLowerCase();
      return inventoryItems.filter(i => 
          i.category === 'sparepart' &&
          (i.name.toLowerCase().includes(term) || (i.code && i.code.toLowerCase().includes(term)))
      ).slice(0, 10);
  }, [inventoryItems, partSearchTerm]);

  useEffect(() => {
      setMaterialSearchTerm('');
      setInputQty('');
      setNotes('');
      setSelectedUnit('');
      setSelectedPartIndices([]); // Reset selection on job change
  }, [selectedJobId, issuanceType]);

  const togglePartSelection = (idx: number) => {
      setSelectedPartIndices(prev => 
          prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      );
  };

  const toggleAllParts = () => {
      if (!selectedJob) return;
      const parts = selectedJob.estimateData?.partItems || [];
      const availableIndices = parts
          .map((p, idx) => ({ p, idx }))
          .filter(({ p }) => !p.hasArrived) // Only select un-issued parts
          .map(({ idx }) => idx);

      if (selectedPartIndices.length === availableIndices.length) {
          setSelectedPartIndices([]);
      } else {
          setSelectedPartIndices(availableIndices);
      }
  };

  const findItem = (term: string) => {
      const t = term.trim().toLowerCase();
      if (!t) return null;
      return inventoryItems.find(i => 
          i.name.toLowerCase().trim() === t || 
          (i.code && i.code.toLowerCase().trim() === t)
      );
  };

  const currentItem = findItem(materialSearchTerm);
  
  useEffect(() => {
    if (currentItem) {
      setSelectedUnit(currentItem.unit);
    }
  }, [currentItem]);

  const unitOptions = useMemo(() => {
      const base = currentItem?.unit || 'Pcs';
      if (base === 'Liter' || base === 'ML') return ['Liter', 'ML', 'Gram'];
      if (base === 'Kg' || base === 'Gram') return ['Kg', 'Gram', 'ML'];
      if (base === 'Kaleng') return ['Kaleng', 'Liter', 'ML', 'Gram'];
      if (base === 'Pcs') return ['Pcs', 'Set', 'Lembar', 'Roll'];
      return [base];
  }, [currentItem]);

  // --- BULK PART ISSUANCE HANDLER ---
  const handleBulkPartIssuance = async () => {
      if (!selectedJob || selectedPartIndices.length === 0) return;
      
      setIsSubmitting(true);
      try {
          const batch = writeBatch(db); // Use batch but mainly we calculate sequentially for logic
          
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          const jobSnap = await getDoc(jobRef);
          if (!jobSnap.exists()) throw new Error("Data WO tidak ditemukan.");
          
          const currentJobData = jobSnap.data() as Job;
          const currentParts = [...(currentJobData.estimateData?.partItems || [])];
          let totalCogsToAdd = 0;
          const usageLogsToAdd: UsageLogItem[] = [];
          
          const mismatchNames: string[] = [];

          // Validate and Process Each Selected Item
          for (const idx of selectedPartIndices) {
              const estItem = currentParts[idx];
              
              // Find in Inventory (Auto Match)
              const invItem = inventoryItems.find(i => 
                  (estItem.inventoryId && i.id === estItem.inventoryId) || 
                  (i.code && estItem.number && i.code.trim().toUpperCase() === estItem.number.trim().toUpperCase())
              );

              if (!invItem) {
                  throw new Error(`Part '${estItem.name}' tidak ditemukan di Master Stok. Lakukan Link Manual dulu.`);
              }

              const reqQty = Number(estItem.qty || 1);
              
              // Stock Check
              // Note: We are reading from props `inventoryItems` which is real-time, but for strict safety 
              // in high concurrency, one should use transaction. For this app scale, checks here + optimistic UI is okay.
              if (invItem.stock < reqQty) {
                  throw new Error(`Stok Fisik ${invItem.name} tidak cukup! (Gudang: ${invItem.stock}, Butuh: ${reqQty})`);
              }

              // --- PRICE MISMATCH CHECK LOGIC ---
              // Rule: Sell Price in Master vs Sell Price in WO
              // If WO Price < Master Sell Price -> Trigger Alert
              if (estItem.price < invItem.sellPrice) {
                  mismatchNames.push(`${estItem.name} (${estItem.number})`);
                  // Flag the part in WO
                  currentParts[idx].isPriceMismatch = true;
                  currentParts[idx].mismatchSuggestedPrice = invItem.sellPrice;
              }

              // COGS Calculation (Using Master Buy Price)
              const cost = invItem.buyPrice * reqQty;
              totalCogsToAdd += cost;

              // Prepare Inventory Update (Deduct Stock)
              batch.update(doc(db, SPAREPART_COLLECTION, invItem.id), {
                  stock: increment(-reqQty),
                  updatedAt: serverTimestamp()
              });

              // Update WO Part Item Status
              currentParts[idx] = {
                  ...currentParts[idx],
                  hasArrived: true, // Mark as Issued/Arrived
                  inventoryId: invItem.id,
                  // Keep mismatch flags if set above
              };

              // Prepare Log
              usageLogsToAdd.push({
                  itemId: invItem.id, 
                  itemName: invItem.name, 
                  itemCode: invItem.code || estItem.number || '-',
                  qty: reqQty, 
                  inputQty: reqQty, 
                  inputUnit: invItem.unit || 'Pcs',
                  costPerUnit: invItem.buyPrice, 
                  totalCost: cost,
                  category: 'sparepart', 
                  notes: `Issued to WO ${selectedJob.woNumber}`,
                  issuedAt: new Date().toISOString(), 
                  issuedBy: userPermissions.role || 'Partman',
                  refPartIndex: idx 
              });
          }

          // Update Job Document
          batch.update(jobRef, {
              'estimateData.partItems': currentParts,
              'costData.hargaBeliPart': increment(totalCogsToAdd),
              usageLog: arrayUnion(...usageLogsToAdd),
              updatedAt: serverTimestamp()
          });

          await batch.commit();

          // TRIGGER NOTIFICATION
          if (mismatchNames.length > 0) {
              const namesStr = mismatchNames.join(', ');
              showNotification(`Warning: Part [${namesStr}] di WO [${selectedJob.woNumber}] underprice. Flag alert telah dipasang untuk SA.`, "error");
          } else {
              showNotification(`${selectedPartIndices.length} Part berhasil dikeluarkan (Issued). Stok berkurang.`, "success");
          }

          onRefreshData();
          setSelectedPartIndices([]);

      } catch (e: any) {
          showNotification(e.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  // Keep single execution for Manual Link Modal
  const executePartIssuance = async (estItem: EstimateItem, idx: number, inventoryItem: InventoryItem) => {
      if (!selectedJob) return;
      const reqQty = Number(estItem.qty || 1);

      setIsSubmitting(true);
      try {
          const invRef = doc(db, SPAREPART_COLLECTION, inventoryItem.id);
          const invSnap = await getDoc(invRef);
          
          if (!invSnap.exists()) throw new Error("Data stok master terhapus.");
          
          const currentStock = Number(invSnap.data().stock || 0);
          const currentBuyPrice = Number(invSnap.data().buyPrice || 0); 
          const currentSellPrice = Number(invSnap.data().sellPrice || 0);

          if (currentStock < reqQty) {
              throw new Error(`Stok Fisik ${inventoryItem.name} tidak cukup! (Gudang: ${currentStock}, Butuh: ${reqQty})`);
          }

          // Price Mismatch Check
          let isMismatch = false;
          if (estItem.price < currentSellPrice) {
              isMismatch = true;
          }

          const cost = currentBuyPrice * reqQty;

          await updateDoc(invRef, { 
              stock: increment(-reqQty), 
              updatedAt: serverTimestamp() 
          });

          const currentPartItems = [...(selectedJob.estimateData?.partItems || [])];
          currentPartItems[idx] = { 
              ...currentPartItems[idx], 
              hasArrived: true,
              inventoryId: inventoryItem.id,
              isPriceMismatch: isMismatch,
              mismatchSuggestedPrice: isMismatch ? currentSellPrice : undefined
          };

          const log: UsageLogItem = cleanObject({
              itemId: inventoryItem.id, itemName: inventoryItem.name, itemCode: inventoryItem.code || estItem.number || '-',
              qty: reqQty, inputQty: reqQty, inputUnit: inventoryItem.unit || 'Pcs',
              costPerUnit: currentBuyPrice, totalCost: cost,
              category: 'sparepart', notes: `Issued (Manual Link) to WO ${selectedJob.woNumber}`,
              issuedAt: new Date().toISOString(), issuedBy: userPermissions.role || 'Logistics',
              refPartIndex: idx 
          });

          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          await updateDoc(jobRef, {
              'estimateData.partItems': currentPartItems,
              'costData.hargaBeliPart': increment(cost), 
              usageLog: arrayUnion(log),
              updatedAt: serverTimestamp()
          });

          if (isMismatch) {
              showNotification(`Warning: Part ${inventoryItem.name} underprice. Alert sent to SA.`, "error");
          } else {
              showNotification(`Berhasil: ${inventoryItem.name} dikeluarkan. Cost tercatat Rp ${formatCurrency(cost)}.`, "success");
          }
          
          onRefreshData();
          setIsLinkModalOpen(false);
          setLinkTarget(null);
      } catch (err: any) { 
          showNotification(err.message, "error"); 
      } finally { 
          setIsSubmitting(false); 
      }
  };

  const handlePartAction = (estItem: EstimateItem, idx: number) => {
    const inv = inventoryItems.find(i => 
        (estItem.inventoryId && i.id === estItem.inventoryId) || 
        (i.code && estItem.number && i.code.trim().toUpperCase() === estItem.number.trim().toUpperCase())
    );

    if (inv) {
        // Now handled via checkbox for bulk, but this button logic remains for fallback/single
        // For UI consistency, we encourage checkbox use, but single button can add to checklist
        togglePartSelection(idx);
    } else {
        // Not Found! Open Manual Link Modal
        setLinkTarget({ estItem, idx });
        setPartSearchTerm(estItem.number || estItem.name || '');
        setIsLinkModalOpen(true);
    }
  };

  const handleMaterialIssuance = async (e: React.FormEvent) => {
    // ... (Existing Material Issuance logic unchanged)
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
    if ((item.unit === 'Liter' || item.unit === 'Kg' || item.unit === 'Kaleng') && 
        (selectedUnit === 'ML' || selectedUnit === 'Gram')) {
        finalDeductQty = qty / 1000;
    }

    setIsSubmitting(true);
    try {
        const itemSnap = await getDoc(doc(db, SPAREPART_COLLECTION, item.id));
        const currentStock = itemSnap.exists() ? Number(itemSnap.data().stock || 0) : 0;
        const currentBuyPrice = itemSnap.exists() ? Number(itemSnap.data().buyPrice || 0) : 0;

        if (item.isStockManaged !== false && currentStock < finalDeductQty) {
            throw new Error(`Stok tidak cukup! Tersedia: ${currentStock.toFixed(3)} ${item.unit}`);
        }

        const cost = currentBuyPrice * finalDeductQty;
        
        const logEntry: UsageLogItem = cleanObject({
            itemId: item.id, itemName: item.name, itemCode: item.code || '-',
            qty: finalDeductQty, inputQty: qty, inputUnit: selectedUnit || item.unit || 'Unit',
            costPerUnit: currentBuyPrice, totalCost: cost,
            category: 'material', notes: notes || 'Pemakaian Bahan',
            issuedAt: new Date().toISOString(), issuedBy: userPermissions.role || 'Staff'
        });

        await updateDoc(doc(db, SPAREPART_COLLECTION, item.id), { stock: increment(-finalDeductQty), updatedAt: serverTimestamp() });
        
        await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id), { 
            'costData.hargaModalBahan': increment(cost), 
            usageLog: arrayUnion(logEntry) 
        });

        showNotification("Bahan berhasil dibebankan.", "success");
        setMaterialSearchTerm('');
        setInputQty('');
        onRefreshData();
    } catch (err: any) {
        showNotification(err.message, "error");
    } finally { setIsSubmitting(false); }
  };

  const handleCancelIssuance = async (log: UsageLogItem) => {
    // ... (Existing Cancel logic unchanged)
    if (!selectedJob || !userPermissions.role.includes('Manager')) return;
    if (!window.confirm("Batalkan pengeluaran barang ini? Stok akan dikembalikan.")) return;

    setIsSubmitting(true);
    try {
        await updateDoc(doc(db, SPAREPART_COLLECTION, log.itemId), { stock: increment(log.qty) });
        const newLog = (selectedJob.usageLog || []).filter(l => !(l.itemId === log.itemId && l.issuedAt === log.issuedAt));
        
        const field = log.category === 'material' ? 'costData.hargaModalBahan' : 'costData.hargaBeliPart';
        const payload: any = { usageLog: newLog, [field]: increment(-log.totalCost) };
        
        if (log.category === 'sparepart' && log.refPartIndex !== undefined) {
            const parts = [...(selectedJob.estimateData?.partItems || [])];
            if (parts[log.refPartIndex]) {
                parts[log.refPartIndex] = { ...parts[log.refPartIndex], hasArrived: false, isPriceMismatch: false }; // Also reset mismatch on cancel
                payload['estimateData.partItems'] = parts;
            }
        }
        await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id), cleanObject(payload));
        showNotification("Pengeluaran dibatalkan. Stok dikembalikan.", "success");
        onRefreshData();
    } catch (e: any) { showNotification(e.message, "error"); } 
    finally { setIsSubmitting(false); }
  };

  const themeColor = issuanceType === 'sparepart' ? 'indigo' : 'orange';
  const themeBg = issuanceType === 'sparepart' ? 'bg-indigo-600' : 'bg-orange-600';
  const themeText = issuanceType === 'sparepart' ? 'text-indigo-700' : 'text-orange-700';

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl shadow-sm text-white ${themeBg}`}>
                    {issuanceType === 'sparepart' ? <Truck size={24}/> : <PaintBucket size={24}/>}
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {issuanceType === 'sparepart' ? 'Logistics / Keluar Part' : 'Supply / Pakai Bahan'}
                    </h1>
                    <p className="text-sm text-gray-500 font-medium">
                        Manajemen Alokasi Stok Gudang & Pembebanan Biaya (COGS)
                    </p>
                </div>
            </div>
            <div className="text-right bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">TOTAL BIAYA WO</span>
                <span className={`text-xl font-bold ${themeText}`}>{formatCurrency(totalUsageCost)}</span>
            </div>
        </div>

        {/* SEARCH WORK ORDER */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Search size={18} className="text-gray-400"/> Cari Work Order Aktif
                </h3>
            </div>
            
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Ketik No. WO, Nopol, atau Pelanggan..." 
                    value={filterWo} 
                    onChange={e => { setFilterWo(e.target.value); if(!e.target.value) setSelectedJobId(''); }}
                    className="w-full pl-4 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono font-bold uppercase text-lg"
                />
                
                {filterWo && !selectedJobId && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto divide-y divide-gray-100">
                        {filteredJobs.length > 0 ? filteredJobs.map(job => (
                            <button 
                                key={job.id}
                                onClick={() => { setSelectedJobId(job.id); setFilterWo(job.woNumber || job.policeNumber); }}
                                className="w-full text-left p-4 hover:bg-gray-50 flex justify-between items-center group transition-colors"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`font-bold ${themeText} text-lg`}>{job.woNumber || 'DRAFT'}</span>
                                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">{job.policeNumber}</span>
                                    </div>
                                    <div className="text-sm text-gray-500 mt-0.5">{job.carModel} - {job.customerName}</div>
                                </div>
                                <ArrowRight size={18} className="text-gray-300 group-hover:text-indigo-600" />
                            </button>
                        )) : <div className="p-6 text-center text-gray-400 text-sm italic">Pencarian tidak ditemukan</div>}
                    </div>
                )}
            </div>

            {selectedJob && (
                <div className={`mt-4 p-4 rounded-lg border flex flex-col md:flex-row justify-between items-center gap-4 ${issuanceType === 'sparepart' ? 'bg-indigo-50 border-indigo-200' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex items-center gap-4">
                        <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100">
                            <Package size={24} className={themeText}/>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Work Order Terpilih</span>
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-xl font-bold text-gray-900">{selectedJob.woNumber}</h3>
                                <span className="text-sm font-medium text-gray-600">| {selectedJob.policeNumber}</span>
                            </div>
                            <p className="text-xs text-gray-500">{selectedJob.carModel} • {selectedJob.namaAsuransi}</p>
                        </div>
                    </div>
                    <button onClick={() => { setSelectedJobId(''); setFilterWo(''); }} className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-bold shadow-sm transition-colors">
                        Ganti Unit
                    </button>
                </div>
            )}
        </div>

        {issuanceType === 'sparepart' && selectedJob && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Truck size={20} className="text-gray-500"/>
                        <h3 className="font-bold text-gray-800">Daftar Kebutuhan Part (Estimasi SA)</h3>
                    </div>
                    {selectedPartIndices.length > 0 && (
                        <button 
                            onClick={handleBulkPartIssuance}
                            disabled={isSubmitting}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2 animate-pulse"
                        >
                            <Save size={16}/> Proses Keluar Part ({selectedPartIndices.length})
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-xs font-semibold text-gray-500 uppercase">
                            <tr>
                                <th className="px-6 py-3 w-10 text-center">
                                    <button onClick={toggleAllParts} className="text-indigo-600 hover:text-indigo-800" title="Pilih Semua yang Belum Issued">
                                        <CheckSquare size={18}/>
                                    </button>
                                </th>
                                <th className="px-6 py-3">Detail Suku Cadang</th>
                                <th className="px-6 py-3 text-center">Req. Qty</th>
                                <th className="px-6 py-3 text-center">Stok Gudang</th>
                                <th className="px-6 py-3 text-right">Status / Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(selectedJob.estimateData?.partItems || []).map((item, idx) => {
                                // Match Logic: ID first, then Code
                                const inv = inventoryItems.find(i => 
                                    (item.inventoryId && i.id === item.inventoryId) || 
                                    (i.code && item.number && i.code.trim().toUpperCase() === item.number.trim().toUpperCase())
                                );
                                const isIssued = !!item.hasArrived;
                                const readyStock = Number(inv?.stock || 0);
                                const reqQty = Number(item.qty || 1);
                                const isSelected = selectedPartIndices.includes(idx);

                                return (
                                    <tr key={idx} className={isIssued ? 'bg-gray-50 opacity-60' : isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                                        <td className="px-6 py-4 text-center">
                                            {!isIssued && inv && (
                                                <button onClick={() => togglePartSelection(idx)} className="text-indigo-600">
                                                    {isSelected ? <CheckSquare size={20} className="fill-indigo-100"/> : <Square size={20}/>}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900">{item.name}</div>
                                            <div className="text-xs font-mono text-gray-500 mt-1">{item.number || 'TANPA NOMOR PART'}</div>
                                            {item.isPriceMismatch && <span className="text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded border border-red-200 mt-1 inline-block">PRICE MISMATCH</span>}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="font-bold text-gray-900">{reqQty}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {inv ? (
                                                <div className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold ${readyStock >= reqQty ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                    {readyStock.toFixed(2)} {inv.unit}
                                                </div>
                                            ) : <span className="text-orange-500 text-xs italic bg-orange-50 px-2 py-1 rounded border border-orange-100 font-bold">Perlu Link Manual</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isIssued ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                                    <CheckCircle size={14}/> Issued
                                                </span>
                                            ) : !inv ? (
                                                <button 
                                                    onClick={() => handlePartAction(item, idx)}
                                                    className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-bold hover:bg-orange-600 flex items-center gap-1 ml-auto"
                                                >
                                                    <Link size={12}/> Link Manual
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-400 font-medium">Ready to Issue</span>
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

        {/* MANUAL LINKING MODAL */}
        <Modal 
            isOpen={isLinkModalOpen} 
            onClose={() => setIsLinkModalOpen(false)} 
            title="Manual Part Linking & Issuance"
            maxWidth="max-w-3xl"
        >
            <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 mt-1" size={20}/>
                    <div className="text-xs text-amber-800">
                        <strong>Perhatian:</strong> Sistem tidak dapat menemukan part yang cocok secara otomatis. 
                        Silakan cari dan pilih part yang benar dari Master Gudang untuk dikeluarkan. 
                        Aksi ini akan mencatat Harga Modal (HPP) ke WO ini.
                    </div>
                </div>

                <div className="bg-gray-100 p-4 rounded-xl mb-4">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Item Estimasi (Permintaan SA)</p>
                    <p className="text-lg font-black text-gray-900">{linkTarget?.estItem.name}</p>
                    <p className="text-sm font-mono text-gray-600">Kode: {linkTarget?.estItem.number || '-'} | Qty: {linkTarget?.estItem.qty || 1}</p>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                    <input 
                        type="text" 
                        autoFocus
                        placeholder="Cari di Master Stok (Nama / Kode)..." 
                        value={partSearchTerm}
                        onChange={e => setPartSearchTerm(e.target.value)}
                        className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
                    />
                </div>

                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {linkingCandidates.map(item => (
                        <div key={item.id} className="p-3 hover:bg-gray-50 flex justify-between items-center group">
                            <div>
                                <div className="font-bold text-gray-800">{item.name}</div>
                                <div className="text-xs text-gray-500 font-mono">{item.code} | Stok: {item.stock} {item.unit}</div>
                            </div>
                            <button 
                                onClick={() => {
                                    if(linkTarget && linkTarget.idx !== undefined) {
                                        if(item.stock < (linkTarget.estItem.qty || 1)) {
                                            if(!window.confirm("Stok gudang kurang dari permintaan. Tetap lanjutkan (Stok jadi minus)?")) return;
                                        }
                                        executePartIssuance(linkTarget.estItem, linkTarget.idx, item);
                                    }
                                }}
                                disabled={isSubmitting}
                                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2"
                            >
                                <MousePointerClick size={14}/> Pilih & Keluarkan
                            </button>
                        </div>
                    ))}
                    {linkingCandidates.length === 0 && (
                        <div className="p-4 text-center text-gray-400 text-xs italic">Part tidak ditemukan di Master Stok.</div>
                    )}
                </div>
            </div>
        </Modal>

        {issuanceType === 'material' && selectedJob && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-fade-in">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b">
                    <PaintBucket size={20} className="text-orange-600"/>
                    <h3 className="font-bold text-gray-800 text-lg">Input Alokasi Bahan Baku</h3>
                </div>
                
                <form onSubmit={handleMaterialIssuance} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cari Katalog Bahan</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                                <input 
                                    list="mat-list"
                                    type="text" 
                                    placeholder="Ketik Nama atau Kode Bahan..."
                                    value={materialSearchTerm}
                                    onChange={e => setMaterialSearchTerm(e.target.value)}
                                    className="w-full pl-10 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-medium"
                                />
                                <datalist id="mat-list">
                                    {materialInventory.map(m => <option key={m.id} value={m.name}>{m.code} | Stok: {m.stock.toFixed(2)} {m.unit}</option>)}
                                </datalist>
                            </div>
                            {currentItem && (
                                <div className="mt-2 text-xs flex justify-between items-center text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">
                                    <span className="font-bold">{currentItem.name}</span>
                                    <span>Stok: <strong className={currentItem.stock > 0 ? 'text-green-600' : 'text-red-600'}>{currentItem.stock.toFixed(3)} {currentItem.unit}</strong></span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Takaran / Qty Digunakan</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" step="0.01" required
                                    value={inputQty}
                                    onChange={e => setInputQty(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0.00"
                                    className="flex-grow p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-bold text-gray-900"
                                />
                                <select 
                                    value={selectedUnit} 
                                    onChange={e => setSelectedUnit(e.target.value)}
                                    className="w-28 p-2.5 border border-gray-300 rounded-lg bg-white font-medium"
                                >
                                    {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Operasional (Opsional)</label>
                        <input 
                            type="text" 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Contoh: Pemakaian untuk panel pintu depan..."
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <button 
                            type="submit" 
                            disabled={isSubmitting || !materialSearchTerm || !inputQty}
                            className="bg-orange-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {isSubmitting ? 'Menyimpan...' : <><Save size={18}/> Simpan Pemakaian</>}
                        </button>
                    </div>
                </form>
            </div>
        )}

        {selectedJob && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <History size={18} className="text-gray-500"/> Riwayat Alokasi Unit Ini
                    </h3>
                    <div className="text-sm font-bold text-indigo-700 bg-white px-3 py-1 rounded border border-gray-200 shadow-sm">
                        Total: {formatCurrency(totalUsageCost)}
                    </div>
                </div>
                {usageHistory.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 font-semibold text-gray-500 text-xs uppercase">
                                <tr>
                                    <th className="px-6 py-3">Timestamp</th>
                                    <th className="px-6 py-3">Deskripsi Item</th>
                                    <th className="px-6 py-3 text-center">Qty Keluar</th>
                                    <th className="px-6 py-3 text-right">Biaya Modal</th>
                                    <th className="px-6 py-3 text-center w-20">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {usageHistory.map((log, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-gray-500 text-xs">
                                            {formatDateIndo(log.issuedAt)} 
                                            <div className="text-[10px] opacity-75">{new Date(log.issuedAt).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="font-bold text-gray-900">{log.itemName}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">{log.itemCode} | {log.notes}</div>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-bold border border-gray-200">
                                                {log.inputQty || log.qty} {log.inputUnit || ''}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-right font-bold text-emerald-600">{formatCurrency(log.totalCost)}</td>
                                        <td className="px-6 py-3 text-center">
                                            {userPermissions.role.includes('Manager') ? (
                                                <button onClick={() => handleCancelIssuance(log)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded" title="Batalkan">
                                                    <XCircle size={18}/>
                                                </button>
                                            ) : <span className="text-gray-300">-</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="p-8 text-center text-gray-400 text-sm italic">Belum ada item yang dialokasikan</div>}
            </div>
        )}
    </div>
  );
};

export default MaterialIssuanceView;
