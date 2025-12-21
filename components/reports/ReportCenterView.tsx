
import React, { useState } from 'react';
import { Job, CashierTransaction, PurchaseOrder, InventoryItem, Vehicle } from '../../types';
import * as XLSX from 'xlsx';
import { formatDateIndo, formatCurrency } from '../../utils/helpers';
import { FileSpreadsheet, Download, Calendar, Activity, DollarSign, Package, User, ShoppingCart, BarChart3, TrendingUp, Shield, MapPin, Car, Database, Landmark, Scale, Wallet } from 'lucide-react';

interface ReportCenterViewProps {
  jobs: Job[];
  transactions: CashierTransaction[];
  purchaseOrders: PurchaseOrder[];
  inventoryItems: InventoryItem[];
  vehicles: Vehicle[];
}

const ReportCenterView: React.FC<ReportCenterViewProps> = ({ jobs, transactions, purchaseOrders, inventoryItems, vehicles }) => {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const isInRange = (dateInput: any) => {
      if (!dateInput) return false;
      const d = typeof dateInput.toDate === 'function' ? dateInput.toDate() : new Date(dateInput);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);
      return d >= start && d <= end;
  };

  const handleExport = (type: string) => {
      let filename = `Report_${type}_${startDate}_to_${endDate}.xlsx`;
      const wb = XLSX.utils.book_new();
      let data: any[] = [];

      switch (type) {
          case 'VEHICLE_DATABASE':
              // MASTER DATABASE EXPORT WITH DEDUPLICATION (LATEST RECORD ONLY)
              const uniqueVehiclesMap = new Map<string, Vehicle>();
              const sortedVehicles = [...vehicles].sort((a, b) => {
                  const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                  const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                  return dateB - dateA;
              });
              sortedVehicles.forEach(v => {
                  const nopol = (v.policeNumber || '').toUpperCase().replace(/\s/g, '');
                  if (nopol && !uniqueVehiclesMap.has(nopol)) uniqueVehiclesMap.set(nopol, v);
              });
              data = Array.from(uniqueVehiclesMap.values()).map(v => ({
                  'No. Polisi': v.policeNumber,
                  'Nama Pelanggan': v.customerName,
                  'No. WhatsApp/HP': v.customerPhone,
                  'Alamat Lengkap': v.customerAddress || '-',
                  'Kota/Kabupaten': v.customerKota || '-',
                  'Merk': v.carBrand,
                  'Tipe / Model': v.carModel,
                  'Warna': v.warnaMobil,
                  'Nomor Rangka (VIN)': v.nomorRangka || '-',
                  'Nomor Mesin': v.nomorMesin || '-',
                  'Tahun Pembuatan': v.tahunPembuatan || '-',
                  'Pihak Penjamin (Asuransi)': v.namaAsuransi,
                  'Tanggal Terdaftar': v.createdAt ? formatDateIndo(v.createdAt) : '-'
              }));
              filename = `Database_Master_Unit_Cleaned_${new Date().toISOString().split('T')[0]}.xlsx`;
              break;

          case 'TAX_REPORT':
              // TAX IN & OUT REPORT
              data = transactions
                .filter(t => t.category.includes('Pajak') || t.description?.toLowerCase().includes('ppn') || t.description?.toLowerCase().includes('pph'))
                .filter(t => isInRange(t.date))
                .map(t => ({
                    'Tanggal': formatDateIndo(t.date),
                    'Tipe Pajak': t.type === 'IN' ? 'Pajak Masuk / Potongan' : 'Setoran Pajak / Keluar',
                    'Kategori': t.category,
                    'Ref Dokumen': t.refNumber || '-',
                    'Nama Pihak': t.customerName || '-',
                    'Nominal': t.amount,
                    'No. Bukti Potong': t.taxCertificateNumber || '-',
                    'Keterangan': t.description,
                    'Metode': t.paymentMethod,
                    'Bank': t.bankName || '-'
                }));
              filename = `Laporan_Pajak_${startDate}_to_${endDate}.xlsx`;
              break;

          case 'RECEIVABLE_REPORT':
              // PIUTANG (INVOICE OUTSTANDING)
              data = jobs
                .filter(j => j.woNumber && !j.isDeleted)
                .map(job => {
                    const totalBill = job.estimateData?.grandTotal || 0;
                    const paidAmount = transactions
                        .filter(t => t.refJobId === job.id && t.type === 'IN')
                        .reduce((acc, t) => acc + (t.amount || 0), 0);
                    const remaining = totalBill - paidAmount;
                    return {
                        'No. WO': job.woNumber,
                        'No. Polisi': job.policeNumber,
                        'Pelanggan': job.customerName,
                        'Asuransi': job.namaAsuransi,
                        'Tgl Masuk': formatDateIndo(job.tanggalMasuk),
                        'Total Tagihan': totalBill,
                        'Sudah Dibayar': paidAmount,
                        'Sisa Piutang': remaining,
                        'Status Unit': job.isClosed ? 'Closed' : 'Open'
                    };
                })
                .filter(r => r['Sisa Piutang'] > 100); // Only outstanding
              filename = `Laporan_Piutang_Unit_${new Date().toISOString().split('T')[0]}.xlsx`;
              break;

          case 'DEBT_REPORT':
              // HUTANG SUPPLIER (PO OUTSTANDING)
              data = purchaseOrders
                .filter(po => ['Received', 'Partial', 'Ordered'].includes(po.status))
                .map(po => {
                    const totalBill = po.totalAmount;
                    const paidAmount = transactions
                        .filter(t => t.refPoId === po.id && t.type === 'OUT')
                        .reduce((acc, t) => acc + t.amount, 0);
                    const remaining = totalBill - paidAmount;
                    return {
                        'No. PO': po.poNumber,
                        'Supplier': po.supplierName,
                        'Tanggal PO': formatDateIndo(po.createdAt),
                        'Status Barang': po.status,
                        'Total Hutang': totalBill,
                        'Sudah Bayar': paidAmount,
                        'Sisa Hutang': remaining
                    };
                })
                .filter(p => p['Sisa Hutang'] > 100);
              filename = `Laporan_Hutang_Supplier_${new Date().toISOString().split('T')[0]}.xlsx`;
              break;

          case 'BI_ANALYSIS':
              // BUSINESS INTELLIGENCE MULTI-SHEET
              const periodJobs = jobs.filter(j => (isInRange(j.closedAt) || isInRange(j.createdAt)) && !j.isDeleted && j.woNumber);
              if (periodJobs.length === 0) { alert("Data kosong."); return; }
              const insCount = periodJobs.filter(j => j.namaAsuransi !== 'Umum / Pribadi').length;
              const priCount = periodJobs.filter(j => j.namaAsuransi === 'Umum / Pribadi').length;
              const summaryData = [{ 'Kategori': 'Total Unit', 'Nilai': periodJobs.length }, { 'Kategori': 'Asuransi', 'Nilai': insCount }, { 'Kategori': 'Pribadi', 'Nilai': priCount }];
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");
              XLSX.writeFile(wb, `Analisa_Performa_${startDate}_to_${endDate}.xlsx`);
              return;

          case 'UNIT_FLOW':
              data = jobs.filter(j => isInRange(j.createdAt) || isInRange(j.closedAt)).map(j => ({
                  'Tgl Masuk': formatDateIndo(j.tanggalMasuk), 'No. WO': j.woNumber || '-', 'Nopol': j.policeNumber, 'Nama': j.customerName, 'Status': j.statusKendaraan, 'SA': j.namaSA, 'Panel': j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0
              }));
              break;

          case 'PROFIT_LOSS_UNIT':
              data = jobs.filter(j => j.isClosed && isInRange(j.closedAt)).map(j => {
                  const rev = (j.hargaJasa || 0) + (j.hargaPart || 0);
                  const cogs = (j.costData?.hargaModalBahan || 0) + (j.costData?.hargaBeliPart || 0) + (j.costData?.jasaExternal || 0);
                  return { 'No. WO': j.woNumber, 'Nopol': j.policeNumber, 'Revenue': rev, 'HPP': cogs, 'Gross Profit': rev - cogs };
              });
              break;

          case 'CASHIER':
              data = transactions.filter(t => isInRange(t.date)).map(t => ({ 'Tgl': formatDateIndo(t.date), 'Ref': t.refNumber || '-', 'Tipe': t.type, 'Kategori': t.category, 'Nominal': t.amount, 'Customer': t.customerName }));
              break;

          case 'PURCHASING':
              data = purchaseOrders.filter(po => isInRange(po.createdAt)).map(po => ({ 'No PO': po.poNumber, 'Supplier': po.supplierName, 'Status': po.status, 'Total': po.totalAmount }));
              break;

          case 'INVENTORY_STOCK':
              data = inventoryItems.map(i => ({ 'Kode': i.code, 'Nama': i.name, 'Stok': i.stock, 'Unit': i.unit, 'Nilai': i.stock * i.buyPrice }));
              break;
            
          case 'MECHANIC_PROD':
              const mStats: any = {};
              jobs.filter(j => j.isClosed && isInRange(j.closedAt)).forEach(j => {
                  if (j.mechanicName) {
                      if (!mStats[j.mechanicName]) mStats[j.mechanicName] = { name: j.mechanicName, units: 0, panels: 0 };
                      mStats[j.mechanicName].units++;
                      mStats[j.mechanicName].panels += j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0;
                  }
              });
              data = Object.values(mStats);
              break;
      }

      if (data.length === 0) {
          alert("Tidak ada data pada periode/kriteria yang dipilih.");
          return;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Data Report");
      XLSX.writeFile(wb, filename);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-700 rounded-xl shadow-sm text-white">
                    <FileSpreadsheet size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pusat Laporan</h1>
                    <p className="text-sm text-gray-500 font-medium">Download Data & Analisis Bisnis (Excel)</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <Calendar size={18} className="text-gray-500"/>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-medium"/>
                <span className="text-gray-400 font-bold">-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-medium"/>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* MASTER DATABASE UNIT */}
            <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-indigo-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-900 text-white rounded-lg"><Database size={20}/></div>
                    <h3 className="font-bold text-gray-800">Database Master Unit</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Data lengkap pelanggan & kendaraan dari menu Input Unit (Deduplikasi Nopol terbaru).</p>
                <button onClick={() => handleExport('VEHICLE_DATABASE')} className="w-full py-2 bg-indigo-900 text-white font-bold rounded-lg hover:bg-black flex items-center justify-center gap-2">
                    <Download size={16}/> Export Master DB
                </button>
            </div>

            {/* TAX REPORT */}
            <div className="bg-white p-6 rounded-xl border border-rose-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-rose-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-rose-600 text-white rounded-lg"><Landmark size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Pajak (In/Out)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekapitulasi PPN Masukan/Keluaran, PPh 23, dan PPh 25 dalam periode terpilih.</p>
                <button onClick={() => handleExport('TAX_REPORT')} className="w-full py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 flex items-center justify-center gap-2">
                    <Download size={16}/> Download Laporan Pajak
                </button>
            </div>

            {/* RECEIVABLES REPORT */}
            <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-emerald-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-600 text-white rounded-lg"><Wallet size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Piutang (User)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar sisa tagihan per WO yang belum lunas (Receivables Aging).</p>
                <button onClick={() => handleExport('RECEIVABLE_REPORT')} className="w-full py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2">
                    <Download size={16}/> Download Data Piutang
                </button>
            </div>

            {/* DEBT REPORT */}
            <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-orange-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-600 text-white rounded-lg"><Scale size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Hutang Supplier</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar sisa hutang ke vendor/supplier atas PO yang sudah diterima (Payables).</p>
                <button onClick={() => handleExport('DEBT_REPORT')} className="w-full py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 flex items-center justify-center gap-2">
                    <Download size={16}/> Download Data Hutang
                </button>
            </div>

            {/* PERFORMANCE ANALYSIS */}
            <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-indigo-50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-600 text-white rounded-lg"><TrendingUp size={20}/></div>
                    <h3 className="font-bold text-gray-800">Analisa Performa & Pasar</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Analisa market share asuransi, demografi, dan tren unit (Multi-Sheet).</p>
                <button onClick={() => handleExport('BI_ANALYSIS')} className="w-full py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
                    <Download size={16}/> Download Business BI
                </button>
            </div>

            {/* OTHER REPORTS (STANDARD) */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Activity size={20}/></div>
                    <h3 className="font-bold text-gray-800">Log Unit & Produksi</h3>
                </div>
                <button onClick={() => handleExport('UNIT_FLOW')} className="w-full py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><DollarSign size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Arus Kasir</h3>
                </div>
                <button onClick={() => handleExport('CASHIER')} className="w-full py-2 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-lg hover:bg-emerald-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><BarChart3 size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laba Rugi per WO</h3>
                </div>
                <button onClick={() => handleExport('PROFIT_LOSS_UNIT')} className="w-full py-2 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-lg hover:bg-indigo-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg"><Package size={20}/></div>
                    <h3 className="font-bold text-gray-800">Valuasi Stok Opname</h3>
                </div>
                <button onClick={() => handleExport('INVENTORY_STOCK')} className="w-full py-2 bg-white border border-cyan-200 text-cyan-700 font-bold rounded-lg hover:bg-cyan-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>
        </div>
    </div>
  );
};

export default ReportCenterView;
