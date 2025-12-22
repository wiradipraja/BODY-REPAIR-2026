
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
                  'Pihak Penjamin (Asuransi)': v.namaAsuransi,
                  'Tanggal Terdaftar': v.createdAt ? formatDateIndo(v.createdAt) : '-'
              }));
              filename = `Database_Master_Unit_Cleaned_${new Date().toISOString().split('T')[0]}.xlsx`;
              break;

          case 'TAX_REPORT':
              data = transactions
                .filter(t => t.category.includes('Pajak') || t.description?.toLowerCase().includes('ppn') || t.description?.toLowerCase().includes('pph'))
                .filter(t => isInRange(t.date))
                .map(t => ({
                    'No. Transaksi': t.transactionNumber || '-',
                    'Tanggal Transaksi': formatDateIndo(t.date),
                    'Tipe Pajak': t.type === 'IN' ? 'Pajak Masuk / Potongan' : 'Setoran Pajak / Keluar',
                    'Kategori Pajak': t.category,
                    'Ref Dokumen (WO/PO)': t.refNumber || '-',
                    'Nama Pihak Terkait': t.customerName || '-',
                    'Nominal (Rp)': t.amount,
                    'No. Bukti Potong': t.taxCertificateNumber || '-',
                    'Keterangan / Catatan': t.description || '-',
                    'Metode Pembayaran': t.paymentMethod,
                    'Bank / Kas': t.bankName || 'KAS TUNAI',
                    'Admin Input': t.createdBy || '-'
                }));
              
              if (data.length > 0) {
                  const total = data.reduce((acc, curr) => acc + (curr['Nominal (Rp)'] || 0), 0);
                  data.push({ 'Tanggal Transaksi': 'TOTAL KESELURUHAN', 'Nominal (Rp)': total });
              }
              filename = `Laporan_Pajak_${startDate}_to_${endDate}.xlsx`;
              break;

          case 'RECEIVABLE_REPORT':
              data = jobs
                .filter(j => j.woNumber && !j.isDeleted)
                .map(job => {
                    const totalBill = job.estimateData?.grandTotal || 0;
                    const paidAmount = transactions
                        .filter(t => t.refJobId === job.id && t.type === 'IN')
                        .reduce((acc, t) => acc + (t.amount || 0), 0);
                    const remaining = totalBill - paidAmount;
                    return {
                        'No. Invoice': job.invoiceNumber || '-',
                        'No. WO': job.woNumber,
                        'No. Polisi': job.policeNumber,
                        'Nama Pelanggan': job.customerName,
                        'Asuransi / Penjamin': job.namaAsuransi,
                        'Tgl Masuk Unit': formatDateIndo(job.tanggalMasuk),
                        'Total Tagihan (Rp)': totalBill,
                        'Sudah Dibayar (Rp)': paidAmount,
                        'Sisa Piutang (Rp)': remaining,
                        'Status Dokumen': job.isClosed ? 'Closed' : 'Open',
                        'SA Penanggungjawab': job.namaSA || '-'
                    };
                })
                .filter(r => r['Sisa Piutang (Rp)'] > 100);
              
              if (data.length > 0) {
                  const tBill = data.reduce((acc, curr) => acc + curr['Total Tagihan (Rp)'], 0);
                  const tPaid = data.reduce((acc, curr) => acc + curr['Sudah Dibayar (Rp)'], 0);
                  const tRem = data.reduce((acc, curr) => acc + curr['Sisa Piutang (Rp)'], 0);
                  data.push({ 'No. WO': 'TOTAL KESELURUHAN', 'Total Tagihan (Rp)': tBill, 'Sudah Dibayar (Rp)': tPaid, 'Sisa Piutang (Rp)': tRem });
              }
              filename = `Laporan_Piutang_Unit_${new Date().toISOString().split('T')[0]}.xlsx`;
              break;

          case 'DEBT_REPORT':
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
                        'Tanggal PO': po.date ? formatDateIndo(po.date) : formatDateIndo(po.createdAt || po.approvedAt), 
                        'Nama Supplier': po.supplierName,
                        'Status Barang': po.status,
                        'Total Hutang (Rp)': totalBill,
                        'Sudah Dibayar (Rp)': paidAmount,
                        'Sisa Hutang (Rp)': remaining,
                        'Catatan / Keterangan PO': po.notes || '-',
                        'Admin Pembuat PO': po.createdBy || '-'
                    };
                })
                .filter(p => p['Sisa Hutang (Rp)'] > 100);
              
              if (data.length > 0) {
                  const tBill = data.reduce((acc, curr) => acc + curr['Total Hutang (Rp)'], 0);
                  const tPaid = data.reduce((acc, curr) => acc + curr['Sudah Dibayar (Rp)'], 0);
                  const tRem = data.reduce((acc, curr) => acc + curr['Sisa Hutang (Rp)'], 0);
                  data.push({ 'No. PO': 'TOTAL KESELURUHAN', 'Total Hutang (Rp)': tBill, 'Sudah Dibayar (Rp)': tPaid, 'Sisa Hutang (Rp)': tRem });
              }
              filename = `Laporan_Hutang_Supplier_${new Date().toISOString().split('T')[0]}.xlsx`;
              break;

          case 'UNIT_FLOW':
              data = jobs.filter(j => isInRange(j.createdAt) || isInRange(j.closedAt)).map(j => ({
                  'Tgl Masuk': formatDateIndo(j.tanggalMasuk), 
                  'No. Invoice': j.invoiceNumber || '-',
                  'No. WO': j.woNumber || '-', 
                  'No. Polisi': j.policeNumber, 
                  'Nama Pelanggan': j.customerName, 
                  'Status Unit': j.statusKendaraan, 
                  'Service Advisor': j.namaSA, 
                  'Total Panel (Pcs)': j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0,
                  'Catatan Progress': j.statusPekerjaan
              }));
              
              if (data.length > 0) {
                  const totalPanel = data.reduce((acc, curr) => acc + curr['Total Panel (Pcs)'], 0);
                  data.push({ 'Tgl Masuk': 'TOTAL REKAPITULASI', 'No. WO': `Total Unit: ${data.length}`, 'Total Panel (Pcs)': totalPanel });
              }
              break;

          case 'PROFIT_LOSS_UNIT':
              data = jobs.filter(j => j.isClosed && isInRange(j.closedAt)).map(j => {
                  const rev = (j.hargaJasa || 0) + (j.hargaPart || 0);
                  const cogs = (j.costData?.hargaModalBahan || 0) + (j.costData?.hargaBeliPart || 0) + (j.costData?.jasaExternal || 0);
                  return { 
                      'No. Invoice': j.invoiceNumber || '-',
                      'No. WO': j.woNumber, 
                      'No. Polisi': j.policeNumber, 
                      'Asuransi / Penjamin': j.namaAsuransi,
                      'Revenue (Rp)': rev, 
                      'HPP (Bahan+Part+Sublet)': cogs, 
                      'Gross Profit (Rp)': rev - cogs,
                      'Tgl Closing': formatDateIndo(j.closedAt)
                  };
              });

              if (data.length > 0) {
                  const tRev = data.reduce((acc, curr) => acc + curr['Revenue (Rp)'], 0);
                  const tCogs = data.reduce((acc, curr) => acc + curr['HPP (Bahan+Part+Sublet)'], 0);
                  const tGp = data.reduce((acc, curr) => acc + curr['Gross Profit (Rp)'], 0);
                  data.push({ 'No. WO': 'TOTAL KESELURUHAN', 'Revenue (Rp)': tRev, 'HPP (Bahan+Part+Sublet)': tCogs, 'Gross Profit (Rp)': tGp });
              }
              break;

          case 'CASHIER':
              data = transactions
                .filter(t => isInRange(t.date))
                .map(t => ({ 
                    'No. Transaksi': t.transactionNumber || '-',
                    'Tanggal': formatDateIndo(t.date), 
                    'No. Ref (WO/PO)': t.refNumber || '-', 
                    'Tipe Arus': t.type === 'IN' ? 'UANG MASUK' : 'UANG KELUAR', 
                    'Kategori': t.category, 
                    'Nama Pihak (Customer/Vendor)': t.customerName || '-',
                    'Nominal (Rp)': t.amount, 
                    'Keterangan / Log Transaksi': t.description || '-', 
                    'Metode': t.paymentMethod,
                    'Bank / Sumber Dana': t.bankName || 'KAS TUNAI',
                    'Admin/Petugas': t.createdBy || '-'
                }));
              
              if (data.length > 0) {
                  const totalIn = data.filter(d => d['Tipe Arus'] === 'UANG MASUK').reduce((acc, curr) => acc + curr['Nominal (Rp)'], 0);
                  const totalOut = data.filter(d => d['Tipe Arus'] === 'UANG KELUAR').reduce((acc, curr) => acc + curr['Nominal (Rp)'], 0);
                  data.push({ 'Tanggal': 'TOTAL MASUK', 'Nominal (Rp)': totalIn });
                  data.push({ 'Tanggal': 'TOTAL KELUAR', 'Nominal (Rp)': totalOut });
                  data.push({ 'Tanggal': 'SALDO PERIODE', 'Nominal (Rp)': totalIn - totalOut });
              }
              filename = `Laporan_Arus_Kasir_${startDate}_to_${endDate}.xlsx`;
              break;

          case 'INVENTORY_STOCK':
              data = inventoryItems.map(i => ({ 
                  'Kode Item': i.code, 
                  'Nama Barang': i.name, 
                  'Merk': i.brand || '-',
                  'Stok Akhir': i.stock, 
                  'Satuan': i.unit, 
                  'Harga Beli Satuan (Rp)': i.buyPrice,
                  'Total Nilai Stok (Rp)': i.stock * i.buyPrice 
              }));

              if (data.length > 0) {
                  const totalValue = data.reduce((acc, curr) => acc + curr['Total Nilai Stok (Rp)'], 0);
                  data.push({ 'Kode Item': 'TOTAL VALUASI GUDANG', 'Total Nilai Stok (Rp)': totalValue });
              }
              filename = `Valuasi_Stok_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
              break;
            
          case 'MECHANIC_PROD':
              const mStats: any = {};
              const filteredJobs = jobs.filter(j => j.isClosed && isInRange(j.closedAt));
              filteredJobs.forEach(j => {
                  const involvedMechs = Array.from(new Set(j.assignedMechanics?.map(a => a.name) || []));
                  involvedMechs.forEach((mName: any) => {
                      if (!mStats[mName]) mStats[mName] = { 'Nama Mekanik': mName, 'Total Unit Selesai': 0, 'Total Produksi Panel': 0 };
                      mStats[mName]['Total Unit Selesai']++;
                      mStats[mName]['Total Produksi Panel'] += j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0;
                  });
              });
              data = Object.values(mStats);

              if (data.length > 0) {
                  const tUnit = data.reduce((acc, curr) => acc + curr['Total Unit Selesai'], 0);
                  const tPanel = data.reduce((acc, curr) => acc + curr['Total Produksi Panel'], 0);
                  data.push({ 'Nama Mekanik': 'TOTAL PRODUKSI TIM', 'Total Unit Selesai': tUnit, 'Total Produksi Panel': tPanel });
              }
              filename = `Produktivitas_Mekanik_${startDate}_to_${endDate}.xlsx`;
              break;
      }

      if (data.length === 0) {
          alert("Tidak ada data pada periode atau kriteria yang dipilih.");
          return;
      }

      // EXCEL GENERATION WITH ENHANCED TABULAR LAYOUT (AUTO-WIDTH SIMULATES BORDERS)
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Auto-fit Column Widths for a clean "bordered" table feel
      const colWidths = Object.keys(data[0]).map(key => {
          const lengths = data.map(d => (d[key] ? d[key].toString().length : 0));
          const maxLen = Math.max(key.length, ...lengths);
          return { wch: maxLen + 4 }; // Extra padding for visual clarity
      });
      ws['!cols'] = colWidths;

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
                    <p className="text-sm text-gray-500 font-medium">Data Audit, Finansial & Produksi dengan Rekapitulasi TOTAL</p>
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

            <div className="bg-white p-6 rounded-xl border border-rose-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-rose-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-rose-600 text-white rounded-lg"><Landmark size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Pajak (Audit)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekapitulasi PPN Masukan/Keluaran, PPh 23, dan PPh 25 lengkap dengan TOTAL nominal.</p>
                <button onClick={() => handleExport('TAX_REPORT')} className="w-full py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 flex items-center justify-center gap-2">
                    <Download size={16}/> Download Data Pajak
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-emerald-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-600 text-white rounded-lg"><Wallet size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Piutang Unit</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar sisa tagihan per WO yang belum lunas dilengkapi ringkasan TOTAL piutang.</p>
                <button onClick={() => handleExport('RECEIVABLE_REPORT')} className="w-full py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2">
                    <Download size={16}/> Download Data Piutang
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-orange-50/50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-600 text-white rounded-lg"><Scale size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Hutang Supplier</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar sisa hutang PO (Received) lengkap dengan Tgl PO, Catatan, dan TOTAL hutang.</p>
                <button onClick={() => handleExport('DEBT_REPORT')} className="w-full py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 flex items-center justify-center gap-2">
                    <Download size={16}/> Download Data Hutang
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Activity size={20}/></div>
                    <h3 className="font-bold text-gray-800">Log Unit & Produksi</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekapitulasi unit masuk, status progress, dan rekap TOTAL panel produksi.</p>
                <button onClick={() => handleExport('UNIT_FLOW')} className="w-full py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-emerald-200 shadow-sm hover:shadow-md transition-shadow ring-2 ring-emerald-50">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><DollarSign size={20}/></div>
                    <h3 className="font-bold text-gray-800">Arus Kasir (Audit Log)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Histori uang masuk/keluar lengkap dengan Catatan, Admin, dan TOTAL saldo periode.</p>
                <button onClick={() => handleExport('CASHIER')} className="w-full py-2 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-lg hover:bg-emerald-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><BarChart3 size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laba Rugi per WO</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Analisa revenue, HPP, dan Gross Profit per WO lengkap dengan TOTAL laba kotor.</p>
                <button onClick={() => handleExport('PROFIT_LOSS_UNIT')} className="w-full py-2 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg"><Package size={20}/></div>
                    <h3 className="font-bold text-gray-800">Valuasi Stok Opname</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Daftar stok akhir inventory lengkap dengan harga beli dan TOTAL valuasi gudang.</p>
                <button onClick={() => handleExport('INVENTORY_STOCK')} className="w-full py-2 bg-white border border-cyan-200 text-cyan-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>
            
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><User size={20}/></div>
                    <h3 className="font-bold text-gray-800">Produktivitas Mekanik</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekap performa mekanik (Unit & Panel) lengkap dengan TOTAL pencapaian tim.</p>
                <button onClick={() => handleExport('MECHANIC_PROD')} className="w-full py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>
        </div>
    </div>
  );
};

export default ReportCenterView;
