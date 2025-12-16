import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogIn, User } from 'lucide-react';

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
      console.error(err);
      setError('Login gagal. Periksa email dan password Anda.');
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
        console.error(err);
        if (err.code === 'auth/operation-not-allowed') {
             setError('Login Tamu (Anonymous) belum diaktifkan di Firebase Console. Silakan aktifkan di menu Authentication > Sign-in method.');
        } else {
             setError('Gagal masuk sebagai tamu. Periksa koneksi atau konfigurasi Firebase.');
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md animate-fade-in border border-white/50">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-indigo-900 tracking-tight">Mazda Ranger</h1>
            <p className="text-sm font-medium text-gray-500 mt-1">Body & Paint Management System</p>
        </div>
        
        {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex flex-col items-center text-center">
                <span className="font-bold mb-1">Terjadi Kesalahan</span>
                {error}
            </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" 
              placeholder="admin@mazda.com" 
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all" 
              placeholder="••••••••" 
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg disabled:opacity-70 font-bold"
          >
            {loading ? 'Memproses...' : <><LogIn size={18} /> Masuk</>}
          </button>
        </form>

        <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">atau</span>
            </div>
        </div>

        <button 
            onClick={handleGuestLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border-2 border-gray-200 py-2.5 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all font-semibold"
        >
            <User size={18} /> Masuk sebagai Tamu (Demo)
        </button>
      </div>
    </div>
  );
};

export default LoginView;