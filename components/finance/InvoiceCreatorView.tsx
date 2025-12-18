
import React, { useState, useEffect, useMemo } from 'react';
import { Job, Settings } from '../../types';
import { formatCurrency, formatDateIndo, cleanObject } from '../../utils/helpers';
import { generateInvoicePDF } from '../../utils/pdfGenerator';
import { doc, updateDoc } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { FileCheck, Search, FileText, User, Car, Printer, Save, Calculator, AlertTriangle, CheckCircle, Clock, XCircle, RotateCcw } from 'lucide-react';

interface InvoiceCreatorViewProps {
  jobs: Job[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
}

const InvoiceCreatorView: React.FC<InvoiceCreatorViewProps> = ({ jobs, settings, showNotification }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  
  // Editable State for Discounts
  const [discountJasa, setDiscountJasa] = useState(0);
  const [discountPart, setDiscountPart] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter Active WO
  const activeWOs = useMemo(() => {
      const term = searchTerm.toUpperCase().trim();
      return jobs.filter(j => 
          j.woNumber && !j.isDeleted &&
          (term === '' || 
           j.woNumber.includes(term) || 
           j.policeNumber.includes(term) ||
           j.customerName.toUpperCase().includes(term))
      );
  }, [jobs, searchTerm]);

  // List of Invoices History
  const invoicesHistory = useMemo(() => {
      return jobs
        .filter(j => j.hasInvoice && !j.isDeleted)
        .sort((a, b) => {
            // Sort by Invoice Date logic (fallback to updated at)
            const tA = a.closedAt?.seconds || 0;
            const tB = b.closedAt?.seconds || 0;
            return tB - tA;
        });
  }, [jobs]);

  // Load Job into State
  useEffect(() => {
      if (selectedJob && selectedJob.estimateData) {
          setDiscountJasa(selectedJob.estimateData.discountJasa || 0);
          setDiscountPart(selectedJob.estimateData.discountPart || 0);
      }
  }, [selectedJob]);

  // Recalculate Logic (Same as EstimateEditor)
  const calculations = useMemo(() => {
      if (!selectedJob || !selectedJob.estimateData) return null;
      
      const jasaItems = selectedJob.estimateData.jasaItems || [];
      const partItems = selectedJob.estimateData.partItems || [];

      const subtotalJasa = jasaItems.reduce((acc, item) => acc + (item.price || 0), 0);
      const subtotalPart = partItems.reduce((acc, item) => acc + ((item.price || 0) * (item.qty || 1)), 0);

      const discJasaRp = (subtotalJasa * discountJasa) / 100;
      const discPartRp = (subtotalPart * discountPart) / 100;

      const totalJasaNet = subtotalJasa - discJasaRp;
      const totalPartNet = subtotalPart - discPartRp;

      const dpp = totalJasaNet + totalPartNet;
      const ppn = (dpp * settings.ppnPercentage) / 100;
      const grandTotal = dpp + ppn;

      return { subtotalJasa, subtotalPart, discJasaRp, discPartRp, dpp, ppn, grandTotal };
  }, [selectedJob, discountJasa, discountPart, settings.ppnPercentage]);

  const handleFinalizeAndPrint = async () => {
      if (!selectedJob || !calculations) return;
      
      const isAlreadyInvoiced = selectedJob.hasInvoice;
      const confirmMsg = isAlreadyInvoiced 
        ? `Cetak ulang Salinan Faktur untuk ${selectedJob.policeNumber}?`
        : `Konfirmasi pembuatan Faktur untuk ${selectedJob.policeNumber}?\n\nTotal: ${formatCurrency(calculations.grandTotal)}\n\nWO akan dikunci setelah Faktur terbit.`;

      if (!window.confirm(confirmMsg)) return;

      setIsProcessing(true);
      try {
          // 1. Update Job with Final Discounts & Totals & LOCK Flag
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          const updatePayload = {
              'estimateData.discountJasa': discountJasa,
              'estimateData.discountPart': discountPart,
              'estimateData.discountJasaAmount': calculations.discJasaRp,
              'estimateData.discountPartAmount': calculations.discPartRp,
              'estimateData.subtotalJasa': calculations.subtotalJasa,
              'estimateData.subtotalPart': calculations.subtotalPart,
              'estimateData.ppnAmount': calculations.ppn,
              'estimateData.grandTotal': calculations.grandTotal,
              'hargaJasa': calculations.subtotalJasa, 
              'hargaPart': calculations.subtotalPart,
              'hasInvoice': true // LOCKS THE WO
          };

          await updateDoc(jobRef, cleanObject(updatePayload));

          // 2. Refresh Local Object for PDF (Merges current job with updated values)
          const updatedJob = {
              ...selectedJob,
              hasInvoice: true,
              estimateData: {
                  ...selectedJob.estimateData!,
                  discountJasa,
                  discountPart,
                  discountJasaAmount: calculations.discJasaRp,
                  discountPartAmount: calculations.discPartRp,
                  subtotalJasa: calculations.subtotalJasa,
                  subtotalPart: calculations.subtotalPart,
                  ppnAmount: calculations.ppn,
                  grandTotal: calculations.grandTotal
              }
          };

          // 3. Generate PDF
          generateInvoicePDF(updatedJob, settings);
          showNotification(isAlreadyInvoiced ? "Salinan Faktur dicetak." : "Faktur berhasil dibuat & disimpan.", "success");
          
          if (!isAlreadyInvoiced) setSelectedJob(null); // Go back to list if new

      } catch (e: any) {
          console.error(e);
          showNotification("Gagal menyimpan faktur: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCancelInvoice = async () => {
      if (!selectedJob || !selectedJob.hasInvoice) return;
      
      const reason = prompt("Masukkan alasan pembatalan faktur:");
      if (!reason) return;

      if (!window.confirm("Yakin ingin membatalkan Faktur? Akses edit WO akan dibuka kembali.")) return;

      setIsProcessing(true);
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, selectedJob.id);
          await updateDoc(jobRef, {
              hasInvoice: false,
              'estimateData.invoiceCancelReason': reason
          });
          
          showNotification("Faktur dibatalkan. WO dibuka kembali.", "success");
          setSelectedJob(null);
      } catch (e: any) {
          showNotification("Gagal membatalkan: " + e.message, "error");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-xl shadow-sm text-white">
                    <FileCheck size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pembuatan Faktur (Invoice)</h1>
                    <p className="text-sm text-gray-500 font-medium">Verifikasi Akhir Work Order & Cetak Dokumen Penagihan</p>
                </div>
            </div>
        </div>

        {/* SEARCH & SELECTION */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="relative mb-4">
                <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                <input 
                    type="text" 
                    placeholder="Cari Nopol, WO, atau Nama Customer..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
                />
            </div>
            
            {!selectedJob && searchTerm && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {activeWOs.map(job => (
                        <div 
                            key={job.id}
                            onClick={() => { setSelectedJob(job); setSearchTerm(''); }}
                            className="p-3 border border-gray-100 rounded-lg hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors"
                        >
                            <div>
                                <span className="font-bold text-indigo-700">{job.woNumber}</span>
                                <span className="mx-2 text-gray-300">|</span>
                                <span className="font-bold text-gray-900">{job.policeNumber}</span>
                                <div className="text-sm text-gray-500">{job.customerName} - {job.carModel}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                {job.hasInvoice && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200">INVOICED</span>}
                                <CheckCircle size={18} className="text-indigo-400"/>
                            </div>
                        </div>
                    ))}
                    {activeWOs.length === 0 && <p className="text-center text-gray-400 py-4 italic">Tidak ada WO aktif ditemukan.</p>}
                </div>
            )}
        </div>

        {/* INVOICE HISTORY TABLE (WHEN NO SELECTION) */}
        {!selectedJob && !searchTerm && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Clock size={18} className="text-gray-500"/> Riwayat Faktur Terbit
                    </h3>
                    <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded text-gray-500 font-medium">{invoicesHistory.length} Record</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-600 uppercase font-semibold text-xs">
                            <tr>
                                <th className="px-6 py-3">No. Invoice (WO)</th>
                                <th className="px-6 py-3">Tanggal</th>
                                <th className="px-6 py-3">Pelanggan</th>
                                <th className="px-6 py-3 text-right">Total Tagihan</th>
                                <th className="px-6 py-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoicesHistory.slice(0, 10).map((job) => (
                                <tr key={job.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-indigo-700">{job.woNumber}</div>
                                        <div className="text-xs text-gray-500">{job.policeNumber}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {formatDateIndo(job.closedAt || new Date())}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-800">
                                        {job.customerName}
                                        <div className="text-xs text-gray-500">{job.namaAsuransi}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                                        {formatCurrency(job.estimateData?.grandTotal)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => setSelectedJob(job)} 
                                            className="text-indigo-600 hover:text-indigo-800 font-bold text-xs bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors"
                                        >
                                            Buka
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {invoicesHistory.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-8 text-gray-400 italic">Belum ada faktur yang diterbitkan.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {selectedJob && calculations && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                {/* LEFT PANEL: INFO (READ ONLY) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText size={18}/> Detail Pekerjaan</h3>
                            <div className="flex items-center gap-2">
                                {selectedJob.hasInvoice && <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200 flex items-center gap-1"><FileCheck size={12}/> SUDAH TERBIT</span>}
                                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded border border-indigo-200">{selectedJob.woNumber}</span>
                            </div>
                        </div>
                        
                        <div className="p-6 grid grid-cols-2 gap-6 text-sm">
                            <div>
                                <div className="flex items-center gap-2 font-bold text-gray-500 mb-2"><User size={16}/> Pelanggan</div>
                                <p className="font-bold text-gray-900 text-lg">{selectedJob.customerName}</p>
                                <p className="text-gray-600">{selectedJob.customerAddress}</p>
                                <p className="text-gray-600">{selectedJob.customerPhone}</p>
                                <p className="mt-2 text-indigo-600 font-medium">{selectedJob.namaAsuransi}</p>
                            </div>
                            <div className="text-right">
                                <div className="flex items-center justify-end gap-2 font-bold text-gray-500 mb-2">Kendaraan <Car size={16}/></div>
                                <p className="font-bold text-gray-900 text-lg">{selectedJob.policeNumber}</p>
                                <p className="text-gray-600">{selectedJob.carBrand} {selectedJob.carModel}</p>
                                <p className="text-gray-600">{selectedJob.warnaMobil}</p>
                                <p className="mt-2 text-gray-500 font-mono text-xs">VIN: {selectedJob.nomorRangka || '-'}</p>
                            </div>
                        </div>

                        {/* JASA TABLE */}
                        <div className="border-t border-gray-100">
                            <div className="px-6 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Jasa Perbaikan</div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {(selectedJob.estimateData?.jasaItems || []).map((item, idx) => (
                                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                                            <td className="px-6 py-3 text-gray-700">{item.name}</td>
                                            <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(item.price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* PART TABLE */}
                        <div className="border-t border-gray-100">
                            <div className="px-6 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Sparepart & Bahan</div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {(selectedJob.estimateData?.partItems || []).map((item, idx) => (
                                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                                            <td className="px-6 py-3 text-gray-700">
                                                <div>{item.name}</div>
                                                <div className="text-[10px] text-gray-400 font-mono">{item.number}</div>
                                            </td>
                                            <td className="px-6 py-3 text-center text-gray-600">{item.qty} x</td>
                                            <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency((item.price||0) * (item.qty||1))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: FINANCIAL SUMMARY & ACTIONS */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6"><Calculator size={18} className="text-emerald-600"/> Kalkulasi Biaya</h3>
                        
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between text-gray-600">
                                <span>Total Jasa</span>
                                <span className="font-medium">{formatCurrency(calculations.subtotalJasa)}</span>
                            </div>
                            
                            {/* EDITABLE DISCOUNT JASA */}
                            <div className="flex justify-between items-center bg-blue-50 p-2 rounded border border-blue-100">
                                <span className="text-blue-800 font-semibold">Disc Jasa (%)</span>
                                <input 
                                    disabled={selectedJob.hasInvoice}
                                    type="number" min="0" max="100" 
                                    className="w-16 p-1 text-right text-sm font-bold border border-blue-300 rounded text-blue-900 focus:ring-1 ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                    value={discountJasa}
                                    onChange={e => setDiscountJasa(Number(e.target.value))}
                                />
                            </div>
                            <div className="flex justify-between text-gray-500 text-xs italic">
                                <span>Potongan:</span>
                                <span>- {formatCurrency(calculations.discJasaRp)}</span>
                            </div>

                            <div className="border-t border-dashed my-2"></div>

                            <div className="flex justify-between text-gray-600">
                                <span>Total Sparepart</span>
                                <span className="font-medium">{formatCurrency(calculations.subtotalPart)}</span>
                            </div>

                            {/* EDITABLE DISCOUNT PART */}
                            <div className="flex justify-between items-center bg-orange-50 p-2 rounded border border-orange-100">
                                <span className="text-orange-800 font-semibold">Disc Part (%)</span>
                                <input 
                                    disabled={selectedJob.hasInvoice}
                                    type="number" min="0" max="100" 
                                    className="w-16 p-1 text-right text-sm font-bold border border-orange-300 rounded text-orange-900 focus:ring-1 ring-orange-500 disabled:bg-gray-100 disabled:text-gray-500"
                                    value={discountPart}
                                    onChange={e => setDiscountPart(Number(e.target.value))}
                                />
                            </div>
                            <div className="flex justify-between text-gray-500 text-xs italic">
                                <span>Potongan:</span>
                                <span>- {formatCurrency(calculations.discPartRp)}</span>
                            </div>

                            <div className="border-t border-gray-200 pt-3 mt-4">
                                <div className="flex justify-between text-gray-700">
                                    <span>DPP (Dasar Pengenaan Pajak)</span>
                                    <span>{formatCurrency(calculations.dpp)}</span>
                                </div>
                                <div className="flex justify-between text-gray-700 mt-1">
                                    <span>PPN ({settings.ppnPercentage}%)</span>
                                    <span>{formatCurrency(calculations.ppn)}</span>
                                </div>
                            </div>

                            <div className="bg-gray-900 text-white p-4 rounded-lg mt-4 text-center">
                                <span className="block text-xs text-gray-400 uppercase tracking-wider">Grand Total Invoice</span>
                                <span className="block text-2xl font-bold mt-1">{formatCurrency(calculations.grandTotal)}</span>
                            </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                            {!selectedJob.hasInvoice ? (
                                <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800 flex gap-2 border border-yellow-200">
                                    <AlertTriangle size={16} className="shrink-0"/>
                                    <p>Pastikan fisik WO sudah sesuai. Tombol di bawah akan mengunci data dan mencetak faktur resmi.</p>
                                </div>
                            ) : (
                                <div className="bg-green-50 p-3 rounded text-xs text-green-800 flex gap-2 border border-green-200">
                                    <CheckCircle size={16} className="shrink-0"/>
                                    <p>Faktur sudah diterbitkan. Gunakan tombol di bawah untuk mencetak ulang atau membatalkan.</p>
                                </div>
                            )}

                            <button 
                                onClick={handleFinalizeAndPrint}
                                disabled={isProcessing}
                                className={`w-full flex items-center justify-center gap-2 text-white py-3 rounded-lg font-bold shadow-lg transition-all transform active:scale-95 disabled:opacity-70 disabled:transform-none ${selectedJob.hasInvoice ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            >
                                {isProcessing ? 'Memproses...' : <><Printer size={20}/> {selectedJob.hasInvoice ? 'Cetak Salinan (Copy)' : 'Simpan & Cetak Faktur'}</>}
                            </button>
                            
                            {selectedJob.hasInvoice && (
                                <button 
                                    onClick={handleCancelInvoice}
                                    disabled={isProcessing}
                                    className="w-full flex items-center justify-center gap-2 bg-red-100 text-red-600 border border-red-200 py-3 rounded-lg font-bold hover:bg-red-200 transition-all"
                                >
                                    <XCircle size={18}/> Batalkan Faktur (Buka WO)
                                </button>
                            )}
                            
                            <button 
                                onClick={() => setSelectedJob(null)}
                                disabled={isProcessing}
                                className="w-full text-gray-500 font-medium text-sm hover:text-gray-700 py-2 flex items-center justify-center gap-1"
                            >
                                <RotateCcw size={14}/> Batalkan / Ganti Unit
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default InvoiceCreatorView;
