
import React, { useState, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement
} from 'chart.js';
import { 
    Car, Wrench, CheckCircle, TrendingUp, Calendar, 
    FileCheck, Layers, Landmark, ArrowUpRight, 
    Briefcase, Users, ChevronRight, PieChart, Activity
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface OverviewProps {
  allJobs: Job[];
  totalUnits: number;
  settings: Settings;
  onNavigate: (view: string) => void;
}

const StatCard = ({ title, value, icon: Icon, color, subValue, trend }: any) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all group overflow-hidden relative">
    <div className={`absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform`}>
        <Icon size={120}/>
    </div>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
        <h3 className="text-2xl font-black text-gray-900 mt-1 tracking-tight">{value}</h3>
        {subValue && (
            <div className="flex items-center gap-1 mt-2">
                {trend === 'up' ? <ArrowUpRight size={14} className="text-emerald-500"/> : null}
                <p className="text-[10px] font-bold text-gray-500">{subValue}</p>
            </div>
        )}
      </div>
      <div className={`p-3 rounded-xl shadow-lg shadow-indigo-100 ${color} text-white`}>
        <Icon size={24} />
      </div>
    </div>
  </div>
);

const OverviewDashboard: React.FC<OverviewProps> = ({ allJobs, totalUnits, settings, onNavigate }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const stats = useMemo(() => {
    // 1. WIP Stats (Independent of Month Filter for operational view)
    const activeJobs = allJobs.filter(j => j.woNumber && !j.isClosed && !j.isDeleted).length;
    const completedWaiting = allJobs.filter(j => j.statusPekerjaan === 'Selesai' && !j.isClosed && !j.isDeleted).length;

    // 2. Filtered Stats (Financials & History)
    const periodJobs = allJobs.filter(j => {
        if (j.isDeleted) return false;
        // Gunakan closedAt untuk financial reporting, fallback ke createdAt
        const dateObj = j.closedAt?.toDate ? j.closedAt.toDate() : (j.createdAt?.toDate ? j.createdAt.toDate() : new Date());
        return dateObj.getMonth() === selectedMonth && dateObj.getFullYear() === selectedYear;
    });

    const invoicedJobs = periodJobs.filter(j => j.hasInvoice);
    const totalInvoicedUnits = invoicedJobs.length;

    const revenue = invoicedJobs.reduce((acc, j) => acc + (j.estimateData?.grandTotal || 0), 0);
    
    const totalPanels = invoicedJobs.reduce((acc, j) => {
        const panels = j.estimateData?.jasaItems?.reduce((pAcc, item) => pAcc + (item.panelCount || 0), 0) || 0;
        return acc + panels;
    }, 0);

    const grossProfit = invoicedJobs.reduce((acc, j) => {
        const revTotal = (j.hargaJasa || 0) + (j.hargaPart || 0);
        const costTotal = (j.costData?.hargaModalBahan || 0) + (j.costData?.hargaBeliPart || 0) + (j.costData?.jasaExternal || 0);
        return acc + (revTotal - costTotal);
    }, 0);

    // Status Distribution for Chart
    const statusCounts: Record<string, number> = {};
    allJobs.filter(j => !j.isClosed && !j.isDeleted).forEach(j => {
      statusCounts[j.statusPekerjaan] = (statusCounts[j.statusPekerjaan] || 0) + 1;
    });

    return { 
        activeJobs, 
        completedWaiting, 
        revenue, 
        statusCounts, 
        totalInvoicedUnits, 
        totalPanels, 
        grossProfit 
    };
  }, [allJobs, selectedMonth, selectedYear]);

  const barChartData = {
    labels: Object.keys(stats.statusCounts),
    datasets: [{
      label: 'Unit Aktif',
      data: Object.values(stats.statusCounts),
      backgroundColor: 'rgba(79, 70, 229, 0.8)',
      borderRadius: 8,
      hoverBackgroundColor: 'rgba(79, 70, 229, 1)',
    }]
  };

  const doughnutData = {
      labels: ['Invoiced', 'Pending Invoice'],
      datasets: [{
          data: [stats.totalInvoicedUnits, stats.activeJobs],
          backgroundColor: ['#10B981', '#6366F1'],
          borderWidth: 0,
          cutout: '70%'
      }]
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-slate-900 p-8 rounded-3xl text-white shadow-2xl relative overflow-hidden">
          <div className="absolute right-0 top-0 p-4 opacity-10 rotate-12 scale-150">
              <Activity size={200}/>
          </div>
          <div className="relative z-10">
            <h1 className="text-4xl font-black tracking-tighter">Overview Dashboard</h1>
            <p className="text-indigo-300 font-medium mt-1">Pantau performa operasional & finansial bengkel anda.</p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/10 relative z-10">
              <Calendar className="text-indigo-300 ml-2" size={20}/>
              <select 
                value={selectedMonth} 
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer py-2"
              >
                  {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                      <option key={i} value={i} className="text-gray-900">{m}</option>
                  ))}
              </select>
              <select 
                value={selectedYear} 
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer border-l border-white/20 pl-4 py-2"
              >
                  {[2024, 2025, 2026].map(y => (
                      <option key={y} value={y} className="text-gray-900">{y}</option>
                  ))}
              </select>
          </div>
      </div>

      {/* PRIMARY OPERATIONAL STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Master Database Unit" 
          value={totalUnits} 
          icon={Users} 
          color="bg-slate-700" 
          subValue="Total unit terdaftar"
        />
        <StatCard 
          title="Work In Progress (WIP)" 
          value={stats.activeJobs} 
          icon={Wrench} 
          color="bg-indigo-600" 
          subValue="Pekerjaan sedang berjalan"
        />
        <StatCard 
          title="Unit Siap Ambil" 
          value={stats.completedWaiting} 
          icon={Car} 
          color="bg-blue-500" 
          subValue="Menunggu penyerahan"
        />
        <StatCard 
          title="Revenue (Terfaktur)" 
          value={formatCurrency(stats.revenue)} 
          icon={Landmark} 
          color="bg-emerald-600" 
          subValue="Total bill periode ini"
          trend="up"
        />
      </div>

      {/* KPI FINANCIAL SECTION (TARGETED INFO) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-6 group hover:shadow-lg transition-all border-l-4 border-l-indigo-600">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
                  <FileCheck size={32}/>
              </div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Terfaktur</p>
                  <h4 className="text-3xl font-black text-gray-900">{stats.totalInvoicedUnits} <span className="text-xs text-gray-400 font-bold uppercase tracking-tight ml-1">WO</span></h4>
                  <p className="text-[10px] text-indigo-500 font-bold mt-1">Periode Terpilih</p>
              </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-6 group hover:shadow-lg transition-all border-l-4 border-l-orange-500">
              <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform">
                  <Layers size={32}/>
              </div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Produksi Panel</p>
                  <h4 className="text-3xl font-black text-gray-900">{stats.totalPanels.toFixed(1)} <span className="text-xs text-gray-400 font-bold uppercase tracking-tight ml-1">PNL</span></h4>
                  <p className="text-[10px] text-orange-500 font-bold mt-1">Berdasarkan unit terfaktur</p>
              </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-6 group hover:shadow-lg transition-all border-l-4 border-l-emerald-500">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                  <TrendingUp size={32}/>
              </div>
              <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Gross Profit</p>
                  <h4 className="text-2xl font-black text-emerald-700">{formatCurrency(stats.grossProfit)}</h4>
                  <p className="text-[10px] text-emerald-500 font-bold mt-1">Margin Kotor (Revenue - HPP)</p>
              </div>
          </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-8">
                  <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                    <Activity className="text-indigo-600" size={20}/> Distribusi Produksi Aktif
                  </h3>
                  <button onClick={() => onNavigate('job_control')} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">Papan Kanban <ChevronRight size={14}/></button>
              </div>
              <div className="h-80">
                  {Object.keys(stats.statusCounts).length > 0 ? (
                       <Bar 
                        data={barChartData} 
                        options={{ 
                            responsive: true, 
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { beginAtZero: true, grid: { display: false } },
                                x: { grid: { display: false } }
                            }
                        }} 
                       />
                  ) : (
                       <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                           <Layers size={48} className="opacity-20"/>
                           <p className="text-sm italic">Tidak ada data unit aktif saat ini.</p>
                       </div>
                  )}
              </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
              <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2">
                <PieChart className="text-emerald-500" size={20}/> Rasio Faktur
              </h3>
              <div className="flex-grow flex items-center justify-center relative">
                  <div className="h-56 w-56">
                    <Doughnut data={doughnutData} options={{ plugins: { legend: { display: false } } }} />
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-3xl font-black text-gray-900">{stats.totalInvoicedUnits}</p>
                      <p className="text-[10px] font-black text-gray-400 uppercase">Unit Closing</p>
                  </div>
              </div>
              <div className="mt-8 space-y-3">
                  <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl">
                      <span className="text-xs font-bold text-emerald-700">Faktur Terbit</span>
                      <span className="text-sm font-black text-emerald-800">{stats.totalInvoicedUnits}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-xl">
                      <span className="text-xs font-bold text-indigo-700">Antrian WIP</span>
                      <span className="text-sm font-black text-indigo-800">{stats.activeJobs}</span>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
