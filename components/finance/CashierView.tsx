
import React, { useState, useEffect, useMemo } from 'react';
import { Job, CashierTransaction, UserPermissions, Settings } from '../../types';
import { collection, addDoc, getDocs, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, CASHIER_COLLECTION, SETTINGS_COLLECTION, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { formatCurrency, formatDateIndo, generateTransactionNumber } from '../../utils/helpers';
import { generateGatePassPDF, generateReceiptPDF, generateInvoicePDF } from '../../utils/pdfGenerator';
import { Banknote, Search, FileText, Printer, Save, History, ArrowUpCircle, ArrowDownCircle, Ticket, CheckCircle, Wallet, Building2, Settings as SettingsIcon, AlertCircle, Calculator, ShieldCheck, Percent, Info } from 'lucide-react';
import { initialSettingsState } from '../../utils/constants';

interface CashierViewProps {
  jobs: Job[];
  transactions: CashierTransaction[]; // REAL-TIME PROP
  userPermissions: UserPermissions;
  showNotification: (msg: string, type: string) => void;
}

const CashierView: React.FC<CashierViewProps> = ({ jobs, transactions, userPermissions, showNotification }) => {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettingsState);

  // Form State
  const [trxType, setTrxType] = useState<'IN' | 'OUT'>('IN');
  const [category, setCategory] = useState('Pelunasan');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Transfer' | 'EDC'>('Transfer');
  const [selectedBank, setSelectedBank] = useState('');
  const [notes, setNotes] = useState('');
  
  // WITHHOLDING TAX STATE
  const [hasWithholding, setHasWithholding] = useState(false);
  const [withholdingAmount, setWithholdingAmount] = useState<number | ''>('');
  const [taxCertificateNo, setTaxCertificateNo] = useState('');

  // WO Linking & Payment Calculation
  const [woSearch, setWoSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [paymentSummary, setPaymentSummary] = useState({ totalBill: 0, totalPaid: 0, remaining: 0 });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
      try {
          const q = await getDocs(collection(db, SETTINGS_COLLECTION));
          if (!q.empty) {
              const data = q.docs[0].data() as Settings;
              setSettings(data);
              if (data.workshopBankAccounts && data.workshopBankAccounts.length > 0) {
                  const b = data.workshopBankAccounts[0];
                  setSelectedBank(`${b.bankName} - ${b.accountNumber}`);
              }
          }
      } catch (e) { console.error(e); }
  };

  // BUG FIX: Increased slice limit to 15 for better search visibility
  const activeJobs = useMemo(() => {
      if (!woSearch) return [];
      const term = woSearch.toUpperCase();
      return jobs.filter(j => 
          (j.woNumber && j.woNumber.includes(term)) || 
          j.policeNumber.includes(term) ||
          j.customerName.toUpperCase().includes(term)
      ).slice(0, 15); 
  }, [jobs, woSearch]);

  const handleSelectJob = (job: Job) => {
      setSelectedJob(job);
      setWoSearch(job.woNumber || job.policeNumber);
      
      const totalBill = Math.floor(job.estimateData?.grandTotal || 0);
      
      const totalPaid = transactions
          .filter(t => t.refJobId === job.id && t.type === 'IN') // Only counting IN (Payments received)
          .reduce((acc, t) => acc + (t.amount || 0), 0);

      const remaining = Math.max(0, totalBill - totalPaid);

      setPaymentSummary({ totalBill, totalPaid, remaining });
      
      // Auto-fill amount with remaining balance if any
      setAmount(remaining > 0 ? remaining : ''); 
      setWithholdingAmount('');
      setHasWithholding(false);

      if (totalPaid > 0) {
          setNotes(remaining > 0 ? `Pelunasan Kekurangan (Revisi Tagihan). Total: ${formatCurrency(totalBill)}` : `Lunas. Total Bill: ${formatCurrency(totalBill)}`);
      } else {
          setNotes(`Pembayaran Full Invoice ${job.woNumber}`);
      }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.replace(/[^0-9]/g, '');
      if (rawValue) {
          setAmount(parseInt(rawValue, 10));
      } else {
          setAmount('');
      }
  };

  const handleWithholdingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.replace(/[^0-9]/g, '');
      if (rawValue) {
          setWithholdingAmount(parseInt(rawValue, 10));
      } else {
          setWithholdingAmount('');
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

      if (trxType === 'IN' && selectedJob && Number(amount) > paymentSummary.remaining + 5000) { // Tolerance 5000
          if (!window.confirm(`Peringatan: Nominal Rp ${formatCurrency(Number(amount))} melebihi sisa tagihan Rp ${formatCurrency(paymentSummary.remaining)}. Lanjutkan?`)) {
              return;
          }
      }

      setLoading(true);
      try {
          const transactionNumber = generateTransactionNumber(trxType);

          // 1. Create the Main Payment Transaction
          const newTrx: any = {
              date: serverTimestamp(),
              type: trxType,
              category,
              amount: Number(amount),
              paymentMethod,
              description: notes,
              transactionNumber: transactionNumber,
              createdBy: userPermissions.role || 'Staff',
              createdAt: serverTimestamp()
          };

          if (trxType === 'IN' && (paymentMethod === 'Transfer' || paymentMethod === 'EDC')) {
              if (!selectedBank) throw new Error("Mohon pilih Bank Penerima.");
              newTrx.bankName = selectedBank;
          }

          if (selectedJob) {
              newTrx.refNumber = selectedJob.woNumber;
              newTrx.refJobId = selectedJob.id;
              newTrx.customerName = selectedJob.customerName;
          } else {
              newTrx.customerName = category.includes('Kas Kecil') ? 'Internal / Bengkel' : 'Non-Customer / Umum';
          }

          await addDoc(collection(db, CASHIER_COLLECTION), newTrx);

          // Auto-generate Receipt PDF
          // Mocking date for immediate PDF generation because serverTimestamp is pending
          const pdfTrx = { ...newTrx, date: new Date() };
          generateReceiptPDF(pdfTrx, settings);

          // 2. Create the Withholding Tax Transaction if enabled
          if (trxType === 'IN' && hasWithholding && withholdingAmount && Number(withholdingAmount) > 0) {
              const taxTrxId = generateTransactionNumber('IN'); // Distinct ID for Tax Record
              const taxTrx: any = {
                  date: serverTimestamp(),
                  type: 'IN',
                  category: 'Potongan PPh (Pihak Ke-3)',
                  amount: Number(withholdingAmount),
                  paymentMethod: 'Non-Tunai (Pajak)',
                  transactionNumber: taxTrxId,
                  description: `Potongan Pajak PPh oleh Pelanggan. Ref: ${newTrx.refNumber}`,
                  taxCertificateNumber: taxCertificateNo || 'PENDING',
                  createdBy: userPermissions.role || 'Staff',
                  createdAt: serverTimestamp(),
                  refJobId: selectedJob?.id,
                  refNumber: selectedJob?.woNumber,
                  customerName: selectedJob?.customerName
              };
              await addDoc(collection(db, CASHIER_COLLECTION), taxTrx);
              
              // Generate PDF for Tax Receipt as well? Maybe useful.
              generateReceiptPDF({...taxTrx, date: new Date()}, settings);
          }
          
          showNotification("Transaksi berhasil disimpan & Bukti PDF diunduh.", "success");
          
          setAmount('');
          setWithholdingAmount('');
          setHasWithholding(false);
          setTaxCertificateNo('');
          setNotes('');
          setSelectedJob(null);
          setWoSearch('');
          setPaymentSummary({ totalBill: 0, totalPaid: 0, remaining: 0 });

      } catch (e: any) {
          showNotification("Gagal menyimpan transaksi: " + e.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handlePrintGatePass = async () => {
      if (!selectedJob) {
          showNotification("Pilih unit/WO terlebih dahulu.", "error");
          return;
      }

      const bill = selectedJob.estimateData?.grandTotal || 0;
      const paid = transactions
          .filter(t => t.refJobId === selectedJob.id && t.type === 'IN')
          .reduce((acc, t) => acc + (t.amount || 0), 0);
      
      if (paid < bill - 1000) {
          if(!window.confirm(`Peringatan: Unit ini belum lunas.\n\nTotal Tagihan: ${formatCurrency(bill)}\nSudah Bayar: ${formatCurrency(paid)}\nSisa: ${formatCurrency(bill - paid)}\n\nTetap cetak Gate Pass?`)) {
              return;
          }
      }
      
      // 1. Generate PDF
      generateGatePassPDF(selectedJob, settings, userPermissions.role || 'Staff');

      // 2. TRIGGER JOB CONTROL & CRC UPDATE
      // Logic: Unit sudah GatePass = Unit Keluar Bengkel
      // - Remove from Active Job Control (Change statusKendaraan & posisiKendaraan)
      // - Add to CRC Queue (Set crcFollowUpStatus: 'Pending')
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          await updateDoc(jobRef, {
              statusKendaraan: 'Sudah Diambil Pemilik', // Status changed from 'Selesai (Tunggu Pengambilan)'
              posisiKendaraan: 'Di Pemilik', // Position changed from 'Di Bengkel'
              crcFollowUpStatus: 'Pending', // NEW: Trigger entry to CRC Dashboard
              updatedAt: serverTimestamp(),
              productionLogs: arrayUnion({
                  stage: 'Gate Pass',
                  timestamp: new Date().toISOString(),
                  user: userPermissions.role || 'Cashier',
                  type: 'progress',
                  note: 'Unit Keluar (Gate Pass Printed) -> Masuk Antrian CRC'
              })
          });
          
          showNotification("Gate Pass didownload. Unit dipindah ke 'Sudah Diambil' & 'Antrian CRC'.", "success");
          
          // Clear Selection
          setSelectedJob(null);
          setWoSearch('');
          setPaymentSummary({ totalBill: 0, totalPaid: 0, remaining: 0 });

      } catch (e: any) {
          console.error("Error updating job status after Gatepass:", e);
          showNotification("PDF dicetak, namun gagal update status unit di sistem.", "warning");
      }
  };

  const handlePrintInvoice = () => {
      if (!selectedJob) return;
      try {
        generateInvoicePDF(selectedJob, settings);
      } catch (e) {
        console.error(e);
        showNotification("Gagal mencetak Invoice.", "error");
      }
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                                            onChange={e => { setWoSearch(e.target.value); setSelectedJob(null); setPaymentSummary({ totalBill: 0, totalPaid: 0, remaining: 0 }); }}
                                            placeholder="Ketik Nopol atau WO..."
                                            className={`w-full pl-10 p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono ${selectedJob ? 'border-green-500 bg-green-50 text-green-800 font-bold' : 'border-gray-300'}`}
                                        />
                                        <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                                        {selectedJob && <CheckCircle className="absolute right-3 top-3 text-green-600" size={18}/>}
                                    </div>
                                    
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
                                        <span className="font-bold text-gray-900 truncate max-w-[150px]">{selectedJob.customerName}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-indigo-100 pt-2">
                                        <span className="text-gray-600">Total Tagihan (Revisi):</span>
                                        <span className="font-bold text-gray-800">{formatCurrency(paymentSummary.totalBill)}</span>
                                    </div>
                                    {paymentSummary.totalPaid > 0 && (
                                        <div className="flex justify-between bg-white/50 p-1.5 rounded border border-indigo-100">
                                            <span className="text-emerald-600 flex items-center gap-1 font-bold text-xs"><CheckCircle size={10}/> SUDAH DIBAYAR (HISTORI):</span>
                                            <span className="font-bold text-emerald-600">-{formatCurrency(paymentSummary.totalPaid)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between border-t-2 border-indigo-300 pt-2 mt-1">
                                        <span className="text-indigo-900 font-bold">SISA KEKURANGAN:</span>
                                        <span className="font-bold text-indigo-700 text-lg">{formatCurrency(paymentSummary.remaining)}</span>
                                    </div>
                                    <div className="pt-2 border-t border-indigo-200 flex gap-2">
                                        <button 
                                            type="button"
                                            onClick={handlePrintInvoice}
                                            className="flex-1 bg-white border border-indigo-300 text-indigo-700 py-2 rounded text-xs font-bold hover:bg-indigo-100 flex items-center justify-center gap-1 shadow-sm transition-colors"
                                        >
                                            <Printer size={14}/> Faktur
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={handlePrintGatePass}
                                            className="flex-1 bg-gray-800 text-white py-2 rounded text-xs font-bold hover:bg-gray-900 flex items-center justify-center gap-1 shadow-sm transition-colors"
                                        >
                                            <Ticket size={14}/> Gatepass
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {selectedJob ? 'Nominal Dibayar (Sisa Kekurangan)' : 'Nominal (Rp)'}
                                </label>
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
                                {selectedJob && paymentSummary.remaining === 0 && (
                                    <p className="text-xs text-green-600 font-bold mt-1 flex items-center gap-1"><CheckCircle size={12}/> Tagihan sudah lunas.</p>
                                )}
                            </div>

                            {/* WITHHOLDING TAX SECTION (PPh Diterima dari Pelanggan) */}
                            {trxType === 'IN' && selectedJob && (
                                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-4">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={hasWithholding} 
                                            onChange={e => setHasWithholding(e.target.checked)}
                                            className="w-4 h-4 text-amber-600 rounded"
                                        />
                                        <span className="text-sm font-bold text-amber-800">Ada Potongan Pajak oleh Pelanggan?</span>
                                    </label>

                                    {hasWithholding && (
                                        <div className="space-y-4 animate-fade-in pt-2 border-t border-amber-100">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">Pajak Dipotong (Rp)</label>
                                                    <input 
                                                        type="text" 
                                                        value={withholdingAmount ? new Intl.NumberFormat('id-ID').format(withholdingAmount) : ''} 
                                                        onChange={handleWithholdingChange}
                                                        className="w-full p-2 border border-amber-300 rounded text-sm font-bold text-amber-900"
                                                        placeholder="Contoh: 20.000"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">No. Bukti Potong</label>
                                                    <input 
                                                        type="text" 
                                                        value={taxCertificateNo} 
                                                        onChange={e => setTaxCertificateNo(e.target.value)}
                                                        className="w-full p-2 border border-amber-300 rounded text-sm font-mono"
                                                        placeholder="BP-123XXX"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] font-bold text-amber-700 bg-white p-2 rounded border border-amber-100">
                                                <span>PELUNASAN PIUTANG AKAN DICATAT SEBESAR:</span>
                                                <span className="text-sm">{formatCurrency(Number(amount || 0) + Number(withholdingAmount || 0))}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Metode Pembayaran (Uang Masuk)</label>
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
                        <button 
                            type="submit" 
                            disabled={loading}
                            className={`flex items-center gap-2 text-white px-10 py-3 rounded-xl shadow-lg font-black transition-all transform active:scale-95 ${trxType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                            <Save size={20}/> {loading ? 'Menyimpan...' : 'PROSES TRANSAKSI'}
                        </button>
                    </div>
                </form>
            </div>

            {/* RIWAYAT (REALTIME FROM PROPS) */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[650px]">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <History size={18} className="text-gray-500"/>
                    <h3 className="font-bold text-gray-800">Riwayat Transaksi (Live)</h3>
                </div>
                <div className="overflow-y-auto flex-grow p-0">
                    {transactions.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">Belum ada transaksi.</div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {transactions.slice(0, 30).map(trx => (
                                <div key={trx.id} className="p-4 hover:bg-gray-50 transition-colors group">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex-1">
                                            <p className={`text-[10px] font-black uppercase ${trx.type === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {trx.type === 'IN' ? 'Terima Uang' : 'Keluar Uang'} ({trx.paymentMethod})
                                            </p>
                                            <p className="font-bold text-gray-800 text-sm mt-0.5">
                                                {trx.category} 
                                                {trx.bankName && <span className="text-indigo-600 ml-1">- {trx.bankName}</span>}
                                            </p>
                                            <span className="text-[9px] font-mono text-gray-400 bg-gray-50 px-1 rounded">{trx.transactionNumber || '-'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className={`font-mono font-bold ${trx.type === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {trx.type === 'IN' ? '+' : '-'}{formatCurrency(trx.amount)}
                                            </span>
                                            <p className="text-[10px] text-gray-400 mt-1">{formatDateIndo(trx.date)}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate mb-1">
                                        {trx.customerName && <span className="font-semibold text-indigo-900">{trx.customerName} - </span>}
                                        {trx.description || '-'}
                                    </p>
                                    {trx.taxCertificateNumber && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 w-fit">
                                            <ShieldCheck size={10}/> BP: {trx.taxCertificateNumber}
                                        </div>
                                    )}
                                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                                        {trx.paymentMethod !== 'Non-Tunai (Pajak)' && (
                                            <button 
                                                onClick={() => generateReceiptPDF(trx, settings)}
                                                className="text-xs flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded text-gray-600 hover:text-indigo-600 hover:border-indigo-200"
                                            >
                                                <Printer size={12}/> Kwitansi
                                            </button>
                                        )}
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
