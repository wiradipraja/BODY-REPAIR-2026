import { Settings, Job } from '../types';

export const carBrands = ["Mazda", "Toyota", "Honda", "Mitsubishi", "Suzuki", "Daihatsu", "Nissan", "Hyundai", "Wuling", "BMW", "Mercedes-Benz", "Lainnya"];
export const mazdaModels = ["Mazda 2", "Mazda 2 HB", "Mazda 3", "Mazda 3 HB", "Mazda 6", "Mazda CX-3", "Mazda CX-30", "Mazda CX-5", "Mazda CX-60", "Mazda CX-8", "Mazda CX-9", "Mazda MX-5", "Mazda CX-80 (PHEV)", "Mazda MX-30 EV", "Mazda Biante", "Lainnya"];
export const mazdaColors = ["Soul Red", "Soul Red Crystal Metallic", "Machine Gray Metallic", "Polymetal Gray Metallic", "Snowflake White Pearl Mica", "Jet Black Mica", "Deep Crystal Blue Mica", "Platinum Quartz Metallic", "Zircon Sand Metallic", "Rhodium White Premium", "Artisan Red Metallic", "Melting Cooper Metallic", "Lainnya"];
export const posisiKendaraanOptions = ["Di Pemilik", "Di Bengkel"];
export const jobdeskOptions = ["Service Advisor", "Admin Bengkel", "CRC", "Foreman", "Manager", "Partman", "Ass. Partman"].sort();

export const initialSettingsState: Settings = {
    ppnPercentage: 11,
    monthlyTarget: 600000000,
    weeklyTarget: 150000000,
    afterServiceFollowUpDays: 3,
    nationalHolidays: [],
    mechanicNames: ["Mekanik A", "Mekanik B", "Mekanik C", "Mekanik D"].sort(),
    serviceAdvisors: ["Oscar", "Andika"].sort(),
    insuranceOptions: [
        { name: "ABDA / OONA Ins", jasa: 10, part: 5 }, { name: "ACA Insurance", jasa: 10, part: 7.5 },
        { name: "BCA Insurance", jasa: 10, part: 5 }, { name: "Garda Oto Ins", jasa: 10, part: 5 },
        { name: "Umum / Pribadi", jasa: 10, part: 5 }, { name: "Lainnya", jasa: 10, part: 5 }
    ],
    statusKendaraanOptions: ["Banding Harga SPK", "Booking Masuk", "Klaim Asuransi", "Work In Progress", "Selesai", "Sudah Di ambil Pemilik"].sort(),
    statusPekerjaanOptions: ["Belum Mulai Perbaikan", "Las Ketok", "Bongkar", "Dempul", "Cat", "Poles", "Pemasangan", "Finishing", "Quality Control", "Tunggu Part", "Selesai"],
    userRoles: {},
};

export const initialCostState = { hargaJasa: 0, hargaPart: 0, hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 };
export const initialEstimateData = { jasaItems: [], partItems: [], discountJasa: 0, discountPart: 0, subtotalJasa: 0, subtotalPart: 0, discountJasaAmount: 0, discountPartAmount: 0, ppnAmount: 0, grandTotal: 0 };

// MOCK DATA FOR SIMULATION
export const MOCK_JOBS: any[] = [
  {
    id: 'sim-1',
    policeNumber: 'B 1234 TES',
    customerName: 'Budi Santoso',
    customerPhone: '08123456789',
    customerKota: 'Jakarta Selatan',
    carBrand: 'Mazda',
    carModel: 'Mazda CX-5',
    warnaMobil: 'Soul Red Crystal Metallic',
    namaAsuransi: 'Garda Oto Ins',
    namaSA: 'Oscar',
    statusKendaraan: 'Work In Progress',
    statusPekerjaan: 'Dempul',
    posisiKendaraan: 'Di Bengkel',
    jumlahPanel: 3,
    tanggalMasuk: new Date().toISOString().split('T')[0],
    isClosed: false,
    estimateData: { grandTotal: 4500000 },
    createdAt: { seconds: Date.now() / 1000 }
  },
  {
    id: 'sim-2',
    policeNumber: 'D 5678 ABC',
    customerName: 'Siti Aminah',
    customerPhone: '08987654321',
    carBrand: 'Mazda',
    carModel: 'Mazda 2',
    warnaMobil: 'Machine Gray Metallic',
    namaAsuransi: 'Umum / Pribadi',
    namaSA: 'Andika',
    statusKendaraan: 'Selesai',
    statusPekerjaan: 'Selesai',
    posisiKendaraan: 'Di Bengkel',
    jumlahPanel: 1,
    tanggalMasuk: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    isClosed: false,
    estimateData: { grandTotal: 1200000 },
    createdAt: { seconds: (Date.now() - 86400000 * 3) / 1000 }
  },
  {
    id: 'sim-3',
    policeNumber: 'F 9999 XYZ',
    customerName: 'Perusahaan X',
    carBrand: 'Mazda',
    carModel: 'Mazda 6',
    warnaMobil: 'Jet Black Mica',
    namaAsuransi: 'BCA Insurance',
    namaSA: 'Oscar',
    statusKendaraan: 'Booking Masuk',
    statusPekerjaan: 'Belum Mulai Perbaikan',
    posisiKendaraan: 'Di Pemilik',
    jumlahPanel: 5,
    tanggalMasuk: new Date(Date.now() - 86400000 * 1).toISOString().split('T')[0],
    isClosed: false,
    estimateData: { grandTotal: 0 },
    createdAt: { seconds: (Date.now() - 86400000) / 1000 }
  }
];