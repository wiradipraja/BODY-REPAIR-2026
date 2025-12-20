
import { Timestamp } from 'firebase/firestore';

export interface Settings {
  workshopName: string;
  workshopAddress: string;
  workshopPhone: string;
  workshopEmail: string;
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
  userRoles: Record<string, string>;
  roleOptions: string[];
  workshopBankAccounts: { bankName: string; accountNumber: string; accountHolder: string }[];
  whatsappTemplates: {
    bookingReminder: string;
    afterService: string;
    readyForPickup: string;
    promoBroadcast?: string;
  };
  whatsappConfig?: {
    mode: 'API' | 'MANUAL';
  };
  taxProfile?: 'UMKM' | 'UMUM';
  fixedPph25Amount?: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  jobdesk?: string;
  role?: string;
}

export interface UserPermissions {
  role: string;
  hasFinanceAccess: boolean;
}

export interface ServiceMasterItem {
  id: string;
  serviceCode?: string; 
  serviceName: string;
  workType: 'KC' | 'GTC' | 'BP' | 'Lainnya'; 
  panelValue: number; 
  basePrice: number;
  createdAt?: any;
}

export interface EstimateItem {
  name: string;
  price: number;
  qty?: number;
  number?: string; // Part number
  inventoryId?: string | null;
  panelCount?: number;
  workType?: string;
  hasArrived?: boolean;
  isOrdered?: boolean;
  isIndent?: boolean;
  indentETA?: string;
}

export interface InsuranceLog {
  date: string;
  user: string;
  note: string;
}

export interface EstimateData {
  estimationNumber?: string;
  grandTotal: number;
  jasaItems: EstimateItem[];
  partItems: EstimateItem[];
  discountJasa: number;
  discountPart: number;
  discountJasaAmount: number;
  discountPartAmount: number;
  ppnAmount: number;
  subtotalJasa: number;
  subtotalPart: number;
  invoiceCancelReason?: string;
  estimatorName?: string;
}

export interface UsageLogItem {
  itemId: string;
  itemName: string;
  itemCode: string;
  qty: number;
  inputQty?: number;
  inputUnit?: string;
  costPerUnit: number;
  totalCost: number;
  category: 'sparepart' | 'material';
  notes?: string;
  issuedAt: string;
  issuedBy: string;
}

export interface SpklItem {
  id: string;
  taskName: string;
  vendorName: string;
  cost: number;
  hasPph23: boolean;
  pph23Amount: number;
  status: 'Open' | 'Closed';
  createdAt: string;
  closedAt?: string | null;
  notes?: string;
}

export interface CostData {
  hargaModalBahan: number;
  hargaBeliPart: number;
  jasaExternal: number;
}

export interface Job {
  id: string;
  unitId?: string; // Links to Vehicle
  policeNumber: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerKelurahan?: string;
  customerKecamatan?: string;
  customerKota?: string;
  customerProvinsi?: string;
  
  carBrand: string;
  carModel: string;
  warnaMobil: string;
  nomorRangka?: string;
  nomorMesin?: string;
  tahunPembuatan?: string;
  
  namaAsuransi: string;
  nomorPolis?: string;
  asuransiExpiryDate?: string;
  
  statusKendaraan: string;
  statusPekerjaan: string;
  posisiKendaraan: string;
  jumlahPanel: number; 
  
  tanggalMasuk: string; // YYYY-MM-DD
  tanggalEstimasiSelesai?: string;
  
  woNumber?: string;
  namaSA?: string;
  mechanicName?: string;
  
  estimateData?: EstimateData;
  hargaJasa?: number;
  hargaPart?: number;
  
  costData?: CostData;
  usageLog?: UsageLogItem[];
  spklItems?: SpklItem[];
  
  // Negotiation History
  insuranceNegotiationLog?: InsuranceLog[];
  
  isClosed: boolean;
  closedAt?: any; // Timestamp
  hasInvoice?: boolean;
  
  createdAt?: any; // Timestamp
  updatedAt?: any; // Timestamp
  isDeleted?: boolean;

  crcFollowUpStatus?: 'Pending' | 'Contacted' | 'Unreachable';
  crcFollowUpDate?: any;
  customerRating?: number;
  customerFeedback?: string;
}

export interface Vehicle {
  id: string;
  policeNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerKota?: string;
  carBrand: string;
  carModel: string;
  warnaMobil: string;
  nomorRangka?: string;
  nomorMesin?: string;
  tahunPembuatan?: string;
  namaAsuransi: string;
  isDeleted?: boolean;
  createdAt?: any;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  brand?: string;
  category: 'sparepart' | 'material';
  stock: number;
  unit: string;
  minStock?: number;
  buyPrice: number;
  sellPrice: number;
  location?: string;
  isStockManaged?: boolean; // false for vendor managed
  createdAt?: any;
  updatedAt?: any;
}

export interface Supplier {
  id: string;
  name: string;
  category: 'Sparepart' | 'Bahan' | 'Jasa Luar' | 'Umum';
  phone?: string;
  address?: string;
}

export interface PurchaseOrderItem {
  code: string;
  name: string;
  brand?: string;
  category: 'sparepart' | 'material';
  qty: number;
  qtyReceived?: number;
  unit: string;
  price: number;
  total: number;
  inventoryId?: string | null;
  refJobId?: string;
  refWoNumber?: string;
  refPartIndex?: number;
  isIndent?: boolean;
  isStockManaged?: boolean;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'Draft' | 'Pending Approval' | 'Ordered' | 'Partial' | 'Received' | 'Rejected' | 'Cancelled';
  items: PurchaseOrderItem[];
  notes?: string;
  hasPpn: boolean;
  subtotal: number;
  ppnAmount: number;
  totalAmount: number;
  paidAmount?: number; // Calculated field
  remaining?: number; // Calculated field
  
  createdBy: string;
  createdAt: any;
  approvedBy?: string;
  approvedAt?: any;
  receivedBy?: string;
  receivedAt?: any;
  rejectionReason?: string;
  lastModified?: any;
}

export interface CashierTransaction {
  id: string;
  date: any; // Timestamp
  type: 'IN' | 'OUT';
  category: string;
  amount: number;
  paymentMethod: 'Cash' | 'Transfer' | 'EDC' | 'Non-Tunai (Pajak)';
  bankName?: string;
  description?: string;
  customerName?: string; // Payer or Payee
  refNumber?: string; // WO or PO number
  refJobId?: string;
  refPoId?: string;
  
  taxCertificateNumber?: string;
  
  createdBy: string;
  createdAt: any;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  purchasePrice: number;
  purchaseDate: string | Date; // stored as string YYYY-MM-DD or date object
  usefulLifeYears: number;
  residualValue: number;
  monthlyDepreciation: number;
  status: 'Active' | 'Sold' | 'Disposed';
  createdAt: any;
}
