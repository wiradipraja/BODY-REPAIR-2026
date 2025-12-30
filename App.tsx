
import React, { useState, useMemo, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db, UNITS_MASTER_COLLECTION, SERVICE_JOBS_COLLECTION, SETTINGS_COLLECTION, SPAREPART_COLLECTION, SUPPLIERS_COLLECTION, CASHIER_COLLECTION, PURCHASE_ORDERS_COLLECTION, ASSETS_COLLECTION, SERVICES_MASTER_COLLECTION, USERS_COLLECTION } from './services/firebase';
import { Job, EstimateData, Settings, InventoryItem, Supplier, Vehicle, CashierTransaction, PurchaseOrder, Asset, ServiceMasterItem, UserProfile } from './types';
import { initialSettingsState } from './utils/constants';
import { cleanObject } from './utils/helpers';

// Components
import OverviewDashboard from './components/dashboard/OverviewDashboard';
import BusinessIntelligenceView from './components/dashboard/BusinessIntelligenceView';
import KPIPerformanceView from './components/dashboard/KPIPerformanceView';
import AIAssistantView from './components/dashboard/AIAssistantView';
import MainDashboard from './components/dashboard/MainDashboard';
import LoginView from './components/auth/LoginView';
import Sidebar from './components/layout/Sidebar';
import Modal from './components/ui/Modal';
import JobForm from './components/forms/JobForm';
import EstimationForm from './components/forms/EstimationForm';
import EstimateEditor from './components/forms/EstimateEditor';
import SettingsView from './components/settings/SettingsView';
import InventoryView from './components/inventory/InventoryView'; 
import MaterialIssuanceView from './components/inventory/MaterialIssuanceView'; 
import PurchaseOrderView from './components/inventory/PurchaseOrderView'; 
import PartMonitoringView from './components/inventory/PartMonitoringView'; 
import AccountingView from './components/finance/AccountingView'; 
import CashierView from './components/finance/CashierView'; 
import DebtReceivableView from './components/finance/DebtReceivableView'; 
import InvoiceCreatorView from './components/finance/InvoiceCreatorView';
import TaxManagementView from './components/finance/TaxManagementView';
import SpklManagementView from './components/production/SpklManagementView';
import AssetManagementView from './components/general/AssetManagementView';
import CrcDashboardView from './components/crc/CrcDashboardView'; 
import JobControlView from './components/production/JobControlView';
import ClaimsControlView from './components/admin/ClaimsControlView'; 
import ReportCenterView from './components/reports/ReportCenterView';

const AppContent: React.FC = () => {
  const { user, userData, userPermissions, settings: defaultSettings, loading: authLoading, logout } = useAuth();
  
  const [currentView, setCurrentView] = useState('overview_main'); // Set default to Overview
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<Settings>(defaultSettings);
  
  // Real-time Data States
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); 
  const [transactions, setTransactions] = useState<CashierTransaction[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]); 
  
  const [loadingData, setLoadingData] = useState(true);

  // Global Listeners
  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    const handleError = (context: string) => (error: any) => console.error(`Error in ${context} listener:`, error);

    const unsubVehicles = onSnapshot(query(collection(db, UNITS_MASTER_COLLECTION)), (snap) => {
        setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)).filter(v => !v.isDeleted));
    }, handleError("Vehicles"));

    const unsubJobs = onSnapshot(query(collection(db, SERVICE_JOBS_COLLECTION)), (snap) => {
        setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)).filter(j => !j.isDeleted));
    }, handleError("Jobs"));

    const unsubInventory = onSnapshot(query(collection(db, SPAREPART_COLLECTION)), (snap) => {
        setInventoryItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    }, handleError("Inventory"));

    const unsubSuppliers = onSnapshot(query(collection(db, SUPPLIERS_COLLECTION)), (snap) => {
        setSuppliers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    }, handleError("Suppliers"));

    const unsubTransactions = onSnapshot(query(collection(db, CASHIER_COLLECTION), orderBy('createdAt', 'desc')), (snap) => {
        setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashierTransaction)));
    }, handleError("Transactions"));

    const unsubPOs = onSnapshot(query(collection(db, PURCHASE_ORDERS_COLLECTION), orderBy('createdAt', 'desc')), (snap) => {
        setPurchaseOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder)));
    }, handleError("PurchaseOrders"));

    const unsubAssets = onSnapshot(query(collection(db, ASSETS_COLLECTION)), (snap) => {
        setAssets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset)));
    }, handleError("Assets"));

    const unsubSettings = onSnapshot(collection(db, SETTINGS_COLLECTION), (snap) => {
       if (!snap.empty) {
           setAppSettings({ ...initialSettingsState, ...snap.docs[0].data() } as Settings);
       }
    });

    setLoadingData(false);
    return () => { 
        unsubVehicles(); unsubJobs(); unsubInventory();
        unsubSuppliers(); unsubTransactions(); unsubPOs(); unsubAssets(); unsubSettings();
    };
  }, [user]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterWorkStatus, setFilterWorkStatus] = useState('');
  const [showClosedJobs, setShowClosedJobs] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  const [actualModalState, setActualModalState] = useState<{
      isOpen: boolean;
      type: 'add_job' | 'edit_data' | 'edit_job' | 'create_estimation' | null;
      data: any | null;
  }>({ isOpen: false, type: null, data: null });

  const showNotification = (message: string, type = 'success') => {
      setNotification({ show: true, message, type });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
  };

  const openModal = (type: any, data: any = null) => setActualModalState({ isOpen: true, type, data });
  const closeModal = () => setActualModalState({ isOpen: false, type: null, data: null });

  const handleSaveVehicle = async (formData: Partial<Vehicle>) => {
      try {
          // STRICT DATA SEPARATION: Only save vehicle master fields.
          // Exclude any potential job/transaction fields if passed.
          const vehiclePayload = {
              policeNumber: formData.policeNumber,
              customerName: formData.customerName,
              customerPhone: formData.customerPhone,
              customerAddress: formData.customerAddress,
              customerKelurahan: formData.customerKelurahan,
              customerKecamatan: formData.customerKecamatan,
              customerKota: formData.customerKota,
              customerProvinsi: formData.customerProvinsi,
              carBrand: formData.carBrand,
              carModel: formData.carModel,
              warnaMobil: formData.warnaMobil,
              nomorRangka: formData.nomorRangka,
              nomorMesin: formData.nomorMesin,
              tahunPembuatan: formData.tahunPembuatan,
              namaAsuransi: formData.namaAsuransi,
              nomorPolis: formData.nomorPolis,
              asuransiExpiryDate: formData.asuransiExpiryDate,
              isDeleted: false
          };

          if (formData.id) {
              await updateDoc(doc(db, UNITS_MASTER_COLLECTION, formData.id), cleanObject(vehiclePayload));
              showNotification("Database Unit diperbarui.", "success");
          } else {
              const newPayload = {
                  ...vehiclePayload,
                  createdAt: serverTimestamp(),
              };
              await addDoc(collection(db, UNITS_MASTER_COLLECTION), cleanObject(newPayload));
              showNotification("Unit baru terdaftar di Master Database. Silakan masuk menu Estimasi untuk memulai Job.", "success");
          }
          closeModal();
      } catch (e: any) { 
          console.error(e); 
          showNotification("Gagal menyimpan unit: " + e.message, "error"); 
      }
  };

  const handleCreateTransaction = (vehicle: Vehicle) => {
      // Create new Job Draft based on selected Vehicle Master
      const newJobDraft: Partial<Job> = {
          id: `TEMP_${Date.now()}`,
          unitId: vehicle.id,
          policeNumber: vehicle.policeNumber,
          customerName: vehicle.customerName,
          customerPhone: vehicle.customerPhone,
          customerAddress: vehicle.customerAddress,
          customerKota: vehicle.customerKota,
          carBrand: vehicle.carBrand,
          carModel: vehicle.carModel,
          warnaMobil: vehicle.warnaMobil,
          namaAsuransi: vehicle.namaAsuransi,
          nomorRangka: vehicle.nomorRangka,
          nomorMesin: vehicle.nomorMesin,
          tahunPembuatan: vehicle.tahunPembuatan,
          statusKendaraan: 'Tunggu Estimasi',
          statusPekerjaan: 'Belum Mulai Perbaikan',
          posisiKendaraan: 'Di Bengkel',
          tanggalMasuk: new Date().toISOString().split('T')[0],
          isClosed: false,
          hargaJasa: 0,
          hargaPart: 0,
          namaSA: vehicle.namaAsuransi === 'Umum / Pribadi' ? userData.displayName || '' : '', 
          costData: { hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 },
          estimateData: { grandTotal: 0, jasaItems: [], partItems: [], discountJasa: 0, discountPart: 0, discountJasaAmount: 0, discountPartAmount: 0, ppnAmount: 0, subtotalJasa: 0, subtotalPart: 0 }
      };
      openModal('create_estimation', newJobDraft);
  };

  // --- HELPER UNTUK GENERATE ID SECARA BERURUTAN ---
  const generateDocumentNumber = (prefix: string, jobList: Job[]) => {
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const codePrefix = `${prefix}${year}${month}`;
      
      // Filter existing numbers from ALL jobs to ensure no duplicate even if filtered in view
      const existingSequences = jobList
          .map(j => {
              const num = prefix === 'WO' ? j.woNumber : j.estimateData?.estimationNumber;
              if (num && num.startsWith(codePrefix)) {
                  // Format: BEYYMMXXXX or WOYYMMXXXX
                  // Extract last 4 digits
                  return parseInt(num.substring(codePrefix.length));
              }
              return 0;
          })
          .filter(n => !isNaN(n));
      
      const maxSeq = existingSequences.length > 0 ? Math.max(...existingSequences) : 0;
      const nextSeq = maxSeq + 1;
      return `${codePrefix}${nextSeq.toString().padStart(4, '0')}`;
  };

  const handleSaveEstimate = async (jobId: string, estimateData: any, saveType: 'estimate' | 'wo'): Promise<string> => {
      try {
          // Get Current Job Data (Merge with new estimate data)
          const currentJob = jobs.find(j => j.id === jobId) || actualModalState.data;
          const isNewJob = jobId.startsWith('TEMP_');
          
          // --- STRICT LOCKING: PREVENT EDIT IF INVOICE EXISTS ---
          // Ini mencegah SA mengedit Estimasi/WO setelah Faktur diterbitkan oleh Kasir
          if (!isNewJob && currentJob?.hasInvoice) {
              showNotification("AKSES DITOLAK: WO ini sudah memiliki Faktur/Invoice. Harap hubungi Kasir/Finance untuk membatalkan faktur jika ingin melakukan revisi.", "error");
              throw new Error("Invoice Exists. WO Locked.");
          }

          let estimationNumber = estimateData.estimationNumber;
          let woNumber = currentJob?.woNumber;
          
          // EXTRACT SELECTED PHYSICAL POSITION FROM EDITOR (Augmented Data)
          const selectedPosisi = estimateData.posisiKendaraan || currentJob?.posisiKendaraan || 'Di Bengkel';
          
          // --- LOGIKA ESTIMASI ---
          if (saveType === 'estimate') {
              // Jika belum ada nomor estimasi, generate baru (BE-YYMM-XXXX)
              if (!estimationNumber) {
                  estimationNumber = generateDocumentNumber('BE', jobs);
              }
              
              // Status Logic untuk Estimasi
              // Jika asuransi, status 'Tunggu SPK Asuransi', jika Pribadi 'Tunggu Estimasi'
              // Posisi Kendaraan bisa 'Di Bengkel' atau 'Di Pemilik' (tidak dipaksa berubah)
          }

          // --- LOGIKA WORK ORDER (WO) ---
          if (saveType === 'wo') {
              // Pastikan nomor estimasi ada (jika direct WO)
              if (!estimationNumber) {
                  estimationNumber = generateDocumentNumber('BE', jobs);
              }

              // Generate WO jika belum ada
              if (!woNumber) {
                  woNumber = generateDocumentNumber('WO', jobs);
              }
          }

          // Remove extra field before saving to DB struct
          const { posisiKendaraan, ...cleanEstimateData } = estimateData;

          // Construct Payload
          const basePayload: any = {
              ...currentJob,
              estimateData: { 
                  ...cleanEstimateData, 
                  estimationNumber // Ensure BE number is saved
              },
              hargaJasa: estimateData.subtotalJasa,
              hargaPart: estimateData.subtotalPart,
              namaSA: estimateData.estimatorName || userData.displayName,
              updatedAt: serverTimestamp()
          };
          delete basePayload.id; // Remove ID to prevent overwrite error

          // --- STATUS UPDATES BASED ON TYPE ---
          if (saveType === 'estimate') {
              // Estimasi hanya update status jika belum WO
              if (!woNumber) {
                  if (basePayload.namaAsuransi !== 'Umum / Pribadi') {
                      basePayload.statusKendaraan = 'Tunggu SPK Asuransi';
                  } else {
                      basePayload.statusKendaraan = 'Tunggu Estimasi';
                  }
                  // Keep position as selected
                  basePayload.posisiKendaraan = selectedPosisi;
              }
          } else if (saveType === 'wo') {
              // TERBITKAN WO: Kunci Status ke Produksi sesuai Posisi Fisik
              basePayload.woNumber = woNumber;
              basePayload.posisiKendaraan = selectedPosisi;

              // LOGIC: KANBAN INTEGRATION
              if (selectedPosisi === 'Di Bengkel') {
                  // Unit Inap -> Masuk Stall Bongkar
                  basePayload.statusKendaraan = 'Work In Progress'; 
                  basePayload.statusPekerjaan = 'Bongkar';
              } else {
                  // Unit Bawa Pulang -> Masuk Persiapan (Tunggu Part)
                  basePayload.statusKendaraan = 'Unit di Pemilik (Tunggu Part)';
                  basePayload.statusPekerjaan = 'Tunggu Part';
              }
          }

          // --- KPI LOGIC: CHECK BOOKING SUCCESS (ONLY ON SAVE) ---
          // This ensures KPI is calculated only when the user commits the change
          if (selectedPosisi === 'Di Bengkel' && currentJob?.isBookingContacted && !currentJob?.bookingSuccess) {
              const today = new Date().toISOString().split('T')[0];
              const bookingDate = currentJob.tanggalBooking;
              
              if (bookingDate === today) {
                  basePayload.bookingSuccess = true;
                  basePayload.bookingEntryDate = today;
                  showNotification("✅ KPI CRC: Booking Tepat Waktu (Success)", "success");
              } else if (bookingDate) {
                  showNotification("⚠️ KPI CRC: Booking Meleset/Tidak Sesuai Tanggal", "info");
              }
          }

          // DATABASE OPERATION
          if (isNewJob) {
              await addDoc(collection(db, SERVICE_JOBS_COLLECTION), cleanObject({ ...basePayload, createdAt: serverTimestamp(), isClosed: false }));
          } else {
              await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, jobId), cleanObject(basePayload));
          }
          
          showNotification(saveType === 'wo' ? `WO ${woNumber} Terbit! Masuk antrian ${basePayload.statusPekerjaan}` : `Estimasi ${estimationNumber} Tersimpan`, "success");
          
          // Close modal automatically for both Estimate and WO actions
          closeModal();
          
          if (saveType === 'wo') {
              setCurrentView('entry_data'); 
          }
          
          return saveType === 'wo' ? woNumber! : estimationNumber!;
      } catch (e) { 
          console.error(e); 
          // Do not show notification again if it was the Invoice Lock error (already shown)
          if (e.message !== "Invoice Exists. WO Locked.") {
              showNotification("Gagal menyimpan transaksi.", "error"); 
          }
          throw e; 
      }
  };

  const handleCloseJob = async (job: Job) => {
      const partItems = job.estimateData?.partItems || [];
      const hasUnissuedParts = partItems.some(p => !p.hasArrived);
      if (hasUnissuedParts) { alert("Gagal Tutup WO: Terdapat item Sparepart yang belum dikeluarkan (Issued) dari Gudang."); return; }
      
      const hasMaterials = job.usageLog?.some(l => l.category === 'material');
      if (!hasMaterials) { alert("Gagal Tutup WO: Belum ada record pembebanan Bahan Baku (Material). Pastikan Bahan sudah dialokasikan."); return; }
      
      const hasOpenSpkl = (job.spklItems || []).some(s => s.status === 'Open');
      if (hasOpenSpkl) { alert("Gagal Tutup WO: Masih ada SPKL (Jasa Luar) yang berstatus OPEN. Selesaikan biaya vendor terlebih dahulu."); return; }

      if (job.statusKendaraan !== 'Selesai (Tunggu Pengambilan)' && job.statusPekerjaan !== 'Selesai') {
          if (!window.confirm("Unit belum dinyatakan selesai di Papan Kontrol. Yakin ingin menutup WO secara paksa?")) return;
      } else {
          if (!window.confirm(`Yakin ingin menutup WO ${job.woNumber}? Data pembebanan sudah divalidasi.`)) return;
      }

      try {
          await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, job.id), { 
              isClosed: true, 
              closedAt: serverTimestamp(), 
              statusKendaraan: 'Sudah Diambil Pemilik', 
              statusPekerjaan: 'Selesai' 
          }); 
          showNotification("WO Berhasil Ditutup.", "success");
      } catch (e) { showNotification("Gagal menutup WO.", "error"); }
  };

  const filteredJobs = useMemo(() => {
      let fJobs = jobs;
      if (!showClosedJobs) fJobs = fJobs.filter(j => !j.isClosed);
      if (searchQuery) fJobs = fJobs.filter(j => j.policeNumber.toLowerCase().includes(searchQuery.toLowerCase()) || j.customerName.toLowerCase().includes(searchQuery.toLowerCase()));
      if (filterStatus) fJobs = fJobs.filter(j => j.statusKendaraan === filterStatus);
      if (filterWorkStatus) fJobs = fJobs.filter(j => j.statusPekerjaan === filterWorkStatus);
      return fJobs;
  }, [jobs, searchQuery, filterStatus, filterWorkStatus, showClosedJobs]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-indigo-600 font-medium">Memuat Sistem...</div>;
  if (!user) return <LoginView />;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} currentView={currentView} setCurrentView={setCurrentView} userData={userData} userPermissions={userPermissions} onLogout={logout} settings={appSettings} />

      <main className="flex-grow p-4 md:p-8 overflow-y-auto h-screen w-full relative">
        {/* Increased Z-Index to 100 to ensure notification appears above Modals */}
        {notification.show && ( <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg text-white z-[100] animate-fade-in ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>{notification.message}</div> )}

        {currentView === 'overview_main' && (
            <OverviewDashboard allJobs={jobs} totalUnits={vehicles.length} settings={appSettings} onNavigate={setCurrentView} />
        )}
        {currentView === 'overview_business' && (
            <BusinessIntelligenceView jobs={jobs} settings={appSettings} />
        )}
        {currentView === 'overview_kpi' && (
            <KPIPerformanceView jobs={jobs} transactions={transactions} settings={appSettings} />
        )}
        {currentView === 'overview_ai' && (
            <AIAssistantView jobs={jobs} transactions={transactions} settings={appSettings} inventoryItems={inventoryItems} />
        )}

        {currentView === 'input_data' && (
             <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
                 <h1 className="text-3xl font-bold text-gray-900">Input Data Unit Baru</h1>
                 <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-gray-100">
                    <JobForm settings={appSettings} onSave={handleSaveVehicle} onCancel={() => setCurrentView('entry_data')} />
                 </div>
             </div>
        )}

        {currentView === 'estimation_create' && (
            <div className="max-w-4xl mx-auto">
                <EstimationForm allVehicles={vehicles} allJobs={jobs} onNavigate={setCurrentView} openModal={openModal} onCreateTransaction={handleCreateTransaction} />
            </div>
        )}

        {currentView === 'claims_control' && (
            <ClaimsControlView jobs={jobs} inventoryItems={inventoryItems} vehicles={vehicles} settings={appSettings} showNotification={showNotification} openModal={openModal} onNavigate={setCurrentView} />
        )}

        {currentView === 'entry_data' && (
            <div className="space-y-4">
                <h1 className="text-3xl font-bold text-gray-900">Daftar Pekerjaan</h1>
                <MainDashboard allData={filteredJobs} openModal={openModal} onDelete={async (j) => { await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, j.id), { isDeleted: true }); showNotification("Dihapus."); }} onCloseJob={handleCloseJob} onReopenJob={async (j) => { await updateDoc(doc(db, SERVICE_JOBS_COLLECTION, j.id), { isClosed: false }); showNotification("WO Dibuka Kembali."); }} userPermissions={userPermissions} showNotification={showNotification} searchQuery={searchQuery} setSearchQuery={setSearchQuery} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterWorkStatus={filterWorkStatus} setFilterWorkStatus={setFilterWorkStatus} showClosedJobs={showClosedJobs} setShowClosedJobs={setShowClosedJobs} settings={appSettings} />
            </div>
        )}

        {currentView === 'production_spkl' && ( <SpklManagementView jobs={jobs} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} /> )}
        {currentView === 'job_control' && ( <JobControlView jobs={jobs} inventoryItems={inventoryItems} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} /> )}
        {currentView === 'general_affairs' && ( <AssetManagementView assets={assets} userPermissions={userPermissions} showNotification={showNotification} /> )}
        {currentView === 'crc_dashboard' && ( <CrcDashboardView jobs={jobs} inventoryItems={inventoryItems} settings={appSettings} showNotification={showNotification} /> )}
        {currentView === 'inventory' && <InventoryView userPermissions={userPermissions} showNotification={showNotification} realTimeItems={inventoryItems} suppliers={suppliers} />}
        {currentView === 'part_monitoring' && <PartMonitoringView jobs={jobs} inventoryItems={inventoryItems} />}
        {currentView === 'purchase_order' && <PurchaseOrderView suppliers={suppliers} inventoryItems={inventoryItems} jobs={jobs} userPermissions={userPermissions} showNotification={showNotification} realTimePOs={purchaseOrders} />}
        {currentView === 'part_issuance' && <MaterialIssuanceView activeJobs={jobs.filter(j => j.woNumber)} inventoryItems={inventoryItems} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} onRefreshData={() => {}} issuanceType="sparepart" />}
        {currentView === 'material_issuance' && <MaterialIssuanceView activeJobs={jobs.filter(j => j.woNumber)} inventoryItems={inventoryItems} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} onRefreshData={() => {}} issuanceType="material" settings={appSettings} />}
        {currentView === 'finance_invoice' && <InvoiceCreatorView jobs={jobs} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} />}
        {currentView === 'finance_tax' && <TaxManagementView jobs={jobs} purchaseOrders={purchaseOrders} transactions={transactions} suppliers={suppliers} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} />}
        {currentView === 'finance_dashboard' && <AccountingView jobs={jobs} purchaseOrders={purchaseOrders} transactions={transactions} assets={assets} />}
        {currentView === 'finance_cashier' && <CashierView jobs={jobs} transactions={transactions} userPermissions={userPermissions} showNotification={showNotification} />}
        {currentView === 'finance_debt' && <DebtReceivableView jobs={jobs} transactions={transactions} purchaseOrders={purchaseOrders} userPermissions={userPermissions} showNotification={showNotification} />}
        
        {/* Updated SettingsView to receive Real-time Props if needed, or maintain internal listeners */}
        {currentView === 'settings' && ( <div className="max-w-5xl mx-auto"><SettingsView currentSettings={appSettings} refreshSettings={async () => {}} showNotification={showNotification} userPermissions={userPermissions} realTimeSuppliers={suppliers} /></div> )}
        
        {currentView === 'report_center' && ( <ReportCenterView jobs={jobs} transactions={transactions} purchaseOrders={purchaseOrders} inventoryItems={inventoryItems} vehicles={vehicles} /> )}

        <Modal isOpen={actualModalState.isOpen} onClose={closeModal} title={actualModalState.type === 'create_estimation' ? 'Editor Estimasi & Work Order' : 'Registrasi Master Unit'} maxWidth={actualModalState.type === 'create_estimation' ? 'max-w-7xl' : 'max-w-3xl'} >
            {actualModalState.type === 'create_estimation' && actualModalState.data && ( <EstimateEditor job={actualModalState.data} ppnPercentage={appSettings.ppnPercentage} insuranceOptions={appSettings.insuranceOptions} onSave={handleSaveEstimate} onCancel={closeModal} settings={appSettings} creatorName={userData.displayName || 'Admin'} inventoryItems={inventoryItems} showNotification={showNotification} /> )}
            {actualModalState.type === 'edit_data' && <JobForm settings={appSettings} initialData={actualModalState.data} onSave={handleSaveVehicle} onCancel={closeModal} />}
        </Modal>
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
