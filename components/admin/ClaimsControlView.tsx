
import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, InventoryItem, Vehicle } from '../../types';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatDateIndo, formatCurrency, cleanObject } from '../../utils/helpers';
import { ShieldCheck, Clock, AlertTriangle, ChevronRight, User, MessageSquare, Search, Phone, Package, Calendar, ArrowRight, ClipboardList, CheckCircle2, Zap, Plus, Car, X, Info, ShoppingCart } from 'lucide-react';
import Modal from '../ui/Modal';

interface ClaimsControlViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
  vehicles: Vehicle[]; 
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

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        title: "Admin Claim Control",
        subtitle: "Jalur Administrasi Asuransi",
        search: "Cari Nopol atau Nama...",
        aging_unit: "HARI",
        ready_badge: "SIAP PANGGIL / BOOKING",
        prod_request: "Request Produksi",
        legend_1: "Outstanding > 3 Hari",
        legend_2: "Menunggu (2-3 Hari)",
        legend_3: "Jadwal Booking Terkonfirmasi",
        "Tunggu Estimasi": "Tunggu Estimasi",
        "Tunggu SPK Asuransi": "Tunggu SPK Asuransi",
        "Banding Harga SPK": "Banding Harga SPK",
        "Unit di Pemilik (Tunggu Part)": "Unit di Pemilik (Tunggu Part)",
        "Booking Masuk": "Booking Masuk"
    },
    en: {
        title: "Claim Control Desk",
        subtitle: "Insurance Admin Pipeline",
        search: "Search Plate or Name...",
        aging_unit: "DAYS",
        ready_badge: "READY TO BOOK / CALL",
        prod_request: "Shop Floor Request",
        legend_1: "Delayed > 3 Days",
        legend_2: "Waiting (2-3 Days)",
        legend_3: "Confirmed Booking Schedule",
        "Tunggu Estimasi": "Pending Estimate",
        "Tunggu SPK Asuransi": "Awaiting Approval",
        "Banding Harga SPK": "Negotiation Phase",
        "Unit di Pemilik (Tunggu Part)": "With Owner (Awaiting Part)",
        "Booking Masuk": "Scheduled Booking"
    }
};

const ClaimsControlView: React.FC<ClaimsControlViewProps> = ({ jobs, inventoryItems, vehicles, settings, showNotification, openModal }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const activeClaimJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      const filtered = jobs.filter(j => !j.isClosed && !j.isDeleted && j.namaAsuransi !== 'Umum / Pribadi' && CLAIM_STAGES.includes(j.statusKendaraan) && (j.policeNumber.includes(term) || j.customerName.toUpperCase().includes(term)));
      const stockMap: Record<string, number> = {};
      inventoryItems.forEach(i => { stockMap[i.id] = i.stock; });
      return filtered.map(job => {
          const parts = job.estimateData?.partItems || [];
          let readyCount = 0;
          let allPartsReady = parts.length > 0;
          if (parts.length > 0) {
              parts.forEach(p => {
                  if (p.hasArrived) { readyCount++; return; }
                  const reqQty = p.qty || 1;
                  if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) { stockMap[p.inventoryId] -= reqQty; readyCount++; }
                  else allPartsReady = false;
              });
          } else allPartsReady = (job.estimateData?.jasaItems?.length || 0) > 0;
          return { ...job, isReadyToCall: allPartsReady, logistik: { total: parts.length, ordered: parts.filter(p => p.isOrdered).length, ready: readyCount } };
      }).sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [jobs, inventoryItems, searchTerm]);

  const boardData = useMemo(() => {
      const columns: Record<string, any[]> = {};
      CLAIM_STAGES.forEach(s => columns[s] = []);
      activeClaimJobs.forEach(job => { if (columns[job.statusKendaraan]) columns[job.statusKendaraan].push(job); });
      return columns;
  }, [activeClaimJobs]);

  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      const idx = CLAIM_STAGES.indexOf(job.statusKendaraan);
      let newIdx = direction === 'next' ? idx + 1 : idx - 1;
      if (newIdx >= 0 && newIdx < CLAIM_STAGES.length) {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { statusKendaraan: CLAIM_STAGES[newIdx], updatedAt: serverTimestamp() });
          showNotification(`Moved to: ${CLAIM_STAGES[newIdx]}`, "success");
      }
  };

  const getAgingDays = (job: Job) => {
      const dateMs = (job.updatedAt?.seconds || job.createdAt?.seconds || 0) * 1000;
      return Math.max(0, Math.floor((Date.now() - dateMs) / (1000 * 3600 * 24)));
  };

  return (
    <div className="space-y-6 animate-fade-in h-[calc(100vh-120px)] flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><ShieldCheck size={28}/></div>
                <div><h1 className="text-xl font-bold text-gray-900 tracking-tight">{t('title')}</h1><p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{t('subtitle')}</p></div>
            </div>
            <div className="relative group"><Search className="absolute left-3 top-2.5 text-gray-300" size={18}/><input type="text" placeholder={t('search')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 p-2.5 border border-gray-200 rounded-xl text-sm w-72 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"/></div>
        </div>

        <div className="flex-grow overflow-x-auto pb-4 scrollbar-thin">
            <div className="flex gap-5 h-full min-w-max px-2">
                {CLAIM_STAGES.map((stage) => (
                    <div key={stage} className="w-72 flex flex-col h-full rounded-2xl bg-gray-50/50 border border-gray-200 shadow-sm">
                        <div className="p-4 flex justify-between items-center sticky top-0 z-10">
                            <div className="flex flex-col"><h3 className="font-bold text-gray-800 text-[11px] uppercase tracking-widest">{t(stage)}</h3><span className="text-[10px] text-indigo-500 font-bold">{boardData[stage]?.length || 0} Unit</span></div>
                        </div>
                        <div className="p-3 flex-grow overflow-y-auto space-y-4 scrollbar-hide">
                            {boardData[stage]?.map(job => {
                                const aging = getAgingDays(job);
                                const latestProdRequest = job.productionLogs?.filter(l => l.note?.startsWith('REQUEST TAMBAHAN:')).reverse()[0];
                                return (
                                    <div key={job.id} onClick={() => openModal('create_estimation', job)} className={`bg-white p-4 rounded-xl shadow-sm border transition-all hover:shadow-md cursor-pointer group relative overflow-hidden ${job.statusKendaraan === 'Booking Masuk' ? 'border-indigo-600 ring-1 ring-indigo-50' : 'border-gray-100 hover:border-indigo-200'}`}>
                                        {aging > 3 ? <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500"></div> : aging >= 2 ? <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-400"></div> : null}
                                        <div className="flex justify-between items-start mb-3"><span className="font-bold text-gray-900 text-sm">{job.policeNumber}</span>{aging > 3 && <AlertTriangle size={14} className="text-red-500 animate-pulse"/>}</div>
                                        <div className="space-y-1.5 mb-4">
                                            <p className="text-[12px] font-bold text-gray-700 truncate uppercase">{job.carModel}</p>
                                            <p className="text-[11px] text-gray-400 font-medium truncate">{job.namaAsuransi}</p>
                                            {stage === 'Banding Harga SPK' && latestProdRequest && (
                                                <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-lg animate-fade-in">
                                                    <p className="text-[8px] font-black text-red-400 uppercase leading-none">{t('prod_request')} (Stall {latestProdRequest.stage})</p>
                                                    <p className="text-[10px] font-bold text-red-700 mt-1 line-clamp-3">{latestProdRequest.note?.replace('REQUEST TAMBAHAN: ', '')}</p>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between pt-2">
                                                <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5"><div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[8px]">SA</div> {job.namaSA || '---'}</span>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${aging > 3 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}>{aging} {t('aging_unit')}</span>
                                            </div>
                                        </div>
                                        {job.isReadyToCall && stage === 'Unit di Pemilik (Tunggu Part)' && (
                                            <div className="mb-4 py-1.5 px-2 bg-emerald-100/50 rounded-lg flex items-center gap-2 border border-emerald-200 animate-pulse"><Zap size={14} className="text-emerald-600 fill-emerald-600"/><span className="text-[10px] font-black text-emerald-700 uppercase tracking-tighter">{t('ready_badge')}</span></div>
                                        )}
                                        <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'prev'); }} disabled={stage === CLAIM_STAGES[0]} className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"><ChevronRight size={18} className="rotate-180"/></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'next'); }} disabled={stage === CLAIM_STAGES[CLAIM_STAGES.length - 1]} className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"><ChevronRight size={18}/></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
        
        <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-wrap items-center gap-8 shadow-sm shrink-0">
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500"><div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div><span className="tracking-tight uppercase">{t('legend_1')}</span></div>
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500"><div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div><span className="tracking-tight uppercase">{t('legend_2')}</span></div>
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500"><div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div><span className="tracking-tight uppercase">{t('legend_3')}</span></div>
        </div>
    </div>
  );
};

export default ClaimsControlView;
