
import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions, ProductionLog, MechanicAssignment } from '../../types';
import { doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatPoliceNumber, formatDateIndo } from '../../utils/helpers';
import { 
    Hammer, Clock, AlertTriangle, CheckCircle, ArrowRight, User, 
    MoreVertical, Briefcase, Calendar, ChevronRight, XCircle, Search, Wrench, BarChart2, Layers, History, RefreshCcw, MessageSquare, Info, AlertCircle, FileSearch, PackageSearch, Calculator, CheckCircle2, Crown, Timer, CalendarClock
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
    "Quality Control",
    "Selesai (Tunggu Pengambilan)" // NEW FINAL STAGE
];

const ADMIN_HURDLE_STATUSES = [
    "Banding Harga SPK",
    "Tunggu Part",
    "Tunggu SPK Asuransi",
    "Tunggu Estimasi"
];

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        title: "Job Control Board",
        subtitle: "Monitoring Produksi Multi-Mekanik & Administrasi Bengkel",
        search: "Cari Unit / Nopol...",
        btn_report: "Laporan Gaji (Panel)",
        load_stall: "Load Stall",
        pic_label: "PIC",
        btn_assign: "Tunjuk Mekanik",
        btn_request: "Request Tambah Jasa/Part",
        hurdle_label: "KENDALA",
        history_title: "Log Produksi & PIC",
        "Persiapan Kendaraan": "Persiapan Kendaraan",
        "Bongkar": "Bongkar",
        "Las Ketok": "Las Ketok",
        "Dempul": "Dempul",
        "Cat": "Cat",
        "Pemasangan": "Pemasangan",
        "Poles": "Poles",
        "Finishing": "Finishing",
        "Quality Control": "Quality Control",
        "Selesai (Tunggu Pengambilan)": "Unit Selesai (Tunggu Pengambilan)"
    },
    en: {
        title: "Job Control Board",
        subtitle: "Multi-Mechanic Production & Admin Monitoring",
        search: "Search Vehicle / Plate...",
        btn_report: "Panel Wages Report",
        load_stall: "Stall Load",
        pic_label: "PIC",
        btn_assign: "Assign Mechanic",
        btn_request: "Request Additional Job/Part",
        hurdle_label: "HURDLE",
        history_title: "Production Log & PIC",
        "Persiapan Kendaraan": "Staging Area",
        "Bongkar": "Disassembly",
        "Las Ketok": "Panel Beating",
        "Dempul": "Body Filler",
        "Cat": "Painting",
        "Pemasangan": "Reassembly",
        "Poles": "Polishing",
        "Finishing": "Finishing",
        "Quality Control": "QC Audit",
        "Selesai (Tunggu Pengambilan)": "Finished (Ready for Collection)"
    }
};

const JobControlView: React.FC<JobControlViewProps> = ({ jobs, settings, showNotification, userPermissions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [showProductivityReport, setShowProductivityReport] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [viewHistoryJob, setViewHistoryJob] = useState<Job | null>(null);

  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const activeProductionJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      return jobs.filter(j => 
          !j.isClosed && j.woNumber && !j.isDeleted && j.posisiKendaraan === 'Di Bengkel' && 
          (
            j.statusKendaraan === 'Work In Progress' || 
            j.statusKendaraan === 'Unit Rawat Jalan' || 
            j.statusKendaraan === 'Booking Masuk' || 
            j.statusKendaraan === 'Selesai (Tunggu Pengambilan)' || 
            ADMIN_HURDLE_STATUSES.includes(j.statusKendaraan)
          ) && 
          (j.policeNumber.includes(term) || j.carModel.toUpperCase().includes(term) || j.customerName.toUpperCase().includes(term))
      );
  }, [jobs, searchTerm]);

  const boardData = useMemo(() => {
      const columns: Record<string, Job[]> = {};
      STAGES.forEach(s => columns[s] = []);
      activeProductionJobs.forEach(job => {
          let status = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) ? "Persiapan Kendaraan" : (STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar');
          
          if (job.statusKendaraan === 'Selesai (Tunggu Pengambilan)') status = "Selesai (Tunggu Pengambilan)";
          
          if (columns[status]) columns[status].push(job);
      });
      return columns;
  }, [activeProductionJobs]);

  const mechanicWorkload = useMemo(() => {
      const workload: Record<string, number> = {};
      (settings.mechanicNames || []).forEach(m => workload[m] = 0);
      activeProductionJobs.forEach((j: Job) => {
          const currentPIC = j.assignedMechanics?.find(a => a.stage === (j.statusPekerjaan || 'Bongkar'))?.name;
          if (currentPIC && workload[currentPIC as string] !== undefined) workload[currentPIC as string]++;
      });
      return workload;
  }, [activeProductionJobs, settings]);

  const getJobProgress = (job: Job) => {
      const start = job.actualStartDate ? new Date(job.actualStartDate) : new Date(job.createdAt.seconds * 1000);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - start.getTime());
      const daysRunning = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 

      let daysRemaining = null;
      if (job.tanggalEstimasiSelesai) {
          const est = new Date(job.tanggalEstimasiSelesai);
          const remTime = est.getTime() - now.getTime();
          daysRemaining = Math.ceil(remTime / (1000 * 60 * 60 * 24));
      }

      return { daysRunning, daysRemaining };
  };

  const toggleVVIP = async (job: Job) => {
      if (!userPermissions.role.includes('Manager')) {
          showNotification("Hanya Manager bisa set status VVIP", "error");
          return;
      }
      const newStatus = !job.isVVIP;
      await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { isVVIP: newStatus });
      showNotification(newStatus ? "Unit diset VVIP (Prioritas)" : "Status VVIP dihapus", "success");
  };

  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      if (ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) && direction === 'next') {
          if (!window.confirm(`Unit berstatus '${job.statusKendaraan}'. Lanjut ke produksi?`)) return;
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { statusKendaraan: 'Work In Progress', statusPekerjaan: 'Bongkar', updatedAt: serverTimestamp() });
          showNotification("Unit aktif ke produksi.", "success");
          return;
      }

      let currentIndex = STAGES.indexOf(job.statusPekerjaan);
      if (currentIndex === -1) currentIndex = 1;
      
      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (direction === 'next') {
          if (newIndex >= STAGES.length) {
              showNotification("Unit sudah di tahap akhir produksi.", "info");
              return;
          }
          
          const newStage = STAGES[newIndex];
          const isFinalStage = newStage === "Selesai (Tunggu Pengambilan)";

          // --- TRIGGER LOGIC START ---
          // Jika pindah ke BONGKAR (Awal Produksi) dan belum ada Start Date
          const updatePayload: any = { 
              statusPekerjaan: newStage, 
              statusKendaraan: isFinalStage ? 'Selesai (Tunggu Pengambilan)' : job.statusKendaraan,
              productionLogs: arrayUnion({ stage: newStage, timestamp: new Date().toISOString(), user: userPermissions.role, type: 'progress' }), 
              updatedAt: serverTimestamp() 
          };

          if (newStage === 'Bongkar' && !job.actualStartDate) {
              const estDate = window.prompt("Unit masuk Produksi (Bongkar). Masukkan Tanggal Estimasi Selesai (YYYY-MM-DD):", new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0]);
              if (estDate) {
                  updatePayload.actualStartDate = new Date().toISOString();
                  updatePayload.tanggalEstimasiSelesai = estDate;
                  showNotification("Timer Produksi Dimulai!", "success");
              } else {
                  if(!window.confirm("Tanpa estimasi selesai? Klik OK untuk lanjut tanpa tanggal.")) return;
              }
          }
          // --- TRIGGER LOGIC END ---

          const confirmMsg = isFinalStage 
            ? "Tandai perbaikan SELESAI? Unit akan diteruskan ke Tim CRC untuk memanggil pemilik." 
            : `Pindahkan unit ke stall ${newStage}?`;

          if(!window.confirm(confirmMsg)) return;

          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), updatePayload);
          showNotification(isFinalStage ? "Unit Selesai & CRC Notified." : `Update: ${newStage}`, "success");

      } else if (direction === 'prev' && newIndex >= 0) {
          const reason = window.prompt(`Alasan re-work ke ${STAGES[newIndex]}:`);
          if (!reason) return;
          const newStage = STAGES[newIndex];
          const isFromFinal = job.statusPekerjaan === "Selesai (Tunggu Pengambilan)";
          
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
              statusPekerjaan: newStage, 
              statusKendaraan: isFromFinal ? 'Work In Progress' : job.statusKendaraan,
              productionLogs: arrayUnion({ stage: newStage, timestamp: new Date().toISOString(), user: userPermissions.role, note: reason, type: 'rework' }), 
              updatedAt: serverTimestamp() 
          });
          showNotification(`Re-work: ${newStage}`, "info");
      }
  };

  const handleRequestAddition = async (job: Job) => {
      const detail = window.prompt("Detail Tambahan:");
      if (!detail) return;
      await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { statusKendaraan: 'Banding Harga SPK', productionLogs: arrayUnion({ stage: job.statusPekerjaan || 'Bongkar', timestamp: new Date().toISOString(), user: userPermissions.role, note: `REQUEST TAMBAHAN: ${detail}`, type: 'rework' }), updatedAt: serverTimestamp() });
      showNotification("Request terkirim.", "success");
  };

  const handleAssignMechanic = async (job: Job, mechanicName: string) => {
      let currentStage = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan) ? "Persiapan Kendaraan" : (STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar');
      const currentAssignments = [...(job.assignedMechanics || [])];
      const existingIdx = currentAssignments.findIndex(a => a.stage === currentStage);
      const assignment = { name: mechanicName, stage: currentStage, assignedAt: new Date().toISOString() };
      if (existingIdx >= 0) currentAssignments[existingIdx] = assignment;
      else currentAssignments.push(assignment);
      await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { assignedMechanics: currentAssignments, mechanicName });
      setAssigningJobId(null);
      showNotification(`Mechanic Assigned.`, "success");
  };

  return (
    <div className="space-y-6 animate-fade-in pb-4 h-[calc(100vh-100px)] flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm shrink-0">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 rounded-xl shadow-sm text-white"><Hammer size={24}/></div>
                <div><h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1><p className="text-sm text-gray-500 font-medium">{t('subtitle')}</p></div>
            </div>
            <div className="flex items-center gap-3">
                <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-400" size={18}/><input type="text" placeholder={t('search')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-50 w-64"/></div>
                <button onClick={() => setShowProductivityReport(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-indigo-700 shadow-sm"><BarChart2 size={16}/> {t('btn_report')}</button>
            </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 shrink-0 scrollbar-thin">
            {(settings.mechanicNames || []).map(mech => (
                <div key={mech} className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center gap-3 min-w-[150px]">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600"><User size={14}/></div>
                    <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('load_stall')}</p><p className="text-xs font-bold text-gray-800">{mech}</p></div>
                    <div className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${mechanicWorkload[mech] > 2 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{mechanicWorkload[mech] || 0}</div>
                </div>
            ))}
        </div>

        <div className="flex-grow overflow-x-auto pb-4">
            <div className="flex gap-4 h-full min-w-max px-2">
                {STAGES.map((stage) => {
                    const jobsInStage = boardData[stage] || [];
                    const isPersiapan = stage === "Persiapan Kendaraan";
                    const isFinal = stage === "Selesai (Tunggu Pengambilan)";
                    
                    return (
                        <div key={stage} className={`w-80 flex flex-col h-full rounded-xl border border-gray-200 shadow-inner ${isPersiapan ? 'bg-amber-50/30' : isFinal ? 'bg-emerald-50/30' : 'bg-gray-100'}`}>
                            <div className="p-3 border-b border-gray-200 bg-white rounded-t-xl flex justify-between items-center sticky top-0 z-10">
                                <div className="flex items-center gap-2">
                                    {isPersiapan ? <FileSearch size={16} className="text-amber-500"/> : isFinal ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Wrench size={16} className="text-gray-400"/>}
                                    <h3 className={`font-bold text-sm uppercase ${isPersiapan ? 'text-amber-700' : isFinal ? 'text-emerald-700' : 'text-gray-700'}`}>{t(stage)}</h3>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFinal ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{jobsInStage.length}</span>
                            </div>
                            <div className="p-2 flex-grow overflow-y-auto space-y-3 scrollbar-thin">
                                {jobsInStage.map(job => {
                                    const isAdminPending = ADMIN_HURDLE_STATUSES.includes(job.statusKendaraan);
                                    const currentPIC = job.assignedMechanics?.find(a => a.stage === (isAdminPending ? 'Persiapan Kendaraan' : job.statusPekerjaan || 'Bongkar'))?.name;
                                    const { daysRunning, daysRemaining } = getJobProgress(job);
                                    
                                    return (
                                        <div key={job.id} className={`bg-white p-3 rounded-lg shadow-sm border-l-4 transition-all hover:shadow-md relative ${job.isVVIP ? 'border-l-yellow-400 ring-2 ring-yellow-200' : isAdminPending ? 'border-l-amber-500 ring-1 ring-amber-100' : isFinal ? 'border-l-emerald-500' : 'border-l-blue-500'}`}>
                                            {job.isVVIP && <div className="absolute -top-2 -right-2 bg-yellow-400 text-white p-1 rounded-full shadow-sm z-10"><Crown size={14} fill="currentColor"/></div>}
                                            
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-black text-gray-800 text-sm tracking-tight">{job.policeNumber}</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => toggleVVIP(job)} className={`p-1 rounded transition-colors ${job.isVVIP ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300 hover:text-yellow-500'}`} title="Set VVIP"><Crown size={14}/></button>
                                                    <button onClick={() => setViewHistoryJob(job)} className="p-1 hover:bg-gray-100 rounded transition-colors"><History size={14} className="text-gray-400"/></button>
                                                </div>
                                            </div>
                                            <p className="text-[11px] font-bold text-gray-500 mb-1 truncate uppercase">{job.carModel} | {job.customerName}</p>
                                            
                                            {/* Progress Indicators */}
                                            {!isAdminPending && !isFinal && (
                                                <div className="flex gap-2 my-2">
                                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black border ${daysRunning > 14 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                        <Timer size={10}/> {daysRunning} Hari Jalan
                                                    </div>
                                                    {daysRemaining !== null && (
                                                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black border ${daysRemaining < 0 ? 'bg-red-50 text-red-600 border-red-100' : daysRemaining < 3 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                                            <CalendarClock size={10}/> {daysRemaining < 0 ? `Telat ${Math.abs(daysRemaining)} Hr` : `Sisa ${daysRemaining} Hr`}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {isAdminPending && <div className="mb-2 px-2 py-1 bg-amber-50 rounded border border-amber-100 text-[9px] font-black text-amber-700 uppercase">{t('hurdle_label')}: {job.statusKendaraan}</div>}
                                            
                                            <div className="mb-3">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('pic_label')}:</label>
                                                {currentPIC ? (
                                                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded p-1.5 cursor-pointer hover:bg-indigo-100" onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)}>
                                                        <User size={12} className="text-indigo-600"/><span className="text-xs font-bold text-indigo-700 truncate">{currentPIC}</span>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)} className="w-full py-1 border border-dashed border-gray-300 rounded text-xs text-gray-400 hover:text-indigo-600 flex items-center justify-center gap-1"><Wrench size={12}/> {t('btn_assign')}</button>
                                                )}
                                                {assigningJobId === job.id && (
                                                    <div className="mt-2 grid grid-cols-2 gap-1 bg-gray-50 p-2 rounded border border-gray-200 shadow-inner z-20 relative animate-pop-in">
                                                        {(settings.mechanicNames || []).map(m => <button key={m} onClick={(e) => { e.stopPropagation(); handleAssignMechanic(job, m); }} className={`text-[10px] p-1.5 border rounded text-left truncate transition-colors ${currentPIC === m ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-indigo-50'}`}>{m}</button>)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
                                                <button onClick={() => handleMoveStage(job, 'prev')} disabled={isPersiapan} className={`p-1.5 rounded-lg border transition-all ${isPersiapan ? 'opacity-0' : 'bg-orange-50 text-orange-600 border-orange-200'}`}><ChevronRight size={18} className="rotate-180"/></button>
                                                <button onClick={() => handleRequestAddition(job)} className="p-1.5 rounded-lg border border-red-100 bg-red-50 text-red-600" title={t('btn_request')}><AlertCircle size={18}/></button>
                                                <button onClick={() => handleMoveStage(job, 'next')} disabled={isFinal} className={`rounded-lg p-1.5 shadow-md transform active:scale-95 transition-all ${isFinal ? 'bg-gray-300 text-white opacity-20' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}><ChevronRight size={18}/></button>
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
    </div>
  );
};

export default JobControlView;
