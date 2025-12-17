import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, serverTimestamp, increment, query, orderBy, limit, getDoc, where, Timestamp } from 'firebase/firestore';
import { db, PURCHASE_ORDERS_COLLECTION, SPAREPART_COLLECTION, SETTINGS_COLLECTION, JOBS_COLLECTION } from '../../services/firebase';
import { InventoryItem, Supplier, PurchaseOrder, PurchaseOrderItem, UserPermissions, Settings, Job } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { generatePurchaseOrderPDF, generateReceivingReportPDF } from '../../utils/pdfGenerator';
import { ShoppingCart, Plus, Search, Eye, Download, CheckCircle, XCircle, ArrowLeft, Trash2, Package, AlertCircle, CheckSquare, Square, Printer, Save, FileText, Send, Ban, Check, RefreshCw, Layers, Car } from 'lucide-react';
import { initialSettingsState } from '../../utils/constants';

interface PurchaseOrderViewProps {
  suppliers: Supplier[];
  inventoryItems: InventoryItem[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  onRefreshInventory: () => void;
}

const UNIT_OPTIONS = ['Pcs', 'Set', 'Unit', 'Liter', 'Kaleng', 'Kg', 'Gram', 'Meter', 'Roll', 'Galon'];

const PurchaseOrderView: React.FC<PurchaseOrderViewProps> = ({ 
  suppliers, inventoryItems, userPermissions, showNotification, onRefreshInventory
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail'>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [settings, setSettings] = useState<Settings>(initialSettingsState);

  // Partial Receive State
  const [selectedItemsToReceive, setSelectedItemsToReceive] = useState<number[]>([]);
  const [receiveQtyMap, setReceiveQtyMap] = useState<Record<number, number>>({});

  // CREATE FORM STATE
  const [poCreationMode, setPoCreationMode] = useState<'manual' | 'wo'>('manual');
  const [poForm, setPoForm] = useState<Partial<PurchaseOrder>>({
      supplierId: '',
      items: [],
      notes: '',
      hasPpn: false 
  });
  const [searchTerm, setSearchTerm] = useState('');

  // WO IMPORT STATE
  const [woSearchTerm, setWoSearchTerm] = useState('');
  const [foundJob, setFoundJob] = useState<Job | null>(null);
  const [selectedPartsFromWo, setSelectedPartsFromWo] = useState<Record<number, { selected: boolean, isIndent: boolean }>>({});

  // Manager Access Check
  const isManager = userPermissions.role === 'Manager' || userPermissions.role === 'Super Admin';

  // Load Settings for PDF Header
  useEffect(() => {
    const fetchSettings = async () => {
        try {
            const q = await getDocs(collection(db, SETTINGS_COLLECTION));
            if (!q.empty) setSettings(q.docs[0].data() as Settings);
        } catch (e) { console.error(e); }
    };
    fetchSettings();
  }, []);

  const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      try {
          const q = query(collection(db, PURCHASE_ORDERS_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder));
          setOrders(data);
      } catch (e: any) {
          console.error(e);
          setError("Gagal memuat data PO.");
          showNotification("Gagal memuat data PO.", "error");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (viewMode === 'list') fetchOrders();
  }, [viewMode]);

  useEffect(() => {
      if (selectedPO && (selectedPO.status === 'Ordered' || selectedPO.status === 'Partial')) {
          setSelectedItemsToReceive([]);
          const initialQtyMap: Record<number, number> = {};
          selectedPO.items.forEach((item, idx) => {
              const remaining = item.qty - (item.qtyReceived || 0);
              if (remaining > 0) initialQtyMap[idx] = remaining;
          });
          setReceiveQtyMap(initialQtyMap);
      }
  }, [selectedPO]);

  // Handler for checkbox selection in detail view
  const toggleItemSelection = (idx: number) => {
    setSelectedItemsToReceive(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  // --- HANDLER FOR PDF PRINTING ---
  const handlePrintPO = (po: PurchaseOrder) => {
    if (!po) return;
    try {
        generatePurchaseOrderPDF(po, settings);
        showNotification(`Mendownload ${po.poNumber}...`, "success");
    } catch (err: any) {
        console.error("PDF Print Error:", err);
        showNotification("Gagal mencetak PDF. Cek console.", "error");
    }
  };

  // --- HANDLERS FOR APPROVAL ---

  const handleApprovePO = async () => {
      if (!selectedPO) return;
      if (!isManager) {
          showNotification("Hanya Manager yang dapat menyetujui PO.", "error");
          return;
      }
      if (!window.confirm("Setujui PO ini? Status akan berubah menjadi Ordered dan dapat dilakukan penerimaan barang.")) return;
      
      setLoading(true);
      try {
          await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), {
              status: 'Ordered',
              approvedBy: userPermissions.role,
              approvedAt: serverTimestamp()
          });
          showNotification("Purchase Order Disetujui (Approved).", "success");
          setSelectedPO(null);
          setViewMode('list');
          fetchOrders();
      } catch (e: any) {
          showNotification("Gagal menyetujui PO: " + e.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handleRejectPO = async () => {
      if (!selectedPO) return;
      if (!isManager) return;
      const reason = window.prompt("⚠️ TOLAK PO\n\nMasukkan alasan penolakan (Wajib):", "Budget tidak sesuai / revisi item");
      if (reason === null) return;
      if (!reason.trim()) {
          showNotification("Alasan penolakan harus diisi!", "error");
          return;
      }

      setLoading(true);
      try {
          await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), {
              status: 'Rejected',
              rejectionReason: reason,
              approvedBy: userPermissions.role,
              approvedAt: serverTimestamp()
          });
          showNotification("PO Berhasil Ditolak.", "success");
          setSelectedPO(null);
          setViewMode('list');
          fetchOrders();
      } catch (e: any) {
          showNotification("Gagal menolak PO.", "error");
      } finally {
          setLoading(false);
      }
  };

  // --- HANDLERS FOR WO IMPORT ---
  
  const handleSearchWO = async () => {
      if (!woSearchTerm) return;
      setLoading(true);
      setFoundJob(null);
      setSelectedPartsFromWo({});

      try {
          const termUpper = woSearchTerm.toUpperCase().replace(/\s/g, '');
          
          let q = query(collection(db, JOBS_COLLECTION), where('woNumber', '==', termUpper));
          let snapshot = await getDocs(q);
          
          if (snapshot.empty) {
              q = query(collection(db, JOBS_COLLECTION), where('policeNumber', '==', termUpper));
              snapshot = await getDocs(q);
          }

          if (!snapshot.empty) {
              const allMatchingDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
              
              allMatchingDocs.sort((a, b) => {
                  const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
                  const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
                  return timeB - timeA;
              });

              const jobWithParts = allMatchingDocs.find(j => j.estimateData?.partItems && j.estimateData.partItems.length > 0);
              
              if (!jobWithParts) {
                  showNotification(`Unit ${termUpper} ditemukan, tapi estimasi part masih kosong di database. Pastikan SA sudah klik "Update Estimasi".`, "error");
                  return;
              }

              setFoundJob(jobWithParts);
              const initialSelection: any = {};
              jobWithParts.estimateData!.partItems.forEach((p, idx) => {
                  if (!p.isOrdered) initialSelection[idx] = { selected: true, isIndent: p.isIndent || false };
              });
              setSelectedPartsFromWo(initialSelection);
              showNotification(`Ditemukan ${jobWithParts.estimateData!.partItems.length} item part dari estimasi SA.`, "success");
          } else {
              showNotification("No. WO atau No. Polisi tidak ditemukan di sistem.", "error");
          }
      } catch (e: any) {
          console.error("Search Error:", e);
          showNotification("Gagal mencari: " + e.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handleToggleWoPart = (idx: number, field: 'selected' | 'isIndent') => {
      setSelectedPartsFromWo(prev => {
          const current = prev[idx] || { selected: false, isIndent: false };
          return { ...prev, [idx]: { ...current, [field]: !current[field] } };
      });
  };

  const handleImportPartsToPO = () => {
      if (!foundJob || !foundJob.estimateData) return;

      const itemsToAdd: PurchaseOrderItem[] = [];
      const parts = foundJob.estimateData.partItems || [];
      
      parts.forEach((estItem, idx) => {
          const selection = selectedPartsFromWo[idx];
          if (selection && selection.selected) {
              const partCodeUpper = estItem.number?.toUpperCase().trim() || "";
              const invItem = inventoryItems.find(i => 
                  (estItem.inventoryId && i.id === estItem.inventoryId) || 
                  (partCodeUpper && i.code?.toUpperCase() === partCodeUpper)
              );

              itemsToAdd.push({
                  code: partCodeUpper || estItem.number || 'NON-PART-NO',
                  name: estItem.name || 'Nama Part Belum Diisi',
                  qty: estItem.qty || 1,
                  qtyReceived: 0,
                  unit: invItem?.unit || 'Pcs',
                  price: invItem?.buyPrice || 0,
                  total: (estItem.qty || 1) * (invItem?.buyPrice || 0),
                  inventoryId: estItem.inventoryId || invItem?.id || null,
                  refJobId: foundJob.id,
                  refWoNumber: foundJob.woNumber,
                  refPartIndex: idx,
                  isIndent: selection.isIndent
              });
          }
      });

      if (itemsToAdd.length === 0) {
          showNotification("Pilih minimal satu part.", "error");
          return;
      }

      setPoForm(prev => ({
          ...prev,
          items: [...(prev.items || []), ...itemsToAdd]
      }));
      
      if (!poForm.notes) {
          setPoForm(prev => ({ ...prev, notes: `PO WO: ${foundJob.woNumber || foundJob.policeNumber}` }));
      }

      showNotification(`${itemsToAdd.length} item berhasil masuk ke Draft PO.`, "success");
      setFoundJob(null);
      setWoSearchTerm('');
  };

  // --- HANDLERS FOR CREATE ---

  const handleAddItem = () => {
      setPoForm(prev => ({
          ...prev,
          items: [...(prev.items || []), { 
              code: '', name: '', qty: 1, price: 0, total: 0, unit: 'Pcs', inventoryId: null, qtyReceived: 0
          }]
      }));
  };

  const handleUpdateItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
      const newItems = [...(poForm.items || [])];
      if (field === 'code') {
          const codeUpper = String(value).toUpperCase().trim();
          const match = inventoryItems.find(i => i.code?.toUpperCase() === codeUpper);
          if (match) {
              newItems[index] = { ...newItems[index], inventoryId: match.id, name: match.name, unit: match.unit, price: match.buyPrice, code: match.code };
          } else {
             newItems[index] = { ...newItems[index], inventoryId: null, code: codeUpper };
          }
      } else {
          newItems[index] = { ...newItems[index], [field]: value };
      }
      newItems[index].total = (newItems[index].qty || 0) * (newItems[index].price || 0);
      setPoForm(prev => ({ ...prev, items: newItems }));
  };

  const handleRemoveItem = (index: number) => {
      const newItems = poForm.items?.filter((_, i) => i !== index);
      setPoForm(prev => ({ ...prev, items: newItems }));
  };

  const calculateFinancials = () => {
      const subtotal = poForm.items?.reduce((acc, item) => acc + item.total, 0) || 0;
      const ppnAmount = poForm.hasPpn ? subtotal * 0.11 : 0;
      const totalAmount = subtotal + ppnAmount;
      return { subtotal, ppnAmount, totalAmount };
  };

  const handleSubmitPO = async (status: 'Draft' | 'Pending Approval') => {
      if (!poForm.supplierId || !poForm.items || poForm.items.length === 0) {
          showNotification("Pilih supplier dan tambahkan item.", "error");
          return;
      }
      const supplier = suppliers.find(s => s.id === poForm.supplierId);
      if (!supplier) return;

      const date = new Date();
      const prefix = `PO-${date.getFullYear().toString().substr(-2)}${(date.getMonth()+1).toString().padStart(2,'0')}`;
      const random = Math.floor(1000 + Math.random() * 9000);
      const poNumber = `${prefix}-${random}`;
      const { subtotal, ppnAmount, totalAmount } = calculateFinancials();

      const sanitizedItems = (poForm.items || []).map(item => ({
          ...item,
          code: item.code.toUpperCase(),
          qtyReceived: 0
      }));

      const payload: any = {
          supplierId: poForm.supplierId,
          items: sanitizedItems,
          notes: poForm.notes || '',
          hasPpn: poForm.hasPpn || false,
          poNumber,
          supplierName: supplier.name,
          status,
          subtotal,
          ppnAmount,
          totalAmount,
          createdAt: serverTimestamp(),
          createdBy: userPermissions.role
      };

      setLoading(true);
      try {
          await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), cleanObject(payload));
          
          for (const item of sanitizedItems) {
              if (item.refJobId && item.refPartIndex !== null) {
                  const jobRef = doc(db, JOBS_COLLECTION, item.refJobId);
                  const jobSnap = await getDoc(jobRef);
                  if (jobSnap.exists()) {
                      const currentParts = jobSnap.data().estimateData?.partItems || [];
                      if (currentParts[item.refPartIndex!]) {
                          currentParts[item.refPartIndex!] = { ...currentParts[item.refPartIndex!], isOrdered: true, isIndent: item.isIndent };
                          await updateDoc(jobRef, { 'estimateData.partItems': currentParts });
                      }
                  }
              }
          }

          showNotification(`PO ${poNumber} Berhasil Diterbitkan!`, "success");
          setViewMode('list');
          setPoForm({ supplierId: '', items: [], notes: '', hasPpn: false });
          setPoCreationMode('manual');
      } catch (e: any) {
          showNotification("Gagal: " + e.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handleProcessReceiving = async () => {
      if (!selectedPO) return;
      if (selectedItemsToReceive.length === 0) { showNotification("Pilih item!", "error"); return; }
      
      const invalidQty = selectedItemsToReceive.some(idx => (receiveQtyMap[idx] || 0) <= 0);
      if (invalidQty) { showNotification("Qty harus > 0.", "error"); return; }

      setLoading(true);
      try {
          const updatedItems = [...selectedPO.items];
          const itemsReceivedForReport: {item: PurchaseOrderItem, qtyReceivedNow: number}[] = [];

          for (const idx of selectedItemsToReceive) {
              const item = updatedItems[idx];
              const qtyNow = receiveQtyMap[idx] || 0;
              const itemCodeUpper = item.code.toUpperCase().trim();
              
              let targetInventoryId = item.inventoryId;
              if (!targetInventoryId) {
                  const q = query(collection(db, SPAREPART_COLLECTION), where('code', '==', itemCodeUpper));
                  const snap = await getDocs(q);
                  if (!snap.empty) targetInventoryId = snap.docs[0].id;
              }

              if (targetInventoryId) {
                  await updateDoc(doc(db, SPAREPART_COLLECTION, targetInventoryId), { 
                      stock: increment(qtyNow), 
                      buyPrice: item.price, 
                      updatedAt: serverTimestamp() 
                  });
              } else {
                  const newItem = await addDoc(collection(db, SPAREPART_COLLECTION), {
                      code: itemCodeUpper, name: item.name, category: 'sparepart',
                      stock: qtyNow, unit: item.unit, minStock: 2, buyPrice: item.price,
                      sellPrice: Math.round(item.price * 1.3), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                  });
                  targetInventoryId = newItem.id;
              }

              updatedItems[idx] = { ...item, qtyReceived: (item.qtyReceived || 0) + qtyNow, inventoryId: targetInventoryId };
              itemsReceivedForReport.push({item: updatedItems[idx], qtyReceivedNow: qtyNow});
          }

          const isFull = updatedItems.every(i => (i.qtyReceived || 0) >= i.qty);
          await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), { 
              items: updatedItems, status: isFull ? 'Received' : 'Partial' 
          });

          generateReceivingReportPDF(selectedPO, itemsReceivedForReport, settings, userPermissions.role);
          showNotification("Barang diterima & Stok terupdate.", "success");
          onRefreshInventory();
          setViewMode('list');
          setSelectedPO(null);
      } catch (e: any) {
          showNotification("Error: " + e.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const getStatusBadge = (status: string) => {
      switch (status) {
          case 'Draft': return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold border">Draft</span>;
          case 'Pending Approval': return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold border">Pending Approval</span>;
          case 'Ordered': return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold border">Ordered</span>;
          case 'Partial': return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold border">Partial</span>;
          case 'Received': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold border">Received</span>;
          case 'Rejected': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold border">Rejected</span>;
          case 'Cancelled': return <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold border">Cancelled</span>;
          default: return null;
      }
  };

  if (viewMode === 'create') {
      const { subtotal, ppnAmount, totalAmount } = calculateFinancials();
      return (
          <div className="animate-fade-in bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-4 mb-6 border-b pb-4">
                  <button onClick={() => { setViewMode('list'); setPoForm({supplierId: '', items: [], hasPpn: false}); }} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
                  <h2 className="text-2xl font-bold text-gray-800">Buat Purchase Order Baru</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                      <label className="block text-sm font-bold mb-1">Supplier *</label>
                      <select className="w-full p-2 border rounded" value={poForm.supplierId} onChange={e => setPoForm({ ...poForm, supplierId: e.target.value })}>
                          <option value="">-- Pilih Supplier --</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-bold mb-1">Metode Input</label>
                      <div className="flex bg-gray-100 p-1 rounded-lg">
                          <button onClick={() => setPoCreationMode('manual')} className={`flex-1 py-2 rounded-md text-sm font-bold ${poCreationMode === 'manual' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}><Layers size={16} className="inline mr-1"/> General</button>
                          <button onClick={() => setPoCreationMode('wo')} className={`flex-1 py-2 rounded-md text-sm font-bold ${poCreationMode === 'wo' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}><Car size={16} className="inline mr-1"/> Dari WO</button>
                      </div>
                  </div>
              </div>

              {poCreationMode === 'wo' && (
                  <div className="mb-8 bg-blue-50 border border-blue-200 p-4 rounded-xl">
                      <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2"><Search size={18}/> Cari Kebutuhan Part dari Estimasi SA</h3>
                      <div className="flex gap-2 mb-4">
                          <input type="text" placeholder="Ketik No. WO atau Nopol..." className="flex-grow p-2 border border-blue-300 rounded uppercase font-mono" value={woSearchTerm} onChange={e => setWoSearchTerm(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchWO()}/>
                          <button onClick={handleSearchWO} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">{loading ? 'Mencari...' : 'Cari Data'}</button>
                      </div>
                      {foundJob && (
                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                              <div className="p-3 bg-gray-100 flex justify-between items-center border-b">
                                  <div className="flex items-center gap-2 font-bold text-gray-800"><span>{foundJob.woNumber || 'ESTIMASI'}</span> | <span>{foundJob.policeNumber} - {foundJob.carModel}</span></div>
                                  <button onClick={handleImportPartsToPO} className="bg-green-600 text-white px-4 py-2 rounded text-xs font-bold hover:bg-green-700 flex items-center gap-1"><Plus size={14}/> Tambah ke PO</button>
                              </div>
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-gray-50"><tr><th className="p-3 w-10 text-center">Pilih</th><th className="p-3">Item Part SA</th><th className="p-3 w-20 text-center">Qty</th><th className="p-3 text-center">Set Indent?</th></tr></thead>
                                  <tbody className="divide-y">
                                      {foundJob.estimateData?.partItems?.map((part, idx) => (
                                          <tr key={idx} className={part.isOrdered ? 'bg-gray-50 opacity-60' : 'hover:bg-blue-50'}>
                                              <td className="p-3 text-center">{!part.isOrdered && <input type="checkbox" checked={selectedPartsFromWo[idx]?.selected || false} onChange={() => handleToggleWoPart(idx, 'selected')} className="w-4 h-4 cursor-pointer"/>}</td>
                                              <td className="p-3"><div className="font-bold">{part.name}</div><div className="text-[10px] text-indigo-600 font-mono">{part.number || '-'}</div></td>
                                              <td className="p-3 text-center font-bold">{part.qty || 1}</td>
                                              <td className="p-3 text-center">{!part.isOrdered && selectedPartsFromWo[idx]?.selected && <label className="inline-flex items-center gap-1 cursor-pointer text-xs bg-white px-2 py-1 rounded border border-red-200"><input type="checkbox" checked={selectedPartsFromWo[idx]?.isIndent || false} onChange={() => handleToggleWoPart(idx, 'isIndent')} className="text-red-600 rounded"/><span className={selectedPartsFromWo[idx]?.isIndent ? 'text-red-600 font-bold' : 'text-gray-400'}>INDENT</span></label>}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      )}
                  </div>
              )}

              <div className="mb-6">
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><ShoppingCart size={18}/> Item Pesanan (Draft)</h3>
                  <table className="w-full text-sm text-left border border-gray-200 rounded overflow-hidden">
                      <thead className="bg-gray-100 font-bold"><tr><th className="p-3 border">Kode</th><th className="p-3 border">Nama Barang</th><th className="p-3 border w-24 text-center">Qty</th><th className="p-3 border text-right">Harga</th><th className="p-3 border text-right">Total</th><th className="p-3 border w-10"></th></tr></thead>
                      <tbody>
                          {(poForm.items || []).map((item, idx) => (
                              <tr key={idx} className={item.refJobId ? "bg-blue-50/50" : ""}>
                                  <td className="p-2 border"><input type="text" className="w-full p-2 border rounded font-mono uppercase text-xs" value={item.code} onChange={e => handleUpdateItem(idx, 'code', e.target.value)} placeholder="Kode..." disabled={!!item.refJobId}/></td>
                                  <td className="p-2 border"><input type="text" className="w-full p-2 border rounded text-xs" value={item.name} onChange={e => handleUpdateItem(idx, 'name', e.target.value)} placeholder="Nama..." disabled={!!item.refJobId}/>{item.refWoNumber && <div className="text-[9px] text-blue-600 font-bold">Ref: {item.refWoNumber} {item.isIndent && <span className="text-red-600">[INDENT]</span>}</div>}</td>
                                  <td className="p-2 border"><input type="number" className="w-full p-2 border rounded text-center font-bold" value={item.qty} onChange={e => handleUpdateItem(idx, 'qty', Number(e.target.value))} /></td>
                                  <td className="p-2 border"><input type="number" className="w-full p-2 border rounded text-right font-mono" value={item.price} onChange={e => handleUpdateItem(idx, 'price', Number(e.target.value))} /></td>
                                  <td className="p-2 border text-right font-bold">{formatCurrency(item.total)}</td>
                                  <td className="p-2 border text-center"><button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  {poCreationMode === 'manual' && <button onClick={handleAddItem} className="mt-2 text-xs text-indigo-600 font-bold hover:underline">+ Tambah Manual</button>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t bg-gray-50 p-6 rounded-xl">
                  <div><label className="block text-sm font-bold mb-1">Catatan</label><textarea className="w-full p-3 border rounded text-sm" rows={2} value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })}/></div>
                  <div className="flex flex-col items-end">
                      <div className="w-full max-w-xs space-y-1">
                          <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-bold">{formatCurrency(subtotal)}</span></div>
                          <div className="flex justify-between items-center text-sm"><label className="flex items-center gap-2 cursor-pointer"><div onClick={() => setPoForm(prev => ({...prev, hasPpn: !prev.hasPpn}))} className={`w-4 h-4 rounded border flex items-center justify-center ${poForm.hasPpn ? 'bg-indigo-600' : 'bg-white'}`}>{poForm.hasPpn && <CheckSquare size={12} className="text-white"/>}</div><span>PPN 11%</span></label><span>{formatCurrency(ppnAmount)}</span></div>
                          <div className="flex justify-between text-xl font-black text-indigo-900 border-t pt-2"><span>Total</span><span>{formatCurrency(totalAmount)}</span></div>
                      </div>
                      <div className="flex gap-3 mt-6 justify-end w-full">
                        <button onClick={() => handleSubmitPO('Draft')} disabled={loading} className="px-6 py-2 border rounded font-bold text-gray-600 hover:bg-gray-100">Simpan Draft</button>
                        <button onClick={() => handleSubmitPO('Pending Approval')} disabled={loading} className="px-8 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 shadow-lg">Ajukan Approval</button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (viewMode === 'detail' && selectedPO) {
      const isReceivable = selectedPO.status === 'Ordered' || selectedPO.status === 'Partial';
      const showApprovalActions = selectedPO.status === 'Pending Approval' && isManager;

      return (
          <div className="animate-fade-in bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                  <div className="flex items-center gap-4">
                      <button onClick={() => { setViewMode('list'); setSelectedPO(null); }} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
                      <div>
                          <h2 className="text-2xl font-bold text-gray-800">{selectedPO.poNumber}</h2>
                          <div className="flex items-center gap-2 text-sm mt-1">{getStatusBadge(selectedPO.status)}<span className="text-gray-500">Supplier: <strong>{selectedPO.supplierName}</strong></span></div>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      {/* APPROVAL BUTTONS */}
                      {showApprovalActions && (
                          <>
                            <button 
                                onClick={handleRejectPO} 
                                disabled={loading}
                                className="px-4 py-2 bg-red-100 text-red-700 rounded border border-red-200 font-bold hover:bg-red-200 transition-all flex items-center gap-1"
                            >
                                <Ban size={18}/> Tolak
                            </button>
                            <button 
                                onClick={handleApprovePO} 
                                disabled={loading}
                                className="px-4 py-2 bg-green-600 text-white rounded shadow font-bold hover:bg-green-700 transition-all flex items-center gap-1"
                            >
                                <Check size={18}/> Setujui (Approve)
                            </button>
                          </>
                      )}

                      {/* RECEIVING BUTTON */}
                      {isReceivable && selectedItemsToReceive.length > 0 && (
                        <button 
                            onClick={handleProcessReceiving} 
                            disabled={loading}
                            className="px-4 py-2 bg-indigo-600 text-white rounded shadow font-bold animate-pulse hover:bg-indigo-700"
                        >
                            Simpan Terima ({selectedItemsToReceive.length})
                        </button>
                      )}

                      {/* PRINT BUTTON - FIXED: Use internal handler */}
                      <button 
                        onClick={() => handlePrintPO(selectedPO)} 
                        className="px-4 py-2 border rounded flex items-center gap-2 font-bold border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                      >
                        <Printer size={18}/> Print PO
                      </button>
                  </div>
              </div>

              {/* REJECTION MESSAGE */}
              {selectedPO.status === 'Rejected' && selectedPO.rejectionReason && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-800 text-sm">
                      <AlertCircle size={20} className="shrink-0 mt-0.5"/>
                      <div>
                          <p className="font-bold">PO DITOLAK</p>
                          <p className="italic">Alasan: {selectedPO.rejectionReason}</p>
                      </div>
                  </div>
              )}

              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border">
                      <thead className="bg-gray-100 font-bold">
                          <tr>{isReceivable && <th className="p-3 border w-10"></th>}<th className="p-3 border">Item Barang</th><th className="p-3 border text-center">Order</th><th className="p-3 border text-center bg-green-50">Diterima</th>{isReceivable && <th className="p-3 border text-center bg-blue-50 w-24">Datang</th>}<th className="p-3 border text-right">Harga</th><th className="p-3 border text-right">Total</th></tr>
                      </thead>
                      <tbody>
                          {(selectedPO.items || []).map((item, idx) => {
                              const rem = item.qty - (item.qtyReceived || 0);
                              return (
                                  <tr key={idx} className={rem <= 0 ? 'opacity-50 bg-gray-50' : ''}>
                                      {isReceivable && <td className="p-3 border text-center">{rem > 0 && <input type="checkbox" checked={selectedItemsToReceive.includes(idx)} onChange={() => toggleItemSelection(idx)} className="w-4 h-4"/>}</td>}
                                      <td className="p-3 border"><div><strong>{item.name}</strong></div><div className="text-[10px] font-mono text-gray-500">{item.code} {item.refWoNumber && `[WO: ${item.refWoNumber}]`}</div></td>
                                      <td className="p-3 border text-center">{item.qty} {item.unit}</td>
                                      <td className="p-3 border text-center bg-green-50 font-bold">{item.qtyReceived || 0}</td>
                                      {isReceivable && <td className="p-3 border text-center bg-blue-50">{rem > 0 && selectedItemsToReceive.includes(idx) ? <input type="number" max={rem} className="w-full p-1 border rounded text-center font-bold" value={receiveQtyMap[idx]} onChange={e => setReceiveQtyMap({...receiveQtyMap, [idx]: Number(e.target.value)})}/> : '-'}</td>}
                                      <td className="p-3 border text-right font-mono">{formatCurrency(item.price)}</td>
                                      <td className="p-3 border text-right font-bold">{formatCurrency(item.total)}</td>
                                  </tr>
                              );
                          })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-bold">
                          <tr>
                              <td colSpan={isReceivable ? 6 : 4} className="p-3 text-right">SUBTOTAL</td>
                              <td className="p-3 text-right">{formatCurrency(selectedPO.subtotal)}</td>
                          </tr>
                          {selectedPO.hasPpn && (
                            <tr>
                                <td colSpan={isReceivable ? 6 : 4} className="p-3 text-right">PPN 11%</td>
                                <td className="p-3 text-right">{formatCurrency(selectedPO.ppnAmount)}</td>
                            </tr>
                          )}
                          <tr className="text-lg bg-indigo-50">
                              <td colSpan={isReceivable ? 6 : 4} className="p-3 text-right font-black text-indigo-900">GRAND TOTAL</td>
                              <td className="p-3 text-right font-black text-indigo-900">{formatCurrency(selectedPO.totalAmount)}</td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
              {selectedPO.notes && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs font-bold text-gray-500 uppercase">Catatan PO:</p>
                      <p className="text-sm text-gray-700">{selectedPO.notes}</p>
                  </div>
              )}
          </div>
      );
  }

  return (
    <div className="animate-fade-in space-y-6">
        <div className="flex justify-between items-center">
            <div><h1 className="text-3xl font-bold text-gray-900">Purchase Order (PO)</h1><p className="text-gray-500">Kelola pengadaan barang bengkel.</p></div>
            <button onClick={() => setViewMode('create')} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 shadow-lg flex items-center gap-2 font-bold"><Plus size={18}/> Buat PO Baru</button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
                <div className="relative w-full max-w-md"><Search className="absolute left-3 top-2.5 text-gray-400" size={18}/><input type="text" placeholder="Cari No. PO atau Supplier..." className="w-full pl-10 p-2.5 border rounded-lg" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            </div>
            {loading && orders.length === 0 ? <div className="p-20 text-center animate-pulse text-gray-500 font-bold">Memuat data...</div> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 font-bold"><tr><th className="px-6 py-4 text-xs uppercase text-gray-500">No. PO</th><th className="px-6 py-4 text-xs uppercase text-gray-500">Supplier</th><th className="px-6 py-4 text-xs uppercase text-gray-500">Status</th><th className="px-6 py-4 text-xs uppercase text-gray-500 text-right">Total</th><th className="px-6 py-4 text-xs uppercase text-gray-500 text-center">Aksi</th></tr></thead>
                        <tbody className="divide-y">
                            {orders.filter(o => o.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) || o.supplierName.toLowerCase().includes(searchTerm.toLowerCase())).map(order => {
                                const isDownloadable = ['Ordered', 'Partial', 'Received'].includes(order.status);
                                
                                return (
                                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-mono font-bold text-indigo-700">{order.poNumber}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">{order.supplierName}</td>
                                        <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                                        <td className="px-6 py-4 text-right font-black text-indigo-900">{formatCurrency(order.totalAmount)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button 
                                                    onClick={() => { setSelectedPO(order); setViewMode('detail'); }} 
                                                    className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 p-2 rounded-full transition-colors"
                                                    title="Lihat Detail"
                                                >
                                                    <Eye size={18}/>
                                                </button>
                                                {isDownloadable && (
                                                    <button 
                                                        onClick={() => handlePrintPO(order)} 
                                                        className="text-emerald-500 hover:text-emerald-700 bg-emerald-50 p-2 rounded-full transition-colors"
                                                        title="Cetak PDF"
                                                    >
                                                        <Printer size={18}/>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    </div>
  );
};

export default PurchaseOrderView;