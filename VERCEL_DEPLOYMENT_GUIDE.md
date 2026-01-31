# 🚀 VERCEL DEPLOYMENT & ENVIRONMENT VARIABLES SETUP GUIDE

**Status:** ✅ Complete Guide  
**Last Updated:** January 31, 2026

---

## 📋 Quick Reference

| Variable Name | Purpose | Required | Sensitivity |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL | ✅ Yes | Public |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anonymous Key | ✅ Yes | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role (Backend Only) | ⏳ Optional | 🔒 Secret |
| `VITE_SUPER_ADMIN_UID` | Super Admin User UUID | ✅ Yes | Public |
| `VITE_GEMINI_API_KEY` | Google Gemini API | ✅ Yes | 🔒 Secret |
| `VITE_APP_ENV` | Environment Type | ✅ Yes | Public |
| `VITE_APP_URL` | Application Domain | ✅ Yes | Public |

---

## 🔐 Super Admin UUID - Important Information

### ❓ What is Super Admin UUID?

Super Admin UUID adalah unique identifier untuk user yang memiliki **akses penuh** ke semua fitur dan menu dalam sistem:

```
┌─────────────────────────────────────────────┐
│         SUPER ADMIN PERMISSIONS              │
├─────────────────────────────────────────────┤
│ ✅ View & Edit All Data                     │
│ ✅ Access All Menus & Features              │
│ ✅ Manage Users & Roles                     │
│ ✅ View Finance Reports                     │
│ ✅ SQL Query Editor Access                  │
│ ✅ System Settings Configuration            │
│ ✅ Delete/Archive Records                   │
│ ✅ Create & Modify All Transactions         │
└─────────────────────────────────────────────┘
```

### 🔑 How to Find/Generate Super Admin UUID

#### **Option 1: Generate UUID Online (Recommended)**
```
1. Go to: https://www.uuidgenerator.net/
2. Click "Generate" button
3. Copy the generated UUID
4. Example format: 550e8400-e29b-41d4-a716-446655440000
```

#### **Option 2: Generate via Terminal**

**Linux/Mac:**
```bash
uuidgen
# Output: 550e8400-e29b-41d4-a716-446655440000
```

**Windows PowerShell:**
```powershell
[guid]::NewGuid().ToString()
# Output: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
```

**Node.js:**
```bash
node -e "console.log(require('crypto').randomUUID())"
# Output: f47ac10b-58cc-4372-a567-0e02b2c3d479
```

#### **Option 3: Get Existing User UUID from Supabase**

1. Buka Supabase Dashboard
2. Pergi ke **Authentication → Users**
3. Cari user yang akan menjadi Super Admin
4. Klik user tersebut
5. Copy UUID dari user details panel

```
Example User Details:
┌─────────────────────────────────────────┐
│ User ID (UUID): 550e8400-e29b-41d4-a716 │
│ Email: admin@company.com                 │
│ Created: 2026-01-31                      │
└─────────────────────────────────────────┘
```

### ⚡ Setting Super Admin in Code

Super Admin UUID digunakan di dalam aplikasi untuk grant penuh akses. Di file `contexts/AuthContext.tsx`:

```typescript
// Super Admin check
const isSuperAdmin = currentUser.id === ADMIN_UID;

if (isSuperAdmin) {
    role = 'Manager';  // Highest role in system
    // Full access to all features
}
```

---

## 📝 Step-by-Step Vercel Setup

### **Step 1: Prepare Your Credentials**

Sebelum setup di Vercel, kumpulkan semua credentials:

**Dari Supabase Dashboard:**

1. Buka https://app.supabase.com
2. Select project **BODY REPAIR 2026**
3. Go to **Settings → API**
4. Copy dan catat:

```
SUPABASE_URL:          https://your-project.supabase.co
SUPABASE_ANON_KEY:     eyJhbGciOiJIUzI1NiIs...
SERVICE_ROLE_KEY:      eyJhbGciOiJIUzI1NiIs...
JWT_SECRET:            your_jwt_secret_key
```

**Dari Supabase Auth:**

1. Go to **Authentication → Users**
2. Cari/buat admin user
3. Copy UUID:

```
SUPER_ADMIN_UID:       550e8400-e29b-41d4-a716-446655440000
```

**Dari Google Gemini:**

1. Buka https://aistudio.google.com
2. Click **Get API Key**
3. Copy key:

```
GEMINI_API_KEY:        AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ
```

### **Step 2: Login to Vercel**

```bash
# Option A: Via Web Browser
# Go to https://vercel.com/login

# Option B: Via CLI
npm install -g vercel
vercel login
```

### **Step 3: Navigate to Project Settings**

```
1. Go to Vercel Dashboard: https://vercel.com/dashboard
2. Click your project: "BODY-REPAIR-2026"
3. Click "Settings" in the top menu
4. Click "Environment Variables" in left sidebar
```

### **Step 4: Add Environment Variables**

Untuk setiap variable di bawah, klik **"Add"** dan isi:

#### **4.1 Supabase URL**
```
Name:     VITE_SUPABASE_URL
Value:    https://your-project-id.supabase.co
Scope:    ✅ Production
          ✅ Preview
          ✅ Development
```

#### **4.2 Supabase Anonymous Key**
```
Name:     VITE_SUPABASE_ANON_KEY
Value:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Scope:    ✅ Production
          ✅ Preview
          ✅ Development
```

#### **4.3 Service Role Key (Server-only) ⚠️**
```
Name:     SUPABASE_SERVICE_ROLE_KEY
Value:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Scope:    ✅ Production ONLY
          ❌ Preview
          ❌ Development

IMPORTANT: Check "Exclude from Client-side"
           This keeps it secret from browser
```

#### **4.4 JWT Secret (Server-only) ⚠️**
```
Name:     SUPABASE_JWT_SECRET
Value:    your_jwt_secret_key_here
Scope:    ✅ Production ONLY
          ❌ Preview
          ❌ Development

IMPORTANT: Check "Exclude from Client-side"
```

#### **4.5 Super Admin UUID**
```
Name:     VITE_SUPER_ADMIN_UID
Value:    550e8400-e29b-41d4-a716-446655440000
Scope:    ✅ Production
          ✅ Preview
          ✅ Development
```

#### **4.6 Gemini API Key**
```
Name:     VITE_GEMINI_API_KEY
Value:    AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ
Scope:    ✅ Production
          ✅ Preview
          ✅ Development
```

#### **4.7 App Environment**
```
Name:     VITE_APP_ENV
Value:    production
Scope:    ✅ Production
          ❌ Preview
          ❌ Development
```

#### **4.8 App URL**
```
Name:     VITE_APP_URL
Value:    https://your-app-domain.vercel.app
Scope:    ✅ Production
          ✅ Preview
          ✅ Development
```

### **Step 5: Verify All Variables Added**

Di Vercel Environment Variables page, Anda should see:

```
✅ VITE_SUPABASE_URL              Production, Preview, Development
✅ VITE_SUPABASE_ANON_KEY         Production, Preview, Development
✅ SUPABASE_SERVICE_ROLE_KEY      Production (Server-only)
✅ SUPABASE_JWT_SECRET            Production (Server-only)
✅ VITE_SUPER_ADMIN_UID           Production, Preview, Development
✅ VITE_GEMINI_API_KEY            Production, Preview, Development
✅ VITE_APP_ENV                   Production
✅ VITE_APP_URL                   Production, Preview, Development
```

### **Step 6: Redeploy Application**

Setelah menambahkan semua variables:

1. Go ke **Deployments** tab
2. Click pada deployment terakhir
3. Click **Redeploy** button
4. Tunggu deployment selesai (biasanya 2-5 menit)

```
atau via CLI:

vercel --prod  # Force production deployment
```

### **Step 7: Verify Deployment**

Setelah deployment selesai:

1. Kunjungi aplikasi: `https://your-app.vercel.app`
2. Verify environment variables loaded:
   - Open browser DevTools (F12)
   - Go to Console tab
   - Test connection to Supabase

3. Login dengan super admin:
   - Email: admin@your-company.com
   - Check all menus accessible

---

## 📋 Environment Variables Checklist

### Before Deployment:

```
SUPABASE CONFIGURATION:
☐ VITE_SUPABASE_URL copied correctly
☐ VITE_SUPABASE_ANON_KEY is valid
☐ SUPABASE_SERVICE_ROLE_KEY marked as Server-only
☐ SUPABASE_JWT_SECRET marked as Server-only

SUPER ADMIN SETUP:
☐ Super admin user created in Supabase Auth
☐ VITE_SUPER_ADMIN_UID matches user UUID
☐ User role set to 'Manager' in users table
☐ UUID format is valid (550e8400-e29b-41d4-...)

API KEYS:
☐ VITE_GEMINI_API_KEY is valid
☐ Google Generative AI API is enabled
☐ API key has not been revoked

APP CONFIGURATION:
☐ VITE_APP_ENV set to 'production'
☐ VITE_APP_URL points to correct domain
☐ All variables added to Vercel dashboard

DEPLOYMENT:
☐ All variables added to Vercel
☐ Application redeployed after adding variables
☐ No errors in Vercel build logs
☐ Application loads without console errors
```

---

## 🔒 Security Best Practices

### ✅ DO:

- ✅ Use different API keys for dev, staging, and production
- ✅ Rotate API keys regularly (every 3-6 months)
- ✅ Mark sensitive keys as "Server-only" in Vercel
- ✅ Store super admin UUID safely (backup copy)
- ✅ Use strong admin passwords
- ✅ Enable 2FA for Supabase account
- ✅ Monitor API key usage in Supabase logs
- ✅ Keep backup of original credentials

### ❌ DON'T:

- ❌ Never share Service Role Key publicly
- ❌ Never commit .env file to Git
- ❌ Never log sensitive credentials
- ❌ Never expose JWT secret in browser
- ❌ Never use same UUID for multiple environments
- ❌ Never hardcode credentials in code
- ❌ Never skip adding Server-only flag
- ❌ Never reuse old/expired API keys

---

## 🆘 Common Issues & Solutions

### Issue 1: "Failed to connect to Supabase"

**Cause:** Wrong Supabase URL or API key

**Solution:**
```
1. Double-check VITE_SUPABASE_URL format
2. Verify key is copied completely (not truncated)
3. Check Supabase project is active
4. Test manually: curl https://your-project.supabase.co/rest/v1/
```

### Issue 2: "Unauthorized" or "Permission denied"

**Cause:** API key permissions or RLS policies

**Solution:**
```
1. Verify VITE_SUPABASE_ANON_KEY is 'anon' public key (not service role)
2. Check RLS policies in Supabase allow access
3. Verify user role in users table is 'Manager'
4. Check authentication is successful
```

### Issue 3: "Super admin not getting full access"

**Cause:** UUID mismatch or role not set correctly

**Solution:**
```
1. Verify VITE_SUPER_ADMIN_UID is correct
2. Check user role in database is 'Manager'
3. Verify user uid in users table matches
4. Check auth context logic in AuthContext.tsx
5. Clear browser cache and re-login
```

### Issue 4: "AI Assistant not responding"

**Cause:** Gemini API key issue

**Solution:**
```
1. Verify VITE_GEMINI_API_KEY is correct
2. Check API key is active in Google Cloud
3. Verify Generative AI API is enabled in project
4. Test API key: https://aistudio.google.com
5. Check API key has not reached quota limit
```

### Issue 5: "Variables not appearing in app"

**Cause:** Vercel cache or server not redeployed

**Solution:**
```
1. Go to Vercel Deployments
2. Click "Redeploy" on latest deployment
3. Wait for deployment to complete
4. Clear browser cache (Ctrl+Shift+Delete)
5. Hard refresh page (Ctrl+Shift+R)
6. Check browser console for errors
```

### Issue 6: "Server-only variables accessible in browser"

**Cause:** Variable not marked as Server-only

**Solution:**
```
1. Go to Vercel Environment Variables
2. Find the sensitive variable
3. Click "Edit"
4. Check ✅ "Exclude from Client-side"
5. Save and redeploy
```

---

## 🔄 Environment Variable Naming Convention

### Frontend Variables (Accessible in Browser):
Prefix with `VITE_` :
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPER_ADMIN_UID
VITE_GEMINI_API_KEY
VITE_APP_ENV
VITE_APP_URL
```

### Backend Variables (Server-only):
No prefix, mark as "Exclude from Client-side":
```
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
```

---

## 📚 Reference Links

- **Supabase Dashboard:** https://app.supabase.com
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Gemini API Studio:** https://aistudio.google.com
- **UUID Generator:** https://www.uuidgenerator.net/
- **Vercel Docs:** https://vercel.com/docs
- **Supabase Docs:** https://supabase.com/docs

---

## ✅ Post-Deployment Testing

Setelah deployment berhasil, test berikut:

### 1. Database Connection
```javascript
// Test di browser console
const response = await fetch('https://your-project.supabase.co/rest/v1/bengkel_units_master?limit=1', {
  headers: {
    'apikey': 'your-anon-key',
    'Authorization': 'Bearer your-anon-key'
  }
});
const data = await response.json();
console.log(data); // Should return data or empty array
```

### 2. Authentication
```javascript
// Test login
// - Try login dengan super admin account
// - Verify all menus accessible
// - Check role is 'Manager'
```

### 3. AI Assistant
```javascript
// Test AI feature
// - Go to Dashboard → AI Strategic Insight
// - Check if it generates insights
// - Verify no console errors
```

### 4. Real-time Features
```javascript
// Test real-time updates
// - Create new vehicle in one tab
// - Check if appears in other tab automatically
```

---

## 📞 Support

Jika ada masalah:

1. Check Vercel build logs
2. Check Supabase logs
3. Open DevTools → Console → Check errors
4. Review this guide troubleshooting section
5. Contact support dengan error message lengkap

---

**Last Updated:** January 31, 2026  
**Status:** ✅ Complete & Production Ready
