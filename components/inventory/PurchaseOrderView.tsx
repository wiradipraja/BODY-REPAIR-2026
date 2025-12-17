import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, serverTimestamp, increment, query, orderBy, limit } from 'firebase/firestore';
import { db, PURCHASE_ORDERS_COLLECTION, SPAREPART_COLLECTION, SETTINGS_COLLECTION } from '../../services/firebase';
import { InventoryItem, Supplier, PurchaseOrder, PurchaseOrderItem, UserPermissions, Settings } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { generatePurchaseOrderPDF, generateReceivingReportPDF } from '../../utils/pdfGenerator';
import { ShoppingCart, Plus, Search, Eye, Download, CheckCircle, XCircle, ArrowLeft, Trash2, Package, AlertCircle, CheckSquare, Square, Printer, Save } from 'lucide-react';
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

  // Form State
  const [poForm, setPoForm] = useState<Partial<PurchaseOrder>>({
      supplierId: '',
      items: [],
      notes: '',
      hasPpn: false // Default no PPN
  });
  const [searchTerm, setSearchTerm] = useState('');

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

  // Fetch Orders
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
          let msg = "Gagal memuat data PO.";
          if (e.code === 'permission-denied') {
              msg = "Akses Ditolak: Database belum mengizinkan akses ke 'Purchase Orders'. Mohon update Rules di Firebase Console.";
          }
          setError(msg);
          showNotification(msg, "error");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (viewMode === 'list') fetchOrders();
  }, [viewMode]);

  // Reset Receiving state when opening a PO
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

  // --- HANDLERS FOR CREATE ---

  const handleAddItem = () => {
      setPoForm(prev => ({
          ...prev,
          items: [...(prev.items || []), { 
              code: '', 
              name: '', 
              qty: 1, 
              price: 0, 
              total: 0, 
              unit: 'Pcs',
              inventoryId: null,
              qtyReceived: 0
          }]
      }));
  };

  const handleUpdateItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
      const newItems = [...(poForm.items || [])];
      
      // Auto-fill logic from inventory ONLY when typing code
      if (field === 'code') {
          // If user selects/types code, try to find in inventory
          const match = inventoryItems.find(i => 
              i.code.toLowerCase() === String(value).toLowerCase()
          );
          
          if (match) {
              newItems[index].inventoryId = match.id;
              newItems[index].name = match.name;
              newItems[index].unit = match.unit;
              newItems[index].price = match.buyPrice; // Default to current buy price
          } else {
             newItems[index].inventoryId = null;
          }
      }

      newItems[index] = { ...newItems[index], [field]: value };
      
      // Recalc Total Row
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

  const handleSubmitPO = async (status: 'Draft' | 'Ordered') => {
      if (!poForm.supplierId || !poForm.items || poForm.items.length === 0) {
          showNotification("Mohon pilih supplier dan tambahkan item.", "error");
          return;
      }

      const supplier = suppliers.find(s => s.id === poForm.supplierId);
      if (!supplier) return;

      const date = new Date();
      const prefix = `PO-${date.getFullYear().toString().substr(-2)}${(date.getMonth()+1).toString().padStart(2,'0')}`;
      const random = Math.floor(1000 + Math.random() * 9000);
      const poNumber = `${prefix}-${random}`;

      const { subtotal, ppnAmount, totalAmount } = calculateFinancials();

      const sanitizedItems = poForm.items.map(item => ({
          code: item.code || '',
          name: item.name || '',
          qty: item.qty || 0,
          qtyReceived: 0, // Init 0
          unit: item.unit || 'Pcs',
          price: item.price || 0,
          total: item.total || 0,
          inventoryId: item.inventoryId || null 
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

      try {
          await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), payload);
          showNotification(`PO ${poNumber} berhasil dibuat (${status})`, "success");
          setViewMode('list');
          setPoForm({ supplierId: '', items: [], notes: '', hasPpn: false });
      } catch (e: any) {
          console.error(e);
          let msg = "Gagal membuat PO";
          if (e.code === 'permission-denied') msg = "Gagal: Izin akses ditolak database.";
          else if (e.message.includes("invalid data")) msg = "Gagal: Data tidak valid (Field undefined).";
          showNotification(msg, "error");
      }
  };

  // --- HANDLERS FOR DETAIL / RECEIVE ---

  const handlePrintPO = () => {
      if (!selectedPO) return;
      generatePurchaseOrderPDF(selectedPO, settings);
  };

  const toggleItemSelection = (index: number) => {
      if (selectedItemsToReceive.includes(index)) {
          setSelectedItemsToReceive(prev => prev.filter(i => i !== index));
      } else {
          setSelectedItemsToReceive(prev => [...prev, index]);
      }
  };

  const handleProcessReceiving = async () => {
      if (!selectedPO) return;
      if (selectedItemsToReceive.length === 0) {
          showNotification("Pilih minimal satu item untuk diterima.", "error");
          return;
      }

      const invalidQty = selectedItemsToReceive.some(idx => {
          const qtyNow = receiveQtyMap[idx] || 0;
          return qtyNow <= 0;
      });

      if (invalidQty) {
          showNotification("Jumlah barang yang diterima harus lebih dari 0.", "error");
          return;
      }

      if (!window.confirm("Simpan Penerimaan Barang?\n\n- Stok Inventory akan bertambah otomatis.\n- Bukti Serah Terima akan didownload.")) return;

      try {
          const updatedItems = [...selectedPO.items];
          let allItemsFullyReceived = true;
          
          // Helper to track items for PDF report
          const itemsReceivedForReport: {item: PurchaseOrderItem, qtyReceivedNow: number}[] = [];

          const updatePromises = selectedItemsToReceive.map(async (idx) => {
              const item = updatedItems[idx];
              const qtyNow = receiveQtyMap[idx] || 0;
              
              // 1. Update Inventory
              let targetInventoryId = item.inventoryId;

              if (targetInventoryId) {
                  // Existing Item -> Update Stock & Price
                  const itemRef = doc(db, SPAREPART_COLLECTION, targetInventoryId);
                  await updateDoc(itemRef, {
                      stock: increment(qtyNow),
                      buyPrice: item.price, 
                      updatedAt: serverTimestamp()
                  });
              } else {
                  // New Item -> Create in Master
                  const isMaterial = ['Liter', 'Kaleng', 'Kg', 'Gram', 'Galon'].includes(item.unit);
                  const newItemPayload: any = {
                      code: item.code || `NEW-${Date.now()}-${idx}`,
                      name: item.name,
                      category: isMaterial ? 'material' : 'sparepart',
                      brand: 'Generic',
                      stock: qtyNow,
                      unit: item.unit,
                      minStock: 5,
                      buyPrice: item.price,
                      sellPrice: item.price * 1.25,
                      location: 'Gudang',
                      supplierId: selectedPO.supplierId,
                      isStockManaged: true,
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp()
                  };
                  
                  const docRef = await addDoc(collection(db, SPAREPART_COLLECTION), newItemPayload);
                  targetInventoryId = docRef.id; // SAVE NEW ID
              }

              // 2. Update Local PO Item State
              updatedItems[idx] = {
                  ...item,
                  qtyReceived: (item.qtyReceived || 0) + qtyNow,
                  inventoryId: targetInventoryId // Ensure future partial receives map to this ID
              };
              
              itemsReceivedForReport.push({item: updatedItems[idx], qtyReceivedNow: qtyNow});
          });

          await Promise.all(updatePromises);

          // 3. Determine New Status
          const isFull = updatedItems.every(i => (i.qtyReceived || 0) >= i.qty);
          const newStatus = isFull ? 'Received' : 'Partial';

          // 4. Update PO Doc
          const updatePayload: any = {
              items: updatedItems,
              status: newStatus,
          };
          if (newStatus === 'Received') {
              updatePayload.receivedAt = serverTimestamp();
              updatePayload.receivedBy = userPermissions.role;
          }

          await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), updatePayload);

          // 5. Generate Receiving Report PDF (Only for items received NOW)
          generateReceivingReportPDF(selectedPO, itemsReceivedForReport, settings, userPermissions.role);

          showNotification("Barang berhasil diterima & stok terupdate.", "success");
          onRefreshInventory();
          setViewMode('list');
          setSelectedPO(null);

      } catch (e: any) {
          console.error(e);
          showNotification("Gagal memproses penerimaan: " + e.message, "error");
      }
  };

  const handleDeletePO = async (po: PurchaseOrder) => {
      if (!window.confirm("Hapus PO ini?")) return;
      try {
          if (po.status === 'Received' || po.status === 'Partial') {
              showNotification("Tidak bisa menghapus PO yang sudah ada penerimaan.", "error");
              return;
          }
           await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, po.id), {
              status: 'Cancelled'
          });
          showNotification("PO Dibatalkan", "success");
          fetchOrders();
      } catch (e: any) {
          let msg = "Gagal membatalkan PO";
          showNotification(msg, "error");
      }
  };

  // --- RENDER HELPERS ---
  
  const getStatusBadge = (status: string) => {
      switch (status) {
          case 'Draft': return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold">Draft</span>;
          case 'Ordered': return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Ordered</span>;
          case 'Partial': return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">Partial (Sebagian)</span>;
          case 'Received': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Received (Lengkap)</span>;
          case 'Cancelled': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Cancelled</span>;
          default: return null;
      }
  };

  // --- VIEWS ---

  if (viewMode === 'create') {
      const { subtotal, ppnAmount, totalAmount } = calculateFinancials();

      return (
          <div className="animate-fade-in bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-4 mb-6 border-b pb-4">
                  <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
                  <h2 className="text-2xl font-bold text-gray-800">Buat Purchase Order Baru</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
                      <select 
                          className="w-full p-2 border rounded"
                          value={poForm.supplierId}
                          onChange={e => setPoForm({ ...poForm, supplierId: e.target.value })}
                      >
                          <option value="">-- Pilih Supplier --</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.category})</option>)}
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                      <input 
                          type="text" 
                          className="w-full p-2 border rounded"
                          placeholder="No. Referensi / Instruksi..."
                          value={poForm.notes}
                          onChange={e => setPoForm({ ...poForm, notes: e.target.value })}
                      />
                  </div>
              </div>

              <div className="mb-6">
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><Package size={18}/> Detail Barang Pesanan</h3>
                  <table className="w-full text-sm text-left border-collapse border border-gray-200">
                      <thead className="bg-gray-50 text-gray-600">
                          <tr>
                              <th className="p-2 border w-40">Kode Part/Bahan</th>
                              <th className="p-2 border">Nama Part/Bahan</th>
                              <th className="p-2 border w-24 text-center">Qty</th>
                              <th className="p-2 border w-32">Satuan</th>
                              <th className="p-2 border w-36 text-right">Harga Satuan</th>
                              <th className="p-2 border w-36 text-right">Total</th>
                              <th className="p-2 border w-10"></th>
                          </tr>
                      </thead>
                      <tbody>
                          {poForm.items?.map((item, idx) => (
                              <tr key={idx} className={item.inventoryId ? "" : "bg-orange-50"}>
                                  <td className="p-2 border relative">
                                      <input 
                                          type="text" 
                                          list="inv-list"
                                          className="w-full p-1 border rounded focus:ring-1 ring-indigo-500 font-mono"
                                          value={item.code}
                                          onChange={e => handleUpdateItem(idx, 'code', e.target.value)}
                                          placeholder="Ketik kode..."
                                      />
                                      {!item.inventoryId && item.code && (
                                          <span className="text-[10px] text-orange-600 absolute right-2 top-2 font-bold bg-white px-1 rounded shadow-sm border border-orange-200">NEW</span>
                                      )}
                                  </td>
                                  <td className="p-2 border">
                                      <input 
                                        type="text" 
                                        className="w-full p-1 border rounded focus:ring-1 ring-indigo-500" 
                                        value={item.name} 
                                        onChange={e => handleUpdateItem(idx, 'name', e.target.value)}
                                        placeholder="Nama barang..." 
                                      />
                                  </td>
                                  <td className="p-2 border">
                                      <input type="number" className="w-full p-1 border rounded text-center font-bold" value={item.qty} onChange={e => handleUpdateItem(idx, 'qty', Number(e.target.value))} />
                                  </td>
                                  <td className="p-2 border">
                                      <select 
                                        className="w-full p-1 border rounded bg-white"
                                        value={item.unit}
                                        onChange={e => handleUpdateItem(idx, 'unit', e.target.value)}
                                      >
                                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                                      </select>
                                  </td>
                                  <td className="p-2 border">
                                      <input type="number" className="w-full p-1 border rounded text-right" value={item.price} onChange={e => handleUpdateItem(idx, 'price', Number(e.target.value))} />
                                  </td>
                                  <td className="p-2 border text-right font-bold text-gray-700">
                                      {formatCurrency(item.total)}
                                  </td>
                                  <td className="p-2 border text-center">
                                      <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  <div className="flex justify-between items-start mt-2">
                    <button onClick={handleAddItem} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                        <Plus size={16}/> Tambah Baris
                    </button>
                    <div className="text-xs text-gray-500 italic max-w-md text-right">
                        * Item dengan kode yang belum terdaftar di sistem akan ditandai sebagai <span className="text-orange-600 font-bold">NEW</span> dan akan otomatis dibuatkan Master Stock baru saat barang diterima.
                    </div>
                  </div>
                  
                  <datalist id="inv-list">
                      {inventoryItems.map(i => <option key={i.id} value={i.code}>{i.name} (Stok: {i.stock})</option>)}
                  </datalist>
              </div>

              {/* FINANCIAL SUMMARY */}
              <div className="flex flex-col items-end gap-2 pt-4 border-t bg-gray-50 p-4 rounded-lg">
                  <div className="w-full max-w-xs space-y-2">
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Subtotal</span>
                          <span className="font-medium">{formatCurrency(subtotal)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center text-sm">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                              <div 
                                onClick={() => setPoForm(prev => ({...prev, hasPpn: !prev.hasPpn}))}
                                className={`w-4 h-4 rounded border flex items-center justify-center ${poForm.hasPpn ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-400'}`}
                              >
                                  {poForm.hasPpn && <CheckSquare size={12} className="text-white"/>}
                              </div>
                              <span className="text-gray-700">Kenakan PPN (11%)</span>
                          </label>
                          <span className="font-medium">{formatCurrency(ppnAmount)}</span>
                      </div>
                      
                      <div className="flex justify-between text-lg font-bold text-indigo-900 border-t border-gray-300 pt-2 mt-2">
                          <span>Grand Total</span>
                          <span>{formatCurrency(totalAmount)}</span>
                      </div>
                  </div>
                  
                  <div className="flex gap-3 mt-4 w-full justify-end">
                    <button onClick={() => handleSubmitPO('Draft')} className="px-6 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100 font-medium">Simpan Draft</button>
                    <button onClick={() => handleSubmitPO('Ordered')} className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold flex items-center gap-2 shadow-lg">
                        <ShoppingCart size={18}/> Buat Order
                    </button>
                  </div>
              </div>
          </div>
      );
  }

  if (viewMode === 'detail' && selectedPO) {
      const isReceivable = selectedPO.status === 'Ordered' || selectedPO.status === 'Partial';

      return (
          <div className="animate-fade-in bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                  <div className="flex items-center gap-4">
                      <button onClick={() => { setViewMode('list'); setSelectedPO(null); }} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
                      <div>
                          <h2 className="text-2xl font-bold text-gray-800">{selectedPO.poNumber}</h2>
                          <div className="flex items-center gap-2 mt-1">
                              {getStatusBadge(selectedPO.status)}
                              <span className="text-sm text-gray-500">Supplier: <strong>{selectedPO.supplierName}</strong></span>
                              <span className="text-sm text-gray-400">|</span>
                              <span className="text-sm text-gray-500">Tgl: {formatDateIndo(selectedPO.createdAt)}</span>
                          </div>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      {isReceivable && selectedItemsToReceive.length > 0 && (
                          <button 
                              onClick={handleProcessReceiving}
                              className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 flex items-center gap-2 font-bold animate-pulse"
                          >
                              <Save size={18}/> Simpan Terima Barang ({selectedItemsToReceive.length})
                          </button>
                      )}
                      
                      <button 
                          onClick={handlePrintPO}
                          className="px-4 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100 flex items-center gap-2 font-medium"
                      >
                          <Printer size={18}/> Print PO
                      </button>
                  </div>
              </div>

              {/* Status Banner */}
              {isReceivable && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-sm text-blue-800">
                      <AlertCircle size={20} className="mt-0.5 shrink-0"/>
                      <div>
                          <p className="font-bold">Penerimaan Barang (Receiving)</p>
                          <p>Centang item yang sudah datang, masukkan jumlah yang diterima, lalu klik tombol <strong>Simpan Terima Barang</strong> di atas.</p>
                      </div>
                  </div>
              )}

              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse border border-gray-200">
                      <thead className="bg-gray-100 text-gray-700 uppercase">
                          <tr>
                              {isReceivable && <th className="p-3 border w-10 text-center">✔</th>}
                              <th className="p-3 border">Kode & Nama Barang</th>
                              <th className="p-3 border text-center">Satuan</th>
                              <th className="p-3 border text-center">Qty Order</th>
                              <th className="p-3 border text-center bg-green-50 text-green-800">Sdh Terima</th>
                              {isReceivable && <th className="p-3 border text-center bg-blue-50 text-blue-800 w-32">Qty Datang</th>}
                              <th className="p-3 border text-right">Harga</th>
                              <th className="p-3 border text-right">Total</th>
                          </tr>
                      </thead>
                      <tbody>
                          {selectedPO.items.map((item, idx) => {
                              const remaining = item.qty - (item.qtyReceived || 0);
                              const isFullyReceived = remaining <= 0;
                              const isChecked = selectedItemsToReceive.includes(idx);

                              return (
                                  <tr key={idx} className={`hover:bg-gray-50 ${isFullyReceived ? 'bg-gray-50 text-gray-400' : ''}`}>
                                      {isReceivable && (
                                          <td className="p-3 border text-center">
                                              {!isFullyReceived && (
                                                  <input 
                                                      type="checkbox" 
                                                      className="w-5 h-5 cursor-pointer text-indigo-600 rounded"
                                                      checked={isChecked}
                                                      onChange={() => toggleItemSelection(idx)}
                                                  />
                                              )}
                                              {isFullyReceived && <CheckCircle size={16} className="text-green-500 mx-auto"/>}
                                          </td>
                                      )}
                                      <td className="p-3 border">
                                          <div className="font-bold">{item.name}</div>
                                          <div className="font-mono text-xs">{item.code}</div>
                                      </td>
                                      <td className="p-3 border text-center">{item.unit}</td>
                                      <td className="p-3 border text-center font-bold">{item.qty}</td>
                                      <td className="p-3 border text-center bg-green-50 font-medium text-green-700">{item.qtyReceived || 0}</td>
                                      
                                      {/* INPUT QTY RECEIVE */}
                                      {isReceivable && (
                                          <td className="p-3 border text-center bg-blue-50">
                                              {!isFullyReceived && isChecked ? (
                                                  <input 
                                                      type="number" 
                                                      min="1" 
                                                      max={remaining}
                                                      className="w-full p-1 border border-blue-300 rounded text-center font-bold text-blue-800"
                                                      value={receiveQtyMap[idx]}
                                                      onChange={(e) => {
                                                          const val = Number(e.target.value);
                                                          if (val <= remaining) {
                                                              setReceiveQtyMap(prev => ({...prev, [idx]: val}));
                                                          }
                                                      }}
                                                  />
                                              ) : (
                                                  <span className="text-gray-400">-</span>
                                              )}
                                          </td>
                                      )}

                                      <td className="p-3 border text-right">{formatCurrency(item.price)}</td>
                                      <td className="p-3 border text-right font-bold">{formatCurrency(item.total)}</td>
                                  </tr>
                              );
                          })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-bold">
                          <tr>
                              <td colSpan={isReceivable ? 6 : 4} className="p-3 text-right text-gray-600">Subtotal</td>
                              <td className="p-3 text-right text-gray-800">{formatCurrency(selectedPO.subtotal || selectedPO.totalAmount)}</td>
                          </tr>
                          {selectedPO.hasPpn && (
                             <tr>
                                <td colSpan={isReceivable ? 6 : 4} className="p-3 text-right text-gray-600">PPN (11%)</td>
                                <td className="p-3 text-right text-gray-800">{formatCurrency(selectedPO.ppnAmount)}</td>
                             </tr>
                          )}
                          <tr className="bg-gray-100 border-t-2 border-gray-300 text-lg">
                              <td colSpan={isReceivable ? 6 : 4} className="p-3 text-right text-indigo-900">GRAND TOTAL</td>
                              <td className="p-3 text-right text-indigo-900">{formatCurrency(selectedPO.totalAmount)}</td>
                          </tr>
                      </tfoot>
                  </table>
              </div>

              {selectedPO.notes && (
                  <div className="mt-4 p-4 bg-yellow-50 rounded border border-yellow-100">
                      <p className="text-sm text-gray-600 font-bold">Catatan:</p>
                      <p className="text-sm text-gray-700">{selectedPO.notes}</p>
                  </div>
              )}
          </div>
      );
  }

  // --- LIST VIEW ---
  return (
    <div className="animate-fade-in space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Purchase Order (PO)</h1>
                <p className="text-gray-500 mt-1">Kelola pembelian barang ke supplier.</p>
            </div>
            <button 
                onClick={() => setViewMode('create')}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg flex items-center gap-2 font-semibold"
            >
                <Plus size={18}/> Buat PO Baru
            </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Cari No. PO atau Supplier..." 
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 m-4 rounded-lg shadow-sm flex items-start gap-3">
                    <div className="mt-1"><AlertCircle size={20}/></div>
                    <div>
                        <p className="font-bold">Koneksi Database Bermasalah</p>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="p-12 text-center text-gray-500">Memuat data...</div>
            ) : orders.length === 0 && !error ? (
                <div className="p-12 text-center text-gray-400">Belum ada Purchase Order.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-600 uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-3">No. PO</th>
                                <th className="px-6 py-3">Tanggal</th>
                                <th className="px-6 py-3">Supplier</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Total</th>
                                <th className="px-6 py-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders
                                .filter(o => 
                                    o.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                    o.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                                .map(order => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-mono font-bold text-indigo-700">{order.poNumber}</td>
                                    <td className="px-6 py-4 text-gray-600">{formatDateIndo(order.createdAt)}</td>
                                    <td className="px-6 py-4 font-medium">{order.supplierName}</td>
                                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                                    <td className="px-6 py-4 text-right font-bold">{formatCurrency(order.totalAmount)}</td>
                                    <td className="px-6 py-4 text-center flex justify-center gap-2">
                                        <button 
                                            onClick={() => { setSelectedPO(order); setViewMode('detail'); }}
                                            className="text-indigo-500 hover:text-indigo-700"
                                            title="Lihat Detail"
                                        >
                                            <Eye size={18}/>
                                        </button>
                                        {order.status !== 'Received' && order.status !== 'Cancelled' && order.status !== 'Partial' && (
                                            <button 
                                                onClick={() => handleDeletePO(order)}
                                                className="text-red-400 hover:text-red-600"
                                                title="Batalkan PO"
                                            >
                                                <XCircle size={18}/>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    </div>
  );
};

export default PurchaseOrderView;