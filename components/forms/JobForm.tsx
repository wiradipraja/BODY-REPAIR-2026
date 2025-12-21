
import React, { useState, useEffect } from 'react';
import { Job, Settings } from '../../types';
import { formatPoliceNumber } from '../../utils/helpers';
import { Save, Loader2, User, Car, Shield, Search, Info, Zap, Wallet, Calendar, MapPin, Tag } from 'lucide-react';

interface JobFormProps {
  initialData?: Job | null;
  settings: Settings;
  onSave: (data: Partial<Job>) => Promise<void>;
  onCancel: () => void;
  allJobs?: Job[]; 
}

const DICTIONARY: Record<string, Record<string, string>> = {
    id: {
        title: "Input Data Unit Baru",
        edit_title: "Perbarui Data Unit",
        sec_vehicle: "Spesifikasi Kendaraan",
        label_police: "No. Polisi (Nopol)",
        placeholder_police: "B 1234 ABC",
        label_brand: "Merk Kendaraan",
        label_model: "Tipe / Model",
        placeholder_model: "CX-5, Mazda 3, dll...",
        label_color: "Warna Utama",
        label_vin: "VIN (Nomor Rangka)",
        placeholder_vin: "17 Digit VIN...",
        label_engine: "Nomor Mesin",
        label_year: "Tahun Pembuatan",
        sec_admin: "Administrasi & Penjamin",
        label_insurance: "Pihak Penjamin (Asuransi)",
        label_policy_no: "Nomor Polis",
        label_policy_expiry: "Masa Berlaku Polis",
        sec_customer: "Kontak & Alamat Pelanggan",
        label_cust_name: "Nama Lengkap Pemilik",
        label_cust_phone: "Nomor WhatsApp / HP",
        sec_location: "Detail Lokasi Pelanggan",
        label_address: "Alamat Lengkap (Jalan/No. Rumah)",
        label_kel: "Kelurahan",
        label_kec: "Kecamatan",
        label_city: "Kota / Kabupaten",
        label_prov: "Provinsi",
        btn_save: "DAFTARKAN UNIT",
        btn_update: "PERBARUI DATA",
        btn_cancel: "Batal"
    },
    en: {
        title: "New Vehicle Intake",
        edit_title: "Update Vehicle Data",
        sec_vehicle: "Vehicle Specification",
        label_police: "Plate Number",
        placeholder_police: "B 1234 ABC",
        label_brand: "Vehicle Brand",
        label_model: "Type / Model",
        placeholder_model: "CX-5, Mazda 3, etc...",
        label_color: "Primary Color",
        label_vin: "VIN (Frame Number)",
        placeholder_vin: "17 Digit VIN...",
        label_engine: "Engine Number",
        label_year: "Year of Manufacture",
        sec_admin: "Administration & Insurance",
        label_insurance: "Payer / Insurance",
        label_policy_no: "Policy Number",
        label_policy_expiry: "Policy Expiry Date",
        sec_customer: "Customer Contact & Address",
        label_cust_name: "Full Owner Name",
        label_cust_phone: "WhatsApp / Phone Number",
        sec_location: "Customer Location Detail",
        label_address: "Full Address (Street/House No)",
        label_kel: "District (Kelurahan)",
        label_kec: "Sub-district (Kecamatan)",
        label_city: "City / Regency",
        label_prov: "Province",
        btn_save: "REGISTER VEHICLE",
        btn_update: "UPDATE DATA",
        btn_cancel: "Cancel"
    }
};

const JobForm: React.FC<JobFormProps> = ({ initialData, settings, onSave, onCancel, allJobs = [] }) => {
  const lang = settings.language || 'id';
  const t = (key: string) => DICTIONARY[lang][key] || key;

  const [formData, setFormData] = useState<Partial<Job>>({
    statusKendaraan: 'Tunggu Estimasi',
    statusPekerjaan: 'Belum Mulai Perbaikan',
    posisiKendaraan: 'Di Bengkel',
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
    carBrand: settings.carBrands?.[0] || 'Mazda',
    carModel: '',
    warnaMobil: settings.carColors?.[0] || 'Soul Red Crystal Metallic',
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
    if (name === 'policeNumber') processedValue = formatPoliceNumber(value);
    else if (type === 'number') processedValue = Number(value);

    setFormData(prev => {
        const newData = { ...prev, [name]: processedValue };
        if (name === 'namaAsuransi') {
            newData.statusKendaraan = value !== 'Umum / Pribadi' ? 'Tunggu Estimasi' : 'Booking Masuk';
        }
        return newData;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.policeNumber || !formData.customerName) return;
    setIsSubmitting(true);
    try { await onSave(formData); } catch (error) { console.error(error); } finally { setIsSubmitting(false); }
  };

  const isInsurance = formData.namaAsuransi !== 'Umum / Pribadi';

  return (
    <form onSubmit={handleSubmit} className="space-y-10 animate-fade-in max-w-5xl mx-auto py-4">
      {existingDataAlert && (
          <div className="bg-indigo-50/50 border border-indigo-200 p-4 rounded-2xl flex items-start gap-4">
              <Info className="text-indigo-500 mt-1" size={20}/>
              <div className="flex-grow">
                  <p className="font-bold text-indigo-900 text-sm">Sistem Mendeteksi Data Eksisting</p>
                  <p className="text-xs text-indigo-700/80 mt-0.5">{existingDataAlert}</p>
              </div>
              <button type="button" onClick={() => { setExistingDataAlert(null); setIsEditMode(false); setFormData(prev => ({ ...prev, id: undefined })); }} className="text-xs font-bold text-indigo-600 hover:underline">Reset Form</button>
          </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
            <div className="p-1.5 bg-gray-50 rounded-lg"><Car className="text-gray-600" size={20} /></div>
            <h4 className="text-base font-bold text-gray-800">{t('sec_vehicle')}</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-6">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_police')}</label>
                <div className="relative">
                    <input type="text" name="policeNumber" value={formData.policeNumber} onChange={handleChange} onKeyDown={(e) => handleKeyDown(e, 'policeNumber')} onBlur={(e) => checkExistingData('policeNumber', e.target.value)} placeholder={t('placeholder_police')} className="w-full p-3 pl-11 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all uppercase font-black text-indigo-900 tracking-tight" required autoFocus />
                    <Search className="absolute left-4 top-3.5 text-gray-300" size={18}/>
                </div>
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_brand')}</label>
                <select name="carBrand" value={formData.carBrand} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-700">
                    {(settings.carBrands || []).map(b => <option key={b} value={b}>{b}</option>)}
                </select>
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_model')}</label>
                <div className="relative group">
                    <input list="car-models-list" type="text" name="carModel" value={formData.carModel} onChange={handleChange} placeholder={t('placeholder_model')} className="w-full p-3 pl-11 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-700" />
                    <Tag size={16} className="absolute left-4 top-3.5 text-gray-300" />
                    <datalist id="car-models-list">{(settings.carModels || []).map(m => <option key={m} value={m}/>)}</datalist>
                </div>
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_color')}</label>
                <select name="warnaMobil" value={formData.warnaMobil} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-700">
                    {(settings.carColors || []).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_vin')}</label>
                <input type="text" name="nomorRangka" value={formData.nomorRangka || ''} onChange={handleChange} onKeyDown={(e) => handleKeyDown(e, 'nomorRangka')} onBlur={(e) => checkExistingData('nomorRangka', e.target.value)} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-mono text-xs font-bold uppercase" placeholder={t('placeholder_vin')} />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_engine')}</label>
                <input type="text" name="nomorMesin" value={formData.nomorMesin || ''} onChange={handleChange} onKeyDown={(e) => handleKeyDown(e, 'nomorMesin')} onBlur={(e) => checkExistingData('nomorMesin', e.target.value)} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-mono text-xs font-bold uppercase" placeholder={t('label_engine')} />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_year')}</label>
                <input type="text" name="tahunPembuatan" value={formData.tahunPembuatan || ''} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all font-bold" placeholder="2023" />
            </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
            <div className="p-1.5 bg-gray-50 rounded-lg"><Shield className="text-gray-600" size={20} /></div>
            <h4 className="text-base font-bold text-gray-800">{t('sec_admin')}</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_insurance')}</label>
                <select name="namaAsuransi" value={formData.namaAsuransi} onChange={handleChange} className={`w-full p-3 border rounded-xl font-black transition-all ${isInsurance ? 'border-indigo-200 bg-indigo-50/30 text-indigo-800 shadow-sm' : 'border-gray-100 bg-gray-50 text-gray-600'}`}>
                    {(settings.insuranceOptions || []).map(ins => <option key={ins.name} value={ins.name}>{ins.name}</option>)}
                </select>
            </div>
            {isInsurance ? (
                <>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_policy_no')}</label>
                        <input type="text" name="nomorPolis" value={formData.nomorPolis || ''} onChange={handleChange} placeholder={t('label_policy_no')} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Calendar size={12}/> {t('label_policy_expiry')}</label>
                        <input type="date" name="asuransiExpiryDate" value={formData.asuransiExpiryDate || ''} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold text-gray-700" />
                    </div>
                </>
            ) : <div className="hidden md:block"></div>}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
            <div className="p-1.5 bg-gray-50 rounded-lg"><User className="text-gray-600" size={20} /></div>
            <h4 className="text-base font-bold text-gray-800">{t('sec_customer')}</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_cust_name')}</label>
                <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold" required />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{t('label_cust_phone')}</label>
                <input type="text" name="customerPhone" value={formData.customerPhone} onChange={handleChange} className="w-full p-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-indigo-100 font-bold" placeholder="08..." required />
            </div>
        </div>
        <div className="space-y-6 bg-gray-50/50 p-6 rounded-2xl border border-gray-100 mt-4">
            <div className="flex items-center gap-2 mb-2"><MapPin size={16} className="text-indigo-500"/><span className="text-xs font-black text-indigo-900 uppercase tracking-widest">{t('sec_location')}</span></div>
            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('label_address')}</label>
                    <textarea name="customerAddress" value={formData.customerAddress} onChange={handleChange} rows={2} className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-100 transition-all" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('label_kel')}</label><input type="text" name="customerKelurahan" value={formData.customerKelurahan || ''} onChange={handleChange} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('label_kec')}</label><input type="text" name="customerKecamatan" value={formData.customerKecamatan || ''} onChange={handleChange} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('label_city')}</label><input type="text" name="customerKota" value={formData.customerKota || ''} onChange={handleChange} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" /></div>
                <div className="space-y-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('label_prov')}</label><input type="text" name="customerProvinsi" value={formData.customerProvinsi || ''} onChange={handleChange} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium" /></div>
            </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-6 py-3 text-gray-400 hover:text-gray-600 font-bold transition-colors" disabled={isSubmitting}>{t('btn_cancel')}</button>
        <button type="submit" disabled={isSubmitting} className={`flex items-center gap-2 px-10 py-3 text-white rounded-2xl transition-all shadow-xl shadow-indigo-100 font-black tracking-wide ${isEditMode ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'} transform active:scale-95`}>
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {isEditMode ? t('btn_update') : t('btn_save')}
        </button>
      </div>
    </form>
  );
};

export default JobForm;
