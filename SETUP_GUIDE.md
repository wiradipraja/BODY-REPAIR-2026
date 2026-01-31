# 🔧 BODY REPAIR 2026 - Sistem Manajemen Bengkel

**Status:** 🟡 Migration in Progress (Firebase → Supabase)
**Last Updated:** January 31, 2026

## 📋 Table of Contents
- [Overview](#overview)
- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Features](#features)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)

---

## 📖 Overview

**BODY REPAIR 2026** adalah sistem manajemen bengkel otomotif (body repair shop) yang komprehensif dengan fitur-fitur:

- 🔐 **Authentication & Role Management** - Multi-level user roles (Admin, Manager, Staff)
- 📊 **Dashboard & Analytics** - Real-time KPI tracking, BI insights, AI Assistant
- 🏭 **Production Management** - Work order management, job control, production logs
- 💰 **Finance Module** - Invoicing, cashier, tax management, debt tracking, accounting
- 📦 **Inventory Management** - Spare parts tracking, purchase orders, material issuance
- 📱 **Internal Communication** - Real-time internal chat system
- 📈 **Reporting** - Comprehensive reports export

**Tech Stack:**
- **Frontend:** React 19 + TypeScript + Vite
- **Backend Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Real-time:** Supabase Realtime
- **AI Integration:** Google Gemini API
- **UI:** Tailwind CSS + Lucide Icons

---

## 💻 System Requirements

- **Node.js:** 18.x atau lebih tinggi
- **npm:** 9.x atau lebih tinggi
- **Supabase Account:** https://supabase.com (free tier OK untuk development)
- **Google Gemini API Key:** https://aistudio.google.com

---

## 🚀 Installation

### Step 1: Clone Repository
```bash
git clone https://github.com/your-repo/BODY-REPAIR-2026.git
cd BODY-REPAIR-2026
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Create Environment File
```bash
cp .env.example .env
```

Edit `.env` dengan konfigurasi Supabase dan API keys Anda:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
```

---

## ⚙️ Configuration

### 1. Setup Supabase Project

1. **Create Supabase Project**
   - Buka https://supabase.com
   - Klik "New Project"
   - Pilih region terdekat (Indonesia recommended)
   - Set password untuk database
   - Tunggu project selesai created (2-5 menit)

2. **Get API Keys**
   - Pergi ke Settings → API
   - Copy `Project URL` → `VITE_SUPABASE_URL`
   - Copy `anon` public key → `VITE_SUPABASE_ANON_KEY`

3. **Setup Google Gemini API**
   - Buka https://aistudio.google.com
   - Klik "Get API Key"
   - Create atau select project
   - Copy API Key → `GEMINI_API_KEY`

---

## 🗄️ Database Setup

### Option A: Auto Setup via SQL Editor (Recommended)

1. Buka Supabase Dashboard
2. Pergi ke "SQL Editor" tab
3. Klik "New Query"
4. Copy seluruh isi dari `supabase_migrations.sql` file
5. Paste ke SQL Editor
6. Klik "Run" atau tekan `Cmd+Enter` / `Ctrl+Enter`
7. Tunggu semua queries selesai (akan ada 11+ tables created)

### Option B: Manual Setup

```bash
# Login ke Supabase CLI (optional)
npx supabase link --project-ref your-project-ref

# Run migrations
npx supabase db push
```

### Verify Database Setup

```sql
-- Check tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Expected tables:
-- - bengkel_units_master
-- - bengkel_service_jobs
-- - bengkel_spareparts_master
-- - bengkel_suppliers
-- - bengkel_purchase_orders
-- - bengkel_cashier_transactions
-- - bengkel_assets
-- - bengkel_services_master
-- - bengkel_internal_chats
-- - users
-- - bengkel_settings
```

---

## ▶️ Running the Application

### Development Mode
```bash
npm run dev
```

Server akan berjalan di `http://localhost:3000`

### Build for Production
```bash
npm run build
```

Output akan ada di folder `dist/`

### Preview Production Build
```bash
npm run preview
```

---

## ✨ Features

### 1. Authentication & Authorization
- Login dengan email/password
- Role-based access control (Manager, Admin Bengkel, Service Advisor, Mechanic, Staff)
- Super Admin UID untuk akses penuh
- Auto role sync dengan database

### 2. Dashboard Views
- **Overview Dashboard:** KPI utama, status unit, financial summary
- **Business Intelligence:** Revenue trends, job analysis, supplier performance
- **KPI Performance:** Detailed metrics tracking
- **AI Assistant:** Predictive analysis, recommendations

### 3. Vehicle & Job Management
- Master data vehicles (units)
- Service job creation dan tracking
- Work order (WO) generation
- Estimation dan costing
- Production logging per tahap pekerjaan
- Mechanic assignment tracking

### 4. Finance Module
- Invoice creation dan tracking
- Cashier transactions (incoming/outgoing)
- Tax management (PPh, PPN)
- Debt receivable tracking
- Financial accounting dashboard

### 5. Inventory Management
- Spare parts master database
- Stock level tracking (available, reserved, stock)
- Supplier management
- Purchase orders dengan status tracking
- Material issuance per job
- Price mismatch detection

### 6. Production Management
- Job control board (papan kontrol)
- SPKL (work order) management
- Production stage tracking
- Mechanic panel rate calculation

### 7. Internal Communication
- Real-time internal chat
- Global messaging
- Private messaging between users
- Chat history

### 8. Reporting & Export
- Job reports
- Financial reports
- Inventory reports
- CSV export
- PDF generation

### 9. Settings Management
- Workshop configuration
- User roles dan permissions
- Service rates dan panel pricing
- Insurance options
- Tax settings
- WhatsApp integration setup

### 10. SQL Query Editor (NEW!)
- Direct SQL access untuk advanced queries
- Save dan load saved queries
- Export results ke CSV
- Real-time query execution

---

## 📁 Project Structure

```
BODY-REPAIR-2026/
├── src/
│   ├── components/
│   │   ├── admin/              # Claims control
│   │   ├── auth/               # Login view
│   │   ├── crc/                # CRC dashboard
│   │   ├── dashboard/          # Analytics dashboards
│   │   ├── finance/            # Financial modules
│   │   ├── forms/              # Job/Vehicle forms
│   │   ├── general/            # Asset management
│   │   ├── inventory/          # Inventory modules
│   │   ├── layout/             # Sidebar, chat widget
│   │   ├── production/         # Production control
│   │   ├── reports/            # Reporting
│   │   ├── settings/           # Settings, SQL Editor
│   │   └── ui/                 # Modal, UI components
│   ├── contexts/
│   │   └── AuthContext.tsx     # Authentication state
│   ├── hooks/
│   │   └── useJobs.ts          # Custom hook untuk jobs
│   ├── services/
│   │   ├── supabase.ts         # Supabase config
│   │   ├── supabaseHelpers.ts  # Helper functions
│   │   └── firebase.ts         # DEPRECATED (untuk reference)
│   ├── utils/
│   │   ├── constants.ts        # App constants
│   │   ├── helpers.ts          # Utility functions
│   │   └── pdfGenerator.ts     # PDF generation
│   ├── App.tsx                 # Main app component
│   ├── index.tsx               # React entry point
│   ├── index.html              # HTML template
│   └── types.ts                # TypeScript types
├── .env.example                # Environment variables template
├── .env                        # IGNORED - Local environment
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript config
├── package.json                # Dependencies
├── supabase_migrations.sql     # Database migrations
├── MIGRATION_GUIDE.md          # Firebase → Supabase migration guide
├── BUG_REPORT.md               # Identified bugs & fixes
├── firestore.rules             # DEPRECATED Firebase rules
├── vercel.json                 # Vercel deployment config
└── README.md                   # This file
```

---

## 🔗 API Documentation

### Authentication
```typescript
// Login
const { error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

// Logout
await supabase.auth.signOut();

// Get current session
const session = await supabase.auth.getSession();
```

### Database Operations
```typescript
import { supabase } from './services/supabase';

// Insert
const { data, error } = await supabase
  .from('table_name')
  .insert([{ field: value }])
  .select();

// Update
const { error } = await supabase
  .from('table_name')
  .update({ field: value })
  .eq('id', id);

// Delete (soft)
const { error } = await supabase
  .from('table_name')
  .update({ is_deleted: true })
  .eq('id', id);

// Query
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(100);
```

### Real-time Subscriptions
```typescript
import { subscribeToChanges } from './services/supabaseHelpers';

const channel = subscribeToChanges(
  supabase,
  'table_name',
  () => loadData(), // on INSERT
  () => loadData(), // on UPDATE
  () => loadData()  // on DELETE
);
```

---

## 🐛 Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** 
- Verify Supabase project is running
- Check `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di `.env`
- Test connection via `curl https://your-project.supabase.co/rest/v1/`

### Authentication Error
```
Error: Invalid login credentials
```
**Solution:**
- Verify user exists in Supabase Auth
- Check email dan password are correct
- Verify user memiliki role di `users` table

### Real-time Not Working
```
Real-time listener tidak trigger on data changes
```
**Solution:**
- Check table sudah enabled untuk realtime di Supabase
- Verify channel subscription aktif
- Check browser console untuk errors

### SQL Query Error
```
Error: relation "table_name" does not exist
```
**Solution:**
- Verify table name adalah correct (check case sensitivity)
- Verify database migrations sudah run
- Run query di Supabase SQL Editor untuk verify

### Slow Performance
**Solution:**
- Add indexes untuk frequently queried fields
- Reduce query limit atau implement pagination
- Check database query plan: `EXPLAIN ANALYZE SELECT ...`

### Component Not Updating
```
UI tidak re-render setelah database update
```
**Solution:**
- Verify state setter (setState) dipanggil setelah update
- Check useEffect dependencies
- Clear browser cache dan restart dev server

---

## 🔒 Security Considerations

1. **Never commit `.env` file** - Sudah di `.gitignore`
2. **Use Row Level Security (RLS)** - Enable untuk production
3. **Validate input** - Server-side validation penting
4. **HTTPS only** - Gunakan HTTPS untuk production
5. **API key rotation** - Rotate keys regularly
6. **User permissions** - Implement proper role checks

---

## 📚 Documentation Files

- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Firebase → Supabase migration details
- **[BUG_REPORT.md](./BUG_REPORT.md)** - Identified bugs dan fixes
- **[supabase_migrations.sql](./supabase_migrations.sql)** - Database schema
- **[.env.example](./.env.example)** - Environment variables template

---

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -am 'Add your feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Submit Pull Request

---

## 📞 Support

Untuk issues atau questions:
1. Check [BUG_REPORT.md](./BUG_REPORT.md) untuk known issues
2. Check [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) untuk migration details
3. Review component documentation dalam file comments
4. Check Supabase docs: https://supabase.com/docs

---

## 📄 License

This project is proprietary software for BODY REPAIR 2026 system.

---

## 🎯 Roadmap

### Current Phase (January 2026)
- ✅ Setup Supabase infrastructure
- ✅ Migrate core services (Auth, App.tsx)
- ✅ Add SQL Editor
- 🟡 Fix identified bugs
- ⏳ Migrate remaining components

### Next Phase
- [ ] Complete all component migrations
- [ ] Implement RLS policies
- [ ] Add file storage integration
- [ ] Performance optimization
- [ ] Production deployment

---

**Status:** 🟡 **ACTIVE DEVELOPMENT**
**Last Update:** January 31, 2026
**Migration Progress:** 40% Complete

