# Schools Not Loading on Mobile - Fix Guide

## Problem
Schools filter not showing on mobile (Median app) even though it works on web. This prevents students/workers from loading.

## Root Cause
Mobile apps may have issues with:
1. API connectivity to Supabase
2. IndexedDB not being seeded initially
3. Environment variables not injected properly
4. CORS/network restrictions

## Solution Implemented

### 1. Cache-First Loading
`SchoolsContext` now **always** loads from IndexedDB cache first, then attempts API refresh in background.

**Key Changes:**
- Cache is loaded immediately on mount
- Schools are set to state even if API fails
- API errors no longer block the UI
- Removed filter-triggered refresh (filters consume schools, don't trigger fetch)

### 2. Fallback "All Schools" Filter
If schools list is empty, `SchoolFilter` shows an "All Schools" checkbox with sentinel value `-1`.

**How it works:**
- Multi-school roles: auto-select `[-1]` if `schools.length === 0`
- DataContext interprets `-1` as "fetch all data without filtering"
- Lists and dashboard skip client-side filtering when `-1` is present

### 3. Enhanced Error Handling
- DataContext catches API errors and falls back to cache
- All cache operations wrapped in try/catch
- Detailed console logging for mobile debugging

---

## Pre-Deployment Steps

### Option A: Seed Cache via Web App (Recommended)

1. Open your web app in a browser
2. Log in as admin/superuser
3. Open browser console (F12)
4. Run:
   ```javascript
   localStorage.setItem('showSchoolsDebug', 'true');
   ```
5. Refresh the page - you'll see a "🔍 Schools Debug" button
6. Click it to verify schools are cached
7. If cache is empty, the debug panel will show it

### Option B: Seed Cache Programmatically

1. In browser console after login, run:
   ```javascript
   import('./utils/seedSchoolsCache').then(m => m.seedSchoolsCache());
   ```

2. Or add this to your app temporarily:
   ```javascript
   // In src/index.js or app.js
   import { seedSchoolsCache } from './utils/seedSchoolsCache';
   
   // After user logs in
   seedSchoolsCache().then(result => {
     console.log('Schools seeded:', result);
   });
   ```

### Option C: Export/Import Schools Data

**Export (from web):**
```javascript
// In browser console
const db = await indexedDB.open('GCU_Schools_offline', 2);
const tx = db.transaction('schools', 'readonly');
const schools = await tx.objectStore('schools').getAll();
console.log(JSON.stringify(schools));
// Copy the output
```

**Import (in mobile app):**
```javascript
const schools = [/* paste exported data */];
const db = await indexedDB.open('GCU_Schools_offline', 2);
const tx = db.transaction('schools', 'readwrite');
for (const school of schools) {
  await tx.objectStore('schools').put(school);
}
```

---

## Mobile Debugging Steps

### 1. Enable Debug Panel on Mobile

In mobile app console or via remote debugging:
```javascript
localStorage.setItem('showSchoolsDebug', 'true');
```

Then reload the app. You'll see the Schools Debug Panel.

### 2. Check Console Logs

Look for these log patterns:
```
[SchoolsContext] Initial mount - loading schools from cache/API
[SchoolsContext] Cache loaded: X schools
[SchoolsContext] Setting schools from cache immediately
```

If you see:
```
[SchoolsContext] No cached schools found - IndexedDB may be empty
```
→ Cache needs to be seeded (see Pre-Deployment Steps)

### 3. Verify Environment Variables

Ensure Median build has:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

Check in app console:
```javascript
console.log(process.env.REACT_APP_SUPABASE_URL);
```

If undefined, env vars weren't injected. Rebuild with proper env file.

### 4. Test Cache Manually

In mobile app console:
```javascript
async function testCache() {
  const db = await indexedDB.open('GCU_Schools_offline', 2);
  return new Promise((resolve) => {
    const tx = db.transaction('schools', 'readonly');
    const req = tx.objectStore('schools').getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

testCache().then(schools => console.log('Cached schools:', schools));
```

---

## Fallback Flow on Mobile

### Scenario: Fresh Install, No Cache, API Fails

1. **SchoolsContext** tries to load cache → finds 0 schools
2. Sets `schools = []` and `loading = false`
3. **SchoolFilter** (multi-school role) sees `schools.length === 0`
4. Renders "All Schools" fallback checkbox with value `[-1]`
5. Auto-selects `[-1]` and calls `onChange([-1])`
6. **DataContext** receives `schoolIds = [-1]`
7. Fetches **all** students/workers without school filtering
8. Lists and dashboard display all data

**Result:** App is functional even without schools loaded. User can browse all data until schools populate.

---

## Median-Specific Notes

### 1. Build Configuration

Ensure your `median.json` or build config includes:
```json
{
  "environment": {
    "REACT_APP_SUPABASE_URL": "your-url",
    "REACT_APP_SUPABASE_ANON_KEY": "your-key"
  }
}
```

### 2. Network Permissions

Add to `capacitor.config.json`:
```json
{
  "server": {
    "allowNavigation": ["*.supabase.co"]
  }
}
```

### 3. Clear Cache on Updates

If schools structure changes, increment IndexedDB version:
```javascript
// In SchoolsContext.js
const DB_VERSION = 3; // Was 2
```

This will trigger cache migration/reset.

---

## Verification Checklist

After deploying to mobile:

- [ ] Debug panel shows "Cached Count: X" (X > 0)
- [ ] Schools dropdown/checkboxes populate
- [ ] Student list loads when school is selected
- [ ] Worker list loads when school is selected
- [ ] Forms show school dropdown with options
- [ ] Console shows: `[SchoolsContext] Cache loaded: X schools`
- [ ] No errors about "Cannot read property 'school_id'"

If any fail, check console logs and run debug panel diagnostics.

---

## Emergency Rollback

If issues persist, temporarily force "All Schools" mode:

```javascript
// In SchoolFilter.js, force fallback mode
const [selectedSchools, setSelectedSchools] = useState([-1]);
// Comment out the useEffect that initializes schools
```

This will load all data without school filtering until the root cause is resolved.

---

## Support

For further debugging, check:
1. Mobile app console logs (via USB debugging or remote dev tools)
2. Network tab (ensure Supabase requests aren't blocked)
3. Application tab → IndexedDB → `GCU_Schools_offline` → `schools` store

Share console logs and debug panel screenshots for targeted assistance.
