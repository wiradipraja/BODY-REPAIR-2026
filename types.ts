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
  inventoryId?: string; // Linked to Inventory Master
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
  supplierId?: string; // New: Track which supplier this usage belongs to (for billing)
  supplierName?: string; // New
  notes?: string;
  issuedAt: string;
  issuedBy: string;
  cancellationReason?: string; // Audit: Why this issuance was cancelled
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
  
  // Audit Trails
  isRework?: boolean;
  reworkReason?: string;
  reopenReason?: string; // Audit: Why WO was reopened
  isDeleted?: boolean; // Soft Delete
  deletedReason?: string; // Audit: Why data was deleted
  
  costData?: JobCostData;
  estimateData?: EstimateData;
  usageLog?: UsageLogItem[]; // History of issued items
  
  hargaJasa?: number;
  hargaPart?: number;
  grossProfit?: number;
  
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
  // Bank Details for Finance
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  createdAt: any;
}

export interface InventoryItem {
  id: string;
  code: string; // Part Number or SKU
  name: string;
  category: 'sparepart' | 'material';
  brand?: string; // Merk (e.g. Mazda Genuine, Nippon Paint)
  stock: number;
  unit: string; // Pcs, Liter, Kg, Set
  minStock: number;
  buyPrice: number; // Harga Modal / HPP
  sellPrice: number; // Harga Jual ke Customer
  location?: string; // Lokasi Rak/Gudang
  supplierId?: string; // Link to Supplier
  isStockManaged?: boolean; // New: If false, stock can go negative (Vendor Managed/Consignment)
  createdAt: any;
  updatedAt?: any;
}

export interface PurchaseOrderItem {
  inventoryId?: string | null; // Nullable for new items
  code: string;
  name: string;
  qty: number;
  qtyReceived?: number; // Supports partial shipment
  unit: string;
  price: number; // Harga Beli Satuan
  total: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'Draft' | 'Pending Approval' | 'Ordered' | 'Rejected' | 'Partial' | 'Received' | 'Cancelled';
  items: PurchaseOrderItem[];
  
  // Financials
  subtotal: number;
  hasPpn: boolean;
  ppnAmount: number;
  totalAmount: number; // Grand Total
  
  notes?: string;
  
  // Audit
  createdBy: string;
  createdAt: any;
  
  approvedBy?: string;
  approvedAt?: any;
  rejectionReason?: string;

  receivedAt?: any;
  receivedBy?: string;
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