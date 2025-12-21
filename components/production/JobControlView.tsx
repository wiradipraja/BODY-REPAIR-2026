
import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, ProductionLog, MechanicAssignment } from '../../types';
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatPoliceNumber, formatDateIndo } from '../../utils/helpers';
// Added Calculator to the imports from lucide-react
import { 
    Hammer, Clock, AlertTriangle, CheckCircle, ArrowRight, User, 
    MoreVertical, Briefcase, Calendar, ChevronRight, XCircle, Search, Wrench, BarChart2, Layers, History, RefreshCcw, MessageSquare, Info, AlertCircle, FileSearch, PackageSearch, Calculator
} from 'lucide-react';
import Modal from '../ui/Modal';

interface JobControlViewProps {
  jobs: Job[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
}

const STAGES = [
    "Persiapan Kendaraan",
    "Bongkar",
    "Las Ketok",
    "Dempul",
    "Cat",
    "Pemasangan",
    "Poles",
    "Finishing",
    "Quality Control"
];

// Statuses that map specifically to "Persiapan Kendaraan"
const ADMIN_HURDLE_STATUSES = [
    "Banding Harga SPK",
    "Tunggu Part",
    "Tunggu SPK Asuransi",
    "Tunggu Estimasi"
];

const JobControlView: React.FC<JobControlViewProps> = ({ jobs, settings, showNotification, userPermissions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  
  // Report & Modal State
  const [showProductivityReport, setShowProductivityReport] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [viewHistoryJob, setViewHistoryJob] = useState<Job | null>(null);

  // --- DATA PROCESSING ---
  const activeProductionJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      return jobs.filter(j => 
          !j.isClosed && 
          j.woNumber && 
          !j.isDeleted &&
          j.posisiKendaraan === 'Di Bengkel' && 
          // Extended filter to include administrative hurdles
          (
              j.statusKendaraan === 'Work In Progress' || 
              j.statusKendaraan === 'Unit Rawat Jalan' || 
              j.statusKendaraan === 'Booking Masuk' ||
              ADMIN_HURDLE_STATUSES.includes(j.statusKendaraan)
          ) && 
          (j.policeNumber.includes(term) || j.carModel.toUpperCase().includes(term) || j.customerName.toUpperCase().includes(term))
      );
  }, [jobs, searchTerm]);

  // Group Jobs by Stage
  const boardData = useMemo(() => {
      const columns: Record<string, Job[]> = {};
      STAGES.forEach(s => columns[s] = []);
      
      activeProductionJobs.forEach(job => {
          let status = 'Bongkar';
          
          // Logic: If unit has admin hurdles, put in "Persiapan Kendaraan"
          if (ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan)) {
              status = "Persiapan Kendaraan";
          } else {
              status = STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar';
          }
          
          if (columns[status]) columns[status].push(job);
      });
      return columns;
  }, [activeProductionJobs]);

  // Mechanic Workload Calculation (Current Workload)
  const mechanicWorkload = useMemo(() => {
      const workload: Record<string, number> = {};
      (settings.mechanicNames || []).forEach(m => workload[m] = 0);
      
      activeProductionJobs.forEach((j: Job) => {
          const currentStage = j.statusPekerjaan || 'Bongkar';
          const currentPIC = j.assignedMechanics?.find(a => a.stage === currentStage)?.name;
          
          if (currentPIC && workload[currentPIC as string] !== undefined) {
              workload[currentPIC as string]++;
          }
      });
      return workload;
  }, [activeProductionJobs, settings]);

  // --- HANDLERS ---
  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      // If unit is in administrative hurdle, it must be moved to WIP first or handled by Admin
      if (ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) && direction === 'next') {
          if (!window.confirm(`Unit ini berstatus '${job.statusKendaraan}'. Paksa lanjut ke produksi (Bongkar)?`)) return;
          
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              statusKendaraan: 'Work In Progress',
              statusPekerjaan: 'Bongkar',
              updatedAt: serverTimestamp()
          });
          showNotification("Unit diaktifkan ke produksi.", "success");
          return;
      }

      let currentIndex = STAGES.indexOf(job.statusPekerjaan);
      if (currentIndex === -1) currentIndex = 1; // Default to Bongkar if status unrecognized

      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (direction === 'next') {
          if (newIndex >= STAGES.length) {
              if(window.confirm("Unit sudah selesai QC. Tandai sebagai 'Selesai' (Ready For Delivery)?")) {
                   await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
                       statusPekerjaan: 'Selesai',
                       statusKendaraan: 'Selesai',
                       posisiKendaraan: 'Di Bengkel',
                       updatedAt: serverTimestamp()
                   });
                   showNotification("Unit ditandai Selesai / Ready.", "success");
              }
              return;
          }
          
          const newStage = STAGES[newIndex];
          const logEntry: ProductionLog = {
              stage: newStage,
              timestamp: new Date().toISOString(),
              user: userPermissions.role,
              type: 'progress'
          };

          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              statusPekerjaan: newStage,
              productionLogs: arrayUnion(logEntry),
              updatedAt: serverTimestamp() 
          });
          showNotification(`Update: ${newStage}`, "success");
      } 
      else if (direction === 'prev') {
          if (newIndex < 0) return;

          const reason = window.prompt(`Konfirmasi RE-WORK ke Stall ${STAGES[newIndex]}.\n\nMasukkan alasan re-work (wajib):`);
          if (!reason || !reason.trim()) {
              showNotification("Gagal: Alasan re-work harus diisi.", "error");
              return;
          }

          const newStage = STAGES[newIndex];
          const logEntry: ProductionLog = {
              stage: newStage,
              timestamp: new Date().toISOString(),
              user: userPermissions.role,
              note: reason,
              type: 'rework'
          };

          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              statusPekerjaan: newStage,
              productionLogs: arrayUnion(logEntry),
              updatedAt: serverTimestamp() 
          });
          showNotification(`Re-work dicatat: Kembali ke ${newStage}`, "info");
      }
  };

  const handleRequestAddition = async (job: Job) => {
      const detail = window.prompt("Detail Tambahan Jasa/Part yang diminta tim produksi:");
      if (!detail || !detail.trim()) return;

      if (!window.confirm("Kirim request tambahan ke Admin Klaim? Unit akan dipindahkan ke status 'Banding Harga SPK'.")) return;

      try {
          const logEntry: ProductionLog = {
              stage: job.statusPekerjaan || 'Bongkar',
              timestamp: new Date().toISOString(),
              user: userPermissions.role,
              note: `REQUEST TAMBAHAN: ${detail}`,
              type: 'rework'
          };

          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              statusKendaraan: 'Banding Harga SPK',
              productionLogs: arrayUnion(logEntry),
              updatedAt: serverTimestamp()
          });
          showNotification("Request dikirim. Unit pindah ke Antrian Banding.", "success");
      } catch (e) {
          showNotification("Gagal mengirim request.", "error");
      }
  };

  const handleAssignMechanic = async (job: Job, mechanicName: string) => {
      let currentStage = STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar';
      if (ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan)) currentStage = "Persiapan Kendaraan";

      try {
          const assignment: MechanicAssignment = {
              name: mechanicName,
              stage: currentStage,
              assignedAt: new Date().toISOString()
          };

          const currentAssignments = [...(job.assignedMechanics || [])];
          const existingIdx = currentAssignments.findIndex(a => a.stage === currentStage);
          
          if (existingIdx >= 0) {
              currentAssignments[existingIdx] = assignment;
          } else {
              currentAssignments.push(assignment);
          }

          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              assignedMechanics: currentAssignments,
              mechanicName: mechanicName
          });
          
          setAssigningJobId(null);
          showNotification(`Mekanik ${mechanicName} ditugaskan di stall ${currentStage}.`, "success");
      } catch (e) {
          showNotification("Gagal assign mekanik.", "error");
      }
  };

  const checkBottleneck = (job: Job) => {
      if (!job.updatedAt) return false; 
      const lastUpdate = (job as any).updatedAt || job.createdAt;
      const ms = lastUpdate.seconds ? lastUpdate.seconds * 1000 : new Date(lastUpdate).getTime();
      const diffDays = (Date.now() - ms) / (1000 * 3600 * 24);
      return diffDays > 3;
  };

  const productivityData = useMemo(() => {
      const completedJobs = jobs.filter(j => {
          if (!j.isClosed || !j.closedAt) return false;
          const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
      });

      const report: Record<string, { totalJobs: number, totalPanels: number, jobList: Job[] }> = {};
      (settings.mechanicNames || []).forEach(m => {
          report[m] = { totalJobs: 0, totalPanels: 0, jobList: [] };
      });

      completedJobs.forEach(j => {
          const uniqueMechanics = Array.from(new Set(j.assignedMechanics?.map(a => a.name) || [])) as string[];
          const panels = j.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;

          uniqueMechanics.forEach((mName: string) => {
              if (report[mName]) {
                  report[mName].totalJobs += 1;
                  report[mName].totalPanels += panels;
                  report[mName].jobList.push(j);
              }
          });
      });
      return report;
  }, [jobs, reportMonth, reportYear, settings.mechanicNames]);

  return (
    <div className="space-y-6 animate-fade-in pb-4 h-[calc(100vh-100px)] flex flex-col">
        {/* HEADER & METRICS */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 rounded-xl shadow-sm text-white">
                    <Hammer size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Job Control Board</h1>
                    <p className="text-sm text-gray-500 font-medium">Monitoring Produksi Multi-Mekanik & Administrasi Bengkel</p>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Cari Unit / Nopol..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-50 w-64"
                    />
                </div>
                <button 
                    onClick={() => setShowProductivityReport(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-indigo-700 shadow-sm"
                >
                    <BarChart2 size={16}/> Laporan Gaji (Panel)
                </button>
            </div>
        </div>

        {/* MECHANIC WORKLOAD STRIP */}
        <div className="flex gap-4 overflow-x-auto pb-2 shrink-0 scrollbar-thin">
            {(settings.mechanicNames || []).map(mech => (
                <div key={mech} className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center gap-3 min-w-[150px]">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                        <User size={14}/>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Load Stall</p>
                        <p className="text-xs font-bold text-gray-800">{mech}</p>
                    </div>
                    <div className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${mechanicWorkload[mech] > 2 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {mechanicWorkload[mech] || 0}
                    </div>
                </div>
            ))}
        </div>

        {/* KANBAN BOARD */}
        <div className="flex-grow overflow-x-auto pb-4">
            <div className="flex gap-4 h-full min-w-max px-2">
                {STAGES.map((stage) => {
                    const jobsInStage = boardData[stage] || [];
                    const isPersiapan = stage === "Persiapan Kendaraan";
                    
                    return (
                        <div key={stage} className={`w-80 flex flex-col h-full rounded-xl border border-gray-200 shadow-inner ${isPersiapan ? 'bg-amber-50/30' : 'bg-gray-100'}`}>
                            <div className="p-3 border-b border-gray-200 bg-white rounded-t-xl flex justify-between items-center sticky top-0 z-10">
                                <div className="flex items-center gap-2">
                                    {isPersiapan && <FileSearch size={16} className="text-amber-500"/>}
                                    <h3 className={`font-bold text-sm uppercase ${isPersiapan ? 'text-amber-700' : 'text-gray-700'}`}>{stage}</h3>
                                </div>
                                <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{jobsInStage.length}</span>
                            </div>

                            <div className="p-2 flex-grow overflow-y-auto space-y-3 scrollbar-thin">
                                {jobsInStage.map(job => {
                                    const isBottleneck = checkBottleneck(job);
                                    const hasRework = job.productionLogs?.some(l => l.type === 'rework');
                                    const isAdminPending = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan);
                                    const currentPIC = job.assignedMechanics?.find(a => a.stage === (isAdminPending ? 'Persiapan Kendaraan' : job.statusPekerjaan || 'Bongkar'))?.name;
                                    
                                    return (
                                        <div key={job.id} className={`bg-white p-3 rounded-lg shadow-sm border-l-4 transition-all hover:shadow-md ${isAdminPending ? 'border-l-amber-500 ring-1 ring-amber-100' : isBottleneck ? 'border-l-red-500 ring-1 ring-red-200' : hasRework ? 'border-l-orange-400' : 'border-l-blue-500'}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-black text-gray-800 text-sm tracking-tight">{job.policeNumber}</span>
                                                <div className="flex items-center gap-1.5">
                                                    {isAdminPending && <AlertCircle size={14} className="text-amber-500" title={job.statusKendaraan}/>}
                                                    {hasRework && <RefreshCcw size={14} className="text-orange-500" title="Pernah Re-work"/>}
                                                    {isBottleneck && <AlertTriangle size={14} className="text-red-500 animate-pulse" title="Unit diam > 3 hari"/>}
                                                    <button onClick={() => setViewHistoryJob(job)} className="p-1 hover:bg-gray-100 rounded transition-colors">
                                                        <History size={14} className="text-gray-400"/>
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <p className="text-[11px] font-bold text-gray-500 mb-1 truncate uppercase">{job.carModel} | {job.customerName}</p>
                                            
                                            {isAdminPending && (
                                                <div className="mb-2 px-2 py-1 bg-amber-50 rounded border border-amber-100 text-[9px] font-black text-amber-700 uppercase flex items-center gap-1">
                                                    {job.statusKendaraan === 'Banding Harga SPK' ? <Calculator size={10}/> : job.statusKendaraan === 'Tunggu Part' ? <PackageSearch size={10}/> : <FileSearch size={10}/>}
                                                    KENDALA: {job.statusKendaraan}
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between mb-3">
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-black border border-gray-200 flex items-center gap-1">
                                                    <Calendar size={10}/> {job.tanggalMasuk ? new Date(job.tanggalMasuk).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}) : '-'}
                                                </span>
                                                <span className="text-[10px] font-bold text-indigo-600">{(job.estimateData?.jasaItems?.reduce((a,b) => a+(b.panelCount||0),0)||0).toFixed(1)} PNL</span>
                                            </div>

                                            <div className="mb-3">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">PIC {isPersiapan ? 'Staging' : stage}:</label>
                                                {currentPIC ? (
                                                    <div 
                                                        className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded p-1.5 cursor-pointer hover:bg-indigo-100"
                                                        onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)}
                                                    >
                                                        <User size={12} className="text-indigo-600"/>
                                                        <span className="text-xs font-bold text-indigo-700 truncate">{currentPIC}</span>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)}
                                                        className="w-full py-1 border border-dashed border-gray-300 rounded text-xs text-gray-400 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center gap-1"
                                                    >
                                                        <Wrench size={12}/> Tunjuk Mekanik
                                                    </button>
                                                )}

                                                {assigningJobId === job.id && (
                                                    <div className="mt-2 grid grid-cols-2 gap-1 bg-gray-50 p-2 rounded border border-gray-200 animate-fade-in shadow-inner z-20 relative">
                                                        {(settings.mechanicNames || []).map(m => (
                                                            <button 
                                                                key={m}
                                                                onClick={(e) => { e.stopPropagation(); handleAssignMechanic(job, m); }}
                                                                className={`text-[10px] p-1.5 border rounded text-left truncate transition-colors ${currentPIC === m ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white hover:bg-indigo-50 text-gray-700'}`}
                                                            >
                                                                {m}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
                                                <button 
                                                    onClick={() => handleMoveStage(job, 'prev')}
                                                    disabled={isPersiapan}
                                                    className={`p-1.5 rounded-lg border transition-all ${isPersiapan ? 'opacity-0' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'}`}
                                                    title="Mundur Stall (Re-Work)"
                                                >
                                                    <ChevronRight size={18} className="rotate-180"/>
                                                </button>
                                                
                                                <button 
                                                    onClick={() => handleRequestAddition(job)}
                                                    className="p-1.5 rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-200 transition-all"
                                                    title="Request Tambah Jasa/Part"
                                                >
                                                    <AlertCircle size={18}/>
                                                </button>

                                                <button 
                                                    onClick={() => handleMoveStage(job, 'next')}
                                                    className="bg-indigo-600 text-white rounded-lg p-1.5 hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all active:scale-95"
                                                    title={isAdminPending ? "Proses ke Produksi (Bongkar)" : "Lanjut Stall"}
                                                >
                                                    <ChevronRight size={18}/>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* MODAL HISTORY LOGS */}
        <Modal 
            isOpen={!!viewHistoryJob} 
            onClose={() => setViewHistoryJob(null)} 
            title={`Log Produksi & PIC - ${viewHistoryJob?.policeNumber}`}
        >
            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase">Pelanggan</p>
                        <p className="text-sm font-bold text-gray-800">{viewHistoryJob?.customerName}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase">Unit</p>
                        <p className="text-sm font-bold text-gray-800">{viewHistoryJob?.carModel}</p>
                    </div>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                    <h4 className="text-xs font-black text-indigo-900 border-b pb-1 mb-2 uppercase tracking-widest">History PIC per Stall</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                        {(viewHistoryJob?.assignedMechanics || []).map((pic, idx) => (
                            <div key={idx} className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-3">
                                <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm"><User size={16}/></div>
                                <div>
                                    <p className="text-[10px] font-black text-indigo-400 uppercase leading-none">{pic.stage}</p>
                                    <p className="text-sm font-black text-indigo-900">{pic.name}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h4 className="text-xs font-black text-indigo-900 border-b pb-1 mb-2 uppercase tracking-widest">Progress Timeline</h4>
                    {(viewHistoryJob?.productionLogs || []).length > 0 ? (
                        [...viewHistoryJob!.productionLogs!].reverse().map((log, idx) => (
                            <div key={idx} className={`p-4 rounded-xl border flex items-start gap-4 ${log.type === 'rework' ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
                                <div className={`p-2 rounded-lg ${log.type === 'rework' ? 'bg-orange-500 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                                    {log.type === 'rework' ? <RefreshCcw size={18}/> : <ArrowRight size={18}/>}
                                </div>
                                <div className="flex-grow">
                                    <div className="flex justify-between items-center mb-1">
                                        <h4 className={`text-sm font-black ${log.type === 'rework' ? 'text-orange-700' : 'text-indigo-700'}`}>
                                            {log.type === 'rework' ? 'RE-WORK:' : 'PROGRES:'} {log.stage}
                                        </h4>
                                        <span className="text-[10px] text-gray-400 font-medium">{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                                    </div>
                                    {log.note && (
                                        <p className="text-xs text-orange-900 bg-white/50 p-2 rounded border border-orange-100 mt-2 font-medium">
                                            <span className="font-black text-[10px] block mb-1">ALASAN RE-WORK:</span>
                                            {log.note}
                                        </p>
                                    )}
                                    <div className="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">Mover PIC: {log.user}</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-400 italic">Belum ada record log produksi.</div>
                    )}
                </div>
            </div>
        </Modal>

        {/* MODAL Gaji/Productivity Report */}
        <Modal isOpen={showProductivityReport} onClose={() => setShowProductivityReport(false)} title="Laporan Produktivitas & Gaji Panel" maxWidth="max-w-5xl">
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-bold text-gray-600">Periode:</label>
                        <select value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))} className="p-2 border rounded text-sm font-bold">{["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (<option key={i} value={i}>{m}</option>))}</select>
                        <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="p-2 border rounded text-sm font-bold">{[2023, 2024, 2025, 2026].map(y => (<option key={y} value={y}>{y}</option>))}</select>
                    </div>
                    <div className="md:ml-auto text-xs text-indigo-500 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-2">
                        <Info size={14}/> Hitungan berdasarkan seluruh mekanik yang terlibat dalam tiap stall (PIC) di unit yang sudah Closed.
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(productivityData).map(([mechanic, rawData]) => {
                        const data = rawData as { totalJobs: number, totalPanels: number, jobList: Job[] };
                        if (data.totalJobs === 0) return null;
                        
                        return (
                        <div key={mechanic} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                            <div className="flex items-center gap-4 mb-4 border-b pb-3">
                                <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg"><User size={20}/></div>
                                <div>
                                    <h3 className="font-black text-gray-800 text-lg leading-none uppercase">{mechanic}</h3>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">Mekanik Body & Paint</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Unit Selesai</p>
                                    <p className="text-xl font-black text-gray-800">{data.totalJobs}</p>
                                </div>
                                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase">Total Panel</p>
                                    <p className="text-xl font-black text-indigo-700">{data.totalPanels.toFixed(1)}</p>
                                </div>
                            </div>

                            <div className="flex-grow">
                                <p className="text-[10px] font-black text-gray-400 uppercase mb-2 px-1">Rincian Unit:</p>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                                    {data.jobList.map((job, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-[10px] p-2 bg-gray-50 rounded-lg border border-gray-100 group">
                                            <span className="font-bold text-gray-700">{job.policeNumber}</span>
                                            <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-black text-indigo-600">
                                                {(job.estimateData?.jasaItems?.reduce((a,b) => a+(b.panelCount||0),0)||0).toFixed(1)} PNL
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )})}
                    {Object.values(productivityData).every((d: any) => d.totalJobs === 0) && (
                        <div className="col-span-full py-20 text-center text-gray-400 italic">
                            <Layers size={48} className="mx-auto mb-4 opacity-20"/>
                            Belum ada data pengerjaan unit untuk periode ini.
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default JobControlView;
