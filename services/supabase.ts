import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// Initialize Supabase Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Database Helper Functions
export const dbHelper = {
  // Helper untuk INSERT
  async insert(table: string, data: any) {
    const { data: result, error } = await supabase
      .from(table)
      .insert([data])
      .select();
    if (error) throw error;
    return result;
  },

  // Helper untuk UPDATE
  async update(table: string, id: string, data: any) {
    const { data: result, error } = await supabase
      .from(table)
      .update(data)
      .eq('id', id)
      .select();
    if (error) throw error;
    return result;
  },

  // Helper untuk DELETE
  async delete(table: string, id: string) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Helper untuk SELECT
  async select(table: string, filters?: Record<string, any>) {
    let query = supabase.from(table).select('*');
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Helper untuk real-time subscription
  onDataChange(table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', callback: (payload: any) => void) {
    const subscription = supabase
      .channel(`public:${table}`)
      .on('postgres_changes', { event, schema: 'public', table }, callback)
      .subscribe();
    return subscription;
  }
};

// Collection/Table Names (sama seperti Firebase)
export const UNITS_MASTER_COLLECTION = 'bengkel_units_master';
export const SERVICE_JOBS_COLLECTION = 'bengkel_service_jobs';
export const SETTINGS_COLLECTION = 'bengkel_settings';
export const USERS_COLLECTION = 'users';
export const SPAREPART_COLLECTION = 'bengkel_spareparts_master';
export const SUPPLIERS_COLLECTION = 'bengkel_suppliers';
export const PURCHASE_ORDERS_COLLECTION = 'bengkel_purchase_orders';
export const CASHIER_COLLECTION = 'bengkel_cashier_transactions';
export const ASSETS_COLLECTION = 'bengkel_assets';
export const SERVICES_MASTER_COLLECTION = 'bengkel_services_master';
export const INTERNAL_CHATS_COLLECTION = 'bengkel_internal_chats';

// Admin UID
export const ADMIN_UID = '1O2CzQEvsVOnBuDWqfbtQWHJ4RP2';

// Helper untuk server timestamp (Supabase gunakan PostgreSQL CURRENT_TIMESTAMP)
export const serverTimestamp = () => new Date().toISOString();

// Helper untuk increment value
export const increment = (value: number) => {
  return { __increment: value }; // Placeholder, akan dihandle di helper
};
