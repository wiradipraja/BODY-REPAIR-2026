
import React, { useState, useMemo, useEffect } from 'react';
import { LayoutDashboard, List, LogOut, User, Menu, PlusCircle, FileText, Settings, Package, ChevronDown, ChevronRight, Truck, Wrench, PaintBucket, ShoppingCart, ClipboardList, BarChart3, Banknote, Scale, FileCheck, Landmark, ExternalLink, Briefcase, Phone, MessageSquare, Hammer, FileSpreadsheet, ShieldCheck, PieChart, TrendingUp, Trophy, Sparkles } from 'lucide-react';
import { UserProfile, UserPermissions } from '../../types';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  currentView: string;
  setCurrentView: (view: string) => void;
  userData: UserProfile;
  userPermissions: UserPermissions;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, setIsOpen, currentView, setCurrentView, userData, userPermissions, onLogout 
}) => {
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);

  const menuItems = useMemo(() => {
    const items = [
      { 
          id: 'overview_root', 
          label: 'Overview', 
          icon: LayoutDashboard,
          children: [
              { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard },
              { id: 'business_intelligence', label: 'Analisis Performa', icon: TrendingUp },
              { id: 'kpi_performance', label: 'KPI Performa Staff', icon: Trophy },
              { id: 'ai_insight', label: 'AI Strategic Insight', icon: Sparkles },
          ]
      },
      
      { id: 'input_data', label: 'Input Data Unit', icon: PlusCircle },
      
      { 
          id: 'estimation_root', 
          label: 'Estimasi & WO', 
          icon: FileText,
          children: [
              { id: 'estimation_create', label: 'Buat Estimasi Baru', icon: PlusCircle },
              { id: 'claims_control', label: 'Admin Control Claim', icon: ShieldCheck },
              { id: 'entry_data', label: 'Daftar Pekerjaan (List)', icon: List },
              { id: 'production_spkl', label: 'SPKL (Jasa Luar)', icon: ExternalLink },
          ]
      },

      { id: 'crc_dashboard', label: 'CRC / Customer Care', icon: MessageSquare },
      
      { 
          id: 'production_root', 
          label: 'Produksi & Bengkel', 
          icon: Hammer,
          children: [
              { id: 'job_control', label: 'Job Control (Kanban)', icon: LayoutDashboard },
          ]
      },
      
      { 
          id: 'sparepart_root', 
          label: 'Sparepart & Gudang', 
          icon: Wrench,
          children: [
              { id: 'part_monitoring', label: 'Monitoring Part WO', icon: ClipboardList },
              { id: 'inventory', label: 'Master Stok', icon: Package },
              { id: 'purchase_order', label: 'Purchase Order (PO)', icon: ShoppingCart },
              { id: 'part_issuance', label: 'Keluar Part (WO)', icon: Truck }, 
              { id: 'material_issuance', label: 'Pakai Bahan', icon: PaintBucket }, 
          ]
      },
      { id: 'general_affairs', label: 'Aset & Operasional', icon: Briefcase },
    ];

    if (userPermissions.hasFinanceAccess) {
        items.push({ 
            id: 'finance_root', 
            label: 'Finance & Accounting', 
            icon: BarChart3,
            children: [
                { id: 'finance_invoice', label: 'Pembuatan Faktur', icon: FileCheck },
                { id: 'finance_tax', label: 'Manajemen Pajak', icon: Landmark },
                { id: 'finance_cashier', label: 'Kasir & Gatepass', icon: Banknote },
                { id: 'finance_debt', label: 'Hutang & Piutang', icon: Scale },
                { id: 'finance_dashboard', label: 'Laporan Keuangan', icon: BarChart3 },
            ]
        });
        
        items.push({ id: 'report_center', label: 'Pusat Laporan', icon: FileSpreadsheet });
    }
    return items;
  }, [userPermissions]);

  useEffect(() => {
    const activeParent = menuItems.find(item => 
      item.children?.some(child => child.id === currentView)
    );
    
    if (activeParent) {
      setExpandedMenuId(activeParent.id);
    } else {
      const isRootMenu = menuItems.some(item => item.id === currentView && !item.children);
      if (isRootMenu) {
        setExpandedMenuId(null);
      }
    }
  }, [currentView, menuItems]);

  const toggleMenu = (id: string) => {
    setExpandedMenuId(prevId => (prevId === id ? null : id));
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

      <aside className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-white shadow-xl flex flex-col z-30 transform transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-indigo-700">Mazda Ranger</h2>
            <p className="text-xs text-gray-500">Body & Paint System</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden text-gray-500">
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-grow p-4 space-y-1 overflow-y-auto scrollbar-thin">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedMenuId === item.id;
            
            const isParentActive = hasChildren && item.children?.some(child => child.id === currentView);
            const isSingleActive = !hasChildren && currentView === item.id;

            return (
              <div key={item.id} className="mb-1">
                  {!hasChildren ? (
                      <button 
                        onClick={() => { setCurrentView(item.id); setIsOpen(false); }} 
                        className={`flex items-center gap-3 w-full p-3 rounded-lg text-sm font-medium transition-all duration-200 ${isSingleActive ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-indigo-600'}`}
                      >
                        <Icon size={18}/> {item.label}
                      </button>
                  ) : (
                      <div className={`rounded-lg transition-colors duration-200 ${isExpanded ? 'bg-gray-50' : ''}`}>
                          <button 
                            onClick={() => toggleMenu(item.id)}
                            className={`flex items-center justify-between w-full p-3 rounded-lg text-sm font-medium transition-all duration-200 ${isParentActive && !isExpanded ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600 hover:bg-gray-100 hover:text-indigo-600'} ${isExpanded ? 'text-indigo-700 font-bold' : ''}`}
                          >
                             <div className="flex items-center gap-3">
                                <Icon size={18}/> {item.label}
                             </div>
                             {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                          </button>
                          
                          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                              <div className="ml-4 pl-2 border-l-2 border-indigo-100 space-y-1 mb-2">
                                  {item.children?.map(child => {
                                      const ChildIcon = child.icon;
                                      const isChildActive = currentView === child.id;
                                      return (
                                        <button 
                                            key={child.id}
                                            onClick={() => { setCurrentView(child.id); setIsOpen(false); }}
                                            className={`flex items-center gap-3 w-full p-2 rounded-md text-sm transition-all duration-200 ${isChildActive ? 'text-indigo-700 font-bold bg-white shadow-sm translate-x-1' : 'text-gray-500 hover:text-indigo-600 hover:bg-white/50'}`}
                                        >
                                            <ChildIcon size={16} className={isChildActive ? "text-indigo-600" : "opacity-70"}/> {child.label}
                                        </button>
                                      )
                                  })}
                              </div>
                          </div>
                      </div>
                  )}
              </div>
            )
          })}
        </nav>

        <div className="p-4 border-t bg-gray-50 space-y-3">
          <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 shadow-sm border border-indigo-200">
                  <User size={16}/>
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-gray-900 truncate max-w-[100px]">{userData.displayName || userData.email || 'User'}</p>
                  <p className="text-[10px] text-gray-500 truncate capitalize font-medium">{userPermissions.role}</p>
                </div>
              </div>
              
              <button 
                onClick={() => { setCurrentView('settings'); setIsOpen(false); }}
                className={`p-2 rounded-full transition-colors ${currentView === 'settings' ? 'bg-indigo-200 text-indigo-800' : 'hover:bg-gray-200 text-gray-600'}`}
                title="Pengaturan Sistem"
              >
                <Settings size={18} />
              </button>
          </div>
          
          <button onLogout={onLogout} className="flex items-center gap-2 text-red-600 text-sm font-medium hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-all w-full border border-transparent hover:border-red-100">
            <LogOut size={16}/> Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
