
import React, { useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Car, Wrench, CheckCircle, TrendingUp } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface OverviewProps {
  allJobs: Job[];
  totalUnits: number;
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

const OverviewDashboard: React.FC<OverviewProps> = ({ allJobs, totalUnits, settings, onNavigate }) => {
  const stats = useMemo(() => {
    // Unit Aktif (WIP): Transaksi yang punya WO dan belum ditutup
    const activeJobs = allJobs.filter(j => j.woNumber && !j.isClosed).length;
    
    // Siap Diserahkan: Unit di status Selesai tapi belum serah terima
    const completedJobs = allJobs.filter(j => j.statusPekerjaan === 'Selesai' && !j.isClosed).length;
    
    // Revenue (Bulan Ini)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const revenueThisMonth = allJobs
      .filter(j => {
        const d = j.createdAt?.toDate ? j.createdAt.toDate() : new Date();
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, curr) => acc + (curr.estimateData?.grandTotal || 0), 0);
    
    // Status Dist
    const statusCounts: Record<string, number> = {};
    allJobs.filter(j => !j.isClosed).forEach(j => {
      statusCounts[j.statusPekerjaan] = (statusCounts[j.statusPekerjaan] || 0) + 1;
    });

    return { activeJobs, completedJobs, revenueThisMonth, statusCounts };
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
          <p className="text-gray-500 mt-1">Status real-time operasional bengkel</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Database Unit" 
          value={totalUnits} 
          icon={Wrench} 
          color="bg-orange-500" 
          subValue="Total unit terdaftar"
        />
        <StatCard 
          title="Unit Aktif (WIP)" 
          value={stats.activeJobs} 
          icon={Car} 
          color="bg-blue-500" 
          subValue="Pekerjaan sedang jalan"
        />
        <StatCard 
          title="Siap Diserahkan" 
          value={stats.completedJobs} 
          icon={CheckCircle} 
          color="bg-green-500" 
          subValue="Menunggu pengambilan"
        />
        <StatCard 
          title="Revenue (Est. Bulan Ini)" 
          value={formatCurrency(stats.revenueThisMonth)} 
          icon={TrendingUp} 
          color="bg-purple-500" 
          subValue="Berdasarkan total transaksi"
        />
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Distribusi Status Pekerjaan</h3>
          {Object.keys(stats.statusCounts).length > 0 ? (
               <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
          ) : (
               <div className="h-full flex items-center justify-center text-gray-400">Tidak ada data aktif</div>
          )}
      </div>
    </div>
  );
};

export default OverviewDashboard;
