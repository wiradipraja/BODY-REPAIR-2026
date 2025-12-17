
import React, { useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Users, Car, Wrench, CheckCircle, TrendingUp, AlertCircle } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface OverviewProps {
  allJobs: Job[];
  settings: Settings;
  onNavigate: (view: string) => void;
}

const StatCard = ({ title, value, icon: Icon, color, subValue }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-2">{value}</h3>
        {subValue && <p className="text-xs text-green-600 mt-1">{subValue}</p>}
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
);

const OverviewDashboard: React.FC<OverviewProps> = ({ allJobs, settings, onNavigate }) => {
  const stats = useMemo(() => {
    // Total Database UNIT: Menghitung semua data unit yang ada di sistem (non-deleted)
    const totalJobs = allJobs.length;
    
    // Unit Aktif (WIP): Hanya unit yang punya nomor WO dan belum Closed
    const activeJobs = allJobs.filter(j => j.woNumber && !j.isClosed).length;
    
    // Siap Diserahkan: Unit yang sudah selesai pengerjaan tapi belum serah terima (Closed)
    const completedJobs = allJobs.filter(j => j.statusPekerjaan === 'Selesai' && !j.isClosed).length;
    
    // Financials (Simple approximation)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const jobsThisMonth = allJobs.filter(j => {
      const d = j.createdAt?.toDate ? j.createdAt.toDate() : new Date();
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const revenueThisMonth = jobsThisMonth.reduce((acc, curr) => acc + (curr.estimateData?.grandTotal || 0), 0);
    
    // Status Distribution (Based on WIP units)
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
      backgroundColor: 'rgba(79, 70, 229, 0.6)',
      borderColor: 'rgba(79, 70, 229, 1)',
      borderWidth: 1
    }]
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-500 mt-1">Ringkasan aktivitas bengkel hari ini</p>
        </div>
        <button 
          onClick={() => onNavigate('entry_data')} 
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
        >
          Lihat Semua Pekerjaan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Unit Aktif (WIP)" 
          value={stats.activeJobs} 
          icon={Car} 
          color="bg-blue-500" 
          subValue="WO Terbit & Belum Selesai"
        />
        <StatCard 
          title="Siap Diserahkan" 
          value={stats.completedJobs} 
          icon={CheckCircle} 
          color="bg-green-500" 
          subValue="Menunggu pengambilan"
        />
        <StatCard 
          title="Estimasi Revenue (Bulan Ini)" 
          value={formatCurrency(stats.revenueThisMonth)} 
          icon={TrendingUp} 
          color="bg-purple-500" 
          subValue="Berdasarkan Estimasi WO"
        />
        <StatCard 
          title="Total Database Unit" 
          value={stats.totalJobs} 
          icon={Wrench} 
          color="bg-orange-500" 
          subValue="Total riwayat masuk"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Distribusi Pekerjaan (WIP)</h3>
          <div className="h-64">
             {Object.keys(stats.statusCounts).length > 0 ? (
               <Bar 
                 data={chartData} 
                 options={{
                   responsive: true,
                   maintainAspectRatio: false,
                   plugins: { legend: { display: false } },
                   scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                 }} 
               />
             ) : (
               <div className="h-full flex items-center justify-center text-gray-400">Belum ada data aktif (WIP)</div>
             )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Aksi Cepat</h3>
          <div className="space-y-3">
             <button onClick={() => onNavigate('entry_data')} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 border transition-colors">
                <div className="bg-blue-100 p-2 rounded-full"><Car className="w-5 h-5 text-blue-600"/></div>
                <div>
                  <p className="font-semibold text-gray-800">Daftar Unit</p>
                  <p className="text-xs text-gray-500">Kelola data kendaraan masuk</p>
                </div>
             </button>
             <button onClick={() => onNavigate('job_control')} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 border transition-colors">
                <div className="bg-yellow-100 p-2 rounded-full"><AlertCircle className="w-5 h-5 text-yellow-600"/></div>
                <div>
                  <p className="font-semibold text-gray-800">Job Control</p>
                  <p className="text-xs text-gray-500">Pantau progres mekanik</p>
                </div>
             </button>
             <button onClick={() => onNavigate('finance')} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 border transition-colors">
                <div className="bg-green-100 p-2 rounded-full"><TrendingUp className="w-5 h-5 text-green-600"/></div>
                <div>
                  <p className="font-semibold text-gray-800">Finance</p>
                  <p className="text-xs text-gray-500">Invoicing dan profit</p>
                </div>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
