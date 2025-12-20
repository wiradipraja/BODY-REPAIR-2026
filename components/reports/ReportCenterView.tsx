
import React, { useState } from 'react';
import { Job, CashierTransaction, PurchaseOrder, InventoryItem } from '../../types';
import * as XLSX from 'xlsx';
import { formatDateIndo, formatCurrency } from '../../utils/helpers';
import { FileSpreadsheet, Download, Calendar, Activity, DollarSign, Package, User, ShoppingCart, BarChart3 } from 'lucide-react';

interface ReportCenterViewProps {
  jobs: Job[];
  transactions: CashierTransaction[];
  purchaseOrders: PurchaseOrder[];
  inventoryItems: InventoryItem[];
}

const ReportCenterView: React.FC<ReportCenterViewProps> = ({ jobs, transactions, purchaseOrders, inventoryItems }) => {
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
      let data: any[] = [];
      let filename = `Report_${type}_${startDate}_to_${endDate}.xlsx`;

      switch (type) {
          case 'UNIT_FLOW':
              data = jobs.filter(j => isInRange(j.createdAt) || isInRange(j.closedAt)).map(j => ({
                  'Tanggal Masuk': formatDateIndo(j.tanggalMasuk),
                  'No. WO': j.woNumber || '-',
                  'No. Polisi': j.policeNumber,
                  'Pelanggan': j.customerName,
                  'Kendaraan': `${j.carBrand} ${j.carModel}`,
                  'SA': j.namaSA,
                  'Status Unit': j.statusKendaraan,
                  'Status WO': j.isClosed ? 'Closed' : 'Open',
                  'Tanggal Selesai': j.closedAt ? formatDateIndo(j.closedAt) : '-',
                  'Total Estimasi': j.estimateData?.grandTotal || 0,
                  'Panel': j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0
              }));
              break;

          case 'PROFIT_LOSS_UNIT':
              // EXCLUDE RAWAT JALAN: Only count fully closed (isClosed = true)
              data = jobs.filter(j => j.isClosed && isInRange(j.closedAt)).map(j => {
                  const revJasa = j.hargaJasa || 0;
                  const revPart = j.hargaPart || 0;
                  const cogsMat = j.costData?.hargaModalBahan || 0;
                  const cogsPart = j.costData?.hargaBeliPart || 0;
                  const cogsExt = j.costData?.jasaExternal || 0;
                  const grossProfit = (revJasa + revPart) - (cogsMat + cogsPart + cogsExt);
                  
                  return {
                      'Tgl Close': formatDateIndo(j.closedAt),
                      'No. WO': j.woNumber,
                      'Nopol': j.policeNumber,
                      'Revenue Jasa': revJasa,
                      'Revenue Part': revPart,
                      'Total Revenue': revJasa + revPart,
                      'HPP Bahan': cogsMat,
                      'HPP Part': cogsPart,
                      'HPP Jasa Luar': cogsExt,
                      'Total HPP': cogsMat + cogsPart + cogsExt,
                      'Gross Profit': grossProfit,
                      'Margin %': ((grossProfit / (revJasa+revPart)) * 100).toFixed(2) + '%'
                  };
              });
              break;

          case 'CASHIER':
              data = transactions.filter(t => isInRange(t.date)).map(t => ({
                  'Tanggal': formatDateIndo(t.date),
                  'No. Ref': t.refNumber || '-',
                  'Tipe': t.type === 'IN' ? 'Pemasukan' : 'Pengeluaran',
                  'Kategori': t.category,
                  'Keterangan': t.description,
                  'Customer/Pihak': t.customerName,
                  'Metode Bayar': t.paymentMethod,
                  'Bank': t.bankName || '-',
                  'Nominal': t.amount,
                  'PIC': t.createdBy
              }));
              break;

          case 'PURCHASING':
              data = purchaseOrders.filter(po => isInRange(po.createdAt)).map(po => ({
                  'Tanggal PO': formatDateIndo(po.createdAt),
                  'No. PO': po.poNumber,
                  'Supplier': po.supplierName,
                  'Status': po.status,
                  'Subtotal': po.subtotal,
                  'PPN': po.ppnAmount,
                  'Grand Total': po.totalAmount,
                  'Dibuat Oleh': po.createdBy
              }));
              break;

          case 'INVENTORY_STOCK':
              filename = `Report_Inventory_Stock_${new Date().toISOString().split('T')[0]}.xlsx`;
              data = inventoryItems.map(i => ({
                  'Kode': i.code,
                  'Nama Item': i.name,
                  'Kategori': i.category,
                  'Merk': i.brand,
                  'Stok Fisik': i.stock,
                  'Satuan': i.unit,
                  'Lokasi': i.location,
                  'Harga Beli': i.buyPrice,
                  'Harga Jual': i.sellPrice,
                  'Nilai Aset (Stok * Beli)': i.stock * i.buyPrice
              }));
              break;
            
          case 'MECHANIC_PROD':
              const mechStats: any = {};
              jobs.filter(j => j.isClosed && isInRange(j.closedAt)).forEach(j => {
                  if (j.mechanicName) {
                      if (!mechStats[j.mechanicName]) mechStats[j.mechanicName] = { name: j.mechanicName, totalUnit: 0, totalPanel: 0, totalRevenueJasa: 0 };
                      mechStats[j.mechanicName].totalUnit += 1;
                      const panels = j.estimateData?.jasaItems?.reduce((acc, i) => acc + (i.panelCount || 0), 0) || 0;
                      mechStats[j.mechanicName].totalPanel += panels;
                      mechStats[j.mechanicName].totalRevenueJasa += (j.hargaJasa || 0);
                  }
              });
              data = Object.values(mechStats);
              break;
      }

      if (data.length === 0) {
          alert("Tidak ada data pada periode yang dipilih.");
          return;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
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
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Activity size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Unit & Produksi</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekapitulasi kendaraan masuk, status pengerjaan, SA, dan tanggal estimasi.</p>
                <button onClick={() => handleExport('UNIT_FLOW')} className="w-full py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><DollarSign size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Kasir (Cash Flow)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Detail transaksi uang masuk/keluar harian, metode pembayaran, dan kategori.</p>
                <button onClick={() => handleExport('CASHIER')} className="w-full py-2 bg-white border border-emerald-200 text-emerald-700 font-bold rounded-lg hover:bg-emerald-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><BarChart3 size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laba Rugi per Unit (WO)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Analisis margin profitabilitas per WO (Revenue dikurangi HPP Material & Part).</p>
                <button onClick={() => handleExport('PROFIT_LOSS_UNIT')} className="w-full py-2 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-lg hover:bg-indigo-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><ShoppingCart size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Pembelian (PO)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekap purchase order ke supplier, status penerimaan, dan nilai total pembelian.</p>
                <button onClick={() => handleExport('PURCHASING')} className="w-full py-2 bg-white border border-orange-200 text-orange-700 font-bold rounded-lg hover:bg-orange-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg"><Package size={20}/></div>
                    <h3 className="font-bold text-gray-800">Laporan Aset Stok (Opname)</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Snapshot posisi stok saat ini beserta nilai valuasi aset persediaan (Part & Bahan).</p>
                <button onClick={() => handleExport('INVENTORY_STOCK')} className="w-full py-2 bg-white border border-cyan-200 text-cyan-700 font-bold rounded-lg hover:bg-cyan-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><User size={20}/></div>
                    <h3 className="font-bold text-gray-800">Kinerja Mekanik</h3>
                </div>
                <p className="text-xs text-gray-500 mb-6 h-10">Rekapitulasi jumlah unit dan total panel yang dikerjakan per mekanik.</p>
                <button onClick={() => handleExport('MECHANIC_PROD')} className="w-full py-2 bg-white border border-purple-200 text-purple-700 font-bold rounded-lg hover:bg-purple-50 flex items-center justify-center gap-2">
                    <Download size={16}/> Download .xlsx
                </button>
            </div>
        </div>
    </div>
  );
};

export default ReportCenterView;
