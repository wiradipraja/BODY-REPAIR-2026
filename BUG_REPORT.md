# Bug Report & Fixes - BODY REPAIR 2026 System

## Bugs Identified and Fixed

### 1. ✅ FIXED: Field Name Consistency Issue (FirebaseTimestamp vs PostgreSQL TIMESTAMPTZ)
**Severity:** High
**Location:** types.ts, utils/helpers.ts, App.tsx
**Issue:** 
- Firebase menggunakan custom Timestamp class yang tidak kompatibel dengan Supabase
- Import `Timestamp` dari firebase/firestore tidak tersedia di Supabase
- Field names menggunakan camelCase (Firebase convention) bukan snake_case (PostgreSQL convention)

**Fix Applied:**
- Removed Firebase Timestamp import
- Updated all field names to snake_case in Supabase queries
- Created `getCurrentTimestamp()` helper function untuk consistency
- Updated all database operations untuk menggunakan ISO 8601 string timestamps

---

### 2. ✅ FIXED: Auth State Management Memory Leak
**Severity:** Medium
**Location:** contexts/AuthContext.tsx
**Issue:**
- Firebase `onAuthStateChanged` subscription tidak di-cleanup properly
- Bisa menyebabkan multiple listeners dan memory leak dalam component unmount

**Fix Applied:**
```typescript
// BEFORE (Incomplete cleanup):
return () => unsubscribe();

// AFTER (Proper cleanup):
return () => {
  unsubscribe.data?.subscription?.unsubscribe();
};
```

---

### 3. ✅ FIXED: Real-time Listener Not Refreshing Data
**Severity:** High
**Location:** App.tsx
**Issue:**
- Firebase `onSnapshot` listeners tidak merefresh saat user context berubah
- `setLoadingData(false)` dipanggil sebelum semua listeners setup
- Bisa menyebabkan UI menampilkan data lama

**Fix Applied:**
- Membuat separate `loadXXX()` async functions untuk setiap data type
- Menambahkan `subscribeToChanges()` yang memanggil load functions on INSERT/UPDATE/DELETE
- Data akan selalu fresh dan konsisten

---

### 4. ✅ FIXED: Deleted Jobs Tidak Difilter
**Severity:** Medium
**Location:** App.tsx
**Issue:**
```typescript
// BEFORE - Tidak filter deleted jobs
const unsubJobs = onSnapshot(query(...), (snap) => {
    setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Job)).filter(j => !j.isDeleted));
});
```
- Filter `!j.isDeleted` dilakukan di client-side, membuang database query efisiensi

**Fix Applied:**
```typescript
// AFTER - Filter di Supabase query level
const { data, error } = await supabase
  .from(SERVICE_JOBS_COLLECTION)
  .select('*')
  .eq('is_deleted', false)
  .order('updated_at', { ascending: false })
  .limit(200);
```

---

### 5. ✅ FIXED: Missing Null Check untuk Settings
**Severity:** Low
**Location:** App.tsx
**Issue:**
```typescript
const unsubSettings = onSnapshot(collection(db, SETTINGS_COLLECTION), (snap) => {
   if (!snap.empty) {
       setAppSettings({ ...initialSettingsState, ...snap.docs[0].data() } as Settings);
   }
});
```
- Tidak ada fallback jika settings query kosong

**Fix Applied:**
```typescript
const loadSettings = async () => {
  try {
    const { data, error } = await supabase
      .from(SETTINGS_COLLECTION)
      .select('*')
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      setAppSettings({ ...initialSettingsState, ...data[0] } as Settings);
    } else {
      setAppSettings(initialSettingsState); // Fallback
    }
  } catch (err) {
    handleError('Settings')(err);
  }
};
```

---

### 6. ⚠️ NEEDS FIX: handleSaveEstimate State Reference Issue
**Severity:** High
**Location:** App.tsx - handleSaveEstimate function
**Issue:**
```typescript
const currentJob = jobs.find(j => j.id === jobId) || actualModalState.data;
```
- Reference ke `actualModalState.data` bisa out-of-sync
- Jika modal ditutup dan dibuka lagi, data bisa stale

**Recommended Fix:**
```typescript
// Lebih aman:
const currentJob = jobs.find(j => j.id === jobId);
if (!currentJob && !actualModalState.data) {
  throw new Error("Job not found");
}
// Use currentJob with fallback
const jobData = currentJob || actualModalState.data;
```

---

### 7. ⚠️ NEEDS FIX: generateDocumentNumber Function Not Optimal
**Severity:** Low
**Location:** App.tsx - generateDocumentNumber function
**Issue:**
```typescript
const maxSeq = existingSequences.length > 0 ? Math.max(...existingSequences) : 0;
```
- Mengandalkan client-side numbering bisa cause race condition
- Jika dua user submit secara bersamaan, bisa duplicate number

**Recommended Fix:**
- Gunakan Supabase function / trigger untuk generate sequential number
- Database-level constraint untuk uniqueness

```sql
-- Contoh trigger di Supabase:
CREATE OR REPLACE FUNCTION generate_wo_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wo_number IS NULL THEN
    NEW.wo_number := 'WO' || to_char(CURRENT_DATE, 'YYMM') || 
                     LPAD(NEXTVAL('wo_sequence')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_wo_number
BEFORE INSERT ON bengkel_service_jobs
FOR EACH ROW
EXECUTE FUNCTION generate_wo_number();
```

---

### 8. ⚠️ POTENTIAL BUG: Missing Error Handling dalam Modal Operations
**Severity:** Medium
**Location:** App.tsx - Modal delete/reopen operations
**Issue:**
```typescript
onDelete={async (j) => { 
    const { error } = await supabase.from(SERVICE_JOBS_COLLECTION).update({ is_deleted: true }).eq('id', j.id);
    if (!error) {
        showNotification("Dihapus.");
        await loadJobs();
    }
    // Missing: else branch untuk error handling
}}
```

**Fix Applied:**
```typescript
onDelete={async (j) => { 
    const { error } = await supabase
        .from(SERVICE_JOBS_COLLECTION)
        .update({ is_deleted: true })
        .eq('id', j.id);
    
    if (error) {
        showNotification(`Error: ${error.message}`, "error");
    } else {
        showNotification("Dihapus.", "success");
        await loadJobs();
    }
}}
```

---

### 9. ⚠️ NEEDS ATTENTION: Component Props Type Mismatch
**Severity:** Medium
**Location:** Multiple components (Dashboard, Finance, etc.)
**Issue:**
- Props yang diterima komponen mungkin tidak sesuai dengan renamed field names
- Contoh: Component expect `estimateData` tapi Supabase return `estimate_data`

**Status:** ⏳ NEEDS MANUAL VERIFICATION
- Setiap komponen yang dipassing `jobs` data perlu di-check
- Bisa perlu adapter function untuk mapping field names

---

### 10. ⚠️ POTENTIAL ISSUE: Inventory Stock Calculation
**Severity:** High
**Location:** components/inventory/* dan components/production/*
**Issue:**
```typescript
// Firebase version:
qty_available = qty_stock - qty_reserved

// Supabase should have:
- qty_stock (total quantity)
- qty_reserved (reserved amount)
- qty_available (calculated or stored)
```
- Perlu memastikan consistency antara qty_available dan perhitungan

**Recommended Fix:**
- Buat PostgreSQL function untuk auto-calculate qty_available:
```sql
CREATE OR REPLACE FUNCTION update_qty_available()
RETURNS TRIGGER AS $$
BEGIN
  NEW.qty_available := NEW.qty_stock - NEW.qty_reserved;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintain_qty_available
BEFORE INSERT OR UPDATE ON bengkel_spareparts_master
FOR EACH ROW
EXECUTE FUNCTION update_qty_available();
```

---

## Summary of Fixes Applied

| Bug ID | Title | Status | Severity |
|--------|-------|--------|----------|
| 1 | Field Name Consistency | ✅ FIXED | High |
| 2 | Auth Memory Leak | ✅ FIXED | Medium |
| 3 | Real-time Data Refresh | ✅ FIXED | High |
| 4 | Deleted Jobs Filter | ✅ FIXED | Medium |
| 5 | Missing Settings Fallback | ✅ FIXED | Low |
| 6 | State Reference Issue | ⚠️ NEEDS FIX | High |
| 7 | Duplicate Document Numbers | ⚠️ NEEDS FIX | Low |
| 8 | Missing Error Handling | ✅ FIXED | Medium |
| 9 | Component Props Mismatch | ⏳ PENDING REVIEW | Medium |
| 10 | Inventory Calculations | ⚠️ NEEDS FIX | High |

---

## Testing Recommendations

1. **Test Data Consistency:**
   - Create vehicle → Check if it appears in lists
   - Update vehicle → Verify real-time update
   - Delete vehicle → Confirm soft delete works
   - Force refresh → Data should still be consistent

2. **Test Authentication:**
   - Login with admin account
   - Verify role-based access
   - Check permissions for finance module
   - Test logout and re-login

3. **Test Real-time Subscriptions:**
   - Open app in two browser tabs
   - Modify data in one tab
   - Check if other tab updates automatically

4. **Test Error Scenarios:**
   - Network disconnect
   - Invalid data submission
   - Concurrent operations
   - Long-running queries

5. **Performance Testing:**
   - Load 1000+ jobs
   - Filter and search performance
   - Real-time update latency
   - Memory usage

---

## Known Limitations (Post-Migration)

1. **Auto-increment Numbers:**
   - Saat ini menggunakan client-side generation
   - Perlu database trigger untuk production (see Bug #7)

2. **File Storage:**
   - Firebase Storage → Supabase Storage API belum diintegrasikan
   - Perlu migration jika aplikasi menggunakan file uploads

3. **Full-text Search:**
   - Firebase search adalah client-side
   - Supabase bisa menggunakan PostgreSQL full-text search untuk better performance

4. **Batch Operations:**
   - Firebase batch writes vs Supabase transactions
   - Perlu optimization untuk large batch operations

---

**Status:** 🟡 Partial Migration Complete
**Last Updated:** January 31, 2026
**Next:** Complete remaining component migrations and full system testing
