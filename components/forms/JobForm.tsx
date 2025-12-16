import React, { useState, useEffect } from 'react';
import { Job, Settings } from '../../types';
import { carBrands, mazdaColors } from '../../utils/constants';
import { Save, Loader2, User, Car, Shield } from 'lucide-react';

interface JobFormProps {
  initialData?: Job | null;
  settings: Settings;
  onSave: (data: Partial<Job>) => Promise<void>;
  onCancel: () => void;
}

const JobForm: React.FC<JobFormProps> = ({ initialData, settings, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<Job>>({
    // Default Status Values (Hidden from UI)
    statusKendaraan: 'Booking Masuk',
    statusPekerjaan: 'Belum Mulai Perbaikan',
    posisiKendaraan: 'Di Bengkel',
    jumlahPanel: 0,
    woNumber: '',
    namaSA: 'Pending Allocation', 
    
    // Customer Info
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerKelurahan: '',
    customerKecamatan: '',
    customerKota: '',
    customerProvinsi: '',

    // Vehicle Info
    policeNumber: '',
    carBrand: 'Mazda',
    carModel: '',
    warnaMobil: 'Soul Red Crystal Metallic',
    nomorRangka: '',
    nomorMesin: '',
    tahunPembuatan: '',

    // Insurance Info
    namaAsuransi: 'Umum / Pribadi',
    nomorPolis: '',
    asuransiExpiryDate: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.policeNumber || !formData.customerName) {
      alert("Mohon lengkapi No. Polisi dan Nama Pelanggan");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      
      {/* SECTION 1: INFORMASI PELANGGAN */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b pb-2">
            <User className="text-indigo-600" size={24} />
            <h4 className="text-lg font-bold text-gray-800">Informasi Pelanggan</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Pelanggan *</label>
                <input 
                type="text" 
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
                />
            </div>

            <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">No. HP / WA *</label>
                <input 
                type="text" 
                name="customerPhone"
                value={formData.customerPhone}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
                />
            </div>

            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Lengkap</label>
                <textarea 
                name="customerAddress"
                value={formData.customerAddress}
                onChange={handleChange}
                rows={2}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nama Jalan, No. Rumah, RT/RW"
                />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:col-span-2">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kelurahan</label>
                    <input 
                    type="text" 
                    name="customerKelurahan"
                    value={formData.customerKelurahan}
                    onChange={handleChange}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kecamatan</label>
                    <input 
                    type="text" 
                    name="customerKecamatan"
                    value={formData.customerKecamatan}
                    onChange={handleChange}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kota / Kab</label>
                    <input 
                    type="text" 
                    name="customerKota"
                    value={formData.customerKota}
                    onChange={handleChange}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provinsi</label>
                    <input 
                    type="text" 
                    name="customerProvinsi"
                    value={formData.customerProvinsi}
                    onChange={handleChange}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
            </div>
        </div>
      </div>

      {/* SECTION 2: DATA KENDARAAN */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b pb-2">
            <Car className="text-indigo-600" size={24} />
            <h4 className="text-lg font-bold text-gray-800">Data Kendaraan</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Polisi *</label>
                <input 
                type="text" 
                name="policeNumber"
                value={formData.policeNumber}
                onChange={handleChange}
                placeholder="B 1234 XXX"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-bold tracking-wide"
                required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warna Kendaraan</label>
                <select 
                name="warnaMobil" 
                value={formData.warnaMobil} 
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                {mazdaColors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* Merk Sebelum Model */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Merk Kendaraan</label>
                <select 
                name="carBrand" 
                value={formData.carBrand} 
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                {carBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model / Tipe Kendaraan</label>
                <input 
                type="text" 
                name="carModel" 
                value={formData.carModel} 
                onChange={handleChange}
                placeholder="Contoh: CX-5 Elite"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Rangka (VIN)</label>
                <input 
                type="text" 
                name="nomorRangka"
                value={formData.nomorRangka || ''}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-mono"
                />
            </div>

            {/* Nomor Mesin & Tahun Pembuatan */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Mesin</label>
                <input 
                type="text" 
                name="nomorMesin"
                value={formData.nomorMesin || ''}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase font-mono"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tahun Pembuatan</label>
                <input 
                type="number" 
                name="tahunPembuatan"
                value={formData.tahunPembuatan || ''}
                onChange={handleChange}
                placeholder="YYYY"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
        </div>
      </div>

      {/* SECTION 3: INFORMASI DATA ASURANSI */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b pb-2">
            <Shield className="text-indigo-600" size={24} />
            <h4 className="text-lg font-bold text-gray-800">Informasi Data Asuransi</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Asuransi / Penjamin</label>
                <select 
                name="namaAsuransi" 
                value={formData.namaAsuransi} 
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                {(settings.insuranceOptions || []).map(ins => <option key={ins.name} value={ins.name}>{ins.name}</option>)}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Polis</label>
                <input 
                type="text" 
                name="nomorPolis"
                value={formData.nomorPolis || ''}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="No. Polis Asuransi"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Expired Asuransi</label>
                <input 
                type="date" 
                lang="id-ID"
                name="asuransiExpiryDate"
                value={formData.asuransiExpiryDate || ''}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          disabled={isSubmitting}
        >
          Batal
        </button>
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-70 shadow-lg font-bold"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {initialData ? 'Update Data Unit' : 'Simpan Data Baru'}
        </button>
      </div>
    </form>
  );
};

export default JobForm;