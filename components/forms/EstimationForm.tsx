import React, { useState, useEffect } from 'react';
import { Job } from '../../types';
import { Search, CheckCircle, AlertCircle, FileText, User, Car } from 'lucide-react';
import { formatPoliceNumber } from '../../utils/helpers';

interface EstimationFormProps {
  allJobs: Job[];
  onNavigate: (view: string) => void;
  openModal: (type: string, data: any) => void;
}

const EstimationForm: React.FC<EstimationFormProps> = ({ allJobs, onNavigate, openModal }) => {
  const [searchParams, setSearchParams] = useState({
    policeNumber: '',
    nomorRangka: '',
    nomorMesin: ''
  });

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Logic Pencarian Otomatis
  const handleSearchChange = (field: keyof typeof searchParams, value: string) => {
    // Terapkan format tanpa spasi untuk nomor polisi
    const processedValue = field === 'policeNumber' ? formatPoliceNumber(value) : value;
    
    // Update input state
    const newParams = { ...searchParams, [field]: processedValue };
    setSearchParams(newParams);

    // Reset selected job jika input kosong
    if (!processedValue) {
        if (!newParams.policeNumber && !newParams.nomorRangka && !newParams.nomorMesin) {
            setSelectedJob(null);
        }
        return;
    }

    // Cari match di database (case insensitive)
    const match = allJobs.find(job => {
        const dbValue = job[field as keyof Job];
        return dbValue && String(dbValue).toUpperCase() === processedValue.toUpperCase();
    });

    if (match) {
        // Jika ditemukan, isi otomatis kolom lainnya dan set selectedJob
        setSelectedJob(match);
        setSearchParams({
            policeNumber: match.policeNumber || '',
            nomorRangka: match.nomorRangka || '',
            nomorMesin: match.nomorMesin || ''
        });
    } else {
        // Jika tidak ditemukan, tapi user mungkin sedang mengetik, jangan hapus selectedJob dulu
        // kecuali user secara eksplisit menghapus field kunci yang tadi match.
        if (selectedJob) {
             const dbValue = selectedJob[field as keyof Job];
             if (dbValue && String(dbValue).toUpperCase() !== processedValue.toUpperCase()) {
                 setSelectedJob(null); // Data berubah dan tidak match lagi
             }
        }
    }
  };

  const handleCreateEstimate = () => {
    if (selectedJob) {
        openModal('create_estimation', selectedJob);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Estimasi & Work Order</h1>
        <p className="text-gray-500 mt-1">Cari data kendaraan untuk membuat estimasi perbaikan baru.</p>
      </div>

      {/* SECTION PENCARIAN */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Search size={20} className="text-indigo-600"/> 
            Pencarian Data Unit
        </h3>
        <p className="text-sm text-gray-500 mb-4">
            Masukkan salah satu data (No. Polisi, No. Rangka, atau No. Mesin). 
            Jika data ditemukan, kolom lain akan terisi otomatis.
        </p>

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
                <div className="relative">
                    <input 
                        type="text" 
                        value={searchParams.nomorRangka}
                        onChange={(e) => handleSearchChange('nomorRangka', e.target.value)}
                        placeholder="Cari No. Rangka..."
                        className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-mono transition-colors ${selectedJob ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-300'}`}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Mesin</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={searchParams.nomorMesin}
                        onChange={(e) => handleSearchChange('nomorMesin', e.target.value)}
                        placeholder="Cari No. Mesin..."
                        className={`w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-mono transition-colors ${selectedJob ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-300'}`}
                    />
                </div>
            </div>
        </div>

        {!selectedJob && (searchParams.policeNumber || searchParams.nomorRangka || searchParams.nomorMesin) && (
             <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle size={16} />
                Data belum ditemukan di database. Pastikan input benar atau lakukan 
                <span className="font-bold underline cursor-pointer" onClick={() => onNavigate('input_data')}>Input Unit Baru</span> 
                jika kendaraan belum terdaftar.
             </div>
        )}
      </div>

      {/* SECTION HASIL DATA */}
      {selectedJob && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Informasi Pelanggan (Read Only) */}
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
                        <label className="text-xs font-semibold text-gray-500 uppercase">No. Telepon / WA</label>
                        <p className="text-gray-900">{selectedJob.customerPhone || '-'}</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Alamat</label>
                        <p className="text-gray-900">{selectedJob.customerAddress || '-'}</p>
                        <p className="text-sm text-gray-600">
                            {selectedJob.customerKelurahan ? `${selectedJob.customerKelurahan}, ` : ''}
                            {selectedJob.customerKecamatan ? `${selectedJob.customerKecamatan}, ` : ''}
                            {selectedJob.customerKota || ''}
                        </p>
                    </div>
                </div>
            </div>

            {/* Data Kendaraan (Read Only) */}
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
                    <Car className="text-gray-600" size={20} />
                    <h4 className="text-lg font-bold text-gray-800">Verifikasi Kendaraan</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Merk / Model</label>
                        <p className="text-gray-900 font-medium">{selectedJob.carBrand} - {selectedJob.carModel}</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Warna</label>
                        <p className="text-gray-900">{selectedJob.warnaMobil}</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Tahun</label>
                        <p className="text-gray-900">{selectedJob.tahunPembuatan || '-'}</p>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase">Asuransi</label>
                        <p className="text-gray-900">{selectedJob.namaAsuransi}</p>
                    </div>
                    <div className="col-span-2 mt-2 pt-2 border-t border-gray-200">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Status Terakhir</label>
                        <span className="inline-block px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold mt-1">
                            {selectedJob.statusKendaraan}
                        </span>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="lg:col-span-2 flex justify-end gap-3 mt-4">
                <button 
                    onClick={() => {
                        setSearchParams({policeNumber: '', nomorRangka: '', nomorMesin: ''});
                        setSelectedJob(null);
                    }}
                    className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-white transition-colors font-medium"
                >
                    Reset Pencarian
                </button>
                <button 
                    onClick={handleCreateEstimate}
                    className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg font-bold"
                >
                    <FileText size={20} />
                    Buat Work Order / Estimasi
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default EstimationForm;