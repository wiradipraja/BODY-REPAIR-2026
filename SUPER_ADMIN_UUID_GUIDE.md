# 🔑 SUPER ADMIN UUID - TEMPLATE & EXAMPLES

**Last Updated:** January 31, 2026

---

## 📌 Super Admin UUID Template

```
VITE_SUPER_ADMIN_UID=550e8400-e29b-41d4-a716-446655440000
```

### Format Specification:
```
UUID v4 Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
               8 chars - 4 chars - 4 chars - 4 chars - 12 chars
                |
                └─ Total: 36 characters (including hyphens)
                └─ Alphanumeric: 0-9, a-f only
```

---

## 🔒 Example Super Admin UUIDs

### Example 1: Production Super Admin
```
VITE_SUPER_ADMIN_UID=550e8400-e29b-41d4-a716-446655440000

Assigned to: Hendrik Masdatransyogi (Owner/Manager)
Email: hendrik.masdatransyogi@gmail.com
Role: Manager
Created: 2026-01-31
Permissions: FULL ACCESS
```

### Example 2: Backup Super Admin
```
VITE_BACKUP_ADMIN_UID=6ba7b810-9dad-11d1-80b4-00c04fd430c8

Assigned to: Backup Admin Account
Email: backup.admin@company.com
Role: Manager
Created: 2026-01-31
Purpose: Emergency access if primary admin unavailable
```

### Example 3: Development Super Admin
```
VITE_DEV_SUPER_ADMIN_UID=f47ac10b-58cc-4372-a567-0e02b2c3d479

Assigned to: Development Admin
Email: dev.admin@localhost
Role: Manager
Environment: Development only
```

---

## 🛠️ How to Identify Your Super Admin UUID

### Method 1: Check in Supabase Dashboard

**Step-by-step:**
```
1. Open Supabase Dashboard
   URL: https://app.supabase.com

2. Select Your Project
   Click: BODY REPAIR 2026

3. Go to Authentication
   Sidebar → Authentication → Users

4. Find Admin User
   Look for user like: admin@company.com

5. Click on the user name

6. View User Details
   In the details panel, you'll see:
   
   ┌─────────────────────────────────────┐
   │ User ID: 550e8400-e29b-41d4-a716    │  <- This is the UUID!
   │ Email: admin@company.com             │
   │ Created: 2026-01-31                  │
   │ Last Sign In: 2026-01-31 10:30:00   │
   └─────────────────────────────────────┘

7. Copy the User ID
   Select and copy: 550e8400-e29b-41d4-a716-446655440000
```

### Method 2: Query via SQL Editor

**In Supabase SQL Editor:**
```sql
-- Get all users with their UUIDs
SELECT 
  id as user_uuid,
  email,
  created_at
FROM auth.users
WHERE email LIKE '%admin%'
ORDER BY created_at DESC;

-- Result example:
-- user_uuid                          | email                    | created_at
-- ────────────────────────────────────────────────────────────────────────────
-- 550e8400-e29b-41d4-a716-446655440000 | admin@company.com      | 2026-01-31
```

### Method 3: From Your Users Table

**In Supabase SQL Editor:**
```sql
-- Get super admin from users table
SELECT 
  uid as super_admin_uuid,
  email,
  display_name,
  role
FROM public.users
WHERE role = 'Manager'
LIMIT 5;

-- Result example:
-- super_admin_uuid                  | email              | display_name      | role
-- ──────────────────────────────────────────────────────────────────────────────────
-- 550e8400-e29b-41d4-a716-446655440000 | admin@company.com | Hendrik Masdata   | Manager
```

---

## ✨ Complete Environment Variables Example

### For Development (.env):
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdC1pZCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjc4MDAwMDAwLCJleHAiOjE5OTk5OTk5OTl9.your_anon_key_here

# Super Admin Configuration
VITE_SUPER_ADMIN_UID=550e8400-e29b-41d4-a716-446655440000
VITE_BACKUP_ADMIN_UID=6ba7b810-9dad-11d1-80b4-00c04fd430c8

# API Keys
VITE_GEMINI_API_KEY=AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ

# Application Settings
VITE_APP_ENV=development
VITE_APP_URL=http://localhost:3000
VITE_DEBUG_MODE=true
```

### For Vercel Production:
```
1. VITE_SUPABASE_URL:      https://your-project.supabase.co
2. VITE_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
3. VITE_SUPER_ADMIN_UID:   550e8400-e29b-41d4-a716-446655440000
4. VITE_GEMINI_API_KEY:    AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ
5. VITE_APP_ENV:           production
6. VITE_APP_URL:           https://your-app.vercel.app
```

---

## 🔐 Super Admin Permissions Matrix

```
┌────────────────────────────────────────────────────────────────┐
│                    SUPER ADMIN ROLE (Manager)                   │
├────────────────────────────────────────────────────────────────┤
│ Module                          │ View │ Create │ Edit │ Delete │
├────────────────────────────────────────────────────────────────┤
│ Dashboard & Overview            │  ✅  │   ✅   │  ✅  │   ✅   │
│ Vehicle Management              │  ✅  │   ✅   │  ✅  │   ✅   │
│ Service Jobs & WO               │  ✅  │   ✅   │  ✅  │   ✅   │
│ Production Control              │  ✅  │   ✅   │  ✅  │   ✅   │
│ Inventory Management            │  ✅  │   ✅   │  ✅  │   ✅   │
│ Purchase Orders                 │  ✅  │   ✅   │  ✅  │   ✅   │
│ Finance & Invoicing             │  ✅  │   ✅   │  ✅  │   ✅   │
│ Tax Management                  │  ✅  │   ✅   │  ✅  │   ✅   │
│ Asset Management                │  ✅  │   ✅   │  ✅  │   ✅   │
│ User Management                 │  ✅  │   ✅   │  ✅  │   ✅   │
│ System Settings                 │  ✅  │   ✅   │  ✅  │   ✅   │
│ SQL Query Editor                │  ✅  │   ✅   │  ✅  │   ✅   │
│ Reports & Analytics             │  ✅  │   ✅   │  ✅  │   ✅   │
│ Internal Chat                   │  ✅  │   ✅   │  ✅  │   ✅   │
└────────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing Super Admin Access

### Test Checklist:
```
After setting VITE_SUPER_ADMIN_UID and deploying:

LOGIN TEST:
□ Can login with super admin email
□ Role shows as "Manager"
□ UUID matches in user profile

MENU ACCESS TEST:
□ All menu items visible in sidebar
□ No "Access Denied" messages
□ Can navigate to all views

FEATURE TEST:
□ Can create vehicles
□ Can create service jobs
□ Can manage inventory
□ Can create finance transactions
□ Can access settings
□ Can access SQL editor
□ Can view all reports

PERMISSION TEST:
□ Can edit other users' data
□ Can delete records
□ Can modify system settings
□ Can access admin features

DATABASE TEST:
□ Can read from all tables
□ Can insert new records
□ Can update existing records
□ Can delete/soft-delete records

REAL-TIME TEST:
□ Changes visible immediately
□ Other users see updates in real-time
□ No sync delays
```

### Manual Test Script:
```javascript
// Open browser console and run:

// 1. Check super admin UUID is loaded
console.log('Super Admin UUID:', import.meta.env.VITE_SUPER_ADMIN_UID);
// Expected: 550e8400-e29b-41d4-a716-446655440000

// 2. Check user role
const user = JSON.parse(localStorage.getItem('user'));
console.log('Current user role:', user?.role);
// Expected: Manager

// 3. Check Supabase connection
const { data, error } = await supabase
  .from('users')
  .select('*')
  .limit(1);
console.log('Database connection:', error ? 'FAILED' : 'OK');

// 4. Test update permission
const { error: updateError } = await supabase
  .from('bengkel_units_master')
  .update({ is_deleted: false })
  .eq('id', 'some-id');
console.log('Update permission:', updateError ? 'DENIED' : 'ALLOWED');
```

---

## 📋 Required Fields in Users Table

When creating super admin in Supabase, ensure these fields are filled:

```sql
INSERT INTO public.users (
  uid,                    -- Must match VITE_SUPER_ADMIN_UID
  email,                  -- Admin email
  display_name,           -- Display name
  role,                   -- Must be 'Manager'
  is_active              -- Should be true
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'admin@company.com',
  'Administrator Name',
  'Manager',
  true
);
```

---

## 🚀 Setting Up Multiple Admin Accounts

### Scenario: You want multiple super admins

```sql
-- Add second super admin with same UUID (not recommended)
-- OR Create role-based access

-- Better approach: Use same Manager role with different permissions

-- Primary Admin
INSERT INTO public.users (uid, email, display_name, role, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'primary.admin@company.com',
  'Primary Admin',
  'Manager',
  true
);

-- Backup Admin (same Manager role)
INSERT INTO public.users (uid, email, display_name, role, is_active)
VALUES (
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  'backup.admin@company.com',
  'Backup Admin',
  'Manager',
  true
);

-- Finance Manager (restricted to finance)
INSERT INTO public.users (uid, email, display_name, role, is_active)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'finance.manager@company.com',
  'Finance Manager',
  'Manager',  -- Still Manager role but can restrict via RLS
  true
);
```

---

## ⚠️ UUID Validation

### Valid UUID Format:
```
✅ 550e8400-e29b-41d4-a716-446655440000    (Valid)
✅ 6ba7b810-9dad-11d1-80b4-00c04fd430c8    (Valid)
✅ f47ac10b-58cc-4372-a567-0e02b2c3d479    (Valid)
```

### Invalid UUID Format:
```
❌ 550e8400e29b41d4a716446655440000         (Missing hyphens)
❌ 550e8400-e29b-41d4-a716-44665544000      (Too short)
❌ 550e8400-e29b-41d4-a716-4466554400000000 (Too long)
❌ 550e8400-e29b-41d4-a716-44665544000G     (Invalid character G)
❌ 550E8400-E29B-41D4-A716-446655440000     (Uppercase - some systems)
```

---

## 🔄 Rotating Super Admin UUID

Jika perlu ganti super admin:

```
1. Create new user in Supabase Auth
   - Email: new.admin@company.com
   - Copy UUID

2. Create entry in users table
   - uid: new-uuid
   - role: 'Manager'

3. Update VITE_SUPER_ADMIN_UID
   - In .env.local
   - In Vercel Environment Variables

4. Redeploy application

5. Test with new super admin account

6. (Optional) Deactivate old admin
   UPDATE public.users 
   SET is_active = false 
   WHERE uid = 'old-uuid';
```

---

## 📞 Quick Reference Card

Print or bookmark this:

```
┌─────────────────────────────────────────────────┐
│   SUPER ADMIN UUID - QUICK REFERENCE             │
├─────────────────────────────────────────────────┤
│                                                   │
│ UUID Format:                                     │
│ 550e8400-e29b-41d4-a716-446655440000           │
│                                                   │
│ Environment Variable:                           │
│ VITE_SUPER_ADMIN_UID=550e8400-e29b-41d4-...   │
│                                                   │
│ Find UUID:                                       │
│ 1. Supabase Dashboard → Authentication → Users  │
│ 2. Click admin user → Copy User ID               │
│                                                   │
│ Set in Vercel:                                   │
│ 1. Project Settings → Environment Variables     │
│ 2. Add VITE_SUPER_ADMIN_UID                     │
│ 3. Redeploy application                        │
│                                                   │
│ Test Login:                                     │
│ Email: admin@company.com                       │
│ Password: [set in Supabase]                    │
│                                                   │
│ Full Access:                                    │
│ All menus and features available               │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

**Last Updated:** January 31, 2026  
**Status:** ✅ Complete Reference Guide
