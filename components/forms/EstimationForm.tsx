
import React, { useState, useEffect } from 'react';
import { Job } from '../../types';
import { Search, CheckCircle, AlertCircle, FileText, User, Car, Clock, PlusCircle } from 'lucide-react';
import { formatPoliceNumber, formatDateIndo, formatCurrency } from '../../utils/helpers';

interface EstimationFormProps {
  allJobs: Job[];
  onNavigate: (view: string) => void;
  openModal: (type: string, data: any) => void;
  onCreateTransaction?: (vehicleData: Partial<Job>) => void;
}

const EstimationForm: React.FC<EstimationFormProps> = ({ allJobs, onNavigate, openModal, onCreateTransaction }) => {
  const [searchParams, setSearchParams] = useState({
    policeNumber: '',
    nomorRangka: '',
    nomorMesin: ''
  });

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeEstimates, setActiveEstimates] = useState<Job[]>([]);

  const handleSearchChange = (field: keyof typeof searchParams, value: string) => {
    const processedValue = field === 'policeNumber' ? formatPoliceNumber(value) : value;
    const newParams = { ...searchParams, [field]: processedValue };
    setSearchParams(newParams);

    if (!processedValue) {
        if (!newParams.policeNumber && !newParams.nomorRangka && !newParams.nomorMesin) {
            setSelectedJob(null);
            setActiveEstimates([]);
        }
        return;
    }

    const matches = allJobs.filter(job => {
        const dbValue = job[field as keyof Job];
        return dbValue && String(dbValue).toUpperCase() === processedValue.toUpperCase();
    });

    if (matches.length > 0) {
        matches.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setSelectedJob(matches[0]);
        setSearchParams({
            policeNumber: matches[0].policeNumber || '',
            nomorRangka: matches[0].nomorRangka || '',
            nomorMesin: matches[0].nomorMesin || ''
        });
        const active = matches.filter(j => !j.isClosed && (j.estimateData?.grandTotal || 0) > 0);
        setActiveEstimates(active);
    } else {
        if (selectedJob) {
             const dbValue = selectedJob[field as keyof Job];
             if (dbValue && String(dbValue).toUpperCase() !== processedValue.toUpperCase()) {
                 setSelectedJob(null);
                 setActiveEstimates([]);
             }
        }
    }
  };

  const handleCreateEstimate = () => {
    if (selectedJob) {
        openModal('create_estimation', selectedJob);
    }
  };

  const handleNewTransaction = () => {
      if (activeEstimates.length > 0) {
          const confirm = window.confirm(
              `PERINGATAN: Terdapat ${activeEstimates.length} estimasi aktif untuk kendaraan ini yang belum ditutup.\n\n` +
              `Apakah Anda tetap ingin membuat Transaksi BARU?`
          );
          if (!confirm) return;
      }
      
      if (onCreateTransaction && selectedJob) {
          // Hanya ambil data profile kendaraan, jangan bawa history/cost data lama
          const vehicleData: Partial<Job> = {
             policeNumber: selectedJob.policeNumber,
             carModel: selectedJob.carModel,
             carBrand: selectedJob.carBrand,
             warnaMobil: selectedJob.warnaMobil,
             nomorRangka: selectedJob.nomorRangka || '',
             nomorMesin: selectedJob.nomorMesin || '',
             tahunPembuatan: selectedJob.tahunPembuatan || '',
             customerName: selectedJob.customerName,
             customerPhone: selectedJob.customerPhone || '',
             customerAddress: selectedJob.customerAddress || '',
             customerKota: selectedJob.customerKota || '',
             namaAsuransi: selectedJob.namaAsuransi
          };
          onCreateTransaction(vehicleData);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Estimasi & Work Order</h1>
        <p className="text-gray-500 mt-1">Cari data kendaraan untuk perbaikan baru.</p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Search size={20} className="text-indigo-600"/> 
            Pencarian Data Unit
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Polisi</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={searchParams.policeNumber}
                        onChange={(e) => handleSearchChange('policeNumber', e.target.value)}
                        placeholder="Contoh: B1234ABC"
                        className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-bold transition-colors ${selectedJob ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-300'}`}
                    />
                    {selectedJob && <CheckCircle size={18} className="absolute right-3 top-3 text-green-600" />}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Rangka (VIN)</label>
                <input 
                    type="text" 
                    value={searchParams.nomorRangka}
                    onChange={(e) => handleSearchChange('nomorRangka', e.target.value)}
                    placeholder="Cari No. Rangka..."
                    className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-mono transition-colors ${selectedJob ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-300'}`}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Mesin</label>
                <input 
                    type="text" 
                    value={searchParams.nomorMesin}
                    onChange={(e) => handleSearchChange('nomorMesin', e.target.value)}
                    placeholder="Cari No. Mesin..."
                    className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-mono transition-colors ${selectedJob ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-300'}`}
                />
            </div>
        </div>
        {!selectedJob && (searchParams.policeNumber || searchParams.nomorRangka || searchParams.nomorMesin) && (
             <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle size={16} />
                Data belum ditemukan. Silakan <span className="font-bold underline cursor-pointer" onClick={() => onNavigate('input_data')}>Input Unit Baru</span>.
             </div>
        )}
      </div>

      {selectedJob && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
                    <User className="text-gray-600" size={20} />
                    <h4 className="text-lg font-bold text-gray-800">Verifikasi Pelanggan</h4>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Nama Pelanggan</label>
                        <p className="text-gray-900 font-medium text-lg">{selectedJob.customerName}</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">No. Telepon</label>
                        <p className="text-gray-900">{selectedJob.customerPhone || '-'}</p>
                    </div>
                </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
                    <Car className="text-gray-600" size={20} />
                    <h4 className="text-lg font-bold text-gray-800">Verifikasi Kendaraan</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Model</label>
                        <p className="text-gray-900 font-medium">{selectedJob.carBrand} - {selectedJob.carModel}</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Warna</label>
                        <p className="text-gray-900">{selectedJob.warnaMobil}</p>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                 <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
                    <Clock className="text-indigo-600" size={20} />
                    <h4 className="text-lg font-bold text-gray-800">Histori Estimasi & WO Aktif</h4>
                </div>
                {activeEstimates.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-indigo-50 text-indigo-800 font-semibold uppercase">
                                <tr>
                                    <th className="px-4 py-3">Tgl Masuk</th>
                                    <th className="px-4 py-3">No. Estimasi</th>
                                    <th className="px-4 py-3">Status WO</th>
                                    <th className="px-4 py-3 text-right">Total Biaya</th>
                                    <th className="px-4 py-3 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {activeEstimates.map(job => (
                                    <tr key={job.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">{formatDateIndo(job.tanggalMasuk)}</td>
                                        <td className="px-4 py-3 font-mono font-medium">{job.estimateData?.estimationNumber || 'DRAFT'}</td>
                                        <td className="px-4 py-3">
                                            {job.woNumber ? (
                                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">{job.woNumber}</span>
                                            ) : (
                                                <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold">Draft</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(job.estimateData?.grandTotal)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => openModal('create_estimation', job)} className="text-indigo-600 hover:text-indigo-800 font-medium underline">Lanjutkan</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                        Belum ada estimasi aktif.
                    </div>
                )}
            </div>

            <div className="lg:col-span-2 flex justify-between items-center mt-4 pt-4 border-t">
                <button onClick={() => { setSearchParams({policeNumber: '', nomorRangka: '', nomorMesin: ''}); setSelectedJob(null); setActiveEstimates([]); }} className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-white transition-colors font-medium">Reset Pencarian</button>
                <div className="flex gap-3">
                    <button onClick={handleNewTransaction} className="flex items-center gap-2 px-6 py-3 bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors font-bold shadow-sm">
                        <PlusCircle size={20} /> Buat Transaksi Baru
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default EstimationForm;
