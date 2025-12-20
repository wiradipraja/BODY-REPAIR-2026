
import React, { useState, useEffect } from 'react';
import { Job, Settings } from '../../types';
import { carBrands, mazdaColors } from '../../utils/constants';
import { formatPoliceNumber } from '../../utils/helpers';
import { Save, Loader2, User, Car, Shield, Search, Info, Zap, Wallet } from 'lucide-react';

interface JobFormProps {
  initialData?: Job | null;
  settings: Settings;
  onSave: (data: Partial<Job>) => Promise<void>;
  onCancel: () => void;
  allJobs?: Job[]; 
}

const JobForm: React.FC<JobFormProps> = ({ initialData, settings, onSave, onCancel, allJobs = [] }) => {
  const [formData, setFormData] = useState<Partial<Job>>({
    statusKendaraan: 'Tunggu Estimasi',
    statusPekerjaan: 'Belum Mulai Perbaikan',
    posisiKendaraan: 'Di Bengkel', // Default backend value
    jumlahPanel: 0,
    woNumber: '',
    namaSA: '', 
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerKelurahan: '',
    customerKecamatan: '',
    customerKota: '',
    customerProvinsi: '',
    policeNumber: '',
    carBrand: 'Mazda',
    carModel: '',
    warnaMobil: 'Soul Red Crystal Metallic',
    nomorRangka: '',
    nomorMesin: '',
    tahunPembuatan: '',
    namaAsuransi: 'Umum / Pribadi',
    nomorPolis: '',
    asuransiExpiryDate: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingDataAlert, setExistingDataAlert] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
      setIsEditMode(true);
    }
  }, [initialData]);

  const checkExistingData = (field: 'policeNumber' | 'nomorRangka' | 'nomorMesin', value: string) => {
      if (!value || value.length < 3) return;
      const searchTerm = value.toUpperCase();
      const found = allJobs.find(j => {
          const val = j[field];
          return val && String(val).toUpperCase() === searchTerm;
      });
      if (found) {
          if (isEditMode && formData.id === found.id) return;
          const confirmLoad = window.confirm(`Data Kendaraan Ditemukan!\n\nNopol: ${found.policeNumber}\nPelanggan: ${found.customerName}\n\nApakah Anda ingin memuat data ini untuk diedit/update?`);
          if (confirmLoad) {
              setFormData({ ...found });
              setIsEditMode(true);
              setExistingDataAlert(`Mode Edit Aktif: Menampilkan data eksisting untuk ${found.policeNumber}.`);
          }
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'policeNumber' | 'nomorRangka' | 'nomorMesin') => {
      if (e.key === 'Enter') {
          e.preventDefault();
          checkExistingData(field, (e.target as HTMLInputElement).value);
      }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let processedValue: string | number = value;
    
    if (name === 'policeNumber') {
        processedValue = formatPoliceNumber(value);
    } else if (type === 'number') {
        processedValue = Number(value);
    }

    setFormData(prev => {
        const newData = { ...prev, [name]: processedValue };
        
        // AUTOMATION: Jika asuransi dipilih, status harus 'Tunggu Estimasi' agar masuk papan admin
        if (name === 'namaAsuransi') {
            if (value !== 'Umum / Pribadi') {
                newData.statusKendaraan = 'Tunggu Estimasi';
            } else {
                newData.statusKendaraan = 'Booking Masuk';
            }
        }
        
        return newData;
    });
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

  const isInsurance = formData.namaAsuransi !== 'Umum / Pribadi';

  return (
    <form onSubmit={handleSubmit} className="space-y-10 animate-fade-in max-w-4xl mx-auto py-4">
      {existingDataAlert && (
          <div className="bg-indigo-50/50 border border-indigo-200 p-4 rounded-2xl flex items-start gap-4">
              <Info className="text-indigo-500 mt-1" size={20}/>
              <div className="flex-grow">
                  <p className="font-bold text-indigo-900 text-sm">Sistem Mendeteksi Data Eksisting</p>
                  <p className="text-xs text-indigo-700/80 mt-0.5">{existingDataAlert}</p>
              </div>
              <button 
                type="button" 
                onClick={() => { setExistingDataAlert(null); setIsEditMode(false); setFormData(prev => ({ ...prev, id: undefined })); }}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                  Reset Form
              </button>
          </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
            <div className="p-1.5 bg-gray-50 rounded-lg"><Car className="text-gray-600" size={20} /></div>
            <h4 className="text-base font-bold text-gray-800">Spesifikasi Kendaraan</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">No. Polisi (Nopol)</label>
                <div className="relative">
                    <input 
                        type="text" name="policeNumber" value={formData.policeNumber} onChange={handleChange}
                        onKeyDown={(e) => handleKeyDown(e, 'policeNumber')} onBlur={(e) => checkExistingData('policeNumber', e.target.value)}
                        placeholder="Contoh: B1234ABC" className="w-full p-3 pl-11 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all uppercase font-black text-indigo-900 tracking-tight"
                        required autoFocus
                    />
                    <Search className="absolute left-4 top-3.5 text-gray-300" size={18}/>
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Warna Utama</label>
                <select name="warnaMobil" value={formData.warnaMobil} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-700">
                    {mazdaColors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tipe / Model</label>
                <input type="text" name="carModel" value={formData.carModel} onChange={handleChange} placeholder="CX-5, Mazda 2, dll..." className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-700" />
            </div>

            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">VIN (Nomor Rangka)</label>
                <input type="text" name="nomorRangka" value={formData.nomorRangka || ''} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-mono text-xs" placeholder="17 Digit VIN..." />
            </div>

            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tahun Pembuatan</label>
                <input type="text" name="tahunPembuatan" value={formData.tahunPembuatan || ''} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold" placeholder="2024" />
            </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
            <div className="p-1.5 bg-gray-50 rounded-lg"><Shield className="text-gray-600" size={20} /></div>
            <h4 className="text-base font-bold text-gray-800">Administrasi & Penjamin</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-2 space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Pihak Penjamin (Asuransi)</label>
                <select 
                    name="namaAsuransi" value={formData.namaAsuransi} onChange={handleChange}
                    className={`w-full p-4 border rounded-2xl font-black transition-all ${isInsurance ? 'border-indigo-200 bg-indigo-50/30 text-indigo-800 shadow-sm' : 'border-gray-100 bg-gray-50 text-gray-600'}`}
                >
                    {(settings.insuranceOptions || []).map(ins => <option key={ins.name} value={ins.name}>{ins.name}</option>)}
                </select>
            </div>

            <div className={`md:col-span-2 p-5 rounded-2xl border transition-all ${isInsurance ? 'border-indigo-100 bg-white shadow-sm' : 'border-gray-100 bg-white'}`}>
                <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-xl ${isInsurance ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                        {isInsurance ? <Zap size={20}/> : <Wallet size={20}/>}
                    </div>
                    <div>
                        <p className="font-bold text-sm text-gray-800">
                            {isInsurance ? 'Alur Administrasi Asuransi (Klaim)' : 'Alur Perbaikan Umum (Non-Klaim)'}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed font-medium">
                            {isInsurance 
                                ? 'Unit akan otomatis masuk ke antrian "Admin Claim Control" di kolom "Tunggu Estimasi".' 
                                : 'Unit akan diproses sebagai perbaikan mandiri/cash tanpa antrian admin asuransi.'}
                        </p>
                    </div>
                </div>
            </div>

            {isInsurance && (
                <>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nomor Polis</label>
                        <input type="text" name="nomorPolis" value={formData.nomorPolis || ''} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Service Advisor (SA)</label>
                        <select name="namaSA" value={formData.namaSA} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold">
                            <option value="">-- Pilih SA Penanggung Jawab --</option>
                            {(settings.serviceAdvisors || []).map(sa => <option key={sa} value={sa}>{sa}</option>)}
                        </select>
                    </div>
                </>
            )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
            <div className="p-1.5 bg-gray-50 rounded-lg"><User className="text-gray-600" size={20} /></div>
            <h4 className="text-base font-bold text-gray-800">Kontak Pelanggan</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nama Lengkap Pemilik</label>
                <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold" required />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nomor WhatsApp / HP</label>
                <input type="text" name="customerPhone" value={formData.customerPhone} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold" placeholder="08..." required />
            </div>
            <div className="md:col-span-2 space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Alamat Lengkap</label>
                <textarea name="customerAddress" value={formData.customerAddress} onChange={handleChange} rows={2} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100" />
            </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-6 py-3 text-gray-400 hover:text-gray-600 font-bold transition-colors" disabled={isSubmitting}>Batal</button>
        <button type="submit" disabled={isSubmitting} className={`flex items-center gap-2 px-10 py-3 text-white rounded-2xl transition-all shadow-xl shadow-indigo-100 font-black tracking-wide ${isEditMode ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'} transform active:scale-95`}>
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {isEditMode ? 'PERBARUI DATA' : 'DAFTARKAN UNIT'}
        </button>
      </div>
    </form>
  );
};

export default JobForm;
