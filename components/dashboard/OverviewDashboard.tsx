
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
  const lang = settings.language || 'id';

  // TRANSLATIONS
  const t = (key: string) => {
      const dict: any = {
          id: {
              title: "Overview Dashboard",
              subtitle: "Pantau performa operasional & finansial bengkel anda.",
              card1: "Master Database Unit",
              card1_sub: "Total unit terdaftar",
              card2: "Work In Progress (WIP)",
              card2_sub: "Pekerjaan sedang berjalan",
              card3: "Unit Siap Ambil",
              card3_sub: "Menunggu penyerahan",
              card4: "Revenue (Terfaktur)",
              card4_sub: "Total bill periode ini",
              row1: "Unit Terfaktur",
              row2: "Total Produksi Panel",
              row3: "Gross Profit",
              chart1: "Distribusi Produksi Aktif",
              chart2: "Rasio Faktur"
          },
          en: {
              title: "Overview Dashboard",
              subtitle: "Monitor your workshop's operational & financial performance.",
              card1: "Vehicle Database",
              card1_sub: "Total units registered",
              card2: "Work In Progress (WIP)",
              card2_sub: "Active jobs on floor",
              card3: "Ready for Delivery",
              card3_sub: "Waiting for handover",
              card4: "Revenue (Invoiced)",
              card4_sub: "Total bill this period",
              row1: "Invoiced Units",
              row2: "Production Panels",
              row3: "Gross Profit",
              chart1: "Active Production Stages",
              chart2: "Invoice Ratio"
          }
      };
      return dict[lang][key] || key;
  };

  const stats = useMemo(() => {
    // 1. WIP Stats
    const activeJobs = allJobs.filter(j => j.woNumber && !j.isClosed && !j.isDeleted).length;
    const completedWaiting = allJobs.filter(j => j.statusPekerjaan === 'Selesai' && !j.isClosed && !j.isDeleted).length;

    // 2. Filtered Stats
    const periodJobs = allJobs.filter(j => {
        if (j.isDeleted) return false;
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

    const statusCounts: Record<string, number> = {};
    allJobs.filter(j => !j.isClosed && !j.isDeleted).forEach(j => {
      statusCounts[j.statusPekerjaan] = (statusCounts[j.statusPekerjaan] || 0) + 1;
    });

    return { activeJobs, completedWaiting, revenue, statusCounts, totalInvoicedUnits, totalPanels, grossProfit };
  }, [allJobs, selectedMonth, selectedYear]);

  const barChartData = {
    labels: Object.keys(stats.statusCounts),
    datasets: [{
      label: 'Units',
      data: Object.values(stats.statusCounts),
      backgroundColor: 'rgba(79, 70, 229, 0.8)',
      borderRadius: 8,
      hoverBackgroundColor: 'rgba(79, 70, 229, 1)',
    }]
  };

  const doughnutData = {
      labels: ['Invoiced', 'Active'],
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
          <div className="absolute right-0 top-0 p-4 opacity-10 rotate-12 scale-150"><Activity size={200}/></div>
          <div className="relative z-10">
            <h1 className="text-4xl font-black tracking-tighter">{t('title')}</h1>
            <p className="text-indigo-300 font-medium mt-1">{t('subtitle')}</p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/10 relative z-10">
              <Calendar className="text-indigo-300 ml-2" size={20}/>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer py-2">
                  {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                      <option key={i} value={i} className="text-gray-900">{m}</option>
                  ))}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer border-l border-white/20 pl-4 py-2">
                  {[2024, 2025, 2026].map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
              </select>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title={t('card1')} value={totalUnits} icon={Users} color="bg-slate-700" subValue={t('card1_sub')} />
        <StatCard title={t('card2')} value={stats.activeJobs} icon={Wrench} color="bg-indigo-600" subValue={t('card2_sub')} />
        <StatCard title={t('card3')} value={stats.completedWaiting} icon={Car} color="bg-blue-500" subValue={t('card3_sub')} />
        <StatCard title={t('card4')} value={formatCurrency(stats.revenue)} icon={Landmark} color="bg-emerald-600" subValue={t('card4_sub')} trend="up" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-6 border-l-4 border-l-indigo-600">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><FileCheck size={32}/></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('row1')}</p><h4 className="text-3xl font-black text-gray-900">{stats.totalInvoicedUnits}</h4></div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-6 border-l-4 border-l-orange-500">
              <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl"><Layers size={32}/></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('row2')}</p><h4 className="text-3xl font-black text-gray-900">{stats.totalPanels.toFixed(1)}</h4></div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-6 border-l-4 border-l-emerald-500">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><TrendingUp size={32}/></div>
              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('row3')}</p><h4 className="text-2xl font-black text-emerald-700">{formatCurrency(stats.grossProfit)}</h4></div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-8"><h3 className="text-lg font-black text-gray-800 flex items-center gap-2"><Activity className="text-indigo-600" size={20}/> {t('chart1')}</h3><button onClick={() => onNavigate('job_control')} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">Kanban Board <ChevronRight size={14}/></button></div>
              <div className="h-80"><Bar data={barChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col"><h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-2"><PieChart className="text-emerald-500" size={20}/> {t('chart2')}</h3><div className="flex-grow flex items-center justify-center relative"><div className="h-56 w-56"><Doughnut data={doughnutData} options={{ plugins: { legend: { display: false } } }} /></div><div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><p className="text-3xl font-black text-gray-900">{stats.totalInvoicedUnits}</p><p className="text-[10px] font-black text-gray-400 uppercase">Closing</p></div></div></div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
