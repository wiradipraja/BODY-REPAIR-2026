# ⚡ QUICK COMMAND REFERENCE

## 🚀 START HERE

Copy & paste commands di PowerShell/Terminal untuk testing:

---

## 1️⃣ START DEV SERVER (IMMEDIATE)

```powershell
cd "c:\Users\Bangki\Documents\GitHub\BODY-REPAIR-2026"
npm run dev
```

**Expected Output:**
```
VITE v6.4.1  ready in 123 ms
➜  Local:   http://localhost:3000
➜  press h to show help
```

**Then open browser:** http://localhost:3000

---

## 2️⃣ LOGIN CREDENTIALS

```
Email:    admin@reforma.com
Password: [Your Password]
```

**After login, click "⚙️ Settings" in sidebar**

---

## 3️⃣ VERIFY IN BROWSER CONSOLE

After login, open DevTools (F12 → Console) and paste:

```javascript
// Check User ID
const token = JSON.parse(localStorage.getItem('sb-wpiibfuvzjwxgzulrysi-auth-token'));
console.log('✅ User ID:', token?.user?.id);
console.log('✅ Should be: 963342d9-f42c-40ed-b473-b3e9d73f63c2');
```

---

## 4️⃣ CHECK ADMIN UUID IN CODE

```powershell
# View the ADMIN_UID that was fixed:
Get-Content "c:\Users\Bangki\Documents\GitHub\BODY-REPAIR-2026\services\supabase.ts" -TotalCount 100 | Select-Object -Last 10
```

---

## 5️⃣ IF SETTINGS STILL BLANK

### Check Console Error
Press F12 → Console tab → look for red error messages

### Verify in Database
Paste in Supabase SQL Editor:
```sql
SELECT id, email, role FROM public.users 
WHERE uid = '963342d9-f42c-40ed-b473-b3e9d73f63c2';
```

**Should return:** 1 row with role = 'Manager'

### If User Not Found - Add User
```sql
INSERT INTO public.users (uid, email, display_name, role)
VALUES (
  '963342d9-f42c-40ed-b473-b3e9d73f63c2',
  'admin@reforma.com',
  'Super Admin',
  'Manager'
)
ON CONFLICT (uid) DO UPDATE SET role = 'Manager';
```

---

## 6️⃣ DEPLOY TO PRODUCTION

```powershell
# Commit the fix
git add .
git commit -m "fix: update ADMIN_UID to correct Supabase UUID format"
git push

# Vercel auto-deploys!
# Check at: https://app.vercel.com/projects/BODY-REPAIR-2026
```

---

## 📊 TESTING CHECKLIST

- [ ] Build successful: `npm run build` ✅ DONE
- [ ] Dev server starts: `npm run dev` ⏳ RUN THIS NEXT
- [ ] Login works ⏳
- [ ] Settings menu visible ⏳  
- [ ] Settings page loads (NO blank) ⏳
- [ ] All tabs accessible ⏳
- [ ] No console errors ⏳

---

## 🔗 IMPORTANT FILES

| File | Purpose |
|------|---------|
| [services/supabase.ts](services/supabase.ts#L95) | ✅ ADMIN_UID FIX |
| [contexts/AuthContext.tsx](contexts/AuthContext.tsx#L33) | Super admin detection |
| [components/settings/SettingsView.tsx](components/settings/SettingsView.tsx) | Settings component |
| [SUPERUSER_UUID_FIX_SUMMARY.md](SUPERUSER_UUID_FIX_SUMMARY.md) | Full documentation |
| [SETTINGS_MENU_TEST_GUIDE.md](SETTINGS_MENU_TEST_GUIDE.md) | Test procedures |

---

## 🎯 WHAT WAS FIXED

**Before:** 
```typescript
export const ADMIN_UID = '1O2CzQEvsVOnBuDWqfbtQWHJ4RP2';  // ❌ Firebase format
```

**After:**
```typescript
export const ADMIN_UID = '963342d9-f42c-40ed-b473-b3e9d73f63c2';  // ✅ Supabase UUID
```

---

## ⚠️ TROUBLESHOOTING

**Problem:** Build fails
```powershell
npm install --save-dev @types/node
npm run build
```

**Problem:** Settings still blank
```javascript
// In browser console:
const token = JSON.parse(localStorage.getItem('sb-wpiibfuvzjwxgzulrysi-auth-token'));
console.error(token?.user?.id);  // What's the actual UUID?
```

**Problem:** Can't login
- Go to Supabase → Authentication → Users
- Check if superuser exists
- Reset password if needed

---

## 📞 SUPPORT

All documentation files:
1. **SUPERUSER_UUID_FIX_SUMMARY.md** - Overview & verification
2. **SETTINGS_MENU_TEST_GUIDE.md** - Detailed test steps
3. **SUPERUSER_UUID_VERIFICATION.md** - UUID configuration guide
4. **QUICK_COMMAND_REFERENCE.md** - This file

---

**Status:** ✅ Ready to test  
**Next Action:** Run `npm run dev` and login
