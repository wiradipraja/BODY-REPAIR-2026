import React, { useState, useMemo, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useJobs } from './hooks/useJobs';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs, increment, getDoc } from 'firebase/firestore';
import { db, JOBS_COLLECTION, SETTINGS_COLLECTION, SPAREPART_COLLECTION, SUPPLIERS_COLLECTION } from './services/firebase';
import { Job, EstimateData, Settings, InventoryItem, Supplier } from './types';
import { initialSettingsState } from './utils/constants';

// Components
import MainDashboard from './components/dashboard/MainDashboard';
import OverviewDashboard from './components/dashboard/OverviewDashboard';
import LoginView from './components/auth/LoginView';
import Sidebar from './components/layout/Sidebar';
import Modal from './components/ui/Modal';
import JobForm from './components/forms/JobForm';
import EstimationForm from './components/forms/EstimationForm';
import EstimateEditor from './components/forms/EstimateEditor';
import SettingsView from './components/settings/SettingsView';
import InventoryView from './components/inventory/InventoryView'; 
import MaterialIssuanceView from './components/inventory/MaterialIssuanceView'; 
import { Menu, Settings as SettingsIcon, AlertCircle } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, userData, userPermissions, settings: defaultSettings, loading: authLoading, logout } = useAuth();
  const { jobs: allData, loading: jobsLoading, error: jobsError } = useJobs(user);
  
  // UI State
  const [currentView, setCurrentView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Data State
  const [appSettings, setAppSettings] = useState<Settings>(defaultSettings);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); // New State

  // Function to refresh settings from DB manually
  const refreshSettings = async () => {
      try {
          const q = await getDocs(collection(db, SETTINGS_COLLECTION));
          if (!q.empty) {
              setAppSettings(q.docs[0].data() as Settings);
          }
      } catch (e) { console.error("Failed to refresh settings", e); }
  };

  // Function to fetch inventory for dropdowns
  const refreshInventory = async () => {
      try {
          const q = await getDocs(collection(db, SPAREPART_COLLECTION));
          const items = q.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
          setInventoryItems(items);
      } catch (e) { console.error("Failed to load inventory", e); }
  };

  // Function to fetch suppliers
  const refreshSuppliers = async () => {
      try {
          const q = await getDocs(collection(db, SUPPLIERS_COLLECTION));
          const items = q.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
          setSuppliers(items);
      } catch (e) { console.error("Failed to load suppliers", e); }
  };

  useEffect(() => {
    if (user) {
        refreshSettings();
        refreshInventory();
        refreshSuppliers();
    }
  }, [user]);
  
  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterWorkStatus, setFilterWorkStatus] = useState('');
  const [showClosedJobs, setShowClosedJobs] = useState(false);

  // Notification
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  // Modal State
  const [modalState, setModalState] = useState<{
      isOpen: boolean;
      type: 'add_job' | 'edit_data' | 'edit_job' | 'create_estimation' | null;
      data: any | null;
  }>({ isOpen: false, type: null, data: null });

  // Helpers
  const showNotification = (message: string, type = 'success') => {
      setNotification({ show: true, message, type });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
  };

  const openModal = (type: any, data: any = null) => setModalState({ isOpen: true, type, data });
  const closeModal = () => setModalState({ isOpen: false, type: null, data: null });

  // Handlers
  const handleSaveJob = async (formData: Partial<Job>) => {
      try {
          if (formData.id) {
              const jobRef = doc(db, JOBS_COLLECTION, formData.id);
              const cleanData = Object.fromEntries(Object.entries(formData).filter(([_, v]) => v !== undefined));
              await updateDoc(jobRef, cleanData);
              showNotification("Data berhasil diperbarui", "success");
          } else {
              const newJob: any = {
                  ...formData,
                  createdAt: serverTimestamp(),
                  isClosed: false,
                  costData: { hargaJasa: 0, hargaPart: 0, hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 },
                  estimateData: { grandTotal: 0 }
              };
              if (!newJob.tanggalMasuk) newJob.tanggalMasuk = new Date().toISOString().split('T')[0];
              await addDoc(collection(db, JOBS_COLLECTION), newJob);
              showNotification("Data berhasil ditambahkan", "success");
          }
          closeModal();
      } catch (e) { 
          console.error(e);
          showNotification("Gagal menyimpan data. Periksa izin database.", "error"); 
      }
  };

  // Handle Create New Transaction directly from Estimation Page
  const handleCreateTransaction = async (vehicleData: Partial<Job>) => {
      try {
          // 1. Create a new Job Document immediately
          const newJobPayload: any = {
              ...vehicleData,
              statusKendaraan: 'Booking Masuk', 
              statusPekerjaan: 'Belum Mulai Perbaikan',
              posisiKendaraan: 'Di Bengkel',
              tanggalMasuk: new Date().toISOString().split('T')[0],
              createdAt: serverTimestamp(),
              isClosed: false,
              costData: { hargaJasa: 0, hargaPart: 0, hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 },
              estimateData: { grandTotal: 0, jasaItems: [], partItems: [] }
          };

          const docRef = await addDoc(collection(db, JOBS_COLLECTION), newJobPayload);
          
          const newJobData = { id: docRef.id, ...newJobPayload };
          
          showNotification("Transaksi Baru Dibuat. Silakan input estimasi.", "success");
          openModal('create_estimation', newJobData);

      } catch (e) {
          console.error(e);
          showNotification("Gagal membuat transaksi baru", "error");
      }
  };

  const handleDeleteJob = async (job: Job) => {
      try {
          await deleteDoc(doc(db, JOBS_COLLECTION, job.id));
          showNotification("Berhasil dihapus", "success");
      } catch (e) {
          console.error(e);
          showNotification("Gagal menghapus data", "error");
      }
  };

  const handleCloseJob = async (job: Job) => {
      const costs = job.costData || { hargaModalBahan: 0, hargaBeliPart: 0, jasaExternal: 0 };
      const hasExpenses = (costs.hargaModalBahan || 0) > 0 || (costs.hargaBeliPart || 0) > 0 || (costs.jasaExternal || 0) > 0;

      if (!hasExpenses) {
          const confirmNoExpense = window.confirm(
              `PERINGATAN PENTING!\n\n` +
              `WO ${job.woNumber || job.policeNumber} belum memiliki pembebanan biaya.\n` +
              `Apakah Anda yakin ingin tetap menutup WO ini?`
          );
          if (!confirmNoExpense) return;
      } else {
          if (!window.confirm(`Konfirmasi Close WO ${job.woNumber || job.policeNumber}?`)) return;
      }

      try {
          const jobRef = doc(db, JOBS_COLLECTION, job.id);
          await updateDoc(jobRef, {
              isClosed: true,
              statusPekerjaan: 'Selesai',
              statusKendaraan: 'Selesai',
              closedAt: serverTimestamp()
          });
          showNotification("Work Order Berhasil Ditutup (Closed)", "success");
      } catch (e) {
          console.error(e);
          showNotification("Gagal menutup WO", "error");
      }
  };

  // Re-Open WO Logic
  const handleReopenJob = async (job: Job) => {
      if (!userPermissions.role.includes('Manager')) {
          showNotification("Akses ditolak. Hanya Manager yang bisa membuka kembali WO.", "error");
          return;
      }
      if (!window.confirm(`Buka Kembali (Re-open) WO ${job.woNumber}? Status akan kembali aktif.`)) return;

      try {
          const jobRef = doc(db, JOBS_COLLECTION, job.id);
          await updateDoc(jobRef, {
              isClosed: false,
              closedAt: null,
              statusPekerjaan: 'Finishing', // Set to a safe active status
              statusKendaraan: 'Work In Progress'
          });
          showNotification("WO Berhasil Dibuka Kembali", "success");
      } catch (e) {
          console.error(e);
          showNotification("Gagal membuka WO", "error");
      }
  };

  const handleSaveEstimate = async (jobId: string, estimateData: EstimateData, saveType: 'estimate' | 'wo'): Promise<string> => {
      try {
          const jobRef = doc(db, JOBS_COLLECTION, jobId);
          const currentJob = allData.find(j => j.id === jobId);
          
          let estimationNumber = estimateData.estimationNumber;
          let woNumber = currentJob?.woNumber;

          const now = new Date();
          const year = now.getFullYear().toString().slice(-2); 
          const month = (now.getMonth() + 1).toString().padStart(2, '0'); 

          // 1. Generate Estimation Number
          if (!estimationNumber) {
              const prefix = `BE${year}${month}`; 
              const existingNumbers = allData.map(j => j.estimateData?.estimationNumber).filter(n => n && n.startsWith(prefix));
              let maxSeq = 0;
              existingNumbers.forEach(n => {
                  if (n) {
                      const seq = parseInt(n.substring(prefix.length)); 
                      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                  }
              });
              estimationNumber = `${prefix}${(maxSeq + 1).toString().padStart(4, '0')}`;
          }

          // 2. Generate WO Number
          if (saveType === 'wo' && !woNumber) {
              const prefix = `WO${year}${month}`; 
              const existingNumbers = allData.map(j => j.woNumber).filter(n => n && n.startsWith(prefix));
              let maxSeq = 0;
              existingNumbers.forEach(n => {
                  if (n) {
                      const seq = parseInt(n.substring(prefix.length)); 
                      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                  }
              });
              woNumber = `${prefix}${(maxSeq + 1).toString().padStart(4, '0')}`;
          }

          const updatedEstimateData = {
              ...estimateData,
              estimationNumber: estimationNumber
          };

          const updatePayload: any = {
              estimateData: updatedEstimateData,
              hargaJasa: updatedEstimateData.subtotalJasa,
              hargaPart: updatedEstimateData.subtotalPart,
          };
          
          if (woNumber) {
              updatePayload.woNumber = woNumber;
              updatePayload.statusKendaraan = 'Work In Progress';
              updatePayload.statusPekerjaan = 'Belum Mulai Perbaikan';
          }

          if (currentJob && (currentJob.namaSA === 'Pending Allocation' || !currentJob.namaSA)) {
             updatePayload.namaSA = updatedEstimateData.estimatorName || userData.displayName;
          }

          await updateDoc(jobRef, updatePayload);
          
          const successMsg = saveType === 'wo' 
             ? `Work Order ${woNumber} berhasil diterbitkan!` 
             : `Estimasi ${estimationNumber} berhasil disimpan`;
          
          showNotification(successMsg, "success");
          closeModal();
          
          if(currentView !== 'estimation') setCurrentView('entry_data');

          return saveType === 'wo' ? woNumber! : estimationNumber!;
      } catch (e) {
          showNotification("Gagal menyimpan data", "error");
          console.error(e);
          throw e;
      }
  };

  const filteredJobs = useMemo(() => {
      let jobs = [...allData];
      if (!showClosedJobs) jobs = jobs.filter(job => !job.isClosed);
      if (searchQuery) jobs = jobs.filter(job => job.policeNumber && job.policeNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      if (filterStatus) jobs = jobs.filter(job => job.statusKendaraan === filterStatus);
      if (filterWorkStatus) jobs = jobs.filter(job => job.statusPekerjaan === filterWorkStatus);
      return jobs;
  }, [allData, searchQuery, filterStatus, filterWorkStatus, showClosedJobs]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-indigo-600 font-medium">Memuat Sistem...</div>;
  if (!user) return <LoginView />;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
        currentView={currentView} 
        setCurrentView={setCurrentView}
        userData={userData}
        userPermissions={userPermissions}
        onLogout={logout}
      />

      <main className="flex-grow p-4 md:p-8 overflow-y-auto h-screen w-full relative">
        {notification.show && (
            <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg text-white z-50 animate-fade-in ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
                {notification.message}
            </div>
        )}

        <div className="md:hidden flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow-sm">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-700"><Menu size={24}/></button>
            <span className="font-bold text-lg text-indigo-800">Mazda Ranger</span>
            <div className="w-6"></div>
        </div>

        {jobsError && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded shadow-md flex items-start gap-3 mx-4 md:mx-0 animate-fade-in">
                <div className="mt-0.5"><AlertCircle size={20}/></div>
                <div>
                    <p className="font-bold">Koneksi Database Gagal</p>
                    <p className="text-sm">{jobsError}</p>
                </div>
            </div>
        )}

        {currentView === 'overview' && (
            <OverviewDashboard allJobs={allData} settings={appSettings} onNavigate={setCurrentView} />
        )}
        
        {currentView === 'input_data' && (
             <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
                 <div>
                    <h1 className="text-3xl font-bold text-gray-900">Input Data Unit</h1>
                    <p className="text-gray-500 mt-1">Isi formulir lengkap untuk mendaftarkan kendaraan masuk, atau edit data lama.</p>
                 </div>
                 
                 <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-gray-100">
                    <JobForm 
                        settings={appSettings}
                        onSave={handleSaveJob}
                        onCancel={() => setCurrentView('overview')}
                        allJobs={allData} 
                    />
                 </div>
             </div>
        )}

        {currentView === 'estimation' && (
            <div className="max-w-4xl mx-auto">
                <EstimationForm 
                    allJobs={allData} 
                    onNavigate={setCurrentView} 
                    openModal={openModal}
                    onCreateTransaction={handleCreateTransaction} 
                />
            </div>
        )}

        {currentView === 'entry_data' && (
            <div className="space-y-4">
                <h1 className="text-3xl font-bold text-gray-900">Daftar Pekerjaan</h1>
                <MainDashboard 
                    allData={filteredJobs}
                    openModal={openModal}
                    onDelete={handleDeleteJob}
                    onCloseJob={handleCloseJob} 
                    onReopenJob={handleReopenJob} // NEW PROP
                    userPermissions={userPermissions}
                    showNotification={showNotification}
                    searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                    filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                    filterWorkStatus={filterWorkStatus} setFilterWorkStatus={setFilterWorkStatus}
                    showClosedJobs={showClosedJobs} setShowClosedJobs={setShowClosedJobs}
                    settings={appSettings}
                />
            </div>
        )}

        {currentView === 'inventory' && (
             <InventoryView 
                userPermissions={userPermissions}
                showNotification={showNotification}
             />
        )}

        {/* PEMBEBANAN PART (SYNC WITH ESTIMATE) */}
        {currentView === 'part_issuance' && (
            <MaterialIssuanceView 
                activeJobs={allData.filter(j => j.woNumber)} // Allow Closed Jobs to be seen for history, but actions blocked
                inventoryItems={inventoryItems}
                suppliers={suppliers} // PASS SUPPLIERS
                userPermissions={userPermissions}
                showNotification={showNotification}
                onRefreshData={refreshInventory}
                issuanceType="sparepart"
            />
        )}

        {/* PEMBEBANAN BAHAN (AD HOC) */}
        {currentView === 'material_issuance' && (
            <MaterialIssuanceView 
                activeJobs={allData.filter(j => j.woNumber)} 
                inventoryItems={inventoryItems}
                suppliers={suppliers} // PASS SUPPLIERS
                userPermissions={userPermissions}
                showNotification={showNotification}
                onRefreshData={refreshInventory}
                issuanceType="material"
            />
        )}

        {currentView === 'settings' && (
            <div className="max-w-5xl mx-auto">
                <SettingsView 
                    currentSettings={appSettings}
                    refreshSettings={refreshSettings}
                    showNotification={showNotification}
                    userPermissions={userPermissions}
                />
            </div>
        )}

        {['job_control', 'finance'].includes(currentView) && (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                 <SettingsIcon className="text-gray-400 mb-2" size={32} />
                <p className="text-gray-500 font-medium">Modul {currentView} sedang dalam pengembangan.</p>
            </div>
        )}

        {/* Global Modal */}
        <Modal 
            isOpen={modalState.isOpen} 
            onClose={closeModal} 
            title={
                modalState.type === 'edit_data' ? 'Edit Data Kendaraan' : 
                modalState.type === 'create_estimation' ? 'Editor Estimasi & Work Order' :
                'Detail Pekerjaan'
            }
            maxWidth={
                modalState.type === 'edit_job' || modalState.type === 'create_estimation' 
                ? 'max-w-7xl' 
                : 'max-w-3xl'
            }
        >
            {modalState.type === 'edit_data' && (
                <JobForm 
                    settings={appSettings}
                    initialData={modalState.data}
                    onSave={handleSaveJob}
                    onCancel={closeModal}
                    allJobs={allData} 
                />
            )}
            
            {modalState.type === 'add_job' && (
                 <JobForm 
                    settings={appSettings}
                    initialData={modalState.data} 
                    onSave={handleSaveJob}
                    onCancel={closeModal}
                    allJobs={allData}
                />
            )}
            
            {modalState.type === 'create_estimation' && modalState.data && (
                <EstimateEditor
                    job={modalState.data}
                    ppnPercentage={appSettings.ppnPercentage}
                    insuranceOptions={appSettings.insuranceOptions} 
                    onSave={handleSaveEstimate}
                    onCancel={closeModal}
                    settings={appSettings} 
                    creatorName={userData.displayName || 'Admin'}
                    inventoryItems={inventoryItems} 
                />
            )}
        </Modal>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;