import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, serverTimestamp, increment, query, orderBy, limit } from 'firebase/firestore';
import { db, PURCHASE_ORDERS_COLLECTION, SPAREPART_COLLECTION } from '../../services/firebase';
import { InventoryItem, Supplier, PurchaseOrder, PurchaseOrderItem, UserPermissions } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { ShoppingCart, Plus, Search, Eye, Download, CheckCircle, XCircle, ArrowLeft, Save, Trash2, Package } from 'lucide-react';

interface PurchaseOrderViewProps {
  suppliers: Supplier[];
  inventoryItems: InventoryItem[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
  onRefreshInventory: () => void;
}

const PurchaseOrderView: React.FC<PurchaseOrderViewProps> = ({ 
  suppliers, inventoryItems, userPermissions, showNotification, onRefreshInventory
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail'>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  // Form State
  const [poForm, setPoForm] = useState<Partial<PurchaseOrder>>({
      supplierId: '',
      items: [],
      notes: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch Orders
  const fetchOrders = async () => {
      setLoading(true);
      try {
          const q = query(collection(db, PURCHASE_ORDERS_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder));
          setOrders(data);
      } catch (e) {
          console.error(e);
          showNotification("Gagal memuat data PO", "error");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (viewMode === 'list') fetchOrders();
  }, [viewMode]);

  // --- HANDLERS FOR CREATE ---

  const handleAddItem = () => {
      setPoForm(prev => ({
          ...prev,
          items: [...(prev.items || []), { code: '', name: '', qty: 1, price: 0, total: 0, unit: 'Pcs' }]
      }));
  };

  const handleUpdateItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
      const newItems = [...(poForm.items || [])];
      
      // Auto-fill logic from inventory
      if (field === 'code' || field === 'name') {
          // If user selects/types code, try to find in inventory
          const match = inventoryItems.find(i => 
              i.code.toLowerCase() === String(value).toLowerCase() || 
              i.name.toLowerCase() === String(value).toLowerCase()
          );
          
          if (match && field === 'code') {
              newItems[index].inventoryId = match.id;
              newItems[index].name = match.name;
              newItems[index].unit = match.unit;
              newItems[index].price = match.buyPrice; // Default to current buy price
          }
      }

      newItems[index] = { ...newItems[index], [field]: value };
      
      // Recalc Total
      newItems[index].total = (newItems[index].qty || 0) * (newItems[index].price || 0);
      
      setPoForm(prev => ({ ...prev, items: newItems }));
  };

  const handleRemoveItem = (index: number) => {
      const newItems = poForm.items?.filter((_, i) => i !== index);
      setPoForm(prev => ({ ...prev, items: newItems }));
  };

  const calculateTotal = () => {
      return poForm.items?.reduce((acc, item) => acc + item.total, 0) || 0;
  };

  const handleSubmitPO = async (status: 'Draft' | 'Ordered') => {
      if (!poForm.supplierId || !poForm.items || poForm.items.length === 0) {
          showNotification("Mohon pilih supplier dan tambahkan item.", "error");
          return;
      }

      const supplier = suppliers.find(s => s.id === poForm.supplierId);
      if (!supplier) return;

      // Generate PO Number (Simple Logic: PO-YYMM-RANDOM4)
      const date = new Date();
      const prefix = `PO-${date.getFullYear().toString().substr(-2)}${(date.getMonth()+1).toString().padStart(2,'0')}`;
      const random = Math.floor(1000 + Math.random() * 9000);
      const poNumber = `${prefix}-${random}`;

      const payload: any = {
          ...poForm,
          poNumber,
          supplierName: supplier.name,
          status,
          totalAmount: calculateTotal(),
          createdAt: serverTimestamp(),
          createdBy: userPermissions.role
      };

      try {
          await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), payload);
          showNotification(`PO ${poNumber} berhasil dibuat (${status})`, "success");
          setViewMode('list');
          setPoForm({ supplierId: '', items: [], notes: '' });
      } catch (e) {
          console.error(e);
          showNotification("Gagal membuat PO", "error");
      }
  };

  // --- HANDLERS FOR DETAIL / RECEIVE ---

  const handleReceivePO = async () => {
      if (!selectedPO) return;
      if (!window.confirm("Konfirmasi penerimaan barang? \nStok inventory akan bertambah dan harga modal akan diperbarui.")) return;

      try {
          // 1. Update Inventory Stock & Price
          const promises = selectedPO.items.map(async (item) => {
              if (item.inventoryId) {
                  // Update Stock & Last Buy Price
                  await updateDoc(doc(db, SPAREPART_COLLECTION, item.inventoryId), {
                      stock: increment(item.qty),
                      buyPrice: item.price, // Update master price to latest PO price
                      updatedAt: serverTimestamp()
                  });
              } else {
                  // If item doesn't exist in master, ideally we should create it or ignore.
                  // For now, we ignore but log it. In a real app, we might prompt to create.
                  console.warn(`Item ${item.name} not linked to inventory master. Stock not updated.`);
              }
          });

          await Promise.all(promises);

          // 2. Update PO Status
          await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, selectedPO.id), {
              status: 'Received',
              receivedAt: serverTimestamp(),
              receivedBy: userPermissions.role
          });

          showNotification("Barang diterima & Stok diperbarui.", "success");
          onRefreshInventory(); // Refresh master inventory in App
          setViewMode('list');
          setSelectedPO(null);

      } catch (e) {
          console.error(e);
          showNotification("Gagal memproses penerimaan barang.", "error");
      }
  };

  const handleDeletePO = async (po: PurchaseOrder) => {
      if (!window.confirm("Hapus PO ini?")) return;
      try {
          // Soft delete or hard delete? Firestore hard delete here.
          // Note: Only allow delete if not Received to avoid stock inconsistency
          if (po.status === 'Received') {
              showNotification("Tidak bisa menghapus PO yang sudah diterima.", "error");
              return;
          }
          // We actually need deleteDoc from firestore, imported above
          // Assuming we import deleteDoc
          // await deleteDoc(doc(db, PURCHASE_ORDERS_COLLECTION, po.id)); 
          // For safety, let's just Cancel it
           await updateDoc(doc(db, PURCHASE_ORDERS_COLLECTION, po.id), {
              status: 'Cancelled'
          });
          showNotification("PO Dibatalkan", "success");
          fetchOrders();
      } catch (e) {
          showNotification("Gagal menghapus", "error");
      }
  };

  // --- RENDER HELPERS ---
  
  const getStatusBadge = (status: string) => {
      switch (status) {
          case 'Draft': return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold">Draft</span>;
          case 'Ordered': return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Ordered</span>;
          case 'Received': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Received</span>;
          case 'Cancelled': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Cancelled</span>;
          default: return null;
      }
  };

  // --- VIEWS ---

  if (viewMode === 'create') {
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
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><Package size={18}/> Daftar Barang</h3>
                  <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-gray-50 text-gray-600">
                          <tr>
                              <th className="p-2 border">Kode / Nama (Cari Inventory)</th>
                              <th className="p-2 border w-20 text-center">Qty</th>
                              <th className="p-2 border w-24">Satuan</th>
                              <th className="p-2 border w-32 text-right">Harga Satuan</th>
                              <th className="p-2 border w-32 text-right">Total</th>
                              <th className="p-2 border w-10"></th>
                          </tr>
                      </thead>
                      <tbody>
                          {poForm.items?.map((item, idx) => (
                              <tr key={idx}>
                                  <td className="p-2 border">
                                      <input 
                                          type="text" 
                                          list="inv-list"
                                          className="w-full p-1 border rounded"
                                          value={item.code || item.name}
                                          onChange={e => handleUpdateItem(idx, 'code', e.target.value)}
                                          placeholder="Ketik kode atau nama..."
                                      />
                                  </td>
                                  <td className="p-2 border">
                                      <input type="number" className="w-full p-1 border rounded text-center" value={item.qty} onChange={e => handleUpdateItem(idx, 'qty', Number(e.target.value))} />
                                  </td>
                                  <td className="p-2 border">
                                      <input type="text" className="w-full p-1 border rounded" value={item.unit} onChange={e => handleUpdateItem(idx, 'unit', e.target.value)} />
                                  </td>
                                  <td className="p-2 border">
                                      <input type="number" className="w-full p-1 border rounded text-right" value={item.price} onChange={e => handleUpdateItem(idx, 'price', Number(e.target.value))} />
                                  </td>
                                  <td className="p-2 border text-right font-bold">
                                      {formatCurrency(item.total)}
                                  </td>
                                  <td className="p-2 border text-center">
                                      <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  <button onClick={handleAddItem} className="mt-2 text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                      <Plus size={16}/> Tambah Baris
                  </button>
                  
                  <datalist id="inv-list">
                      {inventoryItems.map(i => <option key={i.id} value={i.code}>{i.name} (Stok: {i.stock})</option>)}
                  </datalist>
              </div>

              <div className="flex justify-end items-center gap-4 pt-4 border-t">
                  <div className="text-right mr-4">
                      <p className="text-sm text-gray-500">Grand Total</p>
                      <p className="text-2xl font-bold text-indigo-900">{formatCurrency(calculateTotal())}</p>
                  </div>
                  <button onClick={() => handleSubmitPO('Draft')} className="px-6 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">Simpan Draft</button>
                  <button onClick={() => handleSubmitPO('Ordered')} className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold flex items-center gap-2">
                      <ShoppingCart size={18}/> Buat Order
                  </button>
              </div>
          </div>
      );
  }

  if (viewMode === 'detail' && selectedPO) {
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
                      {/* Action Buttons */}
                      {selectedPO.status === 'Ordered' && (
                          <button 
                              onClick={handleReceivePO}
                              className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 flex items-center gap-2 font-bold"
                          >
                              <CheckCircle size={18}/> Terima Barang (Masuk Gudang)
                          </button>
                      )}
                      <button className="px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                          <Download size={18}/> Print
                      </button>
                  </div>
              </div>

              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse border border-gray-200">
                      <thead className="bg-gray-100 text-gray-700 uppercase">
                          <tr>
                              <th className="p-3 border">Kode</th>
                              <th className="p-3 border">Nama Barang</th>
                              <th className="p-3 border text-center">Qty</th>
                              <th className="p-3 border text-center">Satuan</th>
                              <th className="p-3 border text-right">Harga</th>
                              <th className="p-3 border text-right">Total</th>
                          </tr>
                      </thead>
                      <tbody>
                          {selectedPO.items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                  <td className="p-3 border font-mono">{item.code}</td>
                                  <td className="p-3 border">{item.name}</td>
                                  <td className="p-3 border text-center font-bold">{item.qty}</td>
                                  <td className="p-3 border text-center text-gray-500">{item.unit}</td>
                                  <td className="p-3 border text-right">{formatCurrency(item.price)}</td>
                                  <td className="p-3 border text-right font-bold text-gray-800">{formatCurrency(item.total)}</td>
                              </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-bold">
                          <tr>
                              <td colSpan={5} className="p-3 text-right text-gray-600">TOTAL</td>
                              <td className="p-3 text-right text-indigo-800 text-lg">{formatCurrency(selectedPO.totalAmount)}</td>
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

            {loading ? (
                <div className="p-12 text-center text-gray-500">Memuat data...</div>
            ) : orders.length === 0 ? (
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
                                        {order.status !== 'Received' && order.status !== 'Cancelled' && (
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