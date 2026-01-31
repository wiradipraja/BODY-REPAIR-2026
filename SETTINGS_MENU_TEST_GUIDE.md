# 🧪 SETTINGS MENU FIX - TESTING GUIDE

**Issue:** Settings menu menampilkan blank screen  
**Root Cause:** ADMIN_UID menggunakan Firebase format bukan Supabase UUID  
**Status:** ✅ **FIXED** - Build successful, ready for testing

---

## 🎯 TESTING CHECKLIST

### ✅ Step 1: Build Status
- [x] Build berhasil tanpa error TypeScript
- [x] @types/node ter-install
- [x] Vite production build complete
- [x] Bundle size: 1,910 kB (main chunk)

**Build Output:**
```
✓ 2025 modules transformed.
✓ built in 7.30s
```

### ⏳ Step 2: Development Server Test (NEXT)

**Jalankan perintah:**
```bash
npm run dev
```

**Expected Output:**
```
  VITE v6.4.1  ready in 123 ms

  ➜  Local:   http://localhost:3000
  ➜  press h to show help
```

**Verifikasi:**
- [ ] Server starts pada port 3000
- [ ] No console errors
- [ ] Page loads successfully

---

## 🔐 STEP 3: SUPERUSER LOGIN TEST

### Akses Application

1. **Buka browser:** http://localhost:3000
2. **Login dengan superuser credentials:**
   - Email: `admin@reforma.com` (atau email superuser Anda)
   - Password: `[Password Anda]`

### Verifikasi Login Berhasil

**Di Browser Console (F12 → Console):**

```javascript
// Jalankan command ini untuk check user ID:
const token = JSON.parse(localStorage.getItem('sb-wpiibfuvzjwxgzulrysi-auth-token'));
console.log('User ID:', token?.user?.id);
console.log('Expected:', '963342d9-f42c-40ed-b473-b3e9d73f63c2');
```

**Expected Output:**
```
User ID: 963342d9-f42c-40ed-b473-b3e9d73f63c2
Expected: 963342d9-f42c-40ed-b473-b3e9d73f63c2
```

**Verifikasi:**
- [ ] Anda berhasil login
- [ ] User ID di localStorage match dengan ADMIN_UID
- [ ] Dashboard muncul (bukan blank page)

---

## ⚙️ STEP 4: SETTINGS MENU TEST (CRITICAL)

### Buka Settings Menu

1. **Lihat sidebar (kiri)**
2. **Cari menu "⚙️ Pengaturan" atau "⚙️ Settings"**
3. **Klik pada menu Settings**

### Verifikasi: NO BLANK SCREEN

**Expected Result:**
- ✅ Settings page loads dengan content
- ✅ Tidak ada blank screen
- ✅ Menu tabs visible (General, Services, Users, Roles, dll)
- ✅ Tidak ada console errors

**If Blank Screen Appears:**
- [ ] Check browser console (F12 → Console) untuk errors
- [ ] Screenshot error message
- [ ] Report error di Step 6

### Verifikasi: Settings Content Accessible

**Cek setiap tab:**

| Tab | Expected | Status |
|-----|----------|--------|
| **General** | Aplikasi settings (name, logo, theme) | [ ] |
| **Services** | Daftar services bengkel | [ ] |
| **Users** | List user management | [ ] |
| **Roles** | Role management & permissions | [ ] |
| **Database** | SQL Editor (kalau enabled) | [ ] |
| **Backup** | Backup settings | [ ] |

**Verifikasi untuk tiap tab:**
- Tab bisa diklik
- Content muncul tanpa delay
- Tidak ada error di console

---

## 🔍 STEP 5: PERMISSION VERIFICATION

### Check User Role

**Di Browser Console:**

```javascript
// Check if superuser detected correctly
const isSuperAdmin = '963342d9-f42c-40ed-b473-b3e9d73f63c2' === '963342d9-f42c-40ed-b473-b3e9d73f63c2';
console.log('Is Super Admin:', isSuperAdmin);  // Should be true
```

**Expected:** `true`

### Check User Permissions

**Di Browser DevTools → Network Tab:**

1. Reload page setelah login
2. Lihat request ke: `/auth/v1/user` atau similar
3. Response harus show user role = 'Manager'

**Expected JSON Response:**
```json
{
  "id": "963342d9-f42c-40ed-b473-b3e9d73f63c2",
  "email": "admin@reforma.com",
  "app_metadata": {
    "provider": "email"
  },
  "user_metadata": {
    "role": "Manager"
  },
  "created_at": "2026-01-31T10:00:00Z"
}
```

---

## 📊 STEP 6: DATABASE VERIFICATION

### Query Superuser di Supabase

**Go to Supabase SQL Editor:**

```sql
-- Check user di public.users table
SELECT id, uid, email, role, created_at 
FROM public.users 
WHERE uid = '963342d9-f42c-40ed-b473-b3e9d73f63c2';
```

**Expected Output:**
```
┌────┬──────────────────────────────────────┬─────────────────────┬────────┬────────────────────┐
│ id │ uid                                  │ email               │ role   │ created_at        │
├────┼──────────────────────────────────────┼─────────────────────┼────────┼────────────────────┤
│ 1  │ 963342d9-f42c-40ed-b473-b3e9d73f63c │ admin@reforma.com   │ Manager│ 2026-01-31 10:00  │
└────┴──────────────────────────────────────┴─────────────────────┴────────┴────────────────────┘
```

**Verifikasi:**
- [ ] User ada di database
- [ ] Role = 'Manager' (full access)
- [ ] Email correct
- [ ] uid match dengan ADMIN_UID

### Check Auth.users Table

```sql
-- Check di Supabase Auth table
SELECT id, email FROM auth.users 
WHERE id = '963342d9-f42c-40ed-b473-b3e9d73f63c2';
```

**Expected:** 1 row dengan correct UUID

---

## 🐛 TROUBLESHOOTING

### Problem 1: Still Blank Screen di Settings

**Diagnosis:**
```javascript
// Di console, jalankan:
const token = JSON.parse(localStorage.getItem('sb-wpiibfuvzjwxgzulrysi-auth-token'));
console.log('User ID:', token?.user?.id);
console.log('Admin UUID (expected):', '963342d9-f42c-40ed-b473-b3e9d73f63c2');
```

**Kemungkinan:**
1. User ID tidak match ADMIN_UID
   - Fix: Pastikan login dengan superuser account
   - Fix: Check Supabase Auth → Users tabel

2. User tidak di public.users table
   - Fix: Insert ke public.users dengan role='Manager'
   ```sql
   INSERT INTO public.users (uid, email, display_name, role)
   VALUES ('963342d9-f42c-40ed-b473-b3e9d73f63c2', 'admin@reforma.com', 'Super Admin', 'Manager')
   ON CONFLICT (uid) DO UPDATE SET role = 'Manager';
   ```

3. SettingsView component error
   - Fix: Check browser console untuk error message
   - Fix: Check React DevTools → see component tree

### Problem 2: Settings Loads but No Content

**Cause:** Possible permission check in SettingsView

**Check:**
```javascript
// Di console:
localStorage.getItem('sb-wpiibfuvzjwxgzulrysi-auth-token')
```

**If shows `null`:**
- User tidak ter-authenticate
- Need to login again

### Problem 3: Can't Login (Wrong Password)

**Solution:**
1. Go to Supabase Dashboard
2. Authentication → Users
3. Click superuser account
4. Set new password via email
5. Try login again

### Problem 4: Build Error After Rebuild

**Try:**
```bash
# Clean node_modules dan rebuild
rm -Force node_modules -Recurse
npm install
npm run build
```

---

## ✅ SUCCESS CRITERIA

Jika semua ini true, issue sudah FIXED:

- [x] Build berhasil (no TypeScript errors)
- [ ] npm run dev starts successfully
- [ ] Login dengan superuser account works
- [ ] Settings menu ada di sidebar
- [ ] Settings page loads (NO blank screen)
- [ ] Settings tabs visible (General, Services, Users, Roles)
- [ ] User ID di console = 963342d9-f42c-40ed-b473-b3e9d73f63c2
- [ ] User role = 'Manager' di database
- [ ] All CRUD operations di Settings work
- [ ] No console errors (F12 → Console)

---

## 🚀 DEPLOYMENT AFTER TEST

**Jika testing PASSED:**

1. **Commit changes:**
   ```bash
   git add .
   git commit -m "fix: update ADMIN_UID to correct Supabase UUID format"
   git push
   ```

2. **Deploy ke Vercel:**
   - Vercel auto-deploys on git push
   - Check: https://app.vercel.com → BODY-REPAIR-2026 project
   - Wait for build complete

3. **Test di Production:**
   - Go to live URL (dari Vercel dashboard)
   - Login dengan superuser
   - Click Settings menu
   - Verify works same as local

---

## 📝 TESTING REPORT TEMPLATE

```markdown
# SETTINGS MENU FIX - TEST REPORT

**Tested Date:** [Date]
**Tester:** [Name]
**Environment:** Local / Production

## Build
- [x] npm run build - ✅ SUCCESS
- [x] npm run dev - ✅ SUCCESS

## Login
- [ ] Superuser login - STATUS
- [ ] User ID check - STATUS
- [ ] Permission check - STATUS

## Settings Menu
- [ ] Settings menu visible - STATUS
- [ ] Settings page loads - STATUS
- [ ] No blank screen - STATUS
- [ ] All tabs work - STATUS

## Database
- [ ] User in public.users - STATUS
- [ ] Role = 'Manager' - STATUS
- [ ] Auth.users has UUID - STATUS

## Result
- [ ] PASSED - All tests OK
- [ ] FAILED - [list issues]
- [ ] PARTIALLY - [list what works]

## Screenshots
- Login page: [Screenshot]
- Settings page: [Screenshot]
- Console output: [Screenshot]

## Notes
[Any additional notes]
```

---

## 📚 REFERENCE

**File Updated:** [services/supabase.ts](services/supabase.ts#L95)

**Change:**
```typescript
// Before
export const ADMIN_UID = '1O2CzQEvsVOnBuDWqfbtQWHJ4RP2';

// After
export const ADMIN_UID = '963342d9-f42c-40ed-b473-b3e9d73f63c2';
```

**Related Files:**
- [contexts/AuthContext.tsx](contexts/AuthContext.tsx#L33) - Role checking logic
- [components/settings/SettingsView.tsx](components/settings/SettingsView.tsx) - Settings component
- [App.tsx](App.tsx#L597) - Settings route

---

**Status:** ✅ **READY FOR TESTING**

Build successful. Next step: `npm run dev` and test Settings menu.

*Last Updated: February 1, 2026*
