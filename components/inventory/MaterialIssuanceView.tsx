
import React, { useState, useMemo, useEffect } from 'react';
import { Job, InventoryItem, UserPermissions, EstimateItem, UsageLogItem, Supplier } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp, getDoc, writeBatch, addDoc, collection } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION, SPAREPART_COLLECTION, PURCHASE_ORDERS_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, cleanObject, generateRandomId } from '../../utils/helpers';
import { Search, Truck, PaintBucket, CheckCircle, History, Save, ArrowRight, AlertTriangle, Info, Package, XCircle, Clock, Zap, Target, Link, MousePointerClick, CheckSquare, Square, Box, Archive } from 'lucide-react';
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
  
  // Selection State for Manual Checklist
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

  const toggleAllAvailable = () => {
      if (!selectedJob) return;
      const parts = selectedJob.estimateData?.partItems || [];
      const newIndices: number[] = [];
      
      parts.forEach((item, idx) => {
          if (item.hasArrived) return; // Skip already issued
          
          // Match Logic
          const inv = inventoryItems.find(i => 
              (item.inventoryId && i.id === item.inventoryId) || 
              (i.code && item.number && i.code.trim().toUpperCase() === item.number.trim().toUpperCase())
          );
          
          if (inv && inv.stock >= (item.qty || 1)) {
              newIndices.push(idx);
          }
      });
      
      setSelectedPartIndices(newIndices);
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

  // --- MANUAL CHECKLIST ISSUANCE HANDLER ---
  const handleBulkPartIssuance = async () => {
      if (!selectedJob || selectedPartIndices.length === 0) return;

      // --- VALIDATION BLOCK: CEK SELISIH HARGA ---
      const priceMismatchErrors: string[] = [];
      const currentPartsForCheck = selectedJob.estimateData?.partItems || [];

      selectedPartIndices.forEach(idx => {
          const estItem = currentPartsForCheck[idx];
          // Find Inventory
          const invItem = inventoryItems.find(i => 
              (estItem.inventoryId && i.id === estItem.inventoryId) || 
              (i.code && estItem.number && i.code.trim().toUpperCase() === estItem.number.trim().toUpperCase())
          );

          if (invItem) {
              // Rule: Jika Harga WO < Harga Master Sell Price -> BLOCK
              if (estItem.price < invItem.sellPrice) {
                  priceMismatchErrors.push(
                      `- ${estItem.name}\n  (Harga WO: ${formatCurrency(estItem.price)} < Master: ${formatCurrency(invItem.sellPrice)})`
                  );
              }
          }
      });

      if (priceMismatchErrors.length > 0) {
          alert(
              `⛔ PROSES DIBLOKIR: SELISIH HARGA JUAL\n\n` +
              `Sistem mendeteksi item berikut memiliki harga jual di WO lebih rendah dari Master Stok:\n\n` +
              `${priceMismatchErrors.join('\n')}\n\n` +
              `SOLUSI: Mohon informasikan ke SA untuk menyesuaikan harga di menu Estimasi terlebih dahulu sebelum dikeluarkan.`
          );
          return; // STOP EXECUTION
      }
      // --- END VALIDATION BLOCK ---
      
      if (!window.confirm(`Konfirmasi mengeluarkan ${selectedPartIndices.length} item part dari gudang? Stok akan berkurang.`)) return;

      setIsSubmitting(true);
      try {
          const batch = writeBatch(db); 
          
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          const jobSnap = await getDoc(jobRef);
          if (!jobSnap.exists()) throw new Error("Data WO tidak ditemukan.");
          
          const currentJobData = jobSnap.data() as Job;
          const currentParts = [...(currentJobData.estimateData?.partItems || [])];
          let totalCogsToAdd = 0;
          const usageLogsToAdd: UsageLogItem[] = [];
          
          // Process Checklisted Items
          for (const idx of selectedPartIndices) {
              const estItem = currentParts[idx];
              
              // 1. Find Matching Inventory Item
              const invItem = inventoryItems.find(i => 
                  (estItem.inventoryId && i.id === estItem.inventoryId) || 
                  (i.code && estItem.number && i.code.trim().toUpperCase() === estItem.number.trim().toUpperCase())
              );

              if (!invItem) {
                  throw new Error(`Part '${estItem.name}' belum ter-link ke Master Stok. Gunakan tombol Link Manual.`);
              }

              const reqQty = Number(estItem.qty || 1);
              
              // 2. Strict Stock Validation
              if (invItem.stock < reqQty) {
                  throw new Error(`Gagal Issued: Stok Fisik ${invItem.name} tidak cukup! (Gudang: ${invItem.stock}, Butuh: ${reqQty}). Harap update stok via PO/Opname.`);
              }

              // 3. COGS Calculation
              const cost = invItem.buyPrice * reqQty;
              totalCogsToAdd += cost;

              // 4. Update Inventory (Deduct Stock)
              batch.update(doc(db, SPAREPART_COLLECTION, invItem.id), {
                  stock: increment(-reqQty),
                  updatedAt: serverTimestamp()
              });

              // 5. Update WO Item Status -> MARK AS ISSUED
              currentParts[idx] = {
                  ...currentParts[idx],
                  hasArrived: true, // FLAG ISSUED
                  inventoryId: invItem.id,
                  isPriceMismatch: false // Clear flag if it was set before, assuming passed validation now
              };

              // 6. Create Usage Log
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
                  notes: `Issued Manual Checklist to WO ${selectedJob.woNumber}`,
                  issuedAt: new Date().toISOString(), 
                  issuedBy: userPermissions.role || 'Partman',
                  refPartIndex: idx 
              });
          }

          // Commit Job Updates
          batch.update(jobRef, {
              'estimateData.partItems': currentParts,
              'costData.hargaBeliPart': increment(totalCogsToAdd),
              usageLog: arrayUnion(...usageLogsToAdd),
              updatedAt: serverTimestamp()
          });

          await batch.commit();

          showNotification("Sukses: Part berhasil dikeluarkan (Issued). Stok Gudang berkurang.", "success");
          onRefreshData();
          setSelectedPartIndices([]);

      } catch (e: any) {
          showNotification(e.message, "error");
      } finally {
          setIsSubmitting(false);
      }
  };

  const handlePartAction = (estItem: EstimateItem, idx: number) => {
    // Only for linking manually if auto-match fails
    const inv = inventoryItems.find(i => 
        (estItem.inventoryId && i.id === estItem.inventoryId) || 
        (i.code && estItem.number && i.code.trim().toUpperCase() === estItem.number.trim().toUpperCase())
    );

    if (inv) {
        // Toggle selection
        togglePartSelection(idx);
    } else {
        // Open Manual Link Modal
        setLinkTarget({ estItem, idx });
        setPartSearchTerm(estItem.number || estItem.name || '');
        setIsLinkModalOpen(true);
    }
  };

  // Function to handle manual linking confirmation
  const confirmManualLink = async (inventoryItem: InventoryItem) => {
      if (!selectedJob || !linkTarget) return;
      
      const parts = [...(selectedJob.estimateData?.partItems || [])];
      parts[linkTarget.idx] = {
          ...parts[linkTarget.idx],
          inventoryId: inventoryItem.id, // Just link it, don't issue yet
          name: inventoryItem.name, // Sync name
          number: inventoryItem.code // Sync code
      };

      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id), {
              'estimateData.partItems': parts
          });
          showNotification("Part berhasil di-link. Silakan checklist untuk dikeluarkan.", "success");
          setIsLinkModalOpen(false);
          setLinkTarget(null);
      } catch (e) {
          showNotification("Gagal linking part.", "error");
      }
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
    if ((item.unit === 'Liter' || item.unit === 'Kg' || item.unit === 'Kaleng') && 
        (selectedUnit === 'ML' || selectedUnit === 'Gram')) {
        finalDeductQty = qty / 1000;
    }

    setIsSubmitting(true);
    try {
        const itemSnap = await getDoc(doc(db, SPAREPART_COLLECTION, item.id));
        const currentData = itemSnap.data() as InventoryItem;
        const currentStock = Number(currentData?.stock || 0);
        const currentBuyPrice = Number(currentData?.buyPrice || 0);

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

        if (currentData.supplierId) {
            const poNumber = generateRandomId('BILL');
            const poPayload = {
                poNumber: `AUTO-${poNumber}`,
                supplierId: currentData.supplierId,
                supplierName: currentData.supplierName || 'Unknown Vendor',
                status: 'Received', 
                items: [{
                    code: item.code,
                    name: item.name,
                    qty: finalDeductQty,
                    unit: item.unit,
                    price: currentBuyPrice,
                    total: cost,
                    inventoryId: item.id,
                    refJobId: selectedJob.id,
                    refWoNumber: selectedJob.woNumber
                }],
                notes: `Auto-Bill: Pemakaian Material ${item.name} di WO ${selectedJob.woNumber}`,
                hasPpn: false,
                subtotal: cost,
                ppnAmount: 0,
                totalAmount: cost,
                receivedBy: 'System (Usage)',
                receivedAt: serverTimestamp(),
                createdBy: 'System',
                createdAt: serverTimestamp()
            };
            
            await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), cleanObject(poPayload));
            showNotification(`Tagihan Vendor otomatis dibuat untuk ${currentData.supplierName}.`, "info");
        }

        showNotification("Bahan berhasil dibebankan.", "success");
        setMaterialSearchTerm('');
        setInputQty('');
        onRefreshData();
    } catch (err: any) {
        showNotification(err.message, "error");
    } finally { setIsSubmitting(false); }
  };

  const handleCancelIssuance = async (log: UsageLogItem) => {
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
                parts[log.refPartIndex] = { ...parts[log.refPartIndex], hasArrived: false, isPriceMismatch: false }; 
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
                        Pembebanan Material ke WO & Pengurangan Stok Gudang (Manual)
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
                        <h3 className="font-bold text-gray-800">Daftar Part (Checklist Manual untuk Keluar Barang)</h3>
                    </div>
                    {selectedPartIndices.length > 0 ? (
                        <button 
                            onClick={handleBulkPartIssuance}
                            disabled={isSubmitting}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2 animate-pulse"
                        >
                            <Save size={16}/> Konfirmasi Keluar ({selectedPartIndices.length} Item)
                        </button>
                    ) : (
                        <button 
                            onClick={toggleAllAvailable}
                            className="text-indigo-600 font-bold text-xs hover:bg-indigo-50 px-3 py-1.5 rounded transition-colors"
                        >
                            Pilih Semua Yang Ready
                        </button>
                    )}
                </div>
                <div className="p-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-xs text-blue-800">
                    <Info size={16} className="shrink-0"/>
                    <p>Centang item yang fisik barangnya akan diambil dari gudang untuk dipasang ke mobil. Sistem akan mengurangi stok secara langsung.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-xs font-semibold text-gray-500 uppercase">
                            <tr>
                                <th className="px-6 py-3 w-10 text-center">Pilih</th>
                                <th className="px-6 py-3">Deskripsi Part (Estimasi)</th>
                                <th className="px-6 py-3 text-center">Qty Request</th>
                                <th className="px-6 py-3 text-center">Stok Gudang (Tersedia)</th>
                                <th className="px-6 py-3 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(selectedJob.estimateData?.partItems || []).map((item, idx) => {
                                // Match Logic
                                const inv = inventoryItems.find(i => 
                                    (item.inventoryId && i.id === item.inventoryId) || 
                                    (i.code && item.number && i.code.trim().toUpperCase() === item.number.trim().toUpperCase())
                                );
                                const isIssued = !!item.hasArrived;
                                const readyStock = Number(inv?.stock || 0);
                                const reqQty = Number(item.qty || 1);
                                const isSelected = selectedPartIndices.includes(idx);
                                const isSufficient = readyStock >= reqQty;

                                return (
                                    <tr key={idx} className={isIssued ? 'bg-gray-50 opacity-60' : isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                                        <td className="px-6 py-4 text-center">
                                            {!isIssued && inv ? (
                                                <button 
                                                    onClick={() => togglePartSelection(idx)} 
                                                    className={`transition-colors ${!isSufficient ? 'opacity-30 cursor-not-allowed' : 'text-indigo-600'}`}
                                                    disabled={!isSufficient} // Disable checkbox if stock low
                                                >
                                                    {isSelected ? <CheckSquare size={20} className="fill-indigo-100"/> : <Square size={20}/>}
                                                </button>
                                            ) : null}
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
                                                <div className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold ${isSufficient ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    <Archive size={12} className="mr-1"/> {readyStock} {inv.unit}
                                                </div>
                                            ) : <span className="text-gray-400 text-xs italic">Tidak Terhubung</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isIssued ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                                    <CheckCircle size={14}/> Sudah Keluar
                                                </span>
                                            ) : !inv ? (
                                                <button 
                                                    onClick={() => handlePartAction(item, idx)}
                                                    className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs font-bold hover:bg-orange-600 flex items-center gap-1 ml-auto"
                                                >
                                                    <Link size={12}/> Link Manual
                                                </button>
                                            ) : !isSufficient ? (
                                                <span className="text-xs font-bold text-red-500 flex items-center justify-end gap-1"><XCircle size={14}/> Stok Kurang</span>
                                            ) : (
                                                <span className="text-xs text-indigo-600 font-medium cursor-pointer flex items-center justify-end gap-1" onClick={() => togglePartSelection(idx)}>
                                                    <MousePointerClick size={12}/> Siap Checklist
                                                </span>
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
            title="Manual Part Linking (Mapping)"
            maxWidth="max-w-3xl"
        >
            <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 mt-1" size={20}/>
                    <div className="text-xs text-amber-800">
                        <strong>Perhatian:</strong> Sistem tidak dapat menemukan part secara otomatis. 
                        Silakan pilih part yang sesuai dari Master Stok untuk menghubungkannya.
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
                                onClick={() => confirmManualLink(item)}
                                disabled={isSubmitting}
                                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2"
                            >
                                <Link size={14}/> Link Part Ini
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
