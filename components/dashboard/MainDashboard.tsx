import React from 'react';
import { Job, Settings, UserPermissions } from '../../types';
import { formatDateIndo, exportToCsv, formatCurrency } from '../../utils/helpers';
import { Search, Filter, Download, Trash2, Edit, FileText, AlertCircle } from 'lucide-react';

interface MainDashboardProps {
  allData: Job[];
  openModal: (type: string, data?: any) => void;
  onDelete: (job: Job) => Promise<void>;
  userPermissions: UserPermissions;
  showNotification: (msg: string, type?: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  filterWorkStatus: string;
  setFilterWorkStatus: (s: string) => void;
  showClosedJobs: boolean;
  setShowClosedJobs: (b: boolean) => void;
  settings: Settings;
}

const MainDashboard: React.FC<MainDashboardProps> = ({
  allData, openModal, onDelete, userPermissions, showNotification,
  searchQuery, setSearchQuery, filterStatus, setFilterStatus,
  filterWorkStatus, setFilterWorkStatus, showClosedJobs, setShowClosedJobs, settings
}) => {

  const handleExportGeneralData = () => {
      const dataToExport = allData.map(job => ({
          'Tanggal Masuk': formatDateIndo(job.tanggalMasuk),
          'No Polisi': job.policeNumber || '',
          'Nama Pelanggan': job.customerName || '',
          'Nama Asuransi': job.namaAsuransi || '',
          'No. HP/WA': `="${job.customerPhone || ''}"`,
          'Model Mobil': job.carModel || '',
          'Jumlah Panel': job.jumlahPanel || 0,
          'Status Kendaraan': job.statusKendaraan || '',
          'Status Pekerjaan': job.statusPekerjaan || '',
          'Tgl Estimasi Selesai': formatDateIndo(job.tanggalEstimasiSelesai),
          'Gross Profit': (job.hargaJasa || 0) + (job.hargaPart || 0) - ((job.costData?.hargaModalBahan || 0) + (job.costData?.hargaBeliPart || 0) + (job.costData?.jasaExternal || 0))
      }));
      exportToCsv('Laporan_Data_Unit.csv', dataToExport);
  };

  const getStatusColor = (status: string) => {
      if (!status) return 'bg-gray-100 text-gray-800';
      if (status.includes('Selesai') || status.includes('Di ambil')) return 'bg-green-100 text-green-800 border-green-200';
      if (status.includes('Booking')) return 'bg-blue-100 text-blue-800 border-blue-200';
      if (status.includes('Tunggu')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      if (status.includes('Banding')) return 'bg-orange-100 text-orange-800 border-orange-200';
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  };

  const handleDelete = (job: Job) => {
    if(window.confirm(`Hapus Pekerjaan ${job.policeNumber}?`)) {
         onDelete(job);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            {/* Filters */}
            <div className="flex-grow w-full lg:w-auto">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-grow max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Cari No. Polisi, Pelanggan..." 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value.toUpperCase())} 
                            className="pl-10 p-2.5 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <Filter size={18} className="text-gray-400" />
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="p-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500">
                            <option value="">Status Kendaraan</option>
                            {(settings.statusKendaraanOptions || []).map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                        <select value={filterWorkStatus} onChange={e => setFilterWorkStatus(e.target.value)} className="p-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-500">
                            <option value="">Status Pekerjaan</option>
                            {(settings.statusPekerjaanOptions || []).map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>
                
                <div className="mt-3 flex items-center gap-2">
                     <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                        <div className="relative">
                            <input type="checkbox" checked={showClosedJobs} onChange={(e) => setShowClosedJobs(e.target.checked)} className="sr-only" />
                            <div className={`block w-10 h-6 rounded-full ${showClosedJobs ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showClosedJobs ? 'transform translate-x-4' : ''}`}></div>
                        </div>
                        Tampilkan Closed WO
                    </label>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
                <button onClick={handleExportGeneralData} className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-2.5 px-5 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">
                    <Download size={18} /> <span className="hidden sm:inline">Export CSV</span>
                </button>
            </div>
        </div>
      </div>

      {(!allData || allData.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-dashed border-gray-300">
              <div className="bg-gray-50 p-4 rounded-full mb-3">
                 <Search size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Tidak ada data ditemukan.</p>
              <p className="text-sm text-gray-400 mt-1">Coba ubah filter atau tambah data baru di menu Input Data.</p>
          </div>
      ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tgl Masuk</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">No. Polisi</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kendaraan</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">SA & Asuransi</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Panel</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status Unit</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status WO</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Est. Profit</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allData.map((job) => {
                     const calculatedGrossProfit = (job.hargaJasa || 0) + (job.hargaPart || 0) - 
                                  ((job.costData?.hargaModalBahan || 0) + 
                                   (job.costData?.hargaBeliPart || 0) + 
                                   (job.costData?.jasaExternal || 0));
                     
                     return (
                        <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                             {formatDateIndo(job.tanggalMasuk)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                             <div className="text-sm font-extrabold text-indigo-700">{job.policeNumber}</div>
                             <div className="text-xs text-gray-500">{job.customerName?.split(' ')[0]}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                             <div className="text-sm font-medium text-gray-900">{job.carModel}</div>
                             <div className="text-xs text-gray-500">{job.warnaMobil}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                             <div className="text-sm text-gray-900">{job.namaSA || '-'}</div>
                             <div className="text-xs text-gray-500">{job.namaAsuransi}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                             <span className="px-2 py-1 text-xs font-medium bg-gray-100 rounded-full">{job.jumlahPanel || 0}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                             <span className={`px-2 py-1 text-xs leading-5 font-semibold rounded-full border ${getStatusColor(job.statusKendaraan)}`}>
                               {job.statusKendaraan}
                             </span>
                             <div className="text-xs text-gray-500 mt-1">{job.statusPekerjaan}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                             {job.woNumber ? (
                                <div>
                                   <div className="text-sm font-mono text-gray-700">{job.woNumber}</div>
                                   <span className={`text-[10px] uppercase font-bold ${job.isClosed ? 'text-red-600' : 'text-green-600'}`}>
                                      {job.isClosed ? 'Closed' : 'Open'}
                                   </span>
                                </div>
                             ) : (
                                <span className="text-xs text-gray-400 italic">Draft</span>
                             )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                             <div className="text-sm font-bold text-emerald-600">{formatCurrency(calculatedGrossProfit)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                             <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => openModal('edit_data', job)} 
                                  className="text-gray-400 hover:text-blue-600 transition-colors"
                                  title="Edit Data Unit"
                                >
                                  <Edit size={18}/>
                                </button>
                                <button 
                                  onClick={() => openModal('create_estimation', job)} 
                                  className="text-indigo-400 hover:text-indigo-700 transition-colors"
                                  title="Buka Estimasi / WO"
                                >
                                  <FileText size={18}/>
                                </button>
                                {userPermissions.role === 'Manager' && (
                                  <button 
                                    onClick={() => handleDelete(job)} 
                                    className="text-red-300 hover:text-red-600 transition-colors"
                                    title="Hapus Data"
                                  >
                                    <Trash2 size={18}/>
                                  </button>
                                )}
                             </div>
                          </td>
                        </tr>
                     );
                  })}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
               <span>Menampilkan {allData.length} data pekerjaan</span>
               <div className="flex gap-2 items-center">
                  <AlertCircle size={14}/>
                  <span>Gross Profit = (Jasa + Part) - (Modal Bahan + Beli Part + Jasa Luar)</span>
               </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default MainDashboard;