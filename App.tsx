
import React, { useState, useMemo, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabase, UNITS_MASTER_COLLECTION, SERVICE_JOBS_COLLECTION, SETTINGS_COLLECTION, SPAREPART_COLLECTION, SUPPLIERS_COLLECTION, CASHIER_COLLECTION, PURCHASE_ORDERS_COLLECTION, ASSETS_COLLECTION, SERVICES_MASTER_COLLECTION, USERS_COLLECTION } from './services/supabase';
import { subscribeToChanges, getCurrentTimestamp, queryWithFilters } from './services/supabaseHelpers';
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
import InternalChatWidget from './components/layout/InternalChatWidget';

const AppContent: React.FC = () => {
  const { user, userData, userPermissions, settings: defaultSettings, loading: authLoading, logout } = useAuth();
  
  const [currentView, setCurrentView] = useState('overview_main'); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<Settings>(defaultSettings);
  
  // Real-time Data States (GLOBAL INTEGRATION FIX)
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); 
  const [transactions, setTransactions] = useState<CashierTransaction[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]); 
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  
  const [loadingData, setLoadingData] = useState(true);

  // Global Listeners (Supabase Real-time Subscriptions)
  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    const handleError = (context: string) => (error: any) => console.error(`Error in ${context} listener:`, error);

    // Subscribe to Vehicles
    const vehiclesSubscription = subscribeToChanges(
      supabase,
      UNITS_MASTER_COLLECTION,
      () => loadVehicles(),
      () => loadVehicles(),
      () => loadVehicles()
    );

    // Subscribe to Jobs
    const jobsSubscription = subscribeToChanges(
      supabase,
      SERVICE_JOBS_COLLECTION,
      () => loadJobs(),
      () => loadJobs(),
      () => loadJobs()
    );

    // Subscribe to Suppliers
    const suppliersSubscription = subscribeToChanges(
      supabase,
      SUPPLIERS_COLLECTION,
      () => loadSuppliers(),
      () => loadSuppliers(),
      () => loadSuppliers()
    );

    // Subscribe to Transactions
    const transactionsSubscription = subscribeToChanges(
      supabase,
      CASHIER_COLLECTION,
      () => loadTransactions(),
      () => loadTransactions(),
      () => loadTransactions()
    );

    // Subscribe to Assets
    const assetsSubscription = subscribeToChanges(
      supabase,
      ASSETS_COLLECTION,
      () => loadAssets(),
      () => loadAssets(),
      () => loadAssets()
    );

    // Subscribe to Inventory
    const inventorySubscription = subscribeToChanges(
      supabase,
      SPAREPART_COLLECTION,
      () => loadInventory(),
      () => loadInventory(),
      () => loadInventory()
    );

    // Subscribe to Purchase Orders
    const posSubscription = subscribeToChanges(
      supabase,
      PURCHASE_ORDERS_COLLECTION,
      () => loadPurchaseOrders(),
      () => loadPurchaseOrders(),
      () => loadPurchaseOrders()
    );

    // Subscribe to Settings
    const settingsSubscription = subscribeToChanges(
      supabase,
      SETTINGS_COLLECTION,
      () => loadSettings(),
      () => loadSettings(),
      () => loadSettings()
    );

    setLoadingData(false);

    return () => {
      vehiclesSubscription?.unsubscribe();
      jobsSubscription?.unsubscribe();
      suppliersSubscription?.unsubscribe();
      transactionsSubscription?.unsubscribe();
      assetsSubscription?.unsubscribe();
      inventorySubscription?.unsubscribe();
      posSubscription?.unsubscribe();
      settingsSubscription?.unsubscribe();
    };
  }, [user]);

  // Load functions
  const loadVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from(UNITS_MASTER_COLLECTION)
        .select('*')
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setVehicles((data || []).map(d => ({ ...d, id: d.id })) as Vehicle[]);
    } catch (err) {
      handleError('Vehicles')(err);
    }
  };

  const loadJobs = async () => {
    try {
      const { data, error } = await supabase
        .from(SERVICE_JOBS_COLLECTION)
        .select('*')
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setJobs((data || []).map(d => ({ ...d, id: d.id })) as Job[]);
    } catch (err) {
      handleError('Jobs')(err);
    }
  };

  const loadSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from(SUPPLIERS_COLLECTION)
        .select('*');
      if (error) throw error;
      setSuppliers((data || []).map(d => ({ ...d, id: d.id })) as Supplier[]);
    } catch (err) {
      handleError('Suppliers')(err);
    }
  };

  const loadTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from(CASHIER_COLLECTION)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setTransactions((data || []).map(d => ({ ...d, id: d.id })) as CashierTransaction[]);
    } catch (err) {
      handleError('Transactions')(err);
    }
  };

  const loadAssets = async () => {
    try {
      const { data, error } = await supabase
        .from(ASSETS_COLLECTION)
        .select('*');
      if (error) throw error;
      setAssets((data || []).map(d => ({ ...d, id: d.id })) as Asset[]);
    } catch (err) {
      handleError('Assets')(err);
    }
  };

  const loadInventory = async () => {
    try {
      const { data, error } = await supabase
        .from(SPAREPART_COLLECTION)
        .select('*')
        .limit(5000);
      if (error) throw error;
      setInventoryItems((data || []).map(d => ({ ...d, id: d.id })) as InventoryItem[]);
    } catch (err) {
      handleError('Inventory')(err);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from(PURCHASE_ORDERS_COLLECTION)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setPurchaseOrders((data || []).map(d => ({ ...d, id: d.id })) as PurchaseOrder[]);
    } catch (err) {
      handleError('PurchaseOrders')(err);
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from(SETTINGS_COLLECTION)
        .select('*')
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        setAppSettings({ ...initialSettingsState, ...data[0] } as Settings);
      }
    } catch (err) {
      handleError('Settings')(err);
    }
  };

  const handleError = (context: string) => (error: any) => console.error(`Error in ${context}:`, error);
  
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

  // ... (Keep existing handlers: handleSaveVehicle, handleCreateTransaction, generateDocumentNumber, handleSaveEstimate, handleCloseJob, filteredJobs)
  
  const handleSaveVehicle = async (formData: Partial<Vehicle>) => {
      try {
          const vehiclePayload = {
              police_number: formData.policeNumber,
              customer_name: formData.customerName,
              customer_phone: formData.customerPhone,
              customer_address: formData.customerAddress,
              customer_kelurahan: formData.customerKelurahan,
              customer_kecamatan: formData.customerKecamatan,
              customer_kota: formData.customerKota,
              customer_provinsi: formData.customerProvinsi,
              car_brand: formData.carBrand,
              car_model: formData.carModel,
              warna_mobil: formData.warnaMobil,
              nomor_rangka: formData.nomorRangka,
              nomor_mesin: formData.nomorMesin,
              tahun_pembuatan: formData.tahunPembuatan,
              nama_asuransi: formData.namaAsuransi,
              nomor_polis: formData.nomorPolis,
              asuransi_expiry_date: formData.asuransiExpiryDate,
              is_deleted: false,
              updated_at: getCurrentTimestamp()
          };

          if (formData.id) {
              const { error } = await supabase
                .from(UNITS_MASTER_COLLECTION)
                .update(cleanObject(vehiclePayload))
                .eq('id', formData.id);
              if (error) throw error;
              showNotification("Database Unit diperbarui.", "success");
          } else {
              const newPayload = {
                  ...vehiclePayload,
                  created_at: getCurrentTimestamp(),
              };
              const { error } = await supabase
                .from(UNITS_MASTER_COLLECTION)
                .insert([cleanObject(newPayload)]);
              if (error) throw error;
              showNotification("Unit baru terdaftar di Master Database.", "success");
          }
          closeModal();
          await loadVehicles(); // Refresh data
      } catch (e: any) { 
          console.error(e); 
          showNotification("Gagal menyimpan unit: " + e.message, "error"); 
      }
  };

  const handleCreateTransaction = (vehicle: Vehicle) => {
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

  const generateDocumentNumber = (prefix: string, jobList: Job[]) => {
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const codePrefix = `${prefix}${year}${month}`;
      
      const existingSequences = jobList
          .map(j => {
              const num = prefix === 'WO' ? j.woNumber : j.estimateData?.estimationNumber;
              if (num && num.startsWith(codePrefix)) {
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
          const currentJob = jobs.find(j => j.id === jobId) || actualModalState.data;
          const isNewJob = jobId.startsWith('TEMP_');
          
          if (!isNewJob && currentJob?.hasInvoice) {
              showNotification("AKSES DITOLAK: WO ini sudah memiliki Faktur/Invoice.", "error");
              throw new Error("Invoice Exists. WO Locked.");
          }

          let estimationNumber = estimateData.estimationNumber;
          let woNumber = currentJob?.woNumber;
          
          const selectedPosisi = estimateData.posisiKendaraan || currentJob?.posisiKendaraan || 'Di Bengkel';
          
          if (saveType === 'estimate' && !estimationNumber) {
              estimationNumber = generateDocumentNumber('BE', jobs);
          }

          if (saveType === 'wo') {
              if (!estimationNumber) estimationNumber = generateDocumentNumber('BE', jobs);
              if (!woNumber) woNumber = generateDocumentNumber('WO', jobs);
          }

          const { posisiKendaraan, ...cleanEstimateData } = estimateData;

          const basePayload: any = {
              ...currentJob,
              estimate_data: { ...cleanEstimateData, estimationNumber },
              harga_jasa: estimateData.subtotalJasa,
              harga_part: estimateData.subtotalPart,
              nama_sa: estimateData.estimatorName || userData.displayName,
              updated_at: getCurrentTimestamp()
          };
          delete basePayload.id; 

          if (saveType === 'estimate') {
              if (!woNumber) {
                  if (basePayload.nama_asuransi !== 'Umum / Pribadi') {
                      basePayload.status_kendaraan = 'Tunggu SPK Asuransi';
                  } else {
                      basePayload.status_kendaraan = 'Tunggu Estimasi';
                  }
                  basePayload.posisi_kendaraan = selectedPosisi;
              }
          } else if (saveType === 'wo') {
              basePayload.wo_number = woNumber;
              basePayload.posisi_kendaraan = selectedPosisi;
              if (selectedPosisi === 'Di Bengkel') {
                  basePayload.status_kendaraan = 'Work In Progress'; 
                  basePayload.status_pekerjaan = 'Bongkar';
              } else {
                  basePayload.status_kendaraan = 'Unit di Pemilik (Tunggu Part)';
                  basePayload.status_pekerjaan = 'Tunggu Part';
              }
          }

          if (selectedPosisi === 'Di Bengkel' && currentJob?.isBookingContacted && !currentJob?.bookingSuccess) {
              const today = new Date().toISOString().split('T')[0];
              const bookingDate = currentJob.tanggalBooking;
              
              if (bookingDate === today) {
                  basePayload.booking_success = true;
                  basePayload.booking_entry_date = today;
                  showNotification("✅ KPI CRC: Booking Tepat Waktu (Success)", "success");
              } else if (bookingDate) {
                  showNotification("⚠️ KPI CRC: Booking Meleset/Tidak Sesuai Tanggal", "info");
              }
          }

          if (isNewJob) {
              const { error } = await supabase
                .from(SERVICE_JOBS_COLLECTION)
                .insert([cleanObject({ ...basePayload, created_at: getCurrentTimestamp(), is_closed: false })]);
              if (error) throw error;
          } else {
              const { error } = await supabase
                .from(SERVICE_JOBS_COLLECTION)
                .update(cleanObject(basePayload))
                .eq('id', jobId);
              if (error) throw error;
          }
          
          showNotification(saveType === 'wo' ? `WO ${woNumber} Terbit!` : `Estimasi ${estimationNumber} Tersimpan`, "success");
          closeModal();
          await loadJobs(); // Refresh data
          
          if (saveType === 'wo') setCurrentView('entry_data'); 
          
          return saveType === 'wo' ? woNumber! : estimationNumber!;
      } catch (e) { 
          if (e.message !== "Invoice Exists. WO Locked.") showNotification("Gagal menyimpan transaksi.", "error"); 
          throw e; 
      }
  };

  const handleCloseJob = async (job: Job) => {
      const partItems = job.estimate_data?.partItems || [];
      const hasUnissuedParts = partItems.some(p => !p.hasArrived);
      if (hasUnissuedParts) { alert("Gagal Tutup WO: Terdapat item Sparepart yang belum dikeluarkan (Issued)."); return; }
      
      const hasMaterials = job.usage_log?.some((l: any) => l.category === 'material');
      if (!hasMaterials) { alert("Gagal Tutup WO: Belum ada record pemakaian Bahan."); return; }
      
      if (job.status_kendaraan !== 'Selesai (Tunggu Pengambilan)' && job.status_pekerjaan !== 'Selesai') {
          if (!window.confirm("Unit belum selesai di Papan Kontrol. Paksa tutup?")) return;
      }

      try {
          const { error } = await supabase
            .from(SERVICE_JOBS_COLLECTION)
            .update({ 
                is_closed: true, 
                closed_at: getCurrentTimestamp(), 
                status_kendaraan: 'Sudah Diambil Pemilik', 
                status_pekerjaan: 'Selesai',
                updated_at: getCurrentTimestamp()
            })
            .eq('id', job.id);
          if (error) throw error;
          showNotification("WO Berhasil Ditutup.", "success");
          await loadJobs(); // Refresh data
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
    <div className="flex min-h-screen relative">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} currentView={currentView} setCurrentView={setCurrentView} userData={userData} userPermissions={userPermissions} onLogout={logout} settings={appSettings} />

      {/* Main Content Area - Transparent Background to show Body Gradient */}
      <main className="flex-grow p-4 md:p-8 overflow-y-auto h-screen w-full relative">
        {notification.show && ( <div className={`fixed top-4 right-4 p-4 rounded-xl shadow-xl text-white z-[100] animate-fade-in font-bold text-sm ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>{notification.message}</div> )}

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
                 <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Input Data Unit Baru</h1>
                 <div className="bg-white/80 backdrop-blur-lg p-6 md:p-8 rounded-2xl shadow-lg border border-white/50">
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
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Daftar Pekerjaan</h1>
                <MainDashboard allData={filteredJobs} openModal={openModal} onDelete={async (j) => { 
                    const { error } = await supabase.from(SERVICE_JOBS_COLLECTION).update({ is_deleted: true }).eq('id', j.id);
                    if (!error) {
                        showNotification("Dihapus.");
                        await loadJobs();
                    }
                }} onCloseJob={handleCloseJob} onReopenJob={async (j) => { 
                    const { error } = await supabase.from(SERVICE_JOBS_COLLECTION).update({ is_closed: false }).eq('id', j.id);
                    if (!error) {
                        showNotification("WO Dibuka Kembali.");
                        await loadJobs();
                    }
                }} userPermissions={userPermissions} showNotification={showNotification} searchQuery={searchQuery} setSearchQuery={setSearchQuery} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterWorkStatus={filterWorkStatus} setFilterWorkStatus={setFilterWorkStatus} showClosedJobs={showClosedJobs} setShowClosedJobs={setShowClosedJobs} settings={appSettings} />
            </div>
        )}

        {currentView === 'production_spkl' && ( <SpklManagementView jobs={jobs} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} /> )}
        {currentView === 'job_control' && ( <JobControlView jobs={jobs} inventoryItems={inventoryItems} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} /> )}
        {currentView === 'general_affairs' && ( <AssetManagementView assets={assets} userPermissions={userPermissions} showNotification={showNotification} /> )}
        {currentView === 'crc_dashboard' && ( <CrcDashboardView jobs={jobs} inventoryItems={inventoryItems} settings={appSettings} showNotification={showNotification} /> )}
        
        {currentView === 'inventory' && <InventoryView userPermissions={userPermissions} showNotification={showNotification} suppliers={suppliers} />}
        
        {currentView === 'part_monitoring' && <PartMonitoringView jobs={jobs} inventoryItems={inventoryItems} />}
        
        {currentView === 'purchase_order' && <PurchaseOrderView suppliers={suppliers} inventoryItems={inventoryItems} jobs={jobs} userPermissions={userPermissions} showNotification={showNotification} realTimePOs={purchaseOrders} />}
        
        {currentView === 'part_issuance' && <MaterialIssuanceView activeJobs={jobs.filter(j => j.woNumber)} inventoryItems={inventoryItems} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} onRefreshData={() => {}} issuanceType="sparepart" />}
        {currentView === 'material_issuance' && <MaterialIssuanceView activeJobs={jobs.filter(j => j.woNumber)} inventoryItems={inventoryItems} suppliers={suppliers} userPermissions={userPermissions} showNotification={showNotification} onRefreshData={() => {}} issuanceType="material" settings={appSettings} />}
        
        {currentView === 'finance_invoice' && <InvoiceCreatorView jobs={jobs} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} />}
        {currentView === 'finance_tax' && <TaxManagementView jobs={jobs} purchaseOrders={purchaseOrders} transactions={transactions} suppliers={suppliers} settings={appSettings} showNotification={showNotification} userPermissions={userPermissions} />}
        {currentView === 'finance_dashboard' && <AccountingView jobs={jobs} purchaseOrders={purchaseOrders} transactions={transactions} assets={assets} />}
        {currentView === 'finance_cashier' && <CashierView jobs={jobs} transactions={transactions} userPermissions={userPermissions} showNotification={showNotification} />}
        {currentView === 'finance_debt' && <DebtReceivableView jobs={jobs} transactions={transactions} purchaseOrders={purchaseOrders} userPermissions={userPermissions} showNotification={showNotification} />}
        
        {currentView === 'settings' && ( <div className="max-w-5xl mx-auto"><SettingsView currentSettings={appSettings} refreshSettings={async () => {}} showNotification={showNotification} userPermissions={userPermissions} realTimeSuppliers={suppliers} /></div> )}
        
        {currentView === 'report_center' && ( <ReportCenterView jobs={jobs} transactions={transactions} purchaseOrders={purchaseOrders} inventoryItems={inventoryItems} vehicles={vehicles} /> )}

        <Modal isOpen={actualModalState.isOpen} onClose={closeModal} title={actualModalState.type === 'create_estimation' ? 'Editor Estimasi & Work Order' : 'Registrasi Master Unit'} maxWidth={actualModalState.type === 'create_estimation' ? 'max-w-7xl' : 'max-w-3xl'} >
            {actualModalState.type === 'create_estimation' && actualModalState.data && ( <EstimateEditor job={actualModalState.data} ppnPercentage={appSettings.ppnPercentage} insuranceOptions={appSettings.insuranceOptions} onSave={handleSaveEstimate} onCancel={closeModal} settings={appSettings} creatorName={userData.displayName || 'Admin'} inventoryItems={inventoryItems} showNotification={showNotification} /> )}
            {actualModalState.type === 'edit_data' && <JobForm settings={appSettings} initialData={actualModalState.data} onSave={handleSaveVehicle} onCancel={closeModal} />}
        </Modal>
      </main>

      {userData.uid && <InternalChatWidget currentUser={userData} />}
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
