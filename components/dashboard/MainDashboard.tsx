import React, { useState } from 'react';
import { Job, Settings, UserPermissions } from '../../types';
import { formatDateIndo, exportToCsv, formatCurrency } from '../../utils/helpers';
import { Search, Filter, Download, Calendar, Trash2, Edit, FileText } from 'lucide-react';

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

const JobCard = ({ job, openModal, userPermissions, onDelete }: any) => {
    const getStatusColor = (status: string) => {
        if (!status) return 'bg-gray-100 text-gray-800';
        if (status.includes('Selesai') || status.includes('Di ambil')) return 'bg-green-100 text-green-800';
        if (status.includes('Booking')) return 'bg-blue-100 text-blue-800';
        if (status.includes('Tunggu')) return 'bg-yellow-100 text-yellow-800';
        return 'bg-indigo-100 text-indigo-800';
    };

    const handleDelete = () => {
        if(window.confirm(`Hapus Pekerjaan ${job.policeNumber}?`)) {
             onDelete(job);
        }
    };

    const calculatedGrossProfit = (job.hargaJasa || 0) + (job.hargaPart || 0) - 
                                  ((job.costData?.hargaModalBahan || 0) + 
                                   (job.costData?.hargaBeliPart || 0) + 
                                   (job.costData?.jasaExternal || 0));

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
            <div className="p-5">
                <div className="flex justify-between items-start mb-3">
                    <p className="font-extrabold text-sky-700 text-lg tracking-tight">{job.policeNumber}</p>
                    <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full tracking-wider ${getStatusColor(job.statusKendaraan)}`}>
                        {job.statusKendaraan}
                    </span>
                </div>
                <div className="mb-4">
                    <p className="text-sm font-medium text-gray-800">{job.carModel}</p>
                    <p className="text-xs text-gray-500">{job.namaAsuransi}</p>
                </div>
                
                <div className="border-t border-dashed pt-3 space-y-2 text-sm text-gray-600">
                    <div className="flex justify-between"><span>Tgl Masuk:</span> <span className="font-medium text-gray-900">{formatDateIndo(job.tanggalMasuk)}</span></div>
                    <div className="flex justify-between"><span>SA:</span> <span className="font-medium text-gray-900">{job.namaSA || '-'}</span></div>
                    <div className="flex justify-between"><span>Panel:</span> <span className="font-medium text-gray-900">{job.jumlahPanel || 0}</span></div>
                    <div className="flex justify-between"><span>Status:</span> <span className="font-medium text-gray-900">{job.statusPekerjaan || '-'}</span></div>
                    
                    {job.woNumber && (
                        <div className="bg-gray-50 p-2 rounded mt-2 text-xs">
                            <p className="flex justify-between"><span>No. WO:</span> <span className="font-mono">{job.woNumber}</span></p>
                            <p className="flex justify-between mt-1">
                                <span>Status WO:</span>
                                <span className={`font-bold ${job.isClosed ? 'text-red-600' : 'text-green-600'}`}>
                                    {job.isClosed ? 'Closed' : 'Open'}
                                </span>
                            </p>
                        </div>
                    )}

                    <div className="pt-2 mt-2 border-t">
                         <p className="text-xs text-gray-500">Gross Profit</p>
                         <p className="font-bold text-green-600 text-lg">{formatCurrency(calculatedGrossProfit)}</p>
                    </div>
                </div>
            </div>
            
            <div className="bg-gray-50 px-4 py-3 flex justify-between items-center rounded-b-xl border-t">
                {userPermissions.role === 'Manager' && (
                     <button onClick={handleDelete} className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors" title="Hapus">
                        <Trash2 size={16} />
                     </button>
                )}
                <div className="flex gap-2 ml-auto">
                    <button onClick={() => openModal('edit_data', job)} className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 bg-white border rounded hover:bg-gray-50 transition-colors">
                        <Edit size={12}/> Edit
                    </button>
                    <button onClick={() => openModal('create_estimation', job)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors">
                        <FileText size={12}/> Estimasi
                    </button>
                </div>
            </div>
        </div>
    );
};

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
      }));
      exportToCsv('Laporan_Data_Unit.csv', dataToExport);
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
                            onChange={e => setSearchQuery(e.target.value)} 
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
                    <Download size={18} /> <span className="hidden sm:inline">Export</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {allData.map(job => (
                  <JobCard 
                      key={job.id} 
                      job={job} 
                      openModal={openModal} 
                      onDelete={onDelete}
                      userPermissions={userPermissions} 
                      showNotification={showNotification} 
                  />
              ))}
          </div>
      )}
    </div>
  );
};

export default MainDashboard;