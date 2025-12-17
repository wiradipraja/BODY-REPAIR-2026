
import React, { useState } from 'react';
import { Job, Vehicle } from '../../types';
import { Search, CheckCircle, AlertCircle, User, Car, Clock, PlusCircle } from 'lucide-react';
import { formatPoliceNumber, formatDateIndo, formatCurrency } from '../../utils/helpers';

interface EstimationFormProps {
  allVehicles: Vehicle[];
  allJobs: Job[];
  onNavigate: (view: string) => void;
  openModal: (type: string, data: any) => void;
  onCreateTransaction?: (vehicle: Vehicle) => void;
}

const EstimationForm: React.FC<EstimationFormProps> = ({ allVehicles, allJobs, onNavigate, openModal, onCreateTransaction }) => {
  const [searchParams, setSearchParams] = useState({ policeNumber: '', nomorRangka: '', nomorMesin: '' });
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [history, setHistory] = useState<Job[]>([]);

  const handleSearchChange = (field: keyof typeof searchParams, value: string) => {
    const processedValue = field === 'policeNumber' ? formatPoliceNumber(value) : value;
    const newParams = { ...searchParams, [field]: processedValue };
    setSearchParams(newParams);

    if (!processedValue) {
        setSelectedVehicle(null);
        setHistory([]);
        return;
    }

    const found = allVehicles.find(v => {
        const val = v[field as keyof Vehicle];
        return val && String(val).toUpperCase() === processedValue.toUpperCase();
    });

    if (found) {
        setSelectedVehicle(found);
        setSearchParams({
            policeNumber: found.policeNumber || '',
            nomorRangka: found.nomorRangka || '',
            nomorMesin: found.nomorMesin || ''
        });
        const jobHistory = allJobs.filter(j => j.unitId === found.id).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setHistory(jobHistory);
    } else {
        setSelectedVehicle(null);
        setHistory([]);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold text-gray-900">Estimasi & Work Order</h1>
      
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Search size={20} className="text-indigo-600"/> Cari Unit</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <label className="text-sm font-medium text-gray-700">No. Polisi</label>
                <div className="relative">
                    <input type="text" value={searchParams.policeNumber} onChange={(e) => handleSearchChange('policeNumber', e.target.value)} className="w-full p-2 border rounded uppercase font-bold mt-1" placeholder="B1234ABC"/>
                    {selectedVehicle && <CheckCircle size={18} className="absolute right-3 top-4 text-green-600" />}
                </div>
            </div>
            <div>
                <label className="text-sm font-medium text-gray-700">No. Rangka</label>
                <input type="text" value={searchParams.nomorRangka} onChange={(e) => handleSearchChange('nomorRangka', e.target.value)} className="w-full p-2 border rounded uppercase mt-1" />
            </div>
            <div>
                <label className="text-sm font-medium text-gray-700">No. Mesin</label>
                <input type="text" value={searchParams.nomorMesin} onChange={(e) => handleSearchChange('nomorMesin', e.target.value)} className="w-full p-2 border rounded uppercase mt-1" />
            </div>
        </div>
        {!selectedVehicle && searchParams.policeNumber.length > 2 && (
             <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle size={16} /> Unit belum terdaftar. <span className="font-bold underline cursor-pointer" onClick={() => onNavigate('input_data')}>Daftarkan Unit Baru</span>.
             </div>
        )}
      </div>

      {selectedVehicle && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-4"><User className="text-indigo-600" size={20} /> <h4 className="font-bold">Pelanggan</h4></div>
                <p className="text-lg font-bold">{selectedVehicle.customerName}</p>
                <p className="text-sm text-gray-500">{selectedVehicle.customerPhone}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-4"><Car className="text-indigo-600" size={20} /> <h4 className="font-bold">Kendaraan</h4></div>
                <p className="text-lg font-bold">{selectedVehicle.carModel}</p>
                <p className="text-sm text-gray-500">{selectedVehicle.warnaMobil}</p>
            </div>

            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4 border-b pb-2"><Clock className="text-indigo-600" size={20} /> <h4 className="font-bold">Riwayat Servis / Estimasi Aktif</h4></div>
                {history.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 uppercase text-xs font-bold text-gray-500">
                            <tr><th className="p-3">Tgl</th><th className="p-3">No. Est / WO</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th><th className="p-3 text-center">Aksi</th></tr>
                        </thead>
                        <tbody className="divide-y">
                            {history.map(job => (
                                <tr key={job.id} className="hover:bg-gray-50">
                                    <td className="p-3">{formatDateIndo(job.tanggalMasuk)}</td>
                                    <td className="p-3 font-mono">{job.woNumber || job.estimateData?.estimationNumber || 'DRAFT'}</td>
                                    <td className="p-3">{job.isClosed ? <span className="text-red-600 font-bold">Closed</span> : <span className="text-green-600 font-bold">Open</span>}</td>
                                    <td className="p-3 text-right">{formatCurrency(job.estimateData?.grandTotal)}</td>
                                    <td className="p-3 text-center"><button onClick={() => openModal('create_estimation', job)} className="text-indigo-600 font-bold underline">Detail</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : <div className="text-center py-6 text-gray-400">Belum ada riwayat perbaikan.</div>}
            </div>

            <div className="lg:col-span-2 flex justify-end pt-4 border-t">
                 <button onClick={() => onCreateTransaction?.(selectedVehicle)} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-lg">
                    <PlusCircle size={20} /> Buat Transaksi / Estimasi Baru
                 </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default EstimationForm;
