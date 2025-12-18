
import React, { useState, useEffect, useMemo } from 'react';
import { Job, CashierTransaction, UserPermissions, Settings } from '../../types';
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, where } from 'firebase/firestore';
import { db, CASHIER_COLLECTION, SETTINGS_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo } from '../../utils/helpers';
import { generateGatePassPDF, generateReceiptPDF, generateInvoicePDF } from '../../utils/pdfGenerator';
import { Banknote, Search, FileText, Printer, Save, History, ArrowUpCircle, ArrowDownCircle, Ticket, CheckCircle, Wallet, Building2, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import { initialSettingsState } from '../../utils/constants';

interface CashierViewProps {
  jobs: Job[];
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
}

const CashierView: React.FC<CashierViewProps> = ({ jobs, userPermissions, showNotification }) => {
  const [transactions, setTransactions] = useState<CashierTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettingsState);

  // Form State
  const [trxType, setTrxType] = useState<'IN' | 'OUT'>('IN');
  const [category, setCategory] = useState('Pelunasan');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Transfer' | 'EDC'>('Transfer');
  const [selectedBank, setSelectedBank] = useState(''); // Default empty
  const [notes, setNotes] = useState('');
  
  // WO Linking
  const [woSearch, setWoSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    fetchTransactions();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
      try {
          const q = await getDocs(collection(db, SETTINGS_COLLECTION));
          if (!q.empty) {
              const data = q.docs[0].data() as Settings;
              setSettings(data);
              // Set default bank if available
              if (data.workshopBankAccounts && data.workshopBankAccounts.length > 0) {
                  const b = data.workshopBankAccounts[0];
                  setSelectedBank(`${b.bankName} - ${b.accountNumber}`);
              }
          }
      } catch (e) { console.error(e); }
  };

  const fetchTransactions = async () => {
      setLoading(true);
      try {
          // Fetch last 20 transactions
          const q = query(collection(db, CASHIER_COLLECTION), orderBy('createdAt', 'desc'), limit(20));
          const snap = await getDocs(q);
          const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashierTransaction));
          setTransactions(data);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  // Filter Jobs for Search
  const activeJobs = useMemo(() => {
      if (!woSearch) return [];
      const term = woSearch.toUpperCase();
      return jobs.filter(j => 
          (j.woNumber && j.woNumber.includes(term)) || 
          j.policeNumber.includes(term) ||
          j.customerName.toUpperCase().includes(term)
      ).slice(0, 5); // Limit suggestions
  }, [jobs, woSearch]);

  const handleSelectJob = (job: Job) => {
      setSelectedJob(job);
      setWoSearch(job.woNumber || job.policeNumber);
      
      // Auto-fill amount based on remaining bill
      // Round down to avoid decimal issues in UI
      const bill = Math.floor(job.estimateData?.grandTotal || 0);
      setAmount(bill);
  };

  // Helper to handle formatted number input
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Remove non-numeric characters
      const rawValue = e.target.value.replace(/[^0-9]/g, '');
      if (rawValue) {
          setAmount(parseInt(rawValue, 10));
      } else {
          setAmount('');
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!amount || amount <= 0) {
          showNotification("Jumlah uang tidak valid.", "error");
          return;
      }

      if ((category === 'Pelunasan' || category === 'Uang Muka') && !selectedJob) {
          showNotification("Mohon pilih Referensi WO untuk kategori pembayaran ini.", "error");
          return;
      }

      setLoading(true);
      try {
          const newTrx: any = {
              date: serverTimestamp(),
              type: trxType,
              category,
              amount: Number(amount),
              paymentMethod,
              description: notes,
              createdBy: userPermissions.role || 'Staff',
              createdAt: serverTimestamp()
          };

          // Tambahkan data bank jika metode pembayaran Transfer atau EDC
          if (trxType === 'IN' && (paymentMethod === 'Transfer' || paymentMethod === 'EDC')) {
              if (!selectedBank) {
                  throw new Error("Mohon pilih Bank Penerima.");
              }
              newTrx.bankName = selectedBank;
          }

          if (selectedJob) {
              newTrx.refNumber = selectedJob.woNumber;
              newTrx.refJobId = selectedJob.id;
              newTrx.customerName = selectedJob.customerName;
          } else {
              // Jika Petty Cash In / Out, labelnya disesuaikan
              if (category.includes('Kas Kecil')) {
                  newTrx.customerName = 'Internal / Bengkel';
              } else {
                  newTrx.customerName = 'Non-Customer / Umum';
              }
          }

          const docRef = await addDoc(collection(db, CASHIER_COLLECTION), newTrx);
          
          showNotification("Transaksi berhasil disimpan.", "success");
          
          // Reset Form
          setAmount('');
          setNotes('');
          // Do not clear Job to allow printing Gatepass immediately
          // setSelectedJob(null);
          // setWoSearch('');
          fetchTransactions();

      } catch (e: any) {
          showNotification("Gagal menyimpan transaksi: " + e.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handlePrintGatePass = () => {
      if (!selectedJob) {
          showNotification("Pilih unit/WO terlebih dahulu.", "error");
          return;
      }
      // Simple validation: check if total payments cover the bill
      const bill = selectedJob.estimateData?.grandTotal || 0;
      const paid = transactions
          .filter(t => t.refJobId === selectedJob.id && t.type === 'IN')
          .reduce((acc, t) => acc + t.amount, 0);
          
      if (paid < bill - 1000) { // 1000 tolerance
          if(!window.confirm(`Peringatan: Unit ini belum lunas.\nTotal Tagihan: ${formatCurrency(bill)}\nSudah Bayar: ${formatCurrency(paid)}\n\nTetap cetak Gate Pass?`)) {
              return;
          }
      }
      
      generateGatePassPDF(selectedJob, settings, userPermissions.role);
  };

  const handlePrintInvoice = () => {
      if (!selectedJob) return;
      generateInvoicePDF(selectedJob, settings);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-600 rounded-xl shadow-sm text-white">
                    <Banknote size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Kasir & Gatepass</h1>
                    <p className="text-sm text-gray-500 font-medium">Penerimaan Pembayaran & Ijin Keluar Kendaraan</p>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* FORM TRANSAKSI */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={18} className="text-indigo-600"/> Input Transaksi Baru
                    </h3>
                    <div className="flex bg-gray-200 rounded-lg p-1 text-xs font-bold">
                        <button 
                            onClick={() => { setTrxType('IN'); setCategory('Pelunasan'); }}
                            className={`px-4 py-1.5 rounded-md transition-all flex items-center gap-1 ${trxType === 'IN' ? 'bg-emerald-600 text-white shadow' : 'text-gray-600'}`}
                        >
                            <ArrowDownCircle size={14}/> UANG MASUK
                        </button>
                        <button 
                            onClick={() => { setTrxType('OUT'); setCategory('Kas Kecil (Petty Cash)'); }}
                            className={`px-4 py-1.5 rounded-md transition-all flex items-center gap-1 ${trxType === 'OUT' ? 'bg-red-600 text-white shadow' : 'text-gray-600'}`}
                        >
                            <ArrowUpCircle size={14}/> UANG KELUAR
                        </button>
                    </div>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* KIRI */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Transaksi</label>
                                <select 
                                    value={category} 
                                    onChange={e => setCategory(e.target.value)} 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
                                >
                                    {trxType === 'IN' ? (
                                        <>
                                            <option value="Pelunasan">Pelunasan Service (Full Payment)</option>
                                            <option value="Uang Muka">Uang Muka (Down Payment)</option>
                                            <option value="Pengisian Kas Kecil">Pengisian Kas Kecil (Top Up)</option>
                                            <option value="Lainnya">Penerimaan Lainnya</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Kas Kecil (Petty Cash)">Kas Kecil (Petty Cash)</option>
                                            <option value="Operasional">Biaya Operasional Besar</option>
                                            <option value="Refund">Refund Customer</option>
                                            <option value="Vendor">Pembayaran Vendor (Non-PO)</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            {(category === 'Pelunasan' || category === 'Uang Muka') && (
                                <div className="relative">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Cari No. WO / Polisi</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={woSearch} 
                                            onChange={e => { setWoSearch(e.target.value); setSelectedJob(null); }}
                                            placeholder="Ketik Nopol atau WO..."
                                            className={`w-full pl-10 p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono ${selectedJob ? 'border-green-500 bg-green-50 text-green-800 font-bold' : 'border-gray-300'}`}
                                        />
                                        <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                                        {selectedJob && <CheckCircle className="absolute right-3 top-3 text-green-600" size={18}/>}
                                    </div>
                                    
                                    {/* Suggestion Dropdown */}
                                    {woSearch && !selectedJob && activeJobs.length > 0 && (
                                        <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                            {activeJobs.map(job => (
                                                <div 
                                                    key={job.id} 
                                                    onClick={() => handleSelectJob(job)}
                                                    className="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0"
                                                >
                                                    <div className="font-bold text-gray-800">{job.policeNumber}</div>
                                                    <div className="text-xs text-gray-500">{job.woNumber} - {job.customerName}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedJob && (
                                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 text-sm space-y-3 shadow-inner">
                                    <h4 className="font-bold text-indigo-900 border-b border-indigo-200 pb-2 mb-2 flex items-center gap-2">
                                        <FileText size={14}/> Kontrol Dokumen & Tagihan
                                    </h4>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Pelanggan:</span>
                                        <span className="font-bold text-gray-900">{selectedJob.customerName}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Total Tagihan:</span>
                                        <span className="font-bold text-indigo-700">{formatCurrency(selectedJob.estimateData?.grandTotal)}</span>
                                    </div>
                                    
                                    <div className="pt-2 border-t border-indigo-200 flex gap-2">
                                        <button 
                                            type="button"
                                            onClick={handlePrintInvoice}
                                            className="flex-1 bg-white border border-indigo-300 text-indigo-700 py-2 rounded text-xs font-bold hover:bg-indigo-100 flex items-center justify-center gap-1 shadow-sm transition-colors"
                                        >
                                            <Printer size={14}/> Cetak Faktur (Invoice)
                                        </button>
                                    </div>
                                    <div className="text-[10px] text-gray-500 italic mt-1 flex items-start gap-1">
                                        <AlertCircle size={10} className="mt-0.5"/>
                                        Print Invoice sebelum pembayaran agar customer dapat melakukan cek detail biaya.
                                    </div>
                                </div>
                            )}

                            {category.includes('Kas Kecil') && (
                                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-xs text-orange-800 flex items-start gap-2">
                                    <Wallet size={16} className="shrink-0 mt-0.5"/>
                                    <p>
                                        {trxType === 'IN' 
                                            ? 'Catat penerimaan uang modal kasir (Top Up) dari Bank/Manager untuk keperluan kembalian atau biaya kecil.'
                                            : 'Gunakan kategori ini untuk pengeluaran kecil tanpa PO (Bensin, Kopi, ATK, dll).'
                                        }
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* KANAN */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-500 font-bold">Rp</span>
                                    <input 
                                        type="text" 
                                        required
                                        value={amount ? new Intl.NumberFormat('id-ID').format(amount) : ''} 
                                        onChange={handleAmountChange} 
                                        className="w-full pl-10 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold text-xl text-right tracking-wide text-gray-800"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Metode Pembayaran</label>
                                    <div className="flex gap-2">
                                        {['Cash', 'Transfer', 'EDC'].map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setPaymentMethod(m as any)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${paymentMethod === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* BANK SELECTION - DYNAMIC FROM SETTINGS */}
                                {trxType === 'IN' && (paymentMethod === 'Transfer' || paymentMethod === 'EDC') && (
                                    <div className="col-span-2 animate-fade-in">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Bank Penerima (Rekening Bengkel)</label>
                                        {settings.workshopBankAccounts && settings.workshopBankAccounts.length > 0 ? (
                                            <div className="relative">
                                                <select 
                                                    value={selectedBank} 
                                                    onChange={e => setSelectedBank(e.target.value)}
                                                    className="w-full pl-9 p-2.5 border border-indigo-300 bg-indigo-50 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-900"
                                                >
                                                    <option value="">-- Pilih Rekening --</option>
                                                    {settings.workshopBankAccounts.map((bank, idx) => (
                                                        <option key={idx} value={`${bank.bankName} - ${bank.accountNumber}`}>
                                                            {bank.bankName} - {bank.accountNumber} ({bank.accountHolder})
                                                        </option>
                                                    ))}
                                                </select>
                                                <Building2 className="absolute left-3 top-3 text-indigo-500" size={18}/>
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded border border-yellow-200 flex items-start gap-2">
                                                <SettingsIcon size={16} className="mt-0.5 shrink-0"/>
                                                <div>
                                                    <strong>Belum ada data rekening bank.</strong>
                                                    <br/>Harap tambahkan di menu Pengaturan - Database Sistem.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan / Keterangan</label>
                                <input 
                                    type="text" 
                                    value={notes} 
                                    onChange={e => setNotes(e.target.value)} 
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    placeholder={trxType === 'IN' ? "Contoh: Pelunasan Invoice #..." : "Contoh: Beli Bensin, Aqua Galon..."}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t flex gap-3 justify-end">
                        {/* GATE PASS BUTTON (Conditional) */}
                        {category === 'Pelunasan' && selectedJob && (
                            <button 
                                type="button"
                                onClick={handlePrintGatePass}
                                className="mr-auto flex items-center gap-2 bg-gray-800 text-white px-5 py-2.5 rounded-lg hover:bg-gray-900 transition-colors shadow-sm font-bold"
                            >
                                <Ticket size={18}/> Cetak Gate Pass
                            </button>
                        )}

                        <button 
                            type="submit" 
                            disabled={loading}
                            className={`flex items-center gap-2 text-white px-8 py-2.5 rounded-lg shadow-lg font-bold transition-all transform active:scale-95 ${trxType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                            <Save size={18}/> {loading ? 'Menyimpan...' : 'Simpan Transaksi'}
                        </button>
                    </div>
                </form>
            </div>

            {/* RIWAYAT / SIDEBAR */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <History size={18} className="text-gray-500"/>
                    <h3 className="font-bold text-gray-800">Riwayat Transaksi</h3>
                </div>
                <div className="overflow-y-auto flex-grow p-0">
                    {transactions.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">Belum ada transaksi hari ini.</div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {transactions.map(trx => (
                                <div key={trx.id} className="p-4 hover:bg-gray-50 transition-colors group">
                                    <div className="flex justify-between items-start mb-1">
                                        <div>
                                            <p className={`text-xs font-bold uppercase ${trx.type === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {trx.type === 'IN' ? 'Terima Uang' : 'Keluar Uang'} ({trx.paymentMethod})
                                            </p>
                                            <p className="font-bold text-gray-800 text-sm mt-0.5">
                                                {trx.category} 
                                                {trx.bankName && <span className="text-indigo-600 ml-1">- {trx.bankName}</span>}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`font-mono font-bold ${trx.type === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {trx.type === 'IN' ? '+' : '-'}{formatCurrency(trx.amount)}
                                            </span>
                                            <p className="text-[10px] text-gray-400 mt-1">{formatDateIndo(trx.date)}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate mb-2">
                                        {trx.customerName && <span className="font-semibold text-indigo-900">{trx.customerName} - </span>}
                                        {trx.description || '-'}
                                    </p>
                                    {/* Action Buttons */}
                                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => generateReceiptPDF(trx, settings)}
                                            className="text-xs flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded text-gray-600 hover:text-indigo-600 hover:border-indigo-200"
                                        >
                                            <Printer size={12}/> Kwitansi
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default CashierView;
