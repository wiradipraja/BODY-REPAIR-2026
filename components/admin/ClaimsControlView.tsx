
import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, InventoryItem, Vehicle } from '../../types';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatDateIndo, formatCurrency, cleanObject } from '../../utils/helpers';
import { 
    ShieldCheck, Clock, AlertTriangle, ChevronRight, User, 
    MessageSquare, Search, Phone, Package, Calendar, ArrowRight,
    ClipboardList, CheckCircle2, Zap, Plus, Car, X, Info, ShoppingCart
} from 'lucide-react';
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

const ClaimsControlView: React.FC<ClaimsControlViewProps> = ({ jobs, inventoryItems, vehicles, settings, showNotification, openModal }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isReEntryModalOpen, setIsReEntryModalOpen] = useState(false);
  const [reEntrySearch, setReEntrySearch] = useState('');

  const activeClaimJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      const filtered = jobs.filter(j => 
          !j.isClosed && 
          !j.isDeleted &&
          j.namaAsuransi !== 'Umum / Pribadi' && 
          CLAIM_STAGES.includes(j.statusKendaraan) &&
          (j.policeNumber.includes(term) || j.customerName.toUpperCase().includes(term))
      );

      // FIFO SORTING: Priority for allocation
      filtered.sort((a,b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

      const stockMap: Record<string, number> = {};
      inventoryItems.forEach(i => { stockMap[i.id] = i.stock; });

      return filtered.map(job => {
          const parts = job.estimateData?.partItems || [];
          const totalParts = parts.length;
          const orderedParts = parts.filter(p => p.isOrdered).length;
          
          let readyCount = 0;
          let allPartsReady = totalParts > 0;
          
          if (totalParts > 0) {
              parts.forEach(p => {
                  if (p.hasArrived) {
                      readyCount++;
                      return;
                  }
                  const reqQty = p.qty || 1;
                  if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) {
                      stockMap[p.inventoryId] -= reqQty;
                      readyCount++;
                  } else {
                      allPartsReady = false;
                  }
              });
          } else {
              // Jasa only is considered ready for production immediately
              allPartsReady = (job.estimateData?.jasaItems?.length || 0) > 0;
          }

          return { 
              ...job, 
              isReadyToCall: allPartsReady, 
              logistik: { 
                  total: totalParts, 
                  ordered: orderedParts, 
                  ready: readyCount 
              } 
          };
      });
  }, [jobs, inventoryItems, searchTerm]);

  const boardData = useMemo(() => {
      const columns: Record<string, any[]> = {};
      CLAIM_STAGES.forEach(s => columns[s] = []);
      activeClaimJobs.forEach(job => {
          if (columns[job.statusKendaraan]) columns[job.statusKendaraan].push(job);
      });
      return columns;
  }, [activeClaimJobs]);

  const filteredVehicles = useMemo(() => {
      if (!reEntrySearch) return [];
      const term = reEntrySearch.toUpperCase().replace(/\s/g, '');
      return vehicles.filter(v => 
          v.policeNumber.replace(/\s/g, '').includes(term) || 
          v.customerName.toUpperCase().includes(term)
      ).slice(0, 8);
  }, [vehicles, reEntrySearch]);

  const handleCreateNewClaim = async (vehicle: Vehicle) => {
      if (vehicle.namaAsuransi === 'Umum / Pribadi') {
          showNotification("Unit ini terdaftar sebagai Umum/Pribadi. Tidak masuk antrian klaim.", "error");
          return;
      }

      const existingActive = jobs.find(j => j.unitId === vehicle.id && !j.isClosed && !j.isDeleted);
      if (existingActive) {
          showNotification(`Unit ini masih memiliki WO Aktif (${existingActive.woNumber || 'Tanpa WO'}).`, "error");
          return;
      }

      if (!window.confirm(`Proses pendaftaran klaim baru untuk ${vehicle.policeNumber}?`)) return;

      try {
          const newJob: Partial<Job> = {
              unitId: vehicle.id,
              policeNumber: vehicle.policeNumber,
              customerName: vehicle.customerName,
              customerPhone: vehicle.customerPhone,
              customerAddress: vehicle.customerAddress,
              customerKota: vehicle.customerKota,
              carBrand: vehicle.carBrand,
              carModel: vehicle.carModel,
              warnaMobil: vehicle.warnaMobil,
              namaAsuransi: vehicle.namaAsuransi,
              statusKendaraan: 'Tunggu Estimasi',
              statusPekerjaan: 'Belum Mulai Perbaikan',
              posisiKendaraan: 'Di Bengkel',
              tanggalMasuk: new Date().toISOString().split('T')[0],
              isClosed: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              hargaJasa: 0,
              hargaPart: 0,
              costData: { hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 }
          };

          await addDoc(collection(db, SERVICE_JOBS_COLLECTION), cleanObject(newJob));
          showNotification("Berhasil didaftarkan.", "success");
          setIsReEntryModalOpen(false);
          setReEntrySearch('');
      } catch (e) {
          showNotification("Gagal memproses klaim.", "error");
      }
  };

  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      const currentIndex = CLAIM_STAGES.indexOf(job.statusKendaraan);
      if (currentIndex === -1) return;

      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (newIndex < 0 || newIndex >= CLAIM_STAGES.length) return;

      const newStage = CLAIM_STAGES[newIndex];
      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              statusKendaraan: newStage,
              updatedAt: serverTimestamp()
          });
          showNotification(`Pindah ke: ${newStage}`, "success");
      } catch (e) {
          showNotification("Gagal update status", "error");
      }
  };

  // ROBUST AGING CALCULATION
  const getAgingDays = (job: Job) => {
      // Prioritas field tanggal yang digunakan untuk hitung aging
      const dateInput = job.updatedAt || job.createdAt || job.tanggalMasuk;
      if (!dateInput) return 0;

      let dateMs: number;
      
      // 1. Handle Firestore Timestamp Object
      if (typeof dateInput === 'object' && 'seconds' in (dateInput as any)) {
          dateMs = (dateInput as any).seconds * 1000;
      } 
      // 2. Handle JS Date Object
      else if (dateInput instanceof Date) {
          dateMs = dateInput.getTime();
      }
      // 3. Handle ISO String / Other String Formats
      else {
          const parsed = new Date(dateInput as string).getTime();
          dateMs = isNaN(parsed) ? Date.now() : parsed;
      }

      const diff = Date.now() - dateMs;
      // Gunakan Math.max agar tidak muncul angka negatif jika jam sistem tidak sinkron
      const days = Math.max(0, Math.floor(diff / (1000 * 3600 * 24)));
      return days;
  };

  return (
    <div className="space-y-6 animate-fade-in h-[calc(100vh-120px)] flex flex-col">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                    <ShieldCheck size={28}/>
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Admin Claim Control</h1>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Jalur Administrasi Asuransi</p>
                </div>
            </div>
            
            <div className="relative group">
                <Search className="absolute left-3 top-2.5 text-gray-300 group-focus-within:text-indigo-500 transition-colors" size={18}/>
                <input 
                    type="text" 
                    placeholder="Cari Nopol atau Nama..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10 p-2.5 border border-gray-200 rounded-xl text-sm w-72 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                />
            </div>
        </div>

        {/* KANBAN BOARD */}
        <div className="flex-grow overflow-x-auto pb-4 scrollbar-thin">
            <div className="flex gap-5 h-full min-w-max px-2">
                {CLAIM_STAGES.map((stage) => {
                    const jobsInStage = boardData[stage] || [];
                    return (
                        <div key={stage} className="w-72 flex flex-col h-full rounded-2xl bg-gray-50/50 border border-gray-200 shadow-sm">
                            {/* Column Header */}
                            <div className="p-4 flex justify-between items-center sticky top-0 z-10">
                                <div className="flex flex-col">
                                    <h3 className="font-bold text-gray-800 text-[11px] uppercase tracking-widest">{stage}</h3>
                                    <span className="text-[10px] text-indigo-500 font-bold">{jobsInStage.length} Kendaraan</span>
                                </div>
                                {stage === 'Tunggu Estimasi' && (
                                    <button 
                                        onClick={() => setIsReEntryModalOpen(true)}
                                        className="p-2 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm border border-indigo-100"
                                    >
                                        <Plus size={16}/>
                                    </button>
                                )}
                            </div>

                            {/* Column Body */}
                            <div className="p-3 flex-grow overflow-y-auto space-y-4 scrollbar-hide">
                                {jobsInStage.map(job => {
                                    const aging = getAgingDays(job);
                                    const isCritical = aging > 3;
                                    const isWarning = aging >= 2 && aging <= 3;
                                    const hasNegotiation = job.insuranceNegotiationLog && job.insuranceNegotiationLog.length > 0;
                                    const logistik = job.logistik;

                                    return (
                                        <div 
                                            key={job.id} 
                                            className={`bg-white p-4 rounded-xl shadow-sm border transition-all hover:shadow-md cursor-pointer group relative overflow-hidden ${job.statusKendaraan === 'Booking Masuk' ? 'border-indigo-600 ring-1 ring-indigo-50' : job.isReadyToCall && (stage === 'Unit di Pemilik (Tunggu Part)' || stage === 'Tunggu SPK Asuransi') ? 'border-emerald-500 bg-emerald-50/10' : 'border-gray-100 hover:border-indigo-200'}`}
                                            onClick={() => openModal('create_estimation', job)}
                                        >
                                            {/* Accent Line Based on Urgency */}
                                            {isCritical ? (
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500"></div>
                                            ) : isWarning ? (
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-400"></div>
                                            ) : (
                                                job.statusKendaraan === 'Booking Masuk' && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600"></div>
                                            )}

                                            <div className="flex justify-between items-start mb-3">
                                                <span className="font-bold text-gray-900 text-sm tracking-tight">{job.policeNumber}</span>
                                                <div className="flex items-center gap-1.5">
                                                    {hasNegotiation && <MessageSquare size={14} className="text-indigo-400"/>}
                                                    {isCritical && <AlertTriangle size={14} className="text-red-500 animate-pulse"/>}
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-1.5 mb-4">
                                                <p className="text-[12px] font-bold text-gray-700 truncate uppercase">{job.carModel}</p>
                                                <p className="text-[11px] text-gray-400 font-medium truncate">{job.namaAsuransi}</p>
                                                
                                                {/* BOOKING INFO SPECIAL DISPLAY */}
                                                {job.statusKendaraan === 'Booking Masuk' && job.tanggalBooking && (
                                                    <div className="mt-2 p-2 bg-indigo-50 rounded-lg border border-indigo-100 flex items-center gap-2">
                                                        <Calendar size={14} className="text-indigo-600"/>
                                                        <div>
                                                            <p className="text-[8px] font-black text-indigo-400 uppercase leading-none">Jadwal Kedatangan</p>
                                                            <p className="text-[11px] font-black text-indigo-700">{formatDateIndo(job.tanggalBooking)}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {logistik && logistik.total > 0 && job.statusKendaraan !== 'Booking Masuk' && (
                                                    <div className="bg-gray-50 rounded-lg p-2 mt-2 space-y-1 border border-gray-100">
                                                        <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase tracking-tighter">
                                                            <div className="flex items-center gap-1"><ShoppingCart size={10}/> Order PO</div>
                                                            <div className={logistik.ordered === logistik.total ? 'text-indigo-600' : ''}>
                                                                {logistik.ordered} / {logistik.total}
                                                            </div>
                                                        </div>
                                                        <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden">
                                                            <div className="bg-indigo-500 h-full" style={{ width: `${(logistik.ordered / logistik.total) * 100}%` }}></div>
                                                        </div>
                                                        <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase tracking-tighter">
                                                            <div className="flex items-center gap-1"><Package size={10}/> Ready Gudang</div>
                                                            <div className={logistik.ready === logistik.total ? 'text-emerald-600' : ''}>
                                                                {logistik.ready} / {logistik.total}
                                                            </div>
                                                        </div>
                                                        <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden">
                                                            <div className="bg-emerald-500 h-full" style={{ width: `${(logistik.ready / logistik.total) * 100}%` }}></div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between pt-2">
                                                    <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5">
                                                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[8px]">SA</div> 
                                                        {job.namaSA || 'BELUM ADA'}
                                                    </span>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isCritical ? 'bg-red-50 text-red-600 border-red-200' : isWarning ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                                                        {aging} HARI
                                                    </span>
                                                </div>
                                            </div>

                                            {job.isReadyToCall && stage === 'Unit di Pemilik (Tunggu Part)' && (
                                                <div className="mb-4 py-1.5 px-2 bg-emerald-100/50 rounded-lg flex items-center gap-2 border border-emerald-200">
                                                    <Zap size={14} className="text-emerald-600 fill-emerald-600"/>
                                                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-tighter">SIAP PANGGIL / BOOKING</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'prev'); }}
                                                    disabled={stage === CLAIM_STAGES[0]}
                                                    className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"
                                                >
                                                    <ChevronRight size={18} className="rotate-180"/>
                                                </button>
                                                <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleMoveStage(job, 'next'); }}
                                                    disabled={stage === CLAIM_STAGES[CLAIM_STAGES.length - 1]}
                                                    className="p-1 text-gray-300 hover:text-indigo-600 disabled:opacity-0 transition-colors"
                                                >
                                                    <ChevronRight size={18}/>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {jobsInStage.length === 0 && (
                                    <div className="py-12 flex flex-col items-center justify-center opacity-20">
                                        <ClipboardList size={32} className="text-gray-300 mb-2"/>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-widest">KOSONG</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        
        {/* FOOTER INFO */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-wrap items-center gap-8 shadow-sm shrink-0">
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                <span className="tracking-tight uppercase">Outstanding &gt; 3 Hari</span>
             </div>
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div>
                <span className="tracking-tight uppercase">Menunggu (2-3 Hari)</span>
             </div>
             <div className="flex items-center gap-2.5 text-xs font-bold text-gray-500">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                <span className="tracking-tight uppercase">Jadwal Booking Terkonfirmasi</span>
             </div>
             <div className="ml-auto flex items-center gap-2 text-[11px] text-indigo-400 font-medium italic bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                <Info size={14}/>
                * Unit akan otomatis hilang dari antrian Booking CRC jika SA merubah posisi menjadi "Di Bengkel".
             </div>
        </div>

        {/* RE-ENTRY MODAL */}
        <Modal 
            isOpen={isReEntryModalOpen} 
            onClose={() => { setIsReEntryModalOpen(false); setReEntrySearch(''); }}
            title="Pendaftaran Klaim Baru"
        >
            <div className="space-y-5">
                <div className="relative">
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20}/>
                    <input 
                        type="text" 
                        placeholder="Masukkan Nopol atau Nama..." 
                        value={reEntrySearch}
                        onChange={e => setReEntrySearch(e.target.value)}
                        className="w-full pl-12 p-4 border border-gray-200 rounded-2xl font-bold text-lg focus:ring-4 focus:ring-indigo-50 outline-none transition-all placeholder:text-gray-300"
                        autoFocus
                    />
                </div>

                <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                    {filteredVehicles.map(v => (
                        <div 
                            key={v.id} 
                            onClick={() => handleCreateNewClaim(v)}
                            className="p-4 border border-gray-50 rounded-xl hover:bg-gray-50 hover:border-indigo-100 cursor-pointer flex justify-between items-center group transition-all"
                        >
                            <div>
                                <h4 className="font-bold text-gray-900 text-base">{v.policeNumber}</h4>
                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                    <span className="font-bold">{v.customerName}</span>
                                    <span>•</span>
                                    <span className="uppercase">{v.carModel}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold px-2 py-1 rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600 uppercase tracking-tighter">
                                    {v.namaAsuransi}
                                </span>
                            </div>
                        </div>
                    ))}
                    {reEntrySearch && filteredVehicles.length === 0 && (
                        <div className="text-center py-16">
                            <Car size={40} className="mx-auto text-gray-100 mb-4" />
                            <p className="text-gray-400 font-bold text-sm">DATA TIDAK DITEMUKAN</p>
                            <p className="text-xs text-gray-300 mt-1">Daftarkan unit baru di menu Input Data Unit.</p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default ClaimsControlView;
