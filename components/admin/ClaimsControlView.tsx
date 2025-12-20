
import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, InventoryItem } from '../../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatDateIndo, formatCurrency } from '../../utils/helpers';
import { 
    ShieldCheck, Clock, AlertTriangle, ChevronRight, User, 
    MessageSquare, Search, Phone, Package, Calendar, ArrowRight,
    ClipboardList, CheckCircle2, Zap
} from 'lucide-react';

interface ClaimsControlViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  openModal: (type: string, data: any) => void;
}

const CLAIM_STAGES = [
    "Tunggu Estimasi",
    "Tunggu SPK Asuransi",
    "Banding Harga SPK",
    "Unit di Pemilik (Tunggu Part)",
    "Booking Masuk"
];

const ClaimsControlView: React.FC<ClaimsControlViewProps> = ({ jobs, inventoryItems, settings, showNotification, openModal }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // --- DATA PROCESSING: FIFO STOCK ALLOCATION ---
  const activeClaimJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      
      // 1. Filter jobs in claim stages
      const filtered = jobs.filter(j => 
          !j.isClosed && 
          !j.isDeleted &&
          CLAIM_STAGES.includes(j.statusKendaraan) &&
          (j.policeNumber.includes(term) || j.customerName.toUpperCase().includes(term))
      );

      // 2. Sort by creation (FIFO)
      filtered.sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

      // 3. Virtual Stock Allocation to check "Ready Part" status
      const stockMap: Record<string, number> = {};
      inventoryItems.forEach(i => { stockMap[i.id] = i.stock; });

      return filtered.map(job => {
          const parts = job.estimateData?.partItems || [];
          let isPartReady = parts.length > 0;
          
          if (parts.length > 0) {
              parts.forEach(p => {
                  if (p.hasArrived) return;
                  const reqQty = p.qty || 1;
                  if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) {
                      stockMap[p.inventoryId] -= reqQty;
                  } else {
                      isPartReady = false;
                  }
              });
          } else {
              isPartReady = false; // No parts estimated yet
          }

          return { ...job, isReadyToCall: isPartReady };
      });
  }, [jobs, inventoryItems, searchTerm]);

  // Group by Stage
  const boardData = useMemo(() => {
      const columns: Record<string, any[]> = {};
      CLAIM_STAGES.forEach(s => columns[s] = []);
      activeClaimJobs.forEach(job => {
          if (columns[job.statusKendaraan]) columns[job.statusKendaraan].push(job);
      });
      return columns;
  }, [activeClaimJobs]);

  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      const currentIndex = CLAIM_STAGES.indexOf(job.statusKendaraan);
      if (currentIndex === -1) return;

      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (newIndex < 0 || newIndex >= CLAIM_STAGES.length) return;

      const newStage = CLAIM_STAGES[newIndex];
      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              statusKendaraan: newStage,
              updatedAt: new Date()
          });
          showNotification(`Unit dipindahkan ke ${newStage}`, "success");
      } catch (e) {
          showNotification("Gagal update status", "error");
      }
  };

  const getAgingDays = (date: any) => {
      if (!date) return 0;
      const ms = date.seconds ? date.seconds * 1000 : new Date(date).getTime();
      return Math.floor((Date.now() - ms) / (1000 * 3600 * 24));
  };

  return (
    <div className="space-y-6 animate-fade-in h-[calc(100vh-120px)] flex flex-col">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-xl shadow-sm text-white">
                    <ShieldCheck size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Job Control Admin Claim</h1>
                    <p className="text-sm text-gray-500 font-medium">Monitoring Pendaftaran Klaim, SPK & Persiapan Part</p>
                </div>
            </div>
            
            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
                <input 
                    type="text" 
                    placeholder="Cari Nopol / Nama..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10 p-2 border border-gray-300 rounded-lg text-sm w-64 focus:ring-2 ring-indigo-500"
                />
            </div>
        </div>

        {/* KANBAN BOARD */}
        <div className="flex-grow overflow-x-auto pb-4">
            <div className="flex gap-4 h-full min-w-max px-2">
                {CLAIM_STAGES.map((stage) => {
                    const jobsInStage = boardData[stage] || [];
                    return (
                        <div key={stage} className="w-72 flex flex-col h-full rounded-xl bg-gray-50 border border-gray-200 shadow-inner">
                            {/* Column Header */}
                            <div className="p-3 border-b border-gray-200 bg-white rounded-t-xl flex justify-between items-center sticky top-0 z-10">
                                <h3 className="font-bold text-gray-700 text-xs uppercase tracking-wider">{stage}</h3>
                                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-full">{jobsInStage.length}</span>
                            </div>

                            {/* Column Body */}
                            <div className="p-2 flex-grow overflow-y-auto space-y-3 scrollbar-thin">
                                {jobsInStage.map(job => {
                                    const aging = getAgingDays(job.updatedAt || job.createdAt);
                                    const isCritical = aging > 3;
                                    const hasNegotiation = job.insuranceNegotiationLog && job.insuranceNegotiationLog.length > 0;
                                    
                                    return (
                                        <div 
                                            key={job.id} 
                                            className={`bg-white p-3 rounded-lg shadow-sm border transition-all hover:shadow-md cursor-pointer group ${job.isReadyToCall && stage === 'Unit di Pemilik (Tunggu Part)' ? 'border-green-500 ring-2 ring-green-100' : 'border-gray-100'}`}
                                            onClick={() => openModal('create_estimation', job)}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-black text-indigo-900 text-sm tracking-tight">{job.policeNumber}</span>
                                                <div className="flex items-center gap-1">
                                                    {hasNegotiation && <MessageSquare size={12} className="text-indigo-500"/>}
                                                    {isCritical && <AlertTriangle size={12} className="text-red-500 animate-pulse"/>}
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-1 mb-3">
                                                <p className="text-[11px] font-bold text-gray-700 truncate">{job.carModel}</p>
                                                <p className="text-[10px] text-gray-400 font-medium truncate">{job.namaAsuransi}</p>
                                                <div className="flex items-center justify-between pt-1">
                                                    <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1">
                                                        <User size={10}/> {job.namaSA || 'No SA'}
                                                    </span>
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isCritical ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                                                        {aging} HARI
                                                    </span>
                                                </div>
                                            </div>

                                            {/* LOGIC BADGE: READY TO CALL */}
                                            {job.isReadyToCall && stage === 'Unit di Pemilik (Tunggu Part)' && (
                                                <div className="mb-3 p-1.5 bg-green-50 rounded border border-green-100 flex items-center gap-2 animate-pulse">
                                                    <Zap size={12} className="text-green-600 fill-green-600"/>
                                                    <span className="text-[10px] font-black text-green-700 uppercase">Part Lengkap (Siap Panggil)</span>
                                                </div>
                                            )}

                                            {/* QUICK ACTION MOVE */}
                                            <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'prev'); }}
                                                    disabled={stage === CLAIM_STAGES[0]}
                                                    className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"
                                                >
                                                    <ChevronRight size={16} className="rotate-180"/>
                                                </button>
                                                
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[8px] font-black text-indigo-300 uppercase tracking-tighter">Click to View</span>
                                                </div>

                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'next'); }}
                                                    disabled={stage === CLAIM_STAGES[CLAIM_STAGES.length - 1]}
                                                    className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"
                                                >
                                                    <ChevronRight size={16}/>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {jobsInStage.length === 0 && (
                                    <div className="py-12 flex flex-col items-center justify-center opacity-20">
                                        <ClipboardList size={32} className="text-gray-400 mb-2"/>
                                        <p className="text-[10px] font-bold text-gray-500">Kosong</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        
        {/* FOOTER INFO */}
        <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex items-center gap-4 shrink-0">
             <div className="flex items-center gap-2 text-xs font-bold text-indigo-700">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                <span>Aging &gt; 3 Hari</span>
             </div>
             <div className="flex items-center gap-2 text-xs font-bold text-green-700">
                <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></div>
                <span>Part Ready (FIFO)</span>
             </div>
             <div className="ml-auto text-[10px] text-indigo-400 font-medium italic">
                * Urutan card berdasarkan prioritas FIFO (First In First Out)
             </div>
        </div>
    </div>
  );
};

export default ClaimsControlView;
