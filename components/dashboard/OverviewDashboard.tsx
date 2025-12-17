import React, { useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Users, Car, Wrench, CheckCircle, TrendingUp, AlertCircle, Clock, Database, ChevronRight } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface OverviewProps {
  allJobs: Job[];
  settings: Settings;
  onNavigate: (view: string) => void;
}

const StatCard = ({ title, value, icon: Icon, color, subValue, onClick }: any) => (
  <div 
    onClick={onClick}
    className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100 hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer group relative overflow-hidden"
  >
    <div className={`absolute top-0 right-0 w-24 h-24 ${color} opacity-[0.03] -mr-8 -mt-8 rounded-full transition-transform group-hover:scale-110`}></div>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
        <h3 className="text-3xl font-black text-gray-900 tracking-tighter">{value}</h3>
        {subValue && (
          <div className="flex items-center gap-1 mt-2">
            <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">{subValue}</p>
          </div>
        )}
      </div>
      <div className={`p-4 rounded-2xl shadow-lg shadow-current/10 ${color} text-white`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  </div>
);

const OverviewDashboard: React.FC<OverviewProps> = ({ allJobs, settings, onNavigate }) => {
  const stats = useMemo(() => {
    // Total Database Unit: Semua data yang tersimpan (exclude soft-deleted)
    const totalJobs = allJobs.length;
    
    // Unit Aktif (WIP): Unit yang sudah generate WO dan Belum Closed
    const activeJobs = allJobs.filter(j => j.woNumber && !j.isClosed).length;
    
    // Siap Diserahkan: Sudah status selesai tapi belum Closed (menunggu ambil)
    const completedJobs = allJobs.filter(j => j.statusPekerjaan === 'Selesai' && !j.isClosed).length;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const jobsThisMonth = allJobs.filter(j => {
      const d = j.createdAt?.toDate ? j.createdAt.toDate() : new Date();
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const revenueThisMonth = jobsThisMonth.reduce((acc, curr) => acc + (curr.estimateData?.grandTotal || 0), 0);
    
    const statusCounts: Record<string, number> = {};
    allJobs.filter(j => j.woNumber && !j.isClosed).forEach(j => {
      statusCounts[j.statusPekerjaan] = (statusCounts[j.statusPekerjaan] || 0) + 1;
    });

    return { totalJobs, activeJobs, completedJobs, revenueThisMonth, statusCounts };
  }, [allJobs]);

  const chartData = {
    labels: Object.keys(stats.statusCounts),
    datasets: [{
      label: 'Unit per Status',
      data: Object.values(stats.statusCounts),
      backgroundColor: 'rgba(79, 70, 229, 0.8)',
      borderRadius: 12,
      barThickness: 40,
    }]
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* WELCOME HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase leading-none">
            Dashboard Overview
          </h1>
          <p className="text-gray-500 font-bold mt-2 flex items-center gap-2">
            <Clock size={16} className="text-indigo-500"/> Ringkasan Operasional Bengkel Hari Ini
          </p>
        </div>
        <button 
          onClick={() => onNavigate('entry_data')} 
          className="group flex items-center gap-3 bg-indigo-600 text-white px-8 py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95 font-black uppercase text-xs tracking-widest"
        >
          Lihat Semua Pekerjaan <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform"/>
        </button>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Unit Aktif (WIP)" 
          value={stats.activeJobs} 
          icon={Car} 
          color="bg-blue-600" 
          subValue="On Progress (In Workshop)"
          onClick={() => onNavigate('entry_data')}
        />
        <StatCard 
          title="Siap Diserahkan" 
          value={stats.completedJobs} 
          icon={CheckCircle} 
          color="bg-emerald-500" 
          subValue="Waiting Collection"
          onClick={() => onNavigate('entry_data')}
        />
        <StatCard 
          title="Est. Revenue (Bulan Ini)" 
          value={formatCurrency(stats.revenueThisMonth)} 
          icon={TrendingUp} 
          color="bg-violet-600" 
          subValue="Based on Active WO"
          onClick={() => onNavigate('entry_data')}
        />
        <StatCard 
          title="Total Database Unit" 
          value={stats.totalJobs} 
          icon={Database} 
          color="bg-orange-500" 
          subValue="Historical Records"
          onClick={() => onNavigate('entry_data')}
        />
      </div>

      {/* MAIN CHARTS & ACTION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-3">
              <BarElement size={20} className="text-indigo-600"/> Progres Distribusi WIP
            </h3>
            <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100 uppercase tracking-widest">Live Data</span>
          </div>
          <div className="h-80">
             {Object.keys(stats.statusCounts).length > 0 ? (
               <Bar 
                 data={chartData} 
                 options={{
                   responsive: true,
                   maintainAspectRatio: false,
                   plugins: { 
                     legend: { display: false },
                     tooltip: {
                       backgroundColor: '#1f2937',
                       padding: 12,
                       titleFont: { size: 14, weight: 'bold' },
                       bodyFont: { size: 13 },
                       cornerRadius: 12
                     }
                   },
                   scales: { 
                     y: { 
                       beginAtZero: true, 
                       ticks: { precision: 0, font: { weight: 'bold' } },
                       grid: { color: '#f3f4f6' }
                     },
                     x: {
                       grid: { display: false },
                       ticks: { font: { weight: 'bold', size: 10 } }
                     }
                   }
                 }} 
               />
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                  <AlertCircle size={48} className="opacity-20"/>
                  <p className="font-bold uppercase text-xs tracking-[0.2em]">Belum ada data unit aktif (WIP)</p>
               </div>
             )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
          <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-3">
            <TrendingUp size={20} className="text-indigo-600"/> Akses Cepat
          </h3>
          <div className="space-y-4">
             <button onClick={() => onNavigate('entry_data')} className="w-full text-left p-5 rounded-2xl hover:bg-blue-50 flex items-center gap-4 border-2 border-transparent hover:border-blue-100 transition-all group">
                <div className="bg-blue-100 p-3 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><Car className="w-6 h-6"/></div>
                <div>
                  <p className="font-black text-gray-800 uppercase text-xs tracking-wider">Daftar Unit</p>
                  <p className="text-xs text-gray-500 font-medium">Monitoring data kendaraan</p>
                </div>
             </button>
             <button onClick={() => onNavigate('job_control')} className="w-full text-left p-5 rounded-2xl hover:bg-orange-50 flex items-center gap-4 border-2 border-transparent hover:border-orange-100 transition-all group">
                <div className="bg-orange-100 p-3 rounded-xl group-hover:bg-orange-500 group-hover:text-white transition-colors"><Wrench className="w-6 h-6"/></div>
                <div>
                  <p className="font-black text-gray-800 uppercase text-xs tracking-wider">Job Control</p>
                  <p className="text-xs text-gray-500 font-medium">Pantau produktivitas tim</p>
                </div>
             </button>
             <button onClick={() => onNavigate('finance')} className="w-full text-left p-5 rounded-2xl hover:bg-emerald-50 flex items-center gap-4 border-2 border-transparent hover:border-emerald-100 transition-all group">
                <div className="bg-emerald-100 p-3 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-colors"><TrendingUp className="w-6 h-6"/></div>
                <div>
                  <p className="font-black text-gray-800 uppercase text-xs tracking-wider">Profitability</p>
                  <p className="text-xs text-gray-500 font-medium">Analisa laba per pekerjaan</p>
                </div>
             </button>
          </div>
          
          <div className="mt-8 p-6 bg-gray-50 rounded-3xl border border-gray-100">
             <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sistem Status</span>
             </div>
             <p className="text-xs text-gray-600 font-bold">Semua modul terkoneksi ke Firebase Real-time Engine.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;