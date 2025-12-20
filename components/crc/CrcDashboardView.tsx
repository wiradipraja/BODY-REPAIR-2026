
import React, { useState, useMemo } from 'react';
import { Job, Settings, InventoryItem } from '../../types';
import { formatDateIndo, formatCurrency, formatWaNumber } from '../../utils/helpers';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, SERVICE_JOBS_COLLECTION } from '../../services/firebase';
import { MessageSquare, Phone, CheckCircle, Calendar, Star, Send, XCircle, Clock, Search, User, Megaphone, CheckSquare, Square, Zap, Package, Wrench } from 'lucide-react';
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

  // Broadcast State
  const [broadcastMessage, setBroadcastMessage] = useState(settings.whatsappTemplates?.promoBroadcast || '');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]); // Array of Job IDs
  const [filterYear, setFilterYear] = useState('');
  const [filterModel, setFilterModel] = useState('');

  // --- DATA PROCESSING: FIFO ALLOCATION FOR BOOKING POTENTIAL ---
  // We need to calculate stock allocation for ALL active jobs to determine which 'Di Pemilik' units are actually ready.
  const bookingJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();

      // 1. Get ALL active jobs that might consume stock (WO exists, not closed)
      //    We include 'Booking Masuk' and 'Work In Progress' to build the timeline
      const activeJobs = jobs.filter(j => !j.isClosed && j.woNumber && !j.isDeleted);

      // 2. Sort by Date Created (FIFO Priority)
      activeJobs.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tA - tB; 
      });

      // 3. Create Virtual Stock Map
      const stockMap: Record<string, number> = {};
      inventoryItems.forEach(item => { stockMap[item.id] = item.stock; });

      // 4. Process Allocation to identify 'Ready' status
      const processedJobs = activeJobs.map(job => {
          const parts = job.estimateData?.partItems || [];
          const jasa = job.estimateData?.jasaItems || [];
          
          const isJasaOnly = parts.length === 0 && jasa.length > 0;
          
          let allPartsReady = true;
          if (!isJasaOnly) {
              if (parts.length === 0) allPartsReady = false; // No parts, no jasa? Not ready.
              else {
                  parts.forEach(p => {
                      if (p.hasArrived) return; // Already issued
                      
                      const reqQty = p.qty || 1;
                      if (p.inventoryId && stockMap[p.inventoryId] >= reqQty) {
                          stockMap[p.inventoryId] -= reqQty; // Allocate
                      } else {
                          allPartsReady = false; // Stock shortage
                      }
                  });
              }
          }

          return { ...job, isPartReady: allPartsReady, isJasaOnly };
      });

      // 5. Filter for CRC Display
      // Criteria:
      // A. Status 'Booking Masuk' (Standard)
      // B. Position 'Di Pemilik' AND (Part Ready OR Jasa Only)
      return processedJobs.filter(j => {
          const matchesSearch = 
            j.policeNumber.toLowerCase().includes(term) || 
            j.customerName.toLowerCase().includes(term);
          
          if (!matchesSearch) return false;

          // Logic 1: Standard Booking
          if (j.statusKendaraan === 'Booking Masuk') return true;

          // Logic 2: Unit di pemilik tapi sudah ready part (FIFO)
          if (j.posisiKendaraan === 'Di Pemilik' && j.isPartReady && !j.isJasaOnly) return true;

          // Logic 3: Unit di pemilik, WO Jasa Saja (Estimasi Deal)
          if (j.posisiKendaraan === 'Di Pemilik' && j.isJasaOnly) return true;

          return false;
      }).sort((a,b) => new Date(a.tanggalMasuk || '').getTime() - new Date(b.tanggalMasuk || '').getTime());

  }, [jobs, inventoryItems, searchTerm]);

  const followUpJobs = useMemo(() => {
      const term = searchTerm.toLowerCase();
      return jobs.filter(j => {
          const isClosed = j.isClosed || j.statusKendaraan === 'Selesai' || j.statusKendaraan === 'Sudah Di ambil Pemilik';
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

  // Unique list of customers for Broadcast (based on latest job per vehicle/customer to avoid duplicates)
  const broadcastCandidates = useMemo(() => {
      const candidates = jobs.filter(j => {
          // Has phone, is not deleted
          if (!j.customerPhone || j.isDeleted) return false;
          
          // Apply Filters
          if (filterModel && !j.carModel.toLowerCase().includes(filterModel.toLowerCase())) return false;
          if (filterYear && j.tahunPembuatan !== filterYear) return false;
          
          return true;
      });

      // Deduplicate by Phone Number (keep latest job)
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

  // --- CALCULATE KPI ---
  const avgRating = useMemo(() => {
      const ratedJobs = jobs.filter(j => j.customerRating && j.customerRating > 0);
      if (ratedJobs.length === 0) return 0;
      const sum = ratedJobs.reduce((acc, j) => acc + (j.customerRating || 0), 0);
      return (sum / ratedJobs.length).toFixed(1);
  }, [jobs]);

  // --- WA LOGIC ---
  const isApiMode = settings.whatsappConfig?.mode === 'API';

  const generateWaLink = (job: Job, templateKey: 'booking' | 'followup' | 'promo') => {
      const phone = formatWaNumber(job.customerPhone);
      if (!phone) return null;

      let template = '';
      if (templateKey === 'booking') template = settings.whatsappTemplates?.bookingReminder || '';
      else if (templateKey === 'followup') template = settings.whatsappTemplates?.afterService || '';
      else template = broadcastMessage;

      const message = template
          .replace('{nama}', job.customerName)
          .replace('{mobil}', job.carModel)
          .replace('{nopol}', job.policeNumber);
      
      return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const handleSingleWaAction = (job: Job, type: 'booking' | 'followup') => {
      if (isApiMode) {
          // API Simulation
          if (window.confirm(`Kirim pesan otomatis ke ${job.customerName}?`)) {
              showNotification("Request dikirim ke Gateway API (Simulasi)", "success");
          }
      } else {
          // Manual Mode
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

  // BROADCAST HANDLERS
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
              // Here you would trigger the backend cloud function
              setSelectedRecipients([]);
          }
      } else {
          // Manual Mode: Just show notification that list is ready
          showNotification("Silakan klik tombol 'Kirim' pada daftar di bawah satu per satu.", "info");
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* HEADER */}
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

        {/* KPI CARDS */}
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

        {/* MAIN CONTENT */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* TABS */}
            <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                <button 
                    onClick={() => setActiveTab('booking')}
                    className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'booking' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Calendar size={16}/> Potensi Booking
                </button>
                <button 
                    onClick={() => setActiveTab('followup')}
                    className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'followup' ? 'border-orange-600 text-orange-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Phone size={16}/> Follow Up Service
                </button>
                <button 
                    onClick={() => setActiveTab('broadcast')}
                    className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'broadcast' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Megaphone size={16}/> Broadcast & Promo
                </button>
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 min-w-[150px] py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'history' ? 'border-green-600 text-green-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Star size={16}/> Riwayat Feedback
                </button>
            </div>

            {/* TAB CONTENT */}
            <div className="min-h-[400px]">
                {/* BOOKING TAB */}
                {activeTab === 'booking' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/>
                            <input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Tgl Rencana</th>
                                        <th className="px-6 py-4">Pelanggan</th>
                                        <th className="px-6 py-4">Kendaraan</th>
                                        <th className="px-6 py-4">Status & Alasan</th>
                                        <th className="px-6 py-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {bookingJobs.map((job: any) => (
                                        <tr key={job.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold text-indigo-700">{formatDateIndo(job.tanggalMasuk)}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{job.customerName}</div>
                                                <div className="text-xs text-gray-500">{job.customerPhone}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-800">{job.policeNumber}</div>
                                                <div className="text-xs text-gray-500">{job.carModel}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    {/* Badge Status Kendaraan */}
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${job.statusKendaraan === 'Booking Masuk' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                        {job.statusKendaraan}
                                                    </span>
                                                    
                                                    {/* Badge Logic (Reason why shown) */}
                                                    {job.isJasaOnly ? (
                                                        <div className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 w-fit">
                                                            <Wrench size={10}/> Jasa Only
                                                        </div>
                                                    ) : job.isPartReady ? (
                                                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                                                            <Package size={10}/> Parts Ready
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button onClick={() => handleSingleWaAction(job, 'booking')} className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-100 text-xs font-bold transition-colors">
                                                    <Send size={14}/> {isApiMode ? 'Auto Send' : 'WA Reminder'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {bookingJobs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400 italic">Tidak ada potensi booking saat ini.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* FOLLOW UP TAB */}
                {activeTab === 'followup' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/>
                            <input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
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
                                            <td className="px-6 py-4 text-gray-600">{formatDateIndo(job.closedAt)}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{job.customerName}</div>
                                                <div className="text-xs text-gray-500">{job.customerPhone}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-800">{job.policeNumber}</div>
                                                <div className="text-xs text-gray-500">{job.carModel}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleSingleWaAction(job, 'followup')} className="p-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition-colors" title="Chat WhatsApp">
                                                        <MessageSquare size={18}/>
                                                    </button>
                                                    <button onClick={() => setFeedbackModal({ isOpen: true, job })} className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors" title="Input Feedback">
                                                        <CheckCircle size={18}/>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {followUpJobs.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400 italic">Semua unit selesai sudah di-follow up.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* BROADCAST TAB (NEW) */}
                {activeTab === 'broadcast' && (
                    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        {/* LEFT: FILTER & MESSAGE */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                                <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2"><Search size={18}/> Filter Target</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-blue-800 mb-1">Model Mobil</label>
                                        <input type="text" placeholder="Semua (CX-5, Mazda 2...)" className="w-full p-2 border rounded text-sm" value={filterModel} onChange={e => setFilterModel(e.target.value)}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-blue-800 mb-1">Tahun Pembuatan</label>
                                        <input type="number" placeholder="Semua Tahun" className="w-full p-2 border rounded text-sm" value={filterYear} onChange={e => setFilterYear(e.target.value)}/>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Pesan Broadcast</label>
                                <textarea 
                                    rows={6}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                    placeholder="Tulis pesan promosi..."
                                    value={broadcastMessage}
                                    onChange={e => setBroadcastMessage(e.target.value)}
                                />
                                <p className="text-xs text-gray-500 mt-1">Gunakan <code>{`{nama}`}</code> untuk personalisasi.</p>
                            </div>

                            <button 
                                onClick={handleBroadcastExecution}
                                className={`w-full py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${isApiMode ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                            >
                                {isApiMode ? <Zap size={20}/> : <Send size={20}/>}
                                {isApiMode ? 'BLAST OTOMATIS (API)' : 'SIAPKAN ANTRIAN (MANUAL)'}
                            </button>
                        </div>

                        {/* RIGHT: RECIPIENT LIST */}
                        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col h-[600px]">
                            <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                                <h3 className="font-bold text-gray-800">Daftar Penerima ({selectedRecipients.length} / {broadcastCandidates.length})</h3>
                                <button onClick={toggleAllRecipients} className="text-xs font-bold text-blue-600 hover:underline">
                                    {selectedRecipients.length === broadcastCandidates.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                                </button>
                            </div>
                            <div className="overflow-y-auto flex-grow p-0">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-100 text-gray-500 uppercase text-xs sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 w-10 text-center"><CheckSquare size={16}/></th>
                                            <th className="px-4 py-3">Nama</th>
                                            <th className="px-4 py-3">Kendaraan</th>
                                            <th className="px-4 py-3">No. WA (Preview)</th>
                                            {!isApiMode && <th className="px-4 py-3 text-center">Aksi</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {broadcastCandidates.map(job => (
                                            <tr key={job.id} className={selectedRecipients.includes(job.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                                                <td className="px-4 py-2 text-center">
                                                    <input type="checkbox" checked={selectedRecipients.includes(job.id)} onChange={() => toggleRecipient(job.id)} className="w-4 h-4 cursor-pointer"/>
                                                </td>
                                                <td className="px-4 py-2 font-medium">{job.customerName}</td>
                                                <td className="px-4 py-2 text-gray-600">{job.carModel} <span className="text-xs bg-gray-200 px-1 rounded">{job.tahunPembuatan}</span></td>
                                                <td className="px-4 py-2 font-mono text-xs">{formatWaNumber(job.customerPhone)}</td>
                                                {!isApiMode && (
                                                    <td className="px-4 py-2 text-center">
                                                        <button 
                                                            onClick={() => {
                                                                const link = generateWaLink(job, 'promo');
                                                                if(link) window.open(link, '_blank');
                                                            }}
                                                            className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-200"
                                                        >
                                                            Kirim
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                        {broadcastCandidates.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Tidak ada data sesuai filter.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* HISTORY TAB */}
                {activeTab === 'history' && (
                    <div className="animate-fade-in">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <Search className="text-gray-400" size={20}/>
                            <input type="text" placeholder="Cari..." className="w-full bg-transparent outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Tgl Follow Up</th>
                                        <th className="px-6 py-4">Pelanggan</th>
                                        <th className="px-6 py-4">Rating</th>
                                        <th className="px-6 py-4">Feedback / Catatan</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {historyJobs.map(job => (
                                        <tr key={job.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 text-gray-600">{formatDateIndo(job.crcFollowUpDate)}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{job.customerName}</div>
                                                <div className="text-xs text-gray-500">{job.policeNumber}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {job.crcFollowUpStatus === 'Contacted' ? (
                                                    <div className="flex text-yellow-400">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star key={i} size={14} fill={i < (job.customerRating || 0) ? "currentColor" : "none"} className={i < (job.customerRating || 0) ? "" : "text-gray-300"}/>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-gray-400 text-xs">-</span>}
                                            </td>
                                            <td className="px-6 py-4 italic text-gray-600 max-w-xs truncate">"{job.customerFeedback || '-'}"</td>
                                            <td className="px-6 py-4 text-center">
                                                {job.crcFollowUpStatus === 'Contacted' ? 
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold">Terhubung</span> :
                                                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold">Gagal Hubungi</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* FEEDBACK MODAL */}
        <Modal 
            isOpen={feedbackModal.isOpen} 
            onClose={() => setFeedbackModal({ isOpen: false, job: null })}
            title="Input Hasil Follow Up"
        >
            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg flex items-center gap-3">
                    <User className="text-gray-400"/>
                    <div>
                        <p className="font-bold text-gray-800">{feedbackModal.job?.customerName}</p>
                        <p className="text-sm text-gray-500">{feedbackModal.job?.policeNumber} - {feedbackModal.job?.carModel}</p>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Status Panggilan</label>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setFollowUpStatus('Contacted')} 
                            className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${followUpStatus === 'Contacted' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-200 text-gray-500'}`}
                        >
                            Berhasil Terhubung
                        </button>
                        <button 
                            onClick={() => setFollowUpStatus('Unreachable')} 
                            className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${followUpStatus === 'Unreachable' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-gray-200 text-gray-500'}`}
                        >
                            Tidak Terhubung / Salah Sambung
                        </button>
                    </div>
                </div>

                {followUpStatus === 'Contacted' && (
                    <div className="animate-fade-in space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Rating Kepuasan Pelanggan</label>
                            <div className="flex gap-2 justify-center py-4 bg-yellow-50 rounded-xl border border-yellow-100">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button 
                                        key={star} 
                                        onClick={() => setRating(star)}
                                        className="transition-transform hover:scale-110 focus:outline-none"
                                    >
                                        <Star 
                                            size={32} 
                                            className={star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} 
                                        />
                                    </button>
                                ))}
                            </div>
                            <p className="text-center text-xs text-gray-500 mt-1 font-medium">{rating === 5 ? "Sangat Puas" : rating === 1 ? "Sangat Kecewa" : "Cukup"}</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Feedback / Komentar Pelanggan</label>
                            <textarea 
                                value={feedbackNotes}
                                onChange={e => setFeedbackNotes(e.target.value)}
                                rows={3}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                placeholder="Tulis keluhan atau pujian pelanggan..."
                            />
                        </div>
                    </div>
                )}

                <div className="pt-4 flex justify-end gap-2">
                    <button onClick={() => setFeedbackModal({ isOpen: false, job: null })} className="px-4 py-2 border rounded-lg text-gray-600 font-medium">Batal</button>
                    <button onClick={handleSaveFeedback} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-md">Simpan Data</button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default CrcDashboardView;
