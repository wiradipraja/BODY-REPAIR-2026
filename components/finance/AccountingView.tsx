
import React, { useState, useMemo } from 'react';
import { Job, PurchaseOrder } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Calendar, TrendingUp, TrendingDown, DollarSign, Wallet, FileText, Download, PieChart, ArrowUpRight, ArrowDownRight, ShoppingCart } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface AccountingViewProps {
  jobs: Job[]; 
  purchaseOrders: PurchaseOrder[]; // REAL-TIME PROP
}

const AccountingView: React.FC<AccountingViewProps> = ({ jobs, purchaseOrders }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pnl' | 'ledger'>('dashboard');
  
  // Filter States
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // --- CORE FINANCIAL CALCULATIONS ---
  const financialData = useMemo(() => {
    // 1. REVENUE: Based on CLOSED Jobs in the selected period
    const closedJobs = jobs.filter(j => {
        if (!j.isClosed || !j.closedAt) return false;
        const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    const revenueJasa = closedJobs.reduce((acc, j) => acc + (j.hargaJasa || 0), 0);
    const revenuePart = closedJobs.reduce((acc, j) => acc + (j.hargaPart || 0), 0);
    const totalRevenue = revenueJasa + revenuePart;

    // 2. COGS (HPP)
    const cogsMaterial = closedJobs.reduce((acc, j) => acc + (j.costData?.hargaModalBahan || 0), 0);
    const cogsPart = closedJobs.reduce((acc, j) => acc + (j.costData?.hargaBeliPart || 0), 0);
    const cogsExternal = closedJobs.reduce((acc, j) => acc + (j.costData?.jasaExternal || 0), 0);
    const totalCOGS = cogsMaterial + cogsPart + cogsExternal;

    // 3. GROSS PROFIT
    const grossProfit = totalRevenue - totalCOGS;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // 4. CASH FLOW OUT (PURCHASING)
    const periodPOs = purchaseOrders.filter(po => {
        if (!po.createdAt) return false;
        const d = po.createdAt.toDate ? po.createdAt.toDate() : new Date(po.createdAt);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear && po.status !== 'Rejected' && po.status !== 'Cancelled';
    });
    
    const totalPurchasing = periodPOs.reduce((acc, po) => acc + (po.totalAmount || 0), 0);
    
    return {
        revenueJasa, revenuePart, totalRevenue,
        cogsMaterial, cogsPart, cogsExternal, totalCOGS,
        grossProfit, grossMargin,
        totalPurchasing,
        closedJobsCount: closedJobs.length,
        poCount: periodPOs.length
    };
  }, [jobs, purchaseOrders, selectedMonth, selectedYear]);

  // --- CHART DATA PREPARATION ---
  const chartData = useMemo(() => {
      // Last 6 Months Trend
      const labels = [];
      const revData = [];
      const expData = [];
      
      for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(selectedMonth - i);
          d.setFullYear(selectedYear); // Handle year rollover roughly
          const m = d.getMonth();
          const y = d.getFullYear();
          
          labels.push(d.toLocaleDateString('id-ID', { month: 'short' }));

          // Revenue in that month
          const mRev = jobs
            .filter(j => j.isClosed && j.closedAt)
            .filter(j => {
                const jd = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
                return jd.getMonth() === m && jd.getFullYear() === y;
            })
            .reduce((acc, j) => acc + (j.estimateData?.grandTotal || 0), 0);
          
          // Expense (PO) in that month
          const mExp = purchaseOrders
            .filter(po => po.createdAt)
            .filter(po => {
                 const pd = po.createdAt.toDate ? po.createdAt.toDate() : new Date(po.createdAt);
                 return pd.getMonth() === m && pd.getFullYear() === y && po.status !== 'Rejected';
            })
            .reduce((acc, po) => acc + (po.totalAmount || 0), 0);
            
          revData.push(mRev);
          expData.push(mExp);
      }

      return {
          trend: {
              labels,
              datasets: [
                  { label: 'Omset (Revenue)', data: revData, borderColor: '#4F46E5', backgroundColor: 'rgba(79, 70, 229, 0.5)', tension: 0.3 },
                  { label: 'Belanja (Expense)', data: expData, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.5)', tension: 0.3 }
              ]
          },
          composition: {
              labels: ['Jasa Perbaikan', 'Penjualan Part'],
              datasets: [{
                  data: [financialData.revenueJasa, financialData.revenuePart],
                  backgroundColor: ['#3B82F6', '#F59E0B'],
                  borderWidth: 0
              }]
          }
      };
  }, [jobs, purchaseOrders, selectedMonth, selectedYear, financialData]);

  // --- LEDGER DATA ---
  const ledgerData = useMemo(() => {
      const txs: any[] = [];
      
      // Income Transactions
      jobs.filter(j => j.isClosed && j.closedAt).forEach(j => {
          const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
          if (d.getMonth() === selectedMonth && d.getFullYear() === selectedYear) {
              txs.push({
                  date: d,
                  ref: j.woNumber,
                  desc: `Pelunasan WO ${j.policeNumber} (${j.customerName})`,
                  category: 'Revenue',
                  amount: j.estimateData?.grandTotal || 0,
                  type: 'IN'
              });
          }
      });

      // Expense Transactions
      purchaseOrders.filter(po => po.createdAt).forEach(po => {
          const d = po.createdAt.toDate ? po.createdAt.toDate() : new Date(po.createdAt);
          if (d.getMonth() === selectedMonth && d.getFullYear() === selectedYear && po.status !== 'Rejected') {
              txs.push({
                  date: d,
                  ref: po.poNumber,
                  desc: `Belanja Stok - ${po.supplierName}`,
                  category: 'Expense',
                  amount: po.totalAmount || 0,
                  type: 'OUT'
              });
          }
      });

      return txs.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [jobs, purchaseOrders, selectedMonth, selectedYear]);


  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER & FILTER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-600 rounded-xl shadow-sm text-white">
                    <TrendingUp size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Finance & Accounting</h1>
                    <p className="text-sm text-gray-500 font-medium">Laporan Keuangan & Analisa Profitabilitas (Real-time)</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                <Calendar size={18} className="text-gray-400 ml-2"/>
                <select 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 cursor-pointer"
                >
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <select 
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 cursor-pointer border-l border-gray-300"
                >
                    {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><DollarSign size={80}/></div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Omset (Revenue)</p>
                <h2 className="text-2xl font-black text-indigo-900">{formatCurrency(financialData.totalRevenue)}</h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-emerald-600">
                    <ArrowUpRight size={14}/> <span>{financialData.closedJobsCount} Closed WO</span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><TrendingDown size={80}/></div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total HPP (COGS)</p>
                <h2 className="text-2xl font-black text-red-800">{formatCurrency(financialData.totalCOGS)}</h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-red-600">
                    <ArrowDownRight size={14}/> <span>Biaya Produksi Real</span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><Wallet size={80}/></div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Laba Kotor (Gross Profit)</p>
                <h2 className={`text-2xl font-black ${financialData.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatCurrency(financialData.grossProfit)}
                </h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-gray-500">
                    <PieChart size={14}/> <span>Margin: {financialData.grossMargin.toFixed(1)}%</span>
                </div>
            </div>

             <div className="bg-indigo-900 p-5 rounded-xl border border-indigo-800 shadow-sm relative overflow-hidden text-white">
                <div className="absolute right-0 top-0 p-4 opacity-10"><ShoppingCart size={80}/></div>
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">Cash Out (Purchasing)</p>
                <h2 className="text-2xl font-black">{formatCurrency(financialData.totalPurchasing)}</h2>
                <div className="flex items-center gap-1 mt-2 text-xs font-medium text-indigo-200">
                    <TrendingDown size={14}/> <span>{financialData.poCount} Transaksi PO</span>
                </div>
            </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex gap-2 border-b border-gray-200">
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'dashboard' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                Visualisasi & Grafik
            </button>
            <button 
                onClick={() => setActiveTab('pnl')}
                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'pnl' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                Laporan Laba Rugi
            </button>
            <button 
                onClick={() => setActiveTab('ledger')}
                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                Buku Besar Transaksi
            </button>
        </div>

        {/* TAB CONTENT: DASHBOARD */}
        {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6">Tren Pendapatan vs Pengeluaran (6 Bulan)</h3>
                    <div className="h-72">
                        <Line data={chartData.trend} options={{ responsive: true, maintainAspectRatio: false }} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6">Komposisi Pendapatan</h3>
                    <div className="h-64 flex justify-center">
                        <Doughnut data={chartData.composition} options={{ cutout: '70%' }} />
                    </div>
                    <div className="mt-6 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> Jasa</span>
                            <span className="font-bold">{formatCurrency(financialData.revenueJasa)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-500 rounded-full"></div> Part</span>
                            <span className="font-bold">{formatCurrency(financialData.revenuePart)}</span>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* TAB CONTENT: P&L */}
        {activeTab === 'pnl' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in max-w-4xl mx-auto">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Profit & Loss Statement</h3>
                        <p className="text-sm text-gray-500">Laporan Laba Rugi Periode {selectedMonth + 1}/{selectedYear}</p>
                    </div>
                    <button className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                        <Download size={16}/> Export PDF
                    </button>
                </div>
                
                <div className="p-8 space-y-6">
                    {/* REVENUE SECTION */}
                    <div>
                        <h4 className="text-sm font-black text-gray-400 uppercase mb-3 border-b pb-1">Pendapatan (Revenue)</h4>
                        <div className="space-y-3 pl-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Pendapatan Jasa Perbaikan</span>
                                <span className="font-medium">{formatCurrency(financialData.revenueJasa)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Pendapatan Penjualan Sparepart</span>
                                <span className="font-medium">{formatCurrency(financialData.revenuePart)}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold text-indigo-900 pt-2 border-t border-gray-100 mt-2">
                                <span>Total Pendapatan Usaha</span>
                                <span>{formatCurrency(financialData.totalRevenue)}</span>
                            </div>
                        </div>
                    </div>

                    {/* COGS SECTION */}
                    <div>
                        <h4 className="text-sm font-black text-gray-400 uppercase mb-3 border-b pb-1">Harga Pokok Penjualan (HPP)</h4>
                        <div className="space-y-3 pl-2">
                            <div className="flex justify-between text-sm group">
                                <span className="text-gray-600 group-hover:text-red-600 transition-colors">Biaya Pemakaian Bahan (Material Usage)</span>
                                <span className="font-medium text-red-600">({formatCurrency(financialData.cogsMaterial)})</span>
                            </div>
                            <div className="flex justify-between text-sm group">
                                <span className="text-gray-600 group-hover:text-red-600 transition-colors">Modal Sparepart Terjual</span>
                                <span className="font-medium text-red-600">({formatCurrency(financialData.cogsPart)})</span>
                            </div>
                            <div className="flex justify-between text-sm group">
                                <span className="text-gray-600 group-hover:text-red-600 transition-colors">Biaya Jasa Luar (Sublet)</span>
                                <span className="font-medium text-red-600">({formatCurrency(financialData.cogsExternal)})</span>
                            </div>
                             <div className="flex justify-between text-base font-bold text-red-800 pt-2 border-t border-gray-100 mt-2">
                                <span>Total HPP</span>
                                <span>({formatCurrency(financialData.totalCOGS)})</span>
                            </div>
                        </div>
                    </div>

                    {/* RESULT SECTION */}
                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mt-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h4 className="text-xl font-black text-gray-800">Laba Kotor (Gross Profit)</h4>
                                <p className="text-sm text-gray-500 mt-1">Pendapatan - HPP Langsung</p>
                            </div>
                            <div className="text-right">
                                <h4 className={`text-2xl font-black ${financialData.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {formatCurrency(financialData.grossProfit)}
                                </h4>
                                <p className="text-sm font-bold text-gray-500 mt-1">Gross Margin: {financialData.grossMargin.toFixed(2)}%</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* TAB CONTENT: LEDGER */}
        {activeTab === 'ledger' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-4 bg-gray-50 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800">Buku Besar Transaksi</h3>
                    <p className="text-xs text-gray-500">Gabungan riwayat pemasukan (WO Closed) dan pengeluaran (PO).</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Tanggal</th>
                                <th className="px-6 py-3">No. Ref</th>
                                <th className="px-6 py-3">Keterangan</th>
                                <th className="px-6 py-3">Kategori</th>
                                <th className="px-6 py-3 text-right">Debit (Masuk)</th>
                                <th className="px-6 py-3 text-right">Kredit (Keluar)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {ledgerData.map((tx, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                        {formatDateIndo(tx.date)}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600">
                                        {tx.ref}
                                    </td>
                                    <td className="px-6 py-4 text-gray-800 font-medium">
                                        {tx.desc}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${tx.category === 'Revenue' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {tx.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-emerald-700 font-bold bg-emerald-50/30">
                                        {tx.type === 'IN' ? formatCurrency(tx.amount) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-red-700 font-bold bg-red-50/30">
                                        {tx.type === 'OUT' ? formatCurrency(tx.amount) : '-'}
                                    </td>
                                </tr>
                            ))}
                            {ledgerData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-gray-400 italic">Tidak ada transaksi pada periode ini.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </div>
  );
};

export default AccountingView;
