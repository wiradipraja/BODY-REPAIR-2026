
import { Timestamp } from 'firebase/firestore';

export interface Vehicle {
  id: string;
  policeNumber: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerKota?: string;
  customerKelurahan?: string;
  customerKecamatan?: string;
  customerProvinsi?: string;
  carBrand?: string;
  carModel: string;
  warnaMobil: string;
  nomorRangka?: string;
  nomorMesin?: string;
  tahunPembuatan?: string;
  namaAsuransi: string;
  nomorPolis?: string;
  asuransiExpiryDate?: string;
  createdAt?: Timestamp;
  isDeleted?: boolean;
}

export interface Job {
  id: string;
  unitId: string; // Linked to Vehicle.id
  policeNumber: string; // Redundant for easy search/display
  customerName: string;
  // Fix: Added missing mirrored fields from Vehicle
  customerPhone?: string;
  customerAddress?: string;
  customerKota?: string;
  customerKelurahan?: string;
  customerKecamatan?: string;
  customerProvinsi?: string;
  carBrand?: string;
  carModel: string;
  warnaMobil: string;
  namaAsuransi: string;
  nomorPolis?: string;
  asuransiExpiryDate?: string;
  
  // Mirrored technical info from Vehicle for full transaction visibility
  nomorRangka?: string;
  nomorMesin?: string;
  tahunPembuatan?: string;
  
  woNumber?: string;
  namaSA: string;
  statusKendaraan: string;
  statusPekerjaan: string;
  posisiKendaraan: string;
  jumlahPanel?: number;
  
  tanggalMasuk?: string;
  tanggalEstimasiSelesai?: string;
  isClosed: boolean;
  hasInvoice?: boolean; // NEW FLAG: Locks the WO if true
  closedAt?: Timestamp;
  createdAt?: Timestamp;
  isDeleted?: boolean;
  
  estimateData?: EstimateData;
  costData?: JobCostData;
  usageLog?: UsageLogItem[];
  
  hargaJasa?: number;
  hargaPart?: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  jobdesk?: string;
  role?: string;
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
  indentETA?: string;
  hasArrived?: boolean;
  inventoryId?: string;
}

export interface EstimateData {
  estimationNumber?: string;
  estimatorName?: string;
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
  issuedAt: string;
  issuedBy: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  phone: string;
  address: string;
  picName: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  createdAt: any;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: 'sparepart' | 'material';
  brand?: string;
  stock: number;
  unit: string;
  minStock: number;
  buyPrice: number;
  sellPrice: number;
  location?: string;
  isStockManaged?: boolean;
  createdAt: any;
  updatedAt?: any;
}

export interface PurchaseOrderItem {
  inventoryId?: string | null;
  code: string;
  name: string;
  brand?: string;
  category: 'sparepart' | 'material';
  qty: number;
  qtyReceived?: number;
  unit: string;
  price: number;
  total: number;
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
  status: 'Draft' | 'Pending Approval' | 'Ordered' | 'Rejected' | 'Partial' | 'Received' | 'Cancelled';
  items: PurchaseOrderItem[];
  subtotal: number;
  hasPpn: boolean;
  ppnAmount: number;
  totalAmount: number;
  notes?: string;
  createdBy: string;
  createdAt: any;
  approvedBy?: string;
  approvedAt?: any;
  rejectionReason?: string;
  receivedAt?: any;
  receivedBy?: string;
  lastModified?: any;
}

export interface CashierTransaction {
  id: string;
  date: any;
  type: 'IN' | 'OUT';
  category: 'Uang Muka' | 'Pelunasan' | 'Invoice Masuk' | 'Operasional' | 'Lainnya';
  amount: number;
  paymentMethod: 'Cash' | 'Transfer' | 'EDC';
  bankName?: string; 
  refNumber?: string; // WO Number or Invoice Number
  refJobId?: string;
  refPoId?: string; // NEW: Link to Purchase Order ID for AP
  description?: string;
  customerName?: string;
  createdBy: string;
  createdAt: any;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface Settings {
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
  roleOptions: string[];
  workshopBankAccounts?: BankAccount[]; 
}
