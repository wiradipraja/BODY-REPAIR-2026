import React, { useState, useMemo } from 'react';
import { Job, InventoryItem, UserPermissions } from '../../types';
import { doc, updateDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { formatCurrency } from '../../utils/helpers';
import { Search, Save, Package, Truck, AlertTriangle, CheckCircle, Car } from 'lucide-react';

interface MaterialIssuanceViewProps {
  activeJobs: Job[];
  inventoryItems: InventoryItem[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  onRefreshData: () => void;
}

const MaterialIssuanceView: React.FC<MaterialIssuanceViewProps> = ({ 
  activeJobs, inventoryItems, userPermissions, showNotification, onRefreshData 
}) => {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterJob, setFilterJob] = useState('');

  // Derived Data
  const selectedJob = useMemo(() => activeJobs.find(j => j.id === selectedJobId), [activeJobs, selectedJobId]);
  const selectedItem = useMemo(() => inventoryItems.find(i => i.id === selectedItemId), [inventoryItems, selectedItemId]);

  const filteredJobs = useMemo(() => {
    return activeJobs.filter(j => 
        j.policeNumber.toLowerCase().includes(filterJob.toLowerCase()) || 
        j.customerName.toLowerCase().includes(filterJob.toLowerCase())
    );
  }, [activeJobs, filterJob]);

  const handleIssuance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !selectedItemId || qty <= 0) {
        showNotification("Mohon lengkapi data pembebanan.", "error");
        return;
    }
    if (!selectedItem) return;

    // Cek Stok
    if (selectedItem.stock < qty) {
        showNotification(`Stok tidak cukup! Tersedia: ${selectedItem.stock}`, "error");
        return;
    }

    if (!window.confirm(`Konfirmasi pembebanan ${qty} ${selectedItem.unit} ${selectedItem.name} ke ${selectedJob?.policeNumber}?`)) return;

    setIsSubmitting(true);
    try {
        const itemCostTotal = (selectedItem.buyPrice || 0) * qty;
        
        // 1. Update Inventory (Kurangi Stok)
        const inventoryRef = doc(db, SPAREPART_COLLECTION, selectedItemId);
        await updateDoc(inventoryRef, {
            stock: increment(-qty),
            updatedAt: serverTimestamp()
        });

        // 2. Update Job (Tambah Cost & Log)
        const jobRef = doc(db, JOBS_COLLECTION, selectedJobId);
        
        const usageRecord = {
            itemId: selectedItemId,
            itemName: selectedItem.name,
            itemCode: selectedItem.code,
            qty: qty,
            costPerUnit: selectedItem.buyPrice,
            totalCost: itemCostTotal,
            category: selectedItem.category,
            notes: notes,
            issuedAt: new Date().toISOString(), // Use string for array storage simplicity
            issuedBy: 'Staff' // Ideally get from AuthContext
        };

        // Determine which cost field to increment
        const costField = selectedItem.category === 'sparepart' ? 'costData.hargaBeliPart' : 'costData.hargaModalBahan';

        await updateDoc(jobRef, {
            [costField]: increment(itemCostTotal),
            usageLog: arrayUnion(usageRecord)
        });

        showNotification("Pembebanan berhasil dicatat.", "success");
        
        // Reset Form
        setQty(1);
        setNotes('');
        setSelectedItemId('');
        onRefreshData(); // Refresh inventory locally if needed
    } catch (error: any) {
        console.error("Issuance Error:", error);
        showNotification("Gagal melakukan pembebanan: " + error.message, "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div>
            <h1 className="text-3xl font-bold text-gray-900">Pembebanan Material</h1>
            <p className="text-gray-500 mt-1">Keluarkan stok sparepart atau bahan baku untuk dibebankan ke WO.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* LEFT COLUMN: FORM */}
            <div className="md:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <form onSubmit={handleIssuance} className="space-y-5">
                    
                    {/* SELECT JOB */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">1. Pilih Unit / WO (Work In Progress)</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Cari Nopol..." 
                                value={filterJob} 
                                onChange={e => setFilterJob(e.target.value)}
                                className="w-full p-2 mb-2 border rounded text-sm bg-gray-50"
                            />
                            <select 
                                value={selectedJobId} 
                                onChange={e => setSelectedJobId(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                required
                            >
                                <option value="">-- Pilih Kendaraan --</option>
                                {filteredJobs.map(job => (
                                    <option key={job.id} value={job.id}>
                                        {job.policeNumber} - {job.carModel} ({job.customerName})
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedJob && (
                            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-800 flex items-center gap-2">
                                <Car size={16}/> 
                                WO: {selectedJob.woNumber || 'Draft'} | SA: {selectedJob.namaSA}
                            </div>
                        )}
                    </div>

                    {/* SELECT ITEM */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">2. Pilih Item (Sparepart / Bahan)</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                            <input 
                                list="inventory-datalist"
                                placeholder="Ketik Kode atau Nama Item..."
                                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                value={selectedItemId}
                                onChange={e => {
                                    // Datalist input returns the value. 
                                    // We need to match it to ID. 
                                    // Simple approach: Use code as value in option, find ID. 
                                    // Or just put ID in option value and show label.
                                    setSelectedItemId(e.target.value); 
                                }}
                            />
                            <datalist id="inventory-datalist">
                                {inventoryItems.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.code ? `[${item.code}] ` : ''}{item.name} (Stok: {item.stock})
                                    </option>
                                ))}
                            </datalist>
                        </div>
                        {/* Selected Item Preview */}
                        {selectedItemId && (
                            <div className="mt-2">
                                {inventoryItems.find(i => i.id === selectedItemId) ? (
                                    <div className="p-3 bg-gray-50 border rounded-lg flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-gray-800">{inventoryItems.find(i => i.id === selectedItemId)?.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Modal: {formatCurrency(inventoryItems.find(i => i.id === selectedItemId)?.buyPrice)} / {inventoryItems.find(i => i.id === selectedItemId)?.unit}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${ (inventoryItems.find(i => i.id === selectedItemId)?.stock || 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                Sisa Stok: {inventoryItems.find(i => i.id === selectedItemId)?.stock}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-red-500 mt-1">* Item tidak ditemukan di database. Pastikan pilih dari list.</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">3. Jumlah (Qty)</label>
                            <input 
                                type="number" 
                                min="1"
                                value={qty} 
                                onChange={e => setQty(Number(e.target.value))}
                                className="w-full p-3 border border-gray-300 rounded-lg font-bold text-center"
                            />
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (Opsional)</label>
                             <input 
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Keperluan..."
                                className="w-full p-3 border border-gray-300 rounded-lg"
                             />
                        </div>
                    </div>

                    <div className="pt-4 border-t">
                        <button 
                            type="submit" 
                            disabled={isSubmitting || !selectedItem || !selectedJob}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg font-bold disabled:opacity-50"
                        >
                            {isSubmitting ? 'Menyimpan...' : <><Truck size={20}/> Proses Pembebanan</>}
                        </button>
                    </div>
                </form>
            </div>

            {/* RIGHT COLUMN: INFO & GUIDANCE */}
            <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-100 p-5 rounded-xl">
                    <h3 className="font-bold text-orange-800 flex items-center gap-2 mb-2">
                        <AlertTriangle size={18}/> Perhatian
                    </h3>
                    <ul className="text-sm text-orange-700 space-y-2 list-disc list-inside">
                        <li>Pastikan WO sudah dibuat sebelum melakukan pembebanan.</li>
                        <li>Stok inventory akan langsung berkurang.</li>
                        <li>Nilai HPP (Harga Modal) akan ditambahkan ke Job Costing unit terkait.</li>
                        <li>Gunakan fitur ini untuk <strong>Cat, Thinner, Amplas</strong> atau part tambahan di luar estimasi awal.</li>
                    </ul>
                </div>

                <div className="bg-white border border-gray-200 p-5 rounded-xl">
                    <h3 className="font-bold text-gray-800 mb-2">Statistik Stok</h3>
                    <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-500 text-sm">Total Item Part</span>
                        <span className="font-bold">{inventoryItems.filter(i => i.category === 'sparepart').length}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                        <span className="text-gray-500 text-sm">Total Bahan Baku</span>
                        <span className="font-bold">{inventoryItems.filter(i => i.category === 'material').length}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default MaterialIssuanceView;