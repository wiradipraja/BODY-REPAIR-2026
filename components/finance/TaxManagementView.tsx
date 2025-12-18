
import React, { useState, useMemo } from 'react';
import { Job, PurchaseOrder, CashierTransaction, Settings, UserPermissions } from '../../types';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, CASHIER_COLLECTION } from '../../services/firebase';
// Added XCircle to the imports from lucide-react
import { Landmark, Calendar, Landmark as TaxIcon, ArrowUpRight, ArrowDownRight, Calculator, Plus, History, Receipt, AlertCircle, Building2, Save, Loader2, ListChecks, CheckCircle2, FileText, ShoppingCart, Percent, XCircle } from 'lucide-react';

interface TaxManagementViewProps {
  jobs: Job[];
  purchaseOrders: PurchaseOrder[];
  transactions: CashierTransaction[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
  userPermissions: UserPermissions;
}

const TaxManagementView: React.FC<TaxManagementViewProps> = ({ jobs, purchaseOrders, transactions, settings, showNotification, userPermissions }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'pending' | 'history'>('summary');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isProcessing, setIsProcessing] = useState(false);

  // Form State for Tax Payment
  const [taxForm, setTaxForm] = useState({
      type: 'PPh 23',
      amount: 0,
      periodMonth: new Date().getMonth(),
      periodYear: new Date().getFullYear(),
      paymentMethod: 'Transfer' as 'Cash' | 'Transfer' | 'EDC',
      bankName: settings.workshopBankAccounts?.[0] ? `${settings.workshopBankAccounts[0].bankName} - ${settings.workshopBankAccounts[0].accountNumber}` : '',
      notes: '',
      refNumber: '', // Linked to WO/PO
      refId: ''
  });

  // --- GET SETTLED TAX REF IDS ---
  const settledTaxRefs = useMemo(() => {
      return new Set(transactions
        .filter(t => t.category === 'Pajak' && t.refNumber)
        .map(t => t.refNumber));
  }, [transactions]);

  // --- DATA PROCESSING: PPN Output (Invoices) ---
  const pendingPPNInvoices = useMemo(() => {
      return jobs.filter(j => 
          j.hasInvoice && 
          j.woNumber && 
          !settledTaxRefs.has(j.woNumber)
      ).sort((a,b) => (b.closedAt?.seconds || 0) - (a.closedAt?.seconds || 0));
  }, [jobs, settledTaxRefs]);

  // --- DATA PROCESSING: PPh 23 (Sublet POs) ---
  const pendingPPhSublets = useMemo(() => {
      return purchaseOrders.filter(po => 
          po.status === 'Received' && 
          !settledTaxRefs.has(po.poNumber) &&
          // Check if PO contains sublet/jasa items
          po.items.some(item => item.category === 'material' || item.name.toLowerCase().includes('jasa'))
      ).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [purchaseOrders, settledTaxRefs]);

  // --- REQUISITION CALCULATION: PPN ---
  const ppnStats = useMemo(() => {
      const periodInvoices = jobs.filter(j => {
          if (!j.hasInvoice || !j.closedAt) return false;
          const d = j.closedAt.toDate ? j.closedAt.toDate() : new Date(j.closedAt);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      });
      const ppnOutput = periodInvoices.reduce((acc, j) => acc + (j.estimateData?.ppnAmount || 0), 0);

      const periodPOs = purchaseOrders.filter(po => {
          if (!po.createdAt || !po.hasPpn) return false;
          const d = po.createdAt.toDate ? po.createdAt.toDate() : new Date(po.createdAt);
          return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear && (po.status === 'Received' || po.status === 'Partial');
      });
      const ppnInput = periodPOs.reduce((acc, po) => acc + (po.ppnAmount || 0), 0);

      return { ppnOutput, ppnInput, ppnNet: ppnOutput - ppnInput, invoiceCount: periodInvoices.length, poCount: periodPOs.length };
  }, [jobs, purchaseOrders, selectedMonth, selectedYear]);

  const taxHistory = useMemo(() => {
      return transactions
        .filter(t => t.category === 'Pajak' && t.type === 'OUT')
        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  }, [transactions]);

  // --- HANDLERS ---
  const prepareTaxFromInvoice = (job: Job) => {
      setTaxForm({
          ...taxForm,
          type: 'PPN (Setoran Masa)',
          amount: Math.round(job.estimateData?.ppnAmount || 0),
          refNumber: job.woNumber || '',
          refId: job.id,
          notes: `Setoran PPN Faktur ${job.woNumber} - ${job.customerName}`
      });
      setActiveTab('pending'); // Scroll to form area
  };

  const prepareTaxFromPO = (po: PurchaseOrder) => {
      // Calculate 2% PPh 23 from total service cost (Assume 2% if not specific)
      const serviceTotal = po.items.reduce((acc, item) => acc + item.total, 0);
      const pphAmount = Math.round(serviceTotal * 0.02);

      setTaxForm({
          ...taxForm,
          type: 'PPh 23',
          amount: pphAmount,
          refNumber: po.poNumber,
          refId: po.id,
          notes: `Potongan PPh 23 (2%) atas PO Sublet ${po.poNumber} - ${po.supplierName}`
      });
      setActiveTab('pending');
  };

  const handleAddTaxPayment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (taxForm.amount <= 0) {
          showNotification("Jumlah pajak tidak valid.", "error");
          return;
      }

      setIsProcessing(true);
      try {
          const payload = {
              date: serverTimestamp(),
              createdAt: serverTimestamp(),
              createdBy: userPermissions.role,
              type: 'OUT',
              category: 'Pajak',
              amount: Number(taxForm.amount),
              paymentMethod: taxForm.paymentMethod,
              bankName: taxForm.paymentMethod !== 'Cash' ? taxForm.bankName : undefined,
              customerName: 'Kantor Pelayanan Pajak (KPP)',
              description: `Bayar ${taxForm.type} - Masa ${taxForm.periodMonth + 1}/${taxForm.periodYear}. ${taxForm.notes}`,
              refNumber: taxForm.refNumber || undefined
          };

          await addDoc(collection(db, CASHIER_COLLECTION), payload);
          showNotification(`Berhasil mencatat pembebanan ${taxForm.type}`, "success");
          setTaxForm(prev => ({ ...prev, amount: 0, notes: '', refNumber: '', refId: '' }));
          setActiveTab('history');
      } catch (e: any) {
          showNotification("Gagal mencatat: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-700 rounded-xl shadow-sm text-white">
                    <TaxIcon size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Manajemen Pajak Terintegrasi</h1>
                    <p className="text-sm text-gray-500 font-medium">Monitoring Pajak Berbasis Transaksi (Case-by-Case Compliance)</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                <Calendar size={18} className="text-gray-400 ml-2"/>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0">
                    {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 border-l border-gray-300 pl-2">
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        </div>

        {/* TABS */}
        <div className="flex border-b border-gray-200">
            <button onClick={() => setActiveTab('summary')} className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'summary' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Calculator size={18}/> Ringkasan PPN
            </button>
            <button onClick={() => setActiveTab('pending')} className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'pending' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <ListChecks size={18}/> Daftar Tunggu Pajak (Case)
                { (pendingPPNInvoices.length + pendingPPhSublets.length) > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingPPNInvoices.length + pendingPPhSublets.length}</span>}
            </button>
            <button onClick={() => setActiveTab('history')} className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'history' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <History size={18}/> Riwayat Setoran
            </button>
        </div>

        {activeTab === 'summary' && (
            <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                        <ArrowUpRight className="absolute -right-2 -top-2 text-emerald-100" size={80}/>
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">PPN Keluaran (Faktur)</p>
                        <h2 className="text-2xl font-black text-gray-900">{formatCurrency(ppnStats.ppnOutput)}</h2>
                        <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1"><Receipt size={10}/> Dari {ppnStats.invoiceCount} Penjualan Jasa/Part</div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                        <ArrowDownRight className="absolute -right-2 -top-2 text-red-100" size={80}/>
                        <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">PPN Masukan (PO)</p>
                        <h2 className="text-2xl font-black text-gray-900">{formatCurrency(ppnStats.ppnInput)}</h2>
                        <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1"><Building2 size={10}/> Dari {ppnStats.poCount} Pembelian Ber-PPN</div>
                    </div>

                    <div className={`p-6 rounded-xl border shadow-sm ${ppnStats.ppnNet >= 0 ? 'bg-indigo-900 text-white' : 'bg-emerald-600 text-white'}`}>
                        <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Estimasi Kurang/Lebih Bayar</p>
                        <h2 className="text-2xl font-black">{formatCurrency(Math.abs(ppnStats.ppnNet))}</h2>
                        <div className="mt-2 text-[10px] flex items-center gap-1 opacity-90"><Calculator size={10}/> {ppnStats.ppnNet >= 0 ? 'Wajib Setor ke Negara' : 'Kompensasi Bulan Depan'}</div>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                    <AlertCircle size={40} className="text-indigo-300 mb-3"/>
                    <h3 className="font-bold text-gray-800">Tips Kepatuhan Pajak</h3>
                    <p className="text-sm text-gray-500 max-w-lg mt-2">Gunakan tab <strong>Daftar Tunggu</strong> untuk membayar pajak secara spesifik per transaksi. Ini membantu melacak Faktur mana yang sudah dilaporkan NTPN-nya.</p>
                </div>
            </div>
        )}

        {activeTab === 'pending' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
                {/* LEFT: PENDING LIST */}
                <div className="lg:col-span-2 space-y-6">
                    {/* SECTION PPN */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                            <h3 className="font-bold text-emerald-800 flex items-center gap-2"><FileText size={18}/> Piutang PPN (Invoice Keluar)</h3>
                            <span className="text-[10px] font-bold bg-white text-emerald-600 px-2 py-1 rounded border border-emerald-200">{pendingPPNInvoices.length} Unit</span>
                        </div>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <tbody className="divide-y divide-gray-50">
                                    {pendingPPNInvoices.map(job => (
                                        <tr key={job.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-gray-900">{job.woNumber}</div>
                                                <div className="text-[10px] text-gray-400">{job.policeNumber} | {job.customerName}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="text-[10px] text-gray-400">PPN (11%)</div>
                                                <div className="font-bold text-emerald-600">{formatCurrency(job.estimateData?.ppnAmount)}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => prepareTaxFromInvoice(job)} className="text-[10px] font-bold bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 shadow-sm">Bayar / Setor</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {pendingPPNInvoices.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">Semua PPN Faktur sudah terselesaikan.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* SECTION PPh 23 */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 bg-orange-50 border-b border-orange-100 flex justify-between items-center">
                            <h3 className="font-bold text-orange-800 flex items-center gap-2"><ShoppingCart size={18}/> Hutang PPh 23 (Potongan Sublet)</h3>
                            <span className="text-[10px] font-bold bg-white text-orange-600 px-2 py-1 rounded border border-orange-200">{pendingPPhSublets.length} PO</span>
                        </div>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <tbody className="divide-y divide-gray-50">
                                    {pendingPPhSublets.map(po => {
                                        const serviceTotal = po.items.reduce((acc, i) => acc + i.total, 0);
                                        return (
                                            <tr key={po.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-gray-900">{po.poNumber}</div>
                                                    <div className="text-[10px] text-gray-400">{po.supplierName}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="text-[10px] text-gray-400">Est. PPh 23 (2%)</div>
                                                    <div className="font-bold text-orange-600">{formatCurrency(serviceTotal * 0.02)}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => prepareTaxFromPO(po)} className="text-[10px] font-bold bg-orange-600 text-white px-3 py-1.5 rounded hover:bg-orange-700 shadow-sm">Bebankan</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {pendingPPhSublets.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">Tidak ada tagihan PPh 23 yang perlu dipotong.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* RIGHT: SETTLEMENT FORM */}
                <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-lg h-fit ring-4 ring-indigo-50">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b">
                        <div className="p-2 bg-indigo-600 rounded-lg text-white"><Calculator size={20}/></div>
                        <h3 className="font-bold text-gray-800">Selesaikan Pembayaran Pajak</h3>
                    </div>
                    
                    <form onSubmit={handleAddTaxPayment} className="space-y-4">
                        {taxForm.refNumber && (
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 flex justify-between items-center animate-bounce-in">
                                <div>
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase">Referensi Transaksi</p>
                                    <p className="font-black text-indigo-700">{taxForm.refNumber}</p>
                                </div>
                                <button type="button" onClick={() => setTaxForm({...taxForm, refNumber: '', refId: '', amount: 0})} className="text-indigo-400 hover:text-indigo-600"><XCircle size={18}/></button>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jenis Pajak</label>
                            <select value={taxForm.type} onChange={e => setTaxForm({...taxForm, type: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-bold text-gray-800">
                                <option value="PPh 23">PPh 23 (Potongan Jasa Luar)</option>
                                <option value="PPN (Setoran Masa)">PPN (Setoran Hasil Faktur)</option>
                                <option value="PPh 21">PPh 21 (Pajak Staff/Gaji)</option>
                                <option value="PPh 25">PPh 25 (Pajak Badan)</option>
                                <option value="Lainnya">Pajak Lainnya</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nominal Pajak (IDR)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 font-bold text-gray-400">Rp</span>
                                <input type="number" required value={taxForm.amount || ''} onChange={e => setTaxForm({...taxForm, amount: Number(e.target.value)})} className="w-full pl-10 p-2.5 border border-gray-300 rounded-lg text-lg font-black text-indigo-900 focus:ring-2 ring-indigo-500"/>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Metode Bayar</label>
                                <select value={taxForm.paymentMethod} onChange={e => setTaxForm({...taxForm, paymentMethod: e.target.value as any})} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50">
                                    <option value="Transfer">Transfer Bank</option>
                                    <option value="Cash">Tunai (Kasir)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sumber Rekening</label>
                                <select value={taxForm.bankName} onChange={e => setTaxForm({...taxForm, bankName: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg text-[10px] bg-gray-50">
                                    {(settings.workshopBankAccounts || []).map((b, i) => (
                                        <option key={i} value={`${b.bankName} - ${b.accountNumber}`}>{b.bankName}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Catatan / No. NTPN</label>
                            <textarea value={taxForm.notes} onChange={e => setTaxForm({...taxForm, notes: e.target.value})} rows={2} placeholder="Masukkan referensi manual atau kode bayar..." className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"/>
                        </div>

                        <button type="submit" disabled={isProcessing} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-black shadow-xl hover:bg-indigo-700 transition-all transform active:scale-95 disabled:opacity-70">
                            {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                            SIMPAN PEMBEBANAN PAJAK
                        </button>
                    </form>
                </div>
            </div>
        )}

        {activeTab === 'history' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in flex flex-col min-h-[400px]">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <History size={18} className="text-gray-500"/> Riwayat Beban Pajak Terintegrasi
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-600 uppercase font-semibold text-[10px] tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Tgl Setor</th>
                                <th className="px-6 py-4">Referensi Case</th>
                                <th className="px-6 py-4">Keterangan</th>
                                <th className="px-6 py-4 text-right">Nominal</th>
                                <th className="px-6 py-4 text-center">PIC</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {taxHistory.length > 0 ? taxHistory.map(trx => (
                                <tr key={trx.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="font-bold">{formatDateIndo(trx.date)}</div>
                                        <div className="text-[10px] opacity-60">{trx.paymentMethod}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {trx.refNumber ? (
                                            <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md font-mono font-bold border border-indigo-100 text-xs">
                                                {trx.refNumber}
                                            </span>
                                        ) : <span className="text-gray-300">- General -</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-800">{trx.description}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-black text-red-600">
                                        {formatCurrency(trx.amount)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-[10px] font-bold text-gray-400">{trx.createdBy}</span>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-400 italic font-medium">Belum ada riwayat pembayaran pajak.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </div>
  );
};

export default TaxManagementView;
