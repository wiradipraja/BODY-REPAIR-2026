import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, SPAREPART_COLLECTION } from '../../services/firebase';
import { InventoryItem, UserPermissions } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import InventoryForm from './InventoryForm';
import Modal from '../ui/Modal';
import { Search, Plus, Wrench, PaintBucket, AlertTriangle, Edit, Trash2, Tag, Box, AlertCircle } from 'lucide-react';

interface InventoryViewProps {
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
}

const InventoryView: React.FC<InventoryViewProps> = ({ userPermissions, showNotification }) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sparepart' | 'material'>('sparepart');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
        const querySnapshot = await getDocs(collection(db, SPAREPART_COLLECTION));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
        // Sort by Name
        data.sort((a, b) => a.name.localeCompare(b.name));
        setItems(data);
    } catch (e: any) {
        console.error("Fetch inventory error", e);
        let errorMsg = "Gagal memuat data inventory.";
        if (e.code === 'permission-denied' || e.message?.includes('Missing or insufficient permissions')) {
            errorMsg = "Akses Ditolak: Database belum mengizinkan akses ke koleksi inventory.";
        }
        setError(errorMsg);
        showNotification(errorMsg, "error");
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (formData: Partial<InventoryItem>) => {
      try {
          // Add Category Automatically based on active tab if not set
          const payload = { 
              ...formData, 
              category: formData.category || activeTab,
              updatedAt: serverTimestamp() 
          };

          if (formData.id) {
              await updateDoc(doc(db, SPAREPART_COLLECTION, formData.id), payload);
              showNotification("Item berhasil diperbarui", "success");
          } else {
              await addDoc(collection(db, SPAREPART_COLLECTION), { ...payload, createdAt: serverTimestamp() });
              showNotification("Item berhasil ditambahkan", "success");
          }
          setIsModalOpen(false);
          fetchData();
      } catch (e: any) {
          console.error(e);
          let errorMsg = e.message;
           if (e.code === 'permission-denied' || e.message?.includes('Missing or insufficient permissions')) {
              errorMsg = "Akses Ditolak: Mohon periksa Rules Firestore.";
          }
          showNotification("Error: " + errorMsg, "error");
      }
  };

  const handleDelete = async (id: string) => {
      if (!window.confirm("Hapus item ini dari database?")) return;
      try {
          await deleteDoc(doc(db, SPAREPART_COLLECTION, id));
          showNotification("Item dihapus", "success");
          fetchData();
      } catch (e) {
          showNotification("Gagal menghapus", "error");
      }
  };

  const filteredItems = useMemo(() => {
      return items.filter(item => {
          const matchesTab = item.category === activeTab;
          const searchUpper = searchQuery.toUpperCase();
          const matchesSearch = 
            item.name.toUpperCase().includes(searchUpper) || 
            (item.code && item.code.toUpperCase().includes(searchUpper)) ||
            (item.brand && item.brand.toUpperCase().includes(searchUpper));
          
          return matchesTab && matchesSearch;
      });
  }, [items, activeTab, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inventory & Stok</h1>
            <p className="text-gray-500 mt-1">Kelola suku cadang dan bahan baku bengkel.</p>
          </div>
          <button 
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg flex items-center gap-2 font-semibold"
          >
            <Plus size={18}/> Tambah Item
          </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-sm flex items-start gap-3">
             <div className="mt-1"><AlertCircle size={20}/></div>
             <div>
                <p className="font-bold">Koneksi Database Bermasalah</p>
                <p className="text-sm mt-1">{error}</p>
                {error.includes('Akses Ditolak') && (
                    <p className="text-xs mt-2 p-2 bg-red-100 rounded text-red-800">
                        <strong>Panduan Admin:</strong> Buka Firebase Console &gt; Firestore Database &gt; Rules.<br/>
                        Tambahkan rule untuk koleksi <code>bengkel-spareparts-master</code> atau atur global read/write ke true (mode test).
                    </p>
                )}
             </div>
        </div>
      )}

      {/* SUB-MENU TABS */}
      <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-100 inline-flex">
          <button 
            onClick={() => setActiveTab('sparepart')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'sparepart' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
             <Wrench size={16}/> Sparepart
          </button>
          <button 
            onClick={() => setActiveTab('material')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'material' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
             <PaintBucket size={16}/> Bahan Baku
          </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* SEARCH BAR */}
          <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
             <Search className="text-gray-400" size={20}/>
             <input 
                type="text" 
                placeholder={`Cari ${activeTab === 'sparepart' ? 'No. Part atau Nama Sparepart' : 'Nama Bahan Baku'}...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-gray-700 w-full placeholder-gray-400"
             />
          </div>

          {loading ? (
              <div className="p-12 flex flex-col items-center justify-center text-gray-500 gap-3">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p>Memuat data inventory...</p>
              </div>
          ) : filteredItems.length === 0 && !error ? (
              <div className="p-12 text-center flex flex-col items-center text-gray-400">
                  <Box size={48} className="mb-2 opacity-20"/>
                  <p>Tidak ada data {activeTab === 'sparepart' ? 'sparepart' : 'bahan baku'}.</p>
                  <button onClick={() => { setEditingItem(null); setIsModalOpen(true); }} className="text-indigo-600 font-bold mt-2 hover:underline">Tambah Baru</button>
              </div>
          ) : (
              <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                          <tr>
                              <th className="px-6 py-3">Item Info</th>
                              <th className="px-6 py-3">Kategori/Merk</th>
                              <th className="px-6 py-3 text-center">Stok</th>
                              <th className="px-6 py-3 text-right">Harga Beli</th>
                              {activeTab === 'sparepart' && <th className="px-6 py-3 text-right">Harga Jual</th>}
                              <th className="px-6 py-3 text-center">Aksi</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                          {filteredItems.map(item => {
                              const isLowStock = item.stock <= (item.minStock || 0);
                              return (
                                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-6 py-4">
                                          <div className="font-bold text-gray-900">{item.name}</div>
                                          <div className="text-xs text-gray-500 font-mono flex items-center gap-1">
                                              {activeTab === 'sparepart' ? <Tag size={12}/> : <PaintBucket size={12}/>}
                                              {item.code || '-'}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium border border-gray-200">
                                              {item.brand || 'No Brand'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex flex-col items-center">
                                            <span className={`font-bold text-base ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>
                                                {item.stock} <span className="text-xs font-normal text-gray-500">{item.unit}</span>
                                            </span>
                                            {isLowStock && (
                                                <span className="flex items-center gap-1 text-[10px] text-red-500 bg-red-50 px-1.5 rounded mt-1">
                                                    <AlertTriangle size={10}/> Stok Rendah
                                                </span>
                                            )}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-right text-gray-600">
                                          {formatCurrency(item.buyPrice)}
                                      </td>
                                      {activeTab === 'sparepart' && (
                                          <td className="px-6 py-4 text-right font-bold text-emerald-600">
                                              {formatCurrency(item.sellPrice)}
                                          </td>
                                      )}
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex justify-center gap-2">
                                              <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="text-indigo-500 hover:text-indigo-700 p-1">
                                                  <Edit size={16}/>
                                              </button>
                                              <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-1">
                                                  <Trash2 size={16}/>
                                              </button>
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

      {/* MODAL FORM */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingItem ? `Edit ${activeTab === 'sparepart' ? 'Sparepart' : 'Bahan Baku'}` : `Tambah ${activeTab === 'sparepart' ? 'Sparepart' : 'Bahan Baku'} Baru`}
      >
          <InventoryForm 
            initialData={editingItem || { category: activeTab }} 
            activeCategory={activeTab}
            onSave={handleSave} 
            onCancel={() => setIsModalOpen(false)} 
          />
      </Modal>
    </div>
  );
};

export default InventoryView;