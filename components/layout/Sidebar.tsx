import React from 'react';
import { LayoutDashboard, List, LogOut, User, Menu, PlusCircle, FileText, Settings } from 'lucide-react';
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
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'input_data', label: 'Input Data Unit', icon: PlusCircle },
    { id: 'estimation', label: 'Estimasi & WO', icon: FileText },
    { id: 'entry_data', label: 'Daftar Pekerjaan', icon: List },
  ];

  return (
    <>
      {/* Mobile Overlay */}
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

        <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button 
                key={item.id}
                onClick={() => { setCurrentView(item.id); setIsOpen(false); }} 
                className={`flex items-center gap-3 w-full p-3 rounded-lg text-sm font-medium transition ${currentView === item.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Icon size={18}/> {item.label}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t bg-gray-50 space-y-3">
          <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                  <User size={16}/>
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[100px]">{userData.displayName || userData.email || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate capitalize">{userPermissions.role}</p>
                </div>
              </div>
              
              {/* SETTINGS BUTTON */}
              {userPermissions.role === 'Manager' && (
                  <button 
                    onClick={() => { setCurrentView('settings'); setIsOpen(false); }}
                    className={`p-2 rounded-full transition-colors ${currentView === 'settings' ? 'bg-indigo-200 text-indigo-800' : 'hover:bg-gray-200 text-gray-600'}`}
                    title="Pengaturan Sistem"
                  >
                    <Settings size={18} />
                  </button>
              )}
          </div>
          
          <button onClick={onLogout} className="flex items-center gap-2 text-red-600 text-sm font-medium hover:text-red-800 transition w-full px-2 pt-2 border-t border-gray-200">
            <LogOut size={16}/> Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;