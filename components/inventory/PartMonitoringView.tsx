import React, { useState, useMemo } from 'react';
import { Job, InventoryItem, EstimateItem } from '../../types';
import { formatDateIndo } from '../../utils/helpers';
import { Search, Filter, CheckCircle, Clock, Package, AlertCircle, Eye, X, AlertTriangle, Save } from 'lucide-react';
import Modal from '../ui/Modal';
import { doc, updateDoc } from 'firebase/firestore';
import { db, JOBS_COLLECTION } from '../../services/firebase';

interface PartMonitoringViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
}

const PartMonitoringView: React.FC<PartMonitoringViewProps> = ({ jobs, inventoryItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LENGKAP' | 'PARTIAL' | 'INDENT'>('ALL');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // --- LOGIC: FIFO Stock Allocation Algorithm ---
  const processedJobs = useMemo(() => {
    // 1. Filter only Active WOs that have Parts
    const activeJobs = jobs.filter(j => 
        !j.isClosed && 
        j.woNumber && 
        j.estimateData?.partItems && 
        j.estimateData.partItems.length > 0
    );

    // 2. Sort by Entry Date (First In First Out priority for stock)
    activeJobs.sort((a, b) => {
        const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return dateA - dateB;
    });

    // 3. Create a Virtual Stock Map from Inventory Master
    const stockMap: Record<string, number> = {};
    inventoryItems.forEach(item => {
        stockMap[item.id] = item.stock;
    });

    // 4. Process Jobs and Allocate Stock
    return activeJobs.map(job => {
        const parts = job.estimateData?.partItems || [];
        const totalParts = parts.length;
        let readyCount = 0;
        
        // Enrich parts with availability status based on Virtual Stock
        const processedParts = parts.map(part => {
            let status: 'ISSUED' | 'READY' | 'INDENT_MANUAL' | 'WAITING' = 'WAITING';
            const reqQty = part.qty || 1;

            // Priority 1: Already Issued/Arrived
            if (part.hasArrived) {
                status = 'ISSUED';
                readyCount++; // Considered "Complete" for this car
            }
            // Priority 2: Explicitly marked as Indent (Override Stock Check)
            else if (part.isIndent) {
                status = 'INDENT_MANUAL';
            }
            // Priority 3: Check Virtual Stock
            else if (part.inventoryId && stockMap[part.inventoryId] >= reqQty) {
                status = 'READY'; // Booked/Reserved for this car
                stockMap[part.inventoryId] -= reqQty; // Deduct from virtual stock
                readyCount++;
            }
            // Priority 4: No Stock Available
            else {
                status = 'WAITING'; // Stock 0 or taken by previous cars
            }

            return { ...part, allocationStatus: status };
        });
        
        let jobStatus: 'LENGKAP' | 'PARTIAL' | 'INDENT' = 'INDENT';
        
        if (readyCount === totalParts) jobStatus = 'LENGKAP';
        else if (readyCount > 0) jobStatus = 'PARTIAL';
        else jobStatus = 'INDENT';

        return {
            ...job,
            partStatus: jobStatus,
            totalParts,
            readyParts: readyCount, // Includes ISSUED and READY (Allocated)
            detailedParts: processedParts
        };
    }).filter(job => {
        // Search Filter
        const matchesSearch = 
            job.policeNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
            job.woNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.customerName.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Status Filter
        const matchesStatus = statusFilter === 'ALL' || job.partStatus === statusFilter;

        return matchesSearch && matchesStatus;
    });
  }, [jobs, inventoryItems, searchTerm, statusFilter]);

  // --- STATS CALCULATION ---
  const stats = useMemo(() => {
      const lengkap = processedJobs.filter(j => j.partStatus === 'LENGKAP').length;
      const partial = processedJobs.filter(j => j.partStatus === 'PARTIAL').length;
      const indent = processedJobs.filter(j => j.partStatus === 'INDENT').length;
      return { total: processedJobs.length, lengkap, partial, indent };
  }, [processedJobs]);

  // --- ACTIONS: PARTMAN SET INDENT ---
  const handleToggleIndent = async (partIndex: number, currentIndentStatus: boolean, currentETA?: string) => {
      if (!selectedJob) return;
      
      // If toggling ON indent, allow input ETA
      let newETA = currentETA || '';
      if (!currentIndentStatus) {
          const input = prompt("Masukkan Estimasi Tanggal Datang (ETA) (Opsional):", newETA);
          if (input === null) return; // Cancelled
          newETA = input;
      } else {
          // If toggling OFF, clear ETA
          newETA = '';
      }

      setIsUpdating(true);
      try {
          // Deep clone the parts array
          const updatedParts = [...(selectedJob.estimateData?.partItems || [])];
          
          // Update the specific part
          updatedParts[partIndex] = {
              ...updatedParts[partIndex],
              isIndent: !currentIndentStatus,
              indentETA: newETA
          };

          // Update Firestore
          const jobRef = doc(db, JOBS_COLLECTION, selectedJob.id);
          await updateDoc(jobRef, {
              'estimateData.partItems': updatedParts
          });

          // Optimistic Update for UI smoothness (optional since realtime listener will catch it)
          setSelectedJob(prev => prev ? ({
              ...prev,
              estimateData: {
                  ...prev.estimateData!,
                  partItems: updatedParts
              }
          }) : null);

      } catch (e) {
          console.error("Failed to update indent status", e);
          alert("Gagal update status.");
      } finally {
          setIsUpdating(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Monitoring Part WO</h1>
                <p className="text-gray-500 mt-1">Status ketersediaan part dengan alokasi stok (First-In-First-Out).</p>
            </div>
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div 
                onClick={() => setStatusFilter('ALL')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'ALL' ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-gray-600">Total Unit (Part)</span>
                    <Package size={20} className="text-indigo-500"/>
                </div>
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            </div>

            <div 
                onClick={() => setStatusFilter('LENGKAP')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'LENGKAP' ? 'bg-green-50 border-green-300 ring-1 ring-green-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-green-700">Part Lengkap</span>
                    <CheckCircle size={20} className="text-green-500"/>
                </div>
                <div className="text-2xl font-bold text-green-800">{stats.lengkap}</div>
                <p className="text-xs text-green-600 mt-1">Ready Gudang / Terpasang</p>
            </div>

            <div 
                onClick={() => setStatusFilter('PARTIAL')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'PARTIAL' ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-orange-700">Lengkap Sebagian</span>
                    <Clock size={20} className="text-orange-500"/>
                </div>
                <div className="text-2xl font-bold text-orange-800">{stats.partial}</div>
                <p className="text-xs text-orange-600 mt-1">Sebagian Ready/Terpasang</p>
            </div>

            <div 
                onClick={() => setStatusFilter('INDENT')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${statusFilter === 'INDENT' ? 'bg-red-50 border-red-300 ring-1 ring-red-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-red-700">Indent / Kosong</span>
                    <AlertTriangle size={20} className="text-red-500"/>
                </div>
                <div className="text-2xl font-bold text-red-800">{stats.indent}</div>
                <p className="text-xs text-red-600 mt-1">Perlu Order Supplier</p>
            </div>
        </div>

        {/* SEARCH & TABLE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
                <Search className="text-gray-400" size={20}/>
                <input 
                    type="text" 
                    placeholder="Cari No. Polisi, WO, atau Pelanggan..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-gray-700 w-full placeholder-gray-400"
                />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 text-gray-600 uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-3">Info Unit (WO)</th>
                            <th className="px-6 py-3">Tanggal Masuk</th>
                            <th className="px-6 py-3">Ketersediaan Part</th>
                            <th className="px-6 py-3">Status Supply</th>
                            <th className="px-6 py-3 text-center">Detail</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {processedJobs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-400 italic">
                                    Tidak ada data Work Order dengan status ini.
                                </td>
                            </tr>
                        ) : (
                            processedJobs.map(job => (
                                <tr key={job.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{job.policeNumber}</div>
                                        <div className="text-xs text-indigo-600 font-mono mb-1">{job.woNumber}</div>
                                        <div className="text-xs text-gray-500">{job.carModel} | {job.customerName}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {formatDateIndo(job.tanggalMasuk)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-grow bg-gray-200 rounded-full h-2.5 w-24 overflow-hidden">
                                                <div 
                                                    className={`h-2.5 rounded-full ${job.partStatus === 'LENGKAP' ? 'bg-green-500' : job.partStatus === 'PARTIAL' ? 'bg-orange-500' : 'bg-red-500'}`} 
                                                    style={{ width: `${(job.readyParts / job.totalParts) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-bold text-gray-700">{job.readyParts}/{job.totalParts}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">Ready Gudang + Terpasang</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        {job.partStatus === 'LENGKAP' && (
                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">
                                                Lengkap (Ready)
                                            </span>
                                        )}
                                        {job.partStatus === 'PARTIAL' && (
                                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold border border-orange-200">
                                                Lengkap Sebagian
                                            </span>
                                        )}
                                        {job.partStatus === 'INDENT' && (
                                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">
                                                Indent / Kosong
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => setSelectedJob(job)}
                                            className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-full transition-colors"
                                            title="Kelola Part"
                                        >
                                            <Eye size={18}/>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* MODAL DETAIL PART - CONTROL TOWER */}
        <Modal 
            isOpen={!!selectedJob} 
            onClose={() => setSelectedJob(null)} 
            title={`Kontrol Part - ${selectedJob?.policeNumber} (${selectedJob?.woNumber})`}
            maxWidth="max-w-5xl"
        >
            {selectedJob && (
                <div className="space-y-4">
                    {/* Header Summary */}
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg text-sm border border-gray-200">
                        <div>
                            <span className="block text-gray-500 text-xs uppercase">Pelanggan / Asuransi</span>
                            <span className="font-bold text-gray-900">{selectedJob.customerName}</span>
                            <span className="text-gray-500 mx-2">|</span>
                            <span className="text-indigo-600 font-semibold">{selectedJob.namaAsuransi}</span>
                        </div>
                        <div className="text-right">
                            <span className="block text-gray-500 text-xs uppercase">SA / Tgl Masuk</span>
                            <span className="font-bold">{selectedJob.namaSA || '-'}</span>
                            <span className="text-gray-500 mx-2">|</span>
                            <span>{formatDateIndo(selectedJob.tanggalMasuk)}</span>
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-800 flex items-start gap-2">
                        <AlertCircle size={16} className="shrink-0 mt-0.5"/>
                        <div>
                            <strong>Partman Control Area:</strong> <br/>
                            - Klik tombol <strong>SET INDENT</strong> jika stok kosong dan perlu order ke supplier. <br/>
                            - Sistem alokasi otomatis (FIFO) akan dilewati jika status manual Indent aktif.
                        </div>
                    </div>

                    <table className="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-800 text-white font-semibold">
                            <tr>
                                <th className="p-3 border-b border-gray-700">No. Part</th>
                                <th className="p-3 border-b border-gray-700">Nama Part</th>
                                <th className="p-3 border-b border-gray-700 text-center">Qty</th>
                                <th className="p-3 border-b border-gray-700">Status Alokasi</th>
                                <th className="p-3 border-b border-gray-700 text-center">Aksi Partman</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {/* Use the detailedParts from the processedJobs logic */}
                            {(processedJobs.find(j => j.id === selectedJob.id)?.detailedParts || []).map((part: any, idx: number) => {
                                let statusBadge;
                                let rowClass = 'bg-white';

                                switch(part.allocationStatus) {
                                    case 'ISSUED':
                                        statusBadge = <span className="text-green-700 font-bold flex items-center gap-1"><CheckCircle size={14}/> Sudah Keluar</span>;
                                        rowClass = 'bg-green-50 opacity-75';
                                        break;
                                    case 'READY':
                                        statusBadge = <span className="text-blue-600 font-bold flex items-center gap-1"><Package size={14}/> Ready Gudang (Booked)</span>;
                                        rowClass = 'bg-blue-50';
                                        break;
                                    case 'INDENT_MANUAL':
                                        statusBadge = (
                                            <div>
                                                <span className="text-red-600 font-bold flex items-center gap-1"><Clock size={14}/> INDENT SUPPLIER</span>
                                                {part.indentETA && <span className="text-[10px] text-red-500 block ml-5">ETA: {part.indentETA}</span>}
                                            </div>
                                        );
                                        rowClass = 'bg-red-50';
                                        break;
                                    case 'WAITING':
                                        statusBadge = <span className="text-orange-600 font-bold flex items-center gap-1"><AlertTriangle size={14}/> Menunggu Stok</span>;
                                        break;
                                    default:
                                        statusBadge = <span className="text-gray-400">Unknown</span>;
                                }

                                return (
                                    <tr key={idx} className={rowClass}>
                                        <td className="p-3 font-mono text-xs">{part.number || '-'}</td>
                                        <td className="p-3">
                                            {part.name}
                                        </td>
                                        <td className="p-3 text-center font-bold">{part.qty}</td>
                                        <td className="p-3">
                                            {statusBadge}
                                        </td>
                                        <td className="p-3 text-center">
                                            {part.allocationStatus !== 'ISSUED' && (
                                                <button 
                                                    disabled={isUpdating}
                                                    onClick={() => handleToggleIndent(idx, part.isIndent, part.indentETA)}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold shadow-sm transition-colors border ${part.isIndent 
                                                        ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100' 
                                                        : 'bg-red-600 text-white border-red-700 hover:bg-red-700'
                                                    }`}
                                                >
                                                    {part.isIndent ? 'Batalkan Indent' : 'Set Indent'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="flex justify-end pt-4">
                        <button 
                            onClick={() => setSelectedJob(null)}
                            className="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 font-medium"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    </div>
  );
};

export default PartMonitoringView;