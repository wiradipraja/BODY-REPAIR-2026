import React, { useState, useMemo } from 'react';
import { Job, Settings, UserPermissions } from '../../types';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatPoliceNumber, formatDateIndo } from '../../utils/helpers';
import { 
    Hammer, Clock, AlertTriangle, CheckCircle, ArrowRight, User, 
    MoreVertical, Briefcase, Calendar, ChevronRight, XCircle, Search, Wrench, BarChart2, Layers 
} from 'lucide-react';
import Modal from '../ui/Modal';

interface JobControlViewProps {
  jobs: Job[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
}

const STAGES = [
    "Bongkar",
    "Las Ketok",
    "Dempul",
    "Cat",
    "Pemasangan",
    "Poles",
    "Finishing",
    "Quality Control"
];

const JobControlView: React.FC<JobControlViewProps> = ({ jobs, settings, showNotification, userPermissions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  
  // Report Modal State
  const [showProductivityReport, setShowProductivityReport] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  // --- DATA PROCESSING ---
  const activeProductionJobs = useMemo(() => {
      const term = searchTerm.toUpperCase();
      return jobs.filter(j => 
          !j.isClosed && 
          j.woNumber && 
          !j.isDeleted &&
          j.posisiKendaraan === 'Di Bengkel' && // CRITICAL: Only units physically inside
          (j.statusKendaraan === 'Work In Progress' || j.statusKendaraan === 'Unit Rawat Jalan') && 
          (j.policeNumber.includes(term) || j.carModel.toUpperCase().includes(term) || j.customerName.toUpperCase().includes(term))
      );
  }, [jobs, searchTerm]);

  // Group Jobs by Stage
  const boardData = useMemo(() => {
      const columns: Record<string, Job[]> = {};
      STAGES.forEach(s => columns[s] = []);
      
      activeProductionJobs.forEach(job => {
          // Normalize status
          const status = STAGES.includes(job.statusPekerjaan) ? job.statusPekerjaan : 'Bongkar';
          if (columns[status]) columns[status].push(job);
      });
      return columns;
  }, [activeProductionJobs]);

  // Mechanic Workload Calculation (Current Active Jobs)
  const mechanicWorkload = useMemo(() => {
      const workload: Record<string, number> = {};
      (settings.mechanicNames || []).forEach(m => workload[m] = 0);
      
      activeProductionJobs.forEach(j => {
          if (j.mechanicName && workload[j.mechanicName] !== undefined) {
              workload[j.mechanicName]++;
          }
      });
      return workload;
  }, [activeProductionJobs, settings]);

  // --- REPORT DATA ---
  const productivityData = useMemo(() => {
      const completedJobs = jobs.filter(j => {
          // Only count closed jobs for payment calculation
          if (!j.isClosed || !j.closedAt) return false;
          
          const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
      });

      const report: Record<string, { totalJobs: number, totalPanels: number, jobList: Job[] }> = {};
      
      (settings.mechanicNames || []).forEach(m => {
          report[m] = { totalJobs: 0, totalPanels: 0, jobList: [] };
      });

      completedJobs.forEach(j => {
          if (j.mechanicName && report[j.mechanicName]) {
              report[j.mechanicName].totalJobs += 1;
              // Sum panel count from estimate
              const panels = j.estimateData?.jasaItems?.reduce((acc, item) => acc + (item.panelCount || 0), 0) || 0;
              report[j.mechanicName].totalPanels += panels;
              report[j.mechanicName].jobList.push(j);
          }
      });

      return report;
  }, [jobs, reportMonth, reportYear, settings.mechanicNames]);

  // --- HANDLERS ---
  const handleMoveStage = async (job: Job, direction: 'next' | 'prev') => {
      const currentIndex = STAGES.indexOf(job.statusPekerjaan);
      if (currentIndex === -1) return;

      let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      // Bounds check
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= STAGES.length) {
          // If next after QC -> Suggest Closing? Or just stay at QC
          if(window.confirm("Unit sudah selesai QC. Tandai sebagai 'Selesai' (Ready For Delivery)?")) {
               await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
                   statusPekerjaan: 'Selesai',
                   statusKendaraan: 'Selesai', // Ready for delivery
                   posisiKendaraan: 'Di Bengkel'
               });
               showNotification("Unit ditandai Selesai / Ready.", "success");
          }
          return;
      }

      const newStage = STAGES[newIndex];
      
      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), {
              statusPekerjaan: newStage,
              // Update timestamp for bottleneck calculation
              updatedAt: serverTimestamp() 
          });
          showNotification(`Status update: ${newStage}`, "success");
      } catch (e) {
          showNotification("Gagal update status", "error");
      }
  };

  const handleAssignMechanic = async (jobId: string, mechanicName: string) => {
      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, jobId), {
              mechanicName: mechanicName
          });
          setAssigningJobId(null);
          showNotification(`Mekanik ${mechanicName} ditugaskan.`, "success");
      } catch (e) {
          showNotification("Gagal assign mekanik.", "error");
      }
  };

  const checkBottleneck = (job: Job) => {
      // Logic: If last update > 3 days ago
      if (!job.updatedAt) return false; 
      const lastUpdate = (job as any).updatedAt || job.createdAt;
      const ms = lastUpdate.seconds ? lastUpdate.seconds * 1000 : new Date(lastUpdate).getTime();
      const diffDays = (Date.now() - ms) / (1000 * 3600 * 24);
      return diffDays > 3;
  };

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
                    <p className="text-sm text-gray-500 font-medium">Monitoring Produksi Real-time & Bottleneck</p>
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
                        className="pl-10 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64"
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
        <div className="flex gap-4 overflow-x-auto pb-2 shrink-0">
            {(settings.mechanicNames || []).map(mech => (
                <div key={mech} className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center gap-3 min-w-[140px]">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                        <User size={14}/>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase">Mekanik</p>
                        <p className="text-xs font-bold text-gray-800">{mech}</p>
                    </div>
                    <div className={`ml-auto px-2 py-0.5 rounded text-xs font-bold ${mechanicWorkload[mech] > 3 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
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
                    return (
                        <div key={stage} className="w-80 flex flex-col h-full rounded-xl bg-gray-100 border border-gray-200 shadow-inner">
                            {/* Column Header */}
                            <div className="p-3 border-b border-gray-200 bg-white rounded-t-xl flex justify-between items-center sticky top-0 z-10">
                                <h3 className="font-bold text-gray-700 text-sm uppercase">{stage}</h3>
                                <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{jobsInStage.length}</span>
                            </div>

                            {/* Column Body (Scrollable) */}
                            <div className="p-2 flex-grow overflow-y-auto space-y-3 scrollbar-thin">
                                {jobsInStage.map(job => {
                                    const isBottleneck = checkBottleneck(job);
                                    return (
                                        <div key={job.id} className={`bg-white p-3 rounded-lg shadow-sm border-l-4 transition-all hover:shadow-md ${isBottleneck ? 'border-l-red-500 ring-1 ring-red-200' : 'border-l-blue-500'}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-black text-gray-800 text-sm">{job.policeNumber}</span>
                                                {/* Removed title prop from AlertTriangle and wrapped it in a span with title to fix TS error */}
                                                {isBottleneck && (
                                                    <span title="Unit diam > 3 hari">
                                                        <AlertTriangle size={14} className="text-red-500 animate-pulse" />
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <p className="text-xs text-gray-500 font-medium mb-1 truncate">{job.carModel}</p>
                                            <p className="text-[10px] text-gray-400 mb-2 truncate">{job.customerName}</p>
                                            
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium border border-gray-200 flex items-center gap-1">
                                                    <Calendar size={10}/> {job.tanggalMasuk ? new Date(job.tanggalMasuk).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}) : '-'}
                                                </span>
                                            </div>

                                            {/* MECHANIC ASSIGNMENT */}
                                            <div className="mb-3">
                                                {job.mechanicName ? (
                                                    <div 
                                                        className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded p-1.5 cursor-pointer hover:bg-indigo-100"
                                                        onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)}
                                                    >
                                                        <User size={12} className="text-indigo-600"/>
                                                        <span className="text-xs font-bold text-indigo-700">{job.mechanicName}</span>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => setAssigningJobId(assigningJobId === job.id ? null : job.id)}
                                                        className="w-full py-1 border border-dashed border-gray-300 rounded text-xs text-gray-400 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center gap-1"
                                                    >
                                                        <Wrench size={12}/> Pilih Mekanik
                                                    </button>
                                                )}

                                                {assigningJobId === job.id && (
                                                    <div className="mt-2 grid grid-cols-2 gap-1 bg-gray-50 p-2 rounded border border-gray-200 animate-fade-in">
                                                        {(settings.mechanicNames || []).map(m => (
                                                            <button 
                                                                key={m}
                                                                onClick={() => handleAssignMechanic(job.id, m)}
                                                                className="text-[10px] p-1 bg-white border rounded hover:bg-indigo-50 hover:text-indigo-700 text-left truncate"
                                                            >
                                                                {m}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* ACTION BUTTONS */}
                                            <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
                                                <button 
                                                    onClick={() => handleMoveStage(job, 'prev')}
                                                    disabled={stage === STAGES[0]}
                                                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-1"
                                                    title="Mundur Tahap"
                                                >
                                                    <ChevronRight size={16} className="rotate-180"/>
                                                </button>
                                                
                                                <span className="text-[10px] font-bold text-blue-600">
                                                    {stage}
                                                </span>

                                                <button 
                                                    onClick={() => handleMoveStage(job, 'next')}
                                                    className="bg-blue-600 text-white rounded-full p-1 hover:bg-blue-700 shadow-sm"
                                                    title="Lanjut Tahap Berikutnya"
                                                >
                                                    <ChevronRight size={16}/>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {jobsInStage.length === 0 && (
                                    <div className="text-center py-10 opacity-30">
                                        <div className="w-12 h-12 bg-gray-300 rounded-full mx-auto mb-2"></div>
                                        <p className="text-xs font-bold text-gray-500">Kosong</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* MODAL REPORT */}
        <Modal 
            isOpen={showProductivityReport} 
            onClose={() => setShowProductivityReport(false)} 
            title="Laporan Produktivitas Mekanik (Flat Rate)"
            maxWidth="max-w-4xl"
        >
            <div className="space-y-6">
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="text-sm font-bold text-gray-600">Periode Laporan:</label>
                    <select 
                        value={reportMonth} 
                        onChange={e => setReportMonth(Number(e.target.value))}
                        className="p-2 border rounded text-sm"
                    >
                        {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                            <option key={i} value={i}>{m}</option>
                        ))}
                    </select>
                    <select 
                        value={reportYear} 
                        onChange={e => setReportYear(Number(e.target.value))}
                        className="p-2 border rounded text-sm"
                    >
                        {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(productivityData).map(([mechanic, rawData]) => {
                        const data = rawData as { totalJobs: number, totalPanels: number, jobList: Job[] };
                        return (
                        <div key={mechanic} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-3 mb-3 border-b pb-2">
                                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-full"><User size={20}/></div>
                                <h3 className="font-bold text-gray-800">{mechanic}</h3>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">Unit Selesai</span>
                                    <span className="font-bold text-gray-800">{data.totalJobs}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">Total Panel</span>
                                    <span className="font-black text-xl text-indigo-600">{data.totalPanels.toFixed(1)}</span>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Detail Pekerjaan</p>
                                <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                                    {data.jobList.map(j => (
                                        <div key={j.id} className="flex justify-between">
                                            <span>{j.policeNumber}</span>
                                            <span className="text-gray-500">{(j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0).toFixed(1)} Pnl</span>
                                        </div>
                                    ))}
                                    {data.jobList.length === 0 && <p className="text-gray-300 italic">Belum ada data selesai.</p>}
                                </div>
                            </div>
                        </div>
                    )})}
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default JobControlView;