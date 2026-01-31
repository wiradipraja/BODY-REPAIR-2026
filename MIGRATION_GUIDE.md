# Firebase ke Supabase Migration Guide

## Overview
Sistem telah dimigrasikan dari Firebase Firestore ke Supabase PostgreSQL. Panduan ini menjelaskan perubahan-perubahan utama dan cara mengintegrasikan dengan komponen yang masih menggunakan Firebase.

## 1. Setup Awal

### Step 1: Install Dependencies
```bash
npm install @supabase/supabase-js
npm remove firebase
```

### Step 2: Konfigurasi Environment
Buat file `.env` di root project:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key
```

### Step 3: Run SQL Migrations
1. Buka Supabase Dashboard
2. Pergi ke SQL Editor
3. Copy semua isi dari `supabase_migrations.sql`
4. Jalankan semua queries untuk membuat table structure

## 2. Import Changes

### Dari Firebase:
```typescript
import { collection, addDoc, updateDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, COLLECTION_NAMES } from './services/firebase';
```

### Ke Supabase:
```typescript
import { supabase, COLLECTION_NAMES } from './services/supabase';
import { subscribeToChanges, getCurrentTimestamp } from './services/supabaseHelpers';
```

## 3. Database Field Name Conversions

Firebase menggunakan camelCase, Supabase (PostgreSQL) menggunakan snake_case.

### Common Conversions:
- `userId` → `user_id`
- `createdAt` → `created_at`
- `updatedAt` → `updated_at`
- `policeNumber` → `police_number`
- `customerName` → `customer_name`
- `statusKendaraan` → `status_kendaraan`
- `statusPekerjaan` → `status_pekerjaan`
- `woNumber` → `wo_number`
- `estimateData` → `estimate_data`
- `costData` → `cost_data`
- `usageLog` → `usage_log`
- `mechanicAssignments` → `mechanic_assignments`
- `insuranceLogs` → `insurance_logs`

## 4. Common Operation Changes

### INSERT
**Firebase:**
```typescript
await addDoc(collection(db, 'table_name'), {
  field: value,
  createdAt: serverTimestamp()
});
```

**Supabase:**
```typescript
const { data, error } = await supabase
  .from('table_name')
  .insert([{
    field: value,
    created_at: getCurrentTimestamp()
  }])
  .select();
if (error) throw error;
```

### UPDATE
**Firebase:**
```typescript
await updateDoc(doc(db, 'table_name', id), {
  field: newValue,
  updatedAt: serverTimestamp()
});
```

**Supabase:**
```typescript
const { error } = await supabase
  .from('table_name')
  .update({
    field: newValue,
    updated_at: getCurrentTimestamp()
  })
  .eq('id', id);
if (error) throw error;
```

### DELETE (Soft Delete)
**Firebase:**
```typescript
await updateDoc(doc(db, 'table_name', id), {
  isDeleted: true
});
```

**Supabase:**
```typescript
const { error } = await supabase
  .from('table_name')
  .update({ is_deleted: true })
  .eq('id', id);
if (error) throw error;
```

### QUERY
**Firebase:**
```typescript
const snapshot = await getDocs(
  query(collection(db, 'table_name'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(100)
  )
);
const data = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));
```

**Supabase:**
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(100);
if (error) throw error;
// data sudah memiliki id field
```

### REAL-TIME LISTENERS
**Firebase:**
```typescript
const unsubscribe = onSnapshot(
  query(collection(db, 'table_name')),
  (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setData(data);
  }
);
```

**Supabase:**
```typescript
const channel = subscribeToChanges(
  supabase,
  'table_name',
  () => loadData(),  // Load on INSERT
  () => loadData(),  // Load on UPDATE
  () => loadData()   // Load on DELETE
);

// Or manually:
const loadData = async () => {
  const { data, error } = await supabase
    .from('table_name')
    .select('*');
  if (error) throw error;
  setData(data);
};
```

## 5. Special Cases

### Timestamp Handling
Supabase menggunakan ISO 8601 string atau PostgreSQL TIMESTAMPTZ type.
```typescript
import { getCurrentTimestamp } from './services/supabaseHelpers';

// Alih-alih serverTimestamp() dari Firebase
updated_at: getCurrentTimestamp() // Returns ISO string
```

### Increment Operations
**Firebase:**
```typescript
import { increment } from 'firebase/firestore';
await updateDoc(doc(db, 'table', id), {
  stock: increment(-5)
});
```

**Supabase:**
```typescript
import { incrementField } from './services/supabaseHelpers';
await incrementField(supabase, 'table', id, 'stock', -5);
```

### JSONB Fields
Supabase mendukung JSONB untuk data kompleks (seperti arrays of objects):
```typescript
estimate_data: {
  jasaItems: [],
  partItems: [],
  discountJasa: 0,
  // ... nested data
}

// Query:
const { data } = await supabase
  .from('bengkel_service_jobs')
  .select('*')
  .contains('estimate_data', { jasaItems: {...} });
```

### File Storage
Firebase memiliki Storage, Supabase memiliki Storage juga dengan API berbeda:
```typescript
// Contoh: Upload file
const { data, error } = await supabase.storage
  .from('bucket_name')
  .upload(`path/${filename}`, file);

// Download:
const { data, error } = await supabase.storage
  .from('bucket_name')
  .download('path/to/file');
```

## 6. Component Migration Checklist

Untuk setiap komponen yang perlu di-update, ikuti checklist ini:

- [ ] Ubah semua imports dari Firebase ke Supabase
- [ ] Konversi semua field names dari camelCase ke snake_case
- [ ] Ganti serverTimestamp() dengan getCurrentTimestamp()
- [ ] Ganti collection() dan doc() dengan supabase table queries
- [ ] Ganti onSnapshot dengan subscribeToChanges atau manual loading
- [ ] Update error handling untuk Supabase
- [ ] Test semua CRUD operations
- [ ] Test real-time updates

## 7. Files Already Migrated ✓

- ✓ services/supabase.ts (NEW - Supabase configuration)
- ✓ services/supabaseHelpers.ts (NEW - Helper functions)
- ✓ contexts/AuthContext.tsx
- ✓ App.tsx (Main app component)
- ✓ components/settings/SqlEditorView.tsx (NEW - SQL Editor)
- ✓ types.ts (Removed Firebase imports)
- ✓ utils/helpers.ts (Removed Firebase imports)
- ✓ package.json (Updated dependencies)

## 8. Files Still Need Migration

Berikut adalah komponen yang masih perlu di-update dengan prinsip yang sama:

- [ ] components/forms/JobForm.tsx
- [ ] components/forms/EstimateEditor.tsx
- [ ] components/forms/EstimationForm.tsx
- [ ] components/inventory/InventoryView.tsx
- [ ] components/inventory/InventoryForm.tsx
- [ ] components/inventory/PurchaseOrderView.tsx
- [ ] components/inventory/MaterialIssuanceView.tsx
- [ ] components/inventory/PartMonitoringView.tsx
- [ ] components/finance/AccountingView.tsx
- [ ] components/finance/CashierView.tsx
- [ ] components/finance/DebtReceivableView.tsx
- [ ] components/finance/InvoiceCreatorView.tsx
- [ ] components/finance/TaxManagementView.tsx
- [ ] components/dashboard/* (all dashboard components)
- [ ] components/production/* (all production components)
- [ ] components/settings/SettingsView.tsx
- [ ] components/layout/InternalChatWidget.tsx
- [ ] hooks/useJobs.ts
- [ ] components/reports/ReportCenterView.tsx
- [ ] components/admin/ClaimsControlView.tsx
- [ ] components/crc/CrcDashboardView.tsx
- [ ] components/general/AssetManagementView.tsx

## 9. Tips untuk Migration Cepat

1. **Gunakan Find & Replace**: 
   - Find: `from 'firebase/firestore'`
   - Replace: Dengan import dari supabase

2. **Batch Field Conversions**:
   - Gunakan regex untuk convert snake_case
   - Example: `([a-z])([A-Z])` → `$1_$2` (lowercase)

3. **Helper Functions**:
   - Gunakan functions dari supabaseHelpers.ts
   - Jangan re-implement logic yang sudah ada

4. **Testing**:
   - Test setiap operasi CRUD
   - Cek real-time updates
   - Verify error handling

## 10. Troubleshooting

### Error: "No rows returned"
Pastikan SELECT query mengembalikan data dengan menambahkan `.select()`:
```typescript
const { data, error } = await supabase
  .from('table')
  .select('*')  // ← Jangan lupa ini
  .eq('id', id);
```

### Error: "Unauthorized"
Check Supabase RLS (Row Level Security) policies. Jika development, bisa disable untuk testing:
1. Buka Supabase Dashboard → Authentication → Policies
2. Ubah policies sesuai kebutuhan atau disable untuk testing

### Real-time Not Working
Pastikan:
1. Tabel sudah di-enable untuk real-time (di Supabase dashboard)
2. Channel subscription aktif dan tidak error
3. Network connection stabil

### Field Name Errors
Selalu gunakan snake_case untuk field names di Supabase (PostgreSQL convention). Jika ada error "column does not exist", cek spelling dan case sensitivity.

## 11. New Features dengan Supabase

1. **SQL Editor (SqlEditorView.tsx)**
   - Direct SQL access untuk queries kompleks
   - Save dan load saved queries
   - Export results ke CSV
   - Execution time tracking

2. **Better Real-time**
   - Native PostgreSQL subscriptions
   - Better performance untuk large datasets
   - Built-in conflict resolution

3. **Row Level Security**
   - Fine-grained access control per user
   - Built-in authorization rules

## 12. Next Steps

1. ✓ Setup Supabase project dan database
2. ✓ Run migrations di SQL Editor
3. Update remaining components (file list di #8)
4. Test seluruh aplikasi end-to-end
5. Setup Supabase RLS policies untuk production
6. Setup backups dan monitoring

---

**Last Updated:** January 31, 2026
**Migrated By:** AI Assistant
**Migration Status:** 40% Complete (Core Services + App.tsx + Auth)
