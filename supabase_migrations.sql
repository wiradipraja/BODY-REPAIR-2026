-- Supabase SQL Schema for Body Repair System
-- Execute these queries in Supabase SQL Editor to create the database structure

-- 1. bengkel_units_master (Vehicle Master Data)
CREATE TABLE IF NOT EXISTS bengkel_units_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  police_number VARCHAR(20) NOT NULL UNIQUE,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  customer_address TEXT,
  customer_kelurahan VARCHAR(100),
  customer_kecamatan VARCHAR(100),
  customer_kota VARCHAR(100),
  customer_provinsi VARCHAR(100),
  car_brand VARCHAR(100),
  car_model VARCHAR(100),
  warna_mobil VARCHAR(100),
  nomor_rangka VARCHAR(50),
  nomor_mesin VARCHAR(50),
  tahun_pembuatan INT,
  nama_asuransi VARCHAR(255),
  nomor_polis VARCHAR(100),
  asuransi_expiry_date DATE,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. bengkel_service_jobs (Service Jobs/Orders)
CREATE TABLE IF NOT EXISTS bengkel_service_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES bengkel_units_master(id),
  police_number VARCHAR(20),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),
  customer_address TEXT,
  customer_kota VARCHAR(100),
  car_brand VARCHAR(100),
  car_model VARCHAR(100),
  warna_mobil VARCHAR(100),
  nama_asuransi VARCHAR(255),
  nomor_rangka VARCHAR(50),
  nomor_mesin VARCHAR(50),
  tahun_pembuatan INT,
  status_kendaraan VARCHAR(100),
  status_pekerjaan VARCHAR(100),
  posisi_kendaraan VARCHAR(100),
  tanggal_masuk DATE,
  is_closed BOOLEAN DEFAULT false,
  harga_jasa DECIMAL(15,2) DEFAULT 0,
  harga_part DECIMAL(15,2) DEFAULT 0,
  nama_sa VARCHAR(255),
  cost_data JSONB DEFAULT '{}',
  estimate_data JSONB DEFAULT '{}',
  production_logs JSONB[] DEFAULT '{}',
  mechanic_assignments JSONB[] DEFAULT '{}',
  insurance_logs JSONB[] DEFAULT '{}',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. bengkel_spareparts_master (Inventory/Spare Parts)
CREATE TABLE IF NOT EXISTS bengkel_spareparts_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code VARCHAR(50) NOT NULL UNIQUE,
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  unit_type VARCHAR(50),
  qty_stock INT DEFAULT 0,
  qty_reserved INT DEFAULT 0,
  qty_available INT DEFAULT 0,
  supplier_id UUID,
  cost_per_unit DECIMAL(15,2),
  last_purchase_price DECIMAL(15,2),
  location VARCHAR(255),
  reorder_point INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. bengkel_suppliers (Suppliers Master)
CREATE TABLE IF NOT EXISTS bengkel_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name VARCHAR(255) NOT NULL,
  supplier_code VARCHAR(50) UNIQUE,
  contact_person VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  payment_terms VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. bengkel_purchase_orders (Purchase Orders)
CREATE TABLE IF NOT EXISTS bengkel_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(50) NOT NULL UNIQUE,
  supplier_id UUID REFERENCES bengkel_suppliers(id),
  supplier_name VARCHAR(255),
  order_date DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  total_amount DECIMAL(15,2),
  status VARCHAR(50) DEFAULT 'Pending',
  items JSONB[] DEFAULT '{}',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. bengkel_cashier_transactions (Financial Transactions)
CREATE TABLE IF NOT EXISTS bengkel_cashier_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(10),
  category VARCHAR(100),
  amount DECIMAL(15,2),
  payment_method VARCHAR(50),
  description TEXT,
  related_job_id UUID,
  reference_number VARCHAR(100),
  note TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. bengkel_assets (Asset Management)
CREATE TABLE IF NOT EXISTS bengkel_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name VARCHAR(255) NOT NULL,
  asset_code VARCHAR(50) UNIQUE,
  category VARCHAR(100),
  description TEXT,
  purchase_price DECIMAL(15,2),
  purchase_date DATE,
  location VARCHAR(255),
  condition VARCHAR(50),
  depreciation_rate DECIMAL(5,2),
  book_value DECIMAL(15,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. bengkel_services_master (Service/Panel Rate Master)
CREATE TABLE IF NOT EXISTS bengkel_services_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code VARCHAR(50) UNIQUE,
  service_name VARCHAR(255) NOT NULL,
  work_type VARCHAR(50),
  panel_value INT DEFAULT 1,
  base_price DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. bengkel_internal_chats (Internal Chat/Communication)
CREATE TABLE IF NOT EXISTS bengkel_internal_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  sender_id UUID NOT NULL,
  sender_name VARCHAR(255),
  sender_role VARCHAR(100),
  recipient_id UUID,
  is_global BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. users (User Management)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid VARCHAR(255) UNIQUE,
  email VARCHAR(255) UNIQUE,
  display_name VARCHAR(255),
  jobdesk VARCHAR(100),
  role VARCHAR(100) DEFAULT 'Staff',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. bengkel_settings (System Settings)
CREATE TABLE IF NOT EXISTS bengkel_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_name VARCHAR(255),
  workshop_address TEXT,
  workshop_phone VARCHAR(20),
  workshop_email VARCHAR(255),
  ppn_percentage DECIMAL(5,2) DEFAULT 10,
  monthly_target DECIMAL(15,2),
  weekly_target DECIMAL(15,2),
  mechanic_panel_rate DECIMAL(15,2),
  after_service_followup_days INT DEFAULT 7,
  national_holidays JSONB[] DEFAULT '{}',
  mechanic_names JSONB[] DEFAULT '{}',
  service_advisors JSONB[] DEFAULT '{}',
  insurance_options JSONB[] DEFAULT '{}',
  special_color_rates JSONB[] DEFAULT '{}',
  status_kendaraan_options JSONB[] DEFAULT '{}',
  status_pekerjaan_options JSONB[] DEFAULT '{}',
  user_roles JSONB DEFAULT '{}',
  role_options JSONB[] DEFAULT '{}',
  workshop_bank_accounts JSONB[] DEFAULT '{}',
  whatsapp_templates JSONB DEFAULT '{}',
  csi_indicators JSONB[] DEFAULT '{}',
  car_brands JSONB[] DEFAULT '{}',
  car_models JSONB[] DEFAULT '{}',
  car_colors JSONB[] DEFAULT '{}',
  whatsapp_config JSONB,
  tax_profile VARCHAR(50),
  fixed_pph25_amount DECIMAL(15,2),
  language VARCHAR(10) DEFAULT 'id',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for better performance
CREATE INDEX idx_units_police ON bengkel_units_master(police_number);
CREATE INDEX idx_jobs_unit_id ON bengkel_service_jobs(unit_id);
CREATE INDEX idx_jobs_status ON bengkel_service_jobs(status_pekerjaan);
CREATE INDEX idx_sparepart_code ON bengkel_spareparts_master(item_code);
CREATE INDEX idx_sparepart_stock ON bengkel_spareparts_master(qty_available);
CREATE INDEX idx_purchase_status ON bengkel_purchase_orders(status);
CREATE INDEX idx_cashier_date ON bengkel_cashier_transactions(created_at);
CREATE INDEX idx_chats_sender ON bengkel_internal_chats(sender_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Enable RLS (Row Level Security) for production
ALTER TABLE bengkel_units_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_service_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_spareparts_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_cashier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_services_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE bengkel_internal_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Examples - adjust as needed)
CREATE POLICY "Enable read access for all authenticated users" ON bengkel_units_master
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all authenticated users" ON bengkel_service_jobs
  FOR SELECT USING (auth.role() = 'authenticated');

-- SQL Query Execution Function (for SQL Editor)
CREATE OR REPLACE FUNCTION execute_sql(sql_query TEXT)
RETURNS SETOF RECORD AS $$
BEGIN
  RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
