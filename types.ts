import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  jobdesk?: string; // This acts as the Role
  role?: string; // Explicit role field
  createdAt?: any;
}

export interface UserPermissions {
  role: string;
  hasFinanceAccess: boolean;
}

export interface JobCostData {
  hargaModalBahan: number;
  hargaBeliPart: number;
  jasaExternal: number;
}

export interface EstimateItem {
  name: string;
  price: number;
  number?: string;
  qty?: number;
  isOrdered?: boolean;
  isIndent?: boolean;
  hasArrived?: boolean;
  hargaBeliAktual?: number;
}

export interface EstimateData {
  estimationNumber?: string; // New: Nomor Unik Estimasi (e.g. BE24110001)
  estimatorName?: string; // New: Persisted name of the person who created/signed the estimate
  jasaItems: EstimateItem[];
  partItems: EstimateItem[];
  discountJasa: number;
  discountPart: number;
  subtotalJasa: number;
  subtotalPart: number;
  discountJasaAmount: number;
  discountPartAmount: number;
  ppnAmount: number;
  grandTotal: number;
}

export interface Job {
  id: string;
  policeNumber: string;
  
  // Customer Info
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerKelurahan?: string;
  customerKecamatan?: string;
  customerKota?: string;
  customerProvinsi?: string;

  // Vehicle Info
  carBrand?: string;
  carModel: string;
  warnaMobil: string;
  nomorRangka?: string;
  nomorMesin?: string;
  tahunPembuatan?: string;
  
  // Insurance Info
  namaAsuransi: string;
  nomorPolis?: string;
  asuransiExpiryDate?: string;

  namaSA: string;
  
  statusKendaraan: string;
  statusPekerjaan: string;
  posisiKendaraan: string;
  
  tanggalMasuk?: string;
  tanggalMulaiPerbaikan?: string;
  tanggalEstimasiSelesai?: string;
  tanggalSelesai?: string;
  tanggalDiambil?: string;
  
  woNumber?: string;
  isClosed: boolean;
  closedAt?: Timestamp;
  createdAt?: Timestamp;
  
  costData?: JobCostData;
  estimateData?: EstimateData;
  
  hargaJasa?: number;
  hargaPart?: number;
  grossProfit?: number;
  
  isRework?: boolean;
  reworkReason?: string;
  
  jumlahPanel?: number;
  photosTaskIgnored?: boolean;
  photos?: Record<string, any[]>;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  phone: string;
  address: string;
  picName: string;
  createdAt: any;
}

export interface Settings {
  // Workshop Identity
  workshopName?: string;
  workshopAddress?: string;
  workshopPhone?: string;
  workshopEmail?: string;

  ppnPercentage: number;
  monthlyTarget: number;
  weeklyTarget: number;
  afterServiceFollowUpDays: number;
  nationalHolidays: string[];
  mechanicNames: string[];
  serviceAdvisors: string[];
  insuranceOptions: { name: string; jasa: number; part: number }[];
  statusKendaraanOptions: string[];
  statusPekerjaanOptions: string[];
  userRoles: Record<string, { role: string; financeAccess: boolean }>;
  roleOptions: string[]; // List of available roles in the system
}