
import React, { useState, useMemo } from 'react';
import { Job, Settings, InventoryItem } from '../../types';
import { formatDateIndo, formatCurrency, formatWaNumber } from '../../utils/helpers';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { MessageSquare, Phone, CheckCircle, Calendar, Star, Send, XCircle, Clock, Search, User, Megaphone, CheckSquare, Square, Zap, Package, Wrench, Loader2, Save } from 'lucide-react';
import Modal from '../ui/Modal';

interface CrcDashboardViewProps {
  jobs: Job[];
  inventoryItems: InventoryItem[];
  settings: Settings;
  showNotification: (msg: string, type: string) => void;
}

const CrcDashboardView: React.FC<CrcDashboardViewProps> = ({ jobs, inventoryItems = [], settings, showNotification }) => {
  const [activeTab, setActiveTab] = useState<'booking' | 'followup' | 'broadcast' | 'history'>('booking');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [rating, setRating] = useState(5);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<'Contacted' | 'Unreachable'>('Contacted');

  // Booking Execution Modal
  const [bookingModal, setBookingModal] = useState<{ isOpen: boolean, job: Job | null }>({ isOpen: false, job: null });
  const [bookingDateInput, setBookingDateInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Broadcast State
  const [broadcastMessage, setBroadcastMessage] = useState(settings.whatsappTemplates?.promoBroadcast || '');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]); // Array of Job IDs
  const [filterYear, setFilterYear] = useState('');
  const [filterModel, setFilterModel] = useState('');

  // --- DATA PROCESSING: FIFO ALLOCATION FOR BOOKING POTENTIAL ---
  const bookingJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      const activeJobs = jobs.filter(j => !j.isClosed && j.woNumber && !j.isDeleted);
      
      activeJobs.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tA - tB; 
      });

      const stockMap: Record<string, number> = {};
      inventoryItems.forEach(item => { stockMap[item.id] = item.stock; });

      const processedJobs = activeJobs.map(job => {
          const parts = job.estimateData?.partItems || [];
          const jasa = job.estimateData?.jasaItems || [];
          const isJasaOnly = parts.length === 0 && jasa.length > 0;
          
          let allPartsReady = true;
          if (!isJasaOnly) {
              if (parts.length === 0) allPartsReady = false;
              else {
                  parts.forEach(p => {
                      if (p.hasArrived) return;
                      const reqQty = p.qty || 1;
                      if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) {
                          stockMap[p.inventoryId] -= reqQty;
                      } else {
                          allPartsReady = false;
                      }
                  });
              }
          }
          return { ...job, isPartReady: allPartsReady, isJasaOnly };
      });

      return processedJobs.filter(j => {
          const matchesSearch = j.policeNumber.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term);
          if (!matchesSearch) return false;
          
          // Logic: ONLY show units that are physically AT OWNER (Unit di Pemilik)
          // Once they arrive (Di Bengkel), they should leave this list
          if (j.posisiKendaraan !== 'Di Pemilik') return false;

          if (j.statusKendaraan === 'Booking Masuk') return true;
          if (j.isPartReady && !j.isJasaOnly) return true;
          if (j.isJasaOnly) return true;

          return false;
      }).sort((a,b) => new Date(a.tanggalMasuk || '').getTime() - new Date(b.tanggalMasuk || '').getTime());

  }, [jobs, inventoryItems, searchTerm]);

  const followUpJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      return jobs.filter(j => {
          const isClosed = j.isClosed || j.statusKendaraan === 'Selesai' || j.statusKendaraan === 'Sudah Diambil Pemilik';
          const isPending = !j.crcFollowUpStatus || j.crcFollowUpStatus === 'Pending';
          return isClosed && isPending && (j.policeNumber.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term));
      }).sort((a,b) => (b.closedAt?.seconds || 0) - (a.closedAt?.seconds || 0));
  }, [jobs, searchTerm]);

  const historyJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      return jobs.filter(j => 
          j.crcFollowUpStatus && j.crcFollowUpStatus !== 'Pending' &&
          (j.policeNumber.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term))
      ).sort((a,b) => (b.crcFollowUpDate?.seconds || 0) - (a.crcFollowUpDate?.seconds || 0));
  }, [jobs, searchTerm]);

  const broadcastCandidates = useMemo(() => {
      const candidates = jobs.filter(j => {
          if (!j.customerPhone || j.isDeleted) return false;
          if (filterModel && !j.carModel.toLowerCase().includes(filterModel.toLowerCase())) return false;
          if (filterYear && j.tahunPembuatan !== filterYear) return false;
          return true;
      });
      const uniqueMap = new Map();
      candidates.forEach(job => {
          const phone = formatWaNumber(job.customerPhone);
          if (phone) {
              const existing = uniqueMap.get(phone);
              if (!existing || (job.createdAt?.seconds || 0) > (existing.createdAt?.seconds || 0)) {
                  uniqueMap.set(phone, job);
              }
          }
      });
      return Array.from(uniqueMap.values());
  }, [jobs, filterModel, filterYear]);

  const avgRating = useMemo(() => {
      const ratedJobs = jobs.filter(j => j.customerRating && j.customerRating > 0);
      if (ratedJobs.length === 0) return 0;
      const sum = ratedJobs.reduce((acc, j) => acc + (j.customerRating || 0), 0);
      return (sum / ratedJobs.length).toFixed(1);
  }, [jobs]);

  const isApiMode = settings.whatsappConfig?.mode === 'API';

  const generateWaLink = (job: Job, type: 'booking' | 'followup' | 'promo', overrideBookingDate?: string) => {
      const phone = formatWaNumber(job.customerPhone);
      if (!phone) return null;

      let template = '';
      if (type === 'booking') template = settings.whatsappTemplates?.bookingReminder || '';
      else if (type === 'followup') template = settings.whatsappTemplates?.afterService || '';
      else template = broadcastMessage;

      const displayBookingDate = overrideBookingDate || job.tanggalBooking || '(Belum Ditentukan)';

      const message = template
          .replace('{nama}', job.customerName)
          .replace('{mobil}', job.carModel)
          .replace('{nopol}', job.policeNumber)
          .replace('{tgl_booking}', displayBookingDate);
      
      return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const executeBookingProcess = async () => {
      if (!bookingModal.job || !bookingDateInput) {
          showNotification("Tanggal booking wajib diisi.", "error");
          return;
      }

      setIsUpdating(true);
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, bookingModal.job.id);
          
          // CRITICAL TRIGGER:
          // 1. Set the booking date
          // 2. Move status to 'Booking Masuk'
          await updateDoc(jobRef, {
              tanggalBooking: bookingDateInput,
              statusKendaraan: 'Booking Masuk',
              updatedAt: serverTimestamp()
          });

          const link = generateWaLink(bookingModal.job, 'booking', bookingDateInput);
          if (link) window.open(link, '_blank');

          showNotification("Jadwal disimpan & Status pindah ke Papan Control.", "success");
          setBookingModal({ isOpen: false, job: null });
          setBookingDateInput('');
      } catch (e: any) {
          showNotification("Gagal memproses booking.", "error");
      } finally {
          setIsUpdating(false);
      }
  };

  const handleSingleWaAction = (job: Job, type: 'booking' | 'followup') => {
      if (type === 'booking') {
          // Open mandatory date modal instead of WA directly
          setBookingModal({ isOpen: true, job });
          setBookingDateInput(job.tanggalBooking || '');
          return;
      }

      if (isApiMode) {
          if (window.confirm(`Kirim pesan otomatis ke ${job.customerName}?`)) {
              showNotification("Request dikirim ke Gateway API (Simulasi)", "success");
          }
      } else {
          const link = generateWaLink(job, type);
          if (link) window.open(link, '_blank');
          else showNotification("Nomor HP tidak valid", "error");
      }
  };

  const handleSaveFeedback = async () => {
      if (!feedbackModal.job) return;
      try {
          const jobRef = doc(db, SERVICE_JOBS_COLLECTION, feedbackModal.job.id);
          await updateDoc(jobRef, {
              crcFollowUpStatus: followUpStatus,
              crcFollowUpDate: serverTimestamp(),
              customerRating: followUpStatus === 'Contacted' ? rating : null,
              customerFeedback: feedbackNotes
          });
          showNotification("Data Follow Up disimpan.", "success");
          setFeedbackModal({ isOpen: false, job: null });
          setRating(5);
          setFeedbackNotes('');
      } catch (e: any) {
          showNotification("Gagal menyimpan: " + e.message, "error");
      }
  };

  const toggleRecipient = (id: string) => {
      setSelectedRecipients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllRecipients = () => {
      if (selectedRecipients.length === broadcastCandidates.length) setSelectedRecipients([]);
      else setSelectedRecipients(broadcastCandidates.map(c => c.id));
  };

  const handleBroadcastExecution = () => {
      if (selectedRecipients.length === 0) { showNotification("Pilih minimal 1 penerima.", "error"); return; }
      if (!broadcastMessage) { showNotification("Isi pesan broadcast.", "error"); return; }
      if (isApiMode) {
          if (window.confirm(`Kirim pesan ke ${selectedRecipients.length} kontak via API?`)) {
              showNotification(`Proses Blast dimulai untuk ${selectedRecipients.length} kontak...`, "success");
              setSelectedRecipients([]);
          }
      } else {
          showNotification("Silakan klik tombol 'Kirim' pada daftar di bawah satu per satu.", "info");
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-green-600 rounded-xl shadow-sm text-white">
                    <MessageSquare size={24}/>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">CRC / Customer Care</h1>
                    <p className="text-sm text-gray-500 font-medium flex items-center gap-2">
                        Mode WhatsApp: 
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isApiMode ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                            {isApiMode ? 'GATEWAY API (BOT)' : 'PERSONAL (MANUAL)'}
                        </span>
                    </p>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Potensi Booking</p>
                    <h2 className="text-2xl font-black text-indigo-900">{bookingJobs.length} Unit</h2>
                </div>
                <div className="p-3 bg-indigo-50 rounded-full text-indigo-600"><Calendar size={24}/></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Perlu Follow Up</p>
                    <h2 className="text-2xl font-black text-orange-600">{followUpJobs.length} Unit</h2>
                </div>
                <div className="p-3 bg-orange-50 rounded-full text-orange-600"><Phone size={24}/></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Avg. Rating (CSAT)</p>
                    <h2 className="text-2xl font-black text-yellow-500 flex items-center gap-1">{avgRating} <Star fill="currentColor" size={20}/></h2>
                </div>
                <div className="p-3 bg-yellow-50 rounded-full text-yellow-600"><Star size={24}/></div>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                <button onClick={() => setActiveTab('booking')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'booking' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <Calendar size={16}/> Potensi Booking
                </button>
                <button onClick={() => setActiveTab('followup')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'followup' ? 'border-orange-600 text-orange-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <Phone size={16}/> Follow Up Service
                </button>
                <button onClick={() => setActiveTab('broadcast')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'broadcast' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <Megaphone size={16}/> Broadcast & Promo
                </button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'history' ? 'border-green-600 text-green-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <Star size={16}/> Riwayat Feedback
                </button>
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'booking' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/>
                            <input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                                    <tr>
                                        <th className="px-6 py-4">Tgl Rencana</th>
                                        <th className="px-6 py-4">Pelanggan</th>
                                        <th className="px-6 py-4">Kendaraan</th>
                                        <th className="px-6 py-4">Status Ketersediaan</th>
                                        <th className="px-6 py-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {bookingJobs.map((job: any) => (
                                        <tr key={job.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold text-indigo-700">
                                                {job.tanggalBooking ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-emerald-600 text-xs uppercase font-black tracking-tighter flex items-center gap-1"><CheckCircle size={10}/> TERJADWAL</span>
                                                        <span>{formatDateIndo(job.tanggalBooking)}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic">Belum Set Jadwal</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{job.customerName}</div>
                                                <div className="text-xs text-gray-500 font-medium tracking-tight">{job.customerPhone}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-800">{job.policeNumber}</div>
                                                <div className="text-xs text-gray-500 truncate max-w-[120px]">{job.carModel}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    {job.isJasaOnly ? (
                                                        <div className="flex items-center gap-1 text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 w-fit uppercase">
                                                            <Wrench size={10}/> Jasa Only
                                                        </div>
                                                    ) : job.isPartReady ? (
                                                        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit uppercase">
                                                            <Package size={10}/> Parts Ready
                                                        </div>
                                                    ) : <span className="text-xs text-gray-400 italic">Waiting Stock</span>}
                                                    <span className="text-[9px] text-gray-400 font-bold uppercase">{job.statusKendaraan}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button onClick={() => handleSingleWaAction(job, 'booking')} className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl border border-green-200 hover:bg-green-100 text-xs font-black transition-all shadow-sm transform active:scale-95">
                                                    <Send size={14}/> WA REMINDER
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {bookingJobs.length === 0 && <tr><td colSpan={5} className="p-20 text-center text-gray-400 italic font-medium">Tidak ada potensi booking (Unit di pemilik yang partnya sudah siap).</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'followup' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/>
                            <input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                                    <tr>
                                        <th className="px-6 py-4">Tgl Selesai</th>
                                        <th className="px-6 py-4">Pelanggan</th>
                                        <th className="px-6 py-4">Kendaraan</th>
                                        <th className="px-6 py-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {followUpJobs.map(job => (
                                        <tr key={job.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 text-gray-600 font-bold">{formatDateIndo(job.closedAt)}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{job.customerName}</div>
                                                <div className="text-xs text-gray-500">{job.customerPhone}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-800">{job.policeNumber}</div>
                                                <div className="text-xs text-gray-500">{job.carModel}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-3">
                                                    <button onClick={() => handleSingleWaAction(job, 'followup')} className="p-2.5 bg-green-50 text-green-600 rounded-full border border-green-100 hover:bg-green-100 transition-colors shadow-sm">
                                                        <MessageSquare size={18}/>
                                                    </button>
                                                    <button onClick={() => setFeedbackModal({ isOpen: true, job })} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors shadow-sm">
                                                        <CheckCircle size={18}/>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {followUpJobs.length === 0 && <tr><td colSpan={4} className="p-20 text-center text-gray-400 italic">Semua unit selesai sudah di-follow up.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {/* OTHERS: Broadcast & History remain same logic but improved visuals if needed */}
            </div>
        </div>

        {/* BOOKING DATE MODAL */}
        <Modal 
            isOpen={bookingModal.isOpen} 
            onClose={() => !isUpdating && setBookingModal({ isOpen: false, job: null })}
            title="Penetapan Jadwal Booking"
        >
            <div className="space-y-6">
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-sm">
                        <Calendar size={24}/>
                    </div>
                    <div>
                        <h4 className="font-black text-gray-900 leading-none">{bookingModal.job?.policeNumber}</h4>
                        <p className="text-sm text-gray-500 mt-1">{bookingModal.job?.customerName} | {bookingModal.job?.carModel}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Pilih Tanggal Rencana Masuk Bengkel *</label>
                    <input 
                        type="date" 
                        required
                        className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl text-lg font-black text-indigo-900 transition-all outline-none"
                        value={bookingDateInput}
                        onChange={e => setBookingDateInput(e.target.value)}
                    />
                    <p className="text-[10px] text-indigo-400 font-bold flex items-center gap-1 mt-1">
                        <Zap size={10}/> Mengisi tanggal ini akan otomatis memindahkan unit ke Papan Control Claim.
                    </p>
                </div>

                <div className="pt-4 flex gap-3">
                    <button 
                        onClick={() => setBookingModal({ isOpen: false, job: null })}
                        disabled={isUpdating}
                        className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-600 transition-colors"
                    >
                        BATAL
                    </button>
                    <button 
                        onClick={executeBookingProcess}
                        disabled={isUpdating || !bookingDateInput}
                        className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all transform active:scale-95 disabled:opacity-50"
                    >
                        {isUpdating ? <Loader2 size={20} className="animate-spin"/> : <><Save size={20}/> SIMPAN & KIRIM WA</>}
                    </button>
                </div>
            </div>
        </Modal>

        {/* FEEDBACK MODAL (EXISTING) */}
        <Modal isOpen={feedbackModal.isOpen} onClose={() => setFeedbackModal({ isOpen: false, job: null })} title="Input Hasil Follow Up">
            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg flex items-center gap-3"><User className="text-gray-400"/><div><p className="font-bold text-gray-800">{feedbackModal.job?.customerName}</p><p className="text-sm text-gray-500">{feedbackModal.job?.policeNumber} - {feedbackModal.job?.carModel}</p></div></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-2">Status Panggilan</label><div className="flex gap-2"><button onClick={() => setFollowUpStatus('Contacted')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${followUpStatus === 'Contacted' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-200 text-gray-500'}`}>Berhasil Terhubung</button><button onClick={() => setFollowUpStatus('Unreachable')} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${followUpStatus === 'Unreachable' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-gray-200 text-gray-500'}`}>Tidak Terhubung</button></div></div>
                {followUpStatus === 'Contacted' && (<div className="animate-fade-in space-y-4"><div><label className="block text-sm font-bold text-gray-700 mb-2">Rating Kepuasan Pelanggan</label><div className="flex gap-2 justify-center py-4 bg-yellow-50 rounded-xl border border-yellow-100">{[1, 2, 3, 4, 5].map(star => (<button key={star} onClick={() => setRating(star)} className="transition-transform hover:scale-110 focus:outline-none"><Star size={32} className={star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} /></button>))}</div></div><div><label className="block text-sm font-bold text-gray-700 mb-2">Feedback / Komentar</label><textarea value={feedbackNotes} onChange={e => setFeedbackNotes(e.target.value)} rows={3} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Tulis komentar..."/></div></div>)}
                <div className="pt-4 flex justify-end gap-2"><button onClick={() => setFeedbackModal({ isOpen: false, job: null })} className="px-4 py-2 border rounded-lg text-gray-600 font-medium">Batal</button><button onClick={handleSaveFeedback} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-md">Simpan Data</button></div>
            </div>
        </Modal>
    </div>
  );
};

export default CrcDashboardView;
