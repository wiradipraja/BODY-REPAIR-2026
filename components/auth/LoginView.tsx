
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogIn, User, AlertCircle, Loader2 } from 'lucide-react';

const LoginView: React.FC = () => {
  const { login, loginAnonymously } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/invalid-credential') {
          setError('Email atau password tidak sesuai. Pastikan akun sudah terdaftar dan provider login aktif.');
      } else if (err.code === 'auth/network-request-failed') {
          setError('Koneksi terputus. Mohon periksa internet Anda.');
      } else {
          setError('Login gagal. Periksa kembali data Anda atau hubungi Admin.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    setError('');
    try {
        await loginAnonymously();
    } catch (err: any) {
        console.error("Guest Login Error:", err);
        setError('Mode Demo tidak tersedia saat ini.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 w-full max-w-md animate-fade-in relative overflow-hidden">
        
        <div className="text-center mb-10">
            <h1 className="text-2xl font-black text-gray-900 tracking-tighter">MAZDA RANGER</h1>
            <p className="text-[10px] font-black text-indigo-400 mt-1 uppercase tracking-[0.2em]">Body & Paint System</p>
        </div>
        
        {error && (
            <div className="mb-8 p-4 bg-red-50/50 text-red-700 text-xs rounded-2xl border border-red-100 flex items-start gap-3 animate-shake">
                <AlertCircle className="shrink-0 mt-0.5" size={16}/>
                <div>
                    <p className="font-bold mb-0.5 uppercase tracking-tighter">Autentikasi Gagal</p>
                    <p className="font-medium opacity-80 leading-relaxed">{error}</p>
                </div>
            </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-gray-300 uppercase tracking-widest ml-1">Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="block w-full p-4 bg-gray-50/50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 focus:bg-white transition-all outline-none text-gray-800 font-bold" 
              placeholder="admin@mazdaranger.com" 
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-gray-300 uppercase tracking-widest ml-1">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="block w-full p-4 bg-gray-50/50 border-none rounded-2xl focus:ring-4 focus:ring-indigo-50 focus:bg-white transition-all outline-none text-gray-800 font-bold" 
              placeholder="••••••••" 
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-70 font-black tracking-wide transform active:scale-95 mt-4"
          >
            {loading ? <Loader2 className="animate-spin" size={20}/> : <><LogIn size={20} /> SIGN IN</>}
          </button>
        </form>

        <div className="relative my-10">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-50"></div>
            </div>
            <div className="relative flex justify-center text-[10px]">
                <span className="px-4 bg-white text-gray-300 font-bold uppercase tracking-[0.3em]">SECURE ACCESS</span>
            </div>
        </div>

        <button 
            onClick={handleGuestLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-400 border-2 border-gray-50 py-3 rounded-2xl hover:bg-gray-50 hover:text-indigo-500 transition-all font-bold text-xs tracking-wider"
        >
            <User size={16} /> GUEST DEMO MODE
        </button>

        <div className="mt-10 text-center">
            <p className="text-[9px] text-gray-300 font-bold uppercase tracking-[0.2em]">© 2025 Mazda Ranger Workshop</p>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
