import React, { useState, useMemo } from 'react';
import { Job, InventoryItem, EstimateItem } from '../../types';
import { formatDateIndo } from '../../utils/helpers';
import { Search, Filter, CheckCircle, Clock, Package, AlertCircle, Eye, X, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';

interface PartMonitoringViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
}

const PartMonitoringView: React.FC<PartMonitoringViewProps> = ({ jobs, inventoryItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LENGKAP' | 'PARTIAL' | 'INDENT'>('ALL');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

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
            // Priority 2: Explicitly marked as Indent
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

  // --- STATS CALCULATION (From processed data to ensure consistency) ---
  const stats = useMemo(() => {
      const lengkap = processedJobs.filter(j => j.partStatus === 'LENGKAP').length;
      const partial = processedJobs.filter(j => j.partStatus === 'PARTIAL').length;
      const indent = processedJobs.filter(j => j.partStatus === 'INDENT').length;
      return { total: processedJobs.length, lengkap, partial, indent };
  }, [processedJobs]);

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
                                            title="Lihat Detail Part"
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

        {/* MODAL DETAIL PART */}
        <Modal 
            isOpen={!!selectedJob} 
            onClose={() => setSelectedJob(null)} 
            title={`Detail Part - ${selectedJob?.policeNumber} (${selectedJob?.woNumber})`}
            maxWidth="max-w-4xl"
        >
            {selectedJob && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg text-sm border border-gray-200">
                        <div>
                            <span className="block text-gray-500">Pelanggan</span>
                            <span className="font-bold">{selectedJob.customerName}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500">Asuransi</span>
                            <span className="font-bold">{selectedJob.namaAsuransi}</span>
                        </div>
                    </div>

                    <table className="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-100 text-gray-700 font-semibold">
                            <tr>
                                <th className="p-3 border-b">No. Part</th>
                                <th className="p-3 border-b">Nama Part</th>
                                <th className="p-3 border-b text-center">Qty</th>
                                <th className="p-3 border-b">Status Alokasi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {/* Use the detailedParts from the processedJobs logic, we need to find the processed version of selectedJob */}
                            {(processedJobs.find(j => j.id === selectedJob.id)?.detailedParts || selectedJob.estimateData?.partItems || []).map((part: any, idx: number) => {
                                let statusBadge;
                                switch(part.allocationStatus) {
                                    case 'ISSUED':
                                        statusBadge = <span className="text-green-700 font-bold flex items-center gap-1"><CheckCircle size={14}/> Sudah Keluar</span>;
                                        break;
                                    case 'READY':
                                        statusBadge = <span className="text-blue-600 font-bold flex items-center gap-1"><Package size={14}/> Ready Gudang (Booked)</span>;
                                        break;
                                    case 'INDENT_MANUAL':
                                        statusBadge = <span className="text-red-600 font-bold flex items-center gap-1"><Clock size={14}/> INDENT SUPPLIER</span>;
                                        break;
                                    case 'WAITING':
                                        statusBadge = <span className="text-orange-600 font-bold flex items-center gap-1"><AlertTriangle size={14}/> Menunggu Stok</span>;
                                        break;
                                    default:
                                        statusBadge = <span className="text-gray-400">Unknown</span>;
                                }

                                return (
                                    <tr key={idx} className={part.allocationStatus === 'READY' ? 'bg-blue-50' : part.allocationStatus === 'ISSUED' ? 'bg-green-50' : 'bg-white'}>
                                        <td className="p-3 font-mono text-xs">{part.number || '-'}</td>
                                        <td className="p-3">
                                            {part.name}
                                            {part.isIndent && <span className="ml-2 text-[10px] text-white bg-red-500 px-1 rounded">INDENT</span>}
                                        </td>
                                        <td className="p-3 text-center font-bold">{part.qty}</td>
                                        <td className="p-3">
                                            {statusBadge}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    
                    <div className="bg-yellow-50 p-3 rounded-lg text-xs text-yellow-800 flex items-start gap-2">
                        <AlertCircle size={16} className="shrink-0 mt-0.5"/>
                        <p>
                            <strong>Catatan Sistem:</strong> Status "Ready Gudang" menggunakan sistem antrian (First-In-First-Out) berdasarkan tanggal masuk mobil. 
                            Jika stok terbatas, mobil yang masuk lebih dulu diprioritaskan.
                        </p>
                    </div>

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