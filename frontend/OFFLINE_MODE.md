# Offline-First Architecture - Implementation Guide

## Overview
This application is now **completely offline-first**, meaning it works without any internet connection and syncs when connectivity is restored. It also handles the scenario where WiFi is connected but has no actual internet access.

## Key Improvements

### 1. Real Connectivity Detection (`useOnlineStatus.js`)
- **Problem**: `navigator.onLine` returns `true` when connected to WiFi, even if WiFi has no internet
- **Solution**: Periodic connectivity checks using lightweight HTTP requests with 3-second timeout
- **Features**:
  - Checks every 30 seconds automatically
  - Manual check available via `checkRealConnectivity()` function
  - Falls back to cached data when checks fail

### 2. Aggressive Timeouts (`offlineClient.js`, `tableCache.js`)
- **Problem**: Slow/fake WiFi connections cause app to hang waiting for responses
- **Solution**: All network requests now have strict timeouts:
  - **3 seconds** for SELECT queries
  - **5 seconds** for table fetches
  - **10 seconds** for mutations (INSERT/UPDATE/DELETE)
- **Behavior**: On timeout, immediately use cached data instead of failing

### 3. Cache-First Query Strategy (`offlineClient.js`)
- **Old**: Try network first, fall back to cache on error
- **New**: Prepare cache data first, attempt network with timeout, return cache if network fails
- **Result**: Zero perceived latency even with bad connections

### 4. Proactive Caching (`proactiveCache.js`)
- Tables cached on app load:
  - `form_schemas`, `roles`, `schools`
  - `workers`, `students`, `meals`
  - `academic_sessions`, `pe_sessions`, `assessments`
  - `attendance_records`, `meal_distributions`
- Each table has 5-second timeout
- Continues to next table even if one fails
- Runs in background without blocking UI

### 5. Smart Background Sync (`tableCache.js`)
- **Features**:
  - Checks real connectivity before attempting sync
  - Debouncing: minimum 10 seconds between sync attempts
  - Exponential backoff on failures (2s → 4s → 8s → 16s → max 60s)
  - Tracks consecutive failures to avoid hammering fake WiFi
- **Logging**: Detailed console logs for debugging sync issues

### 6. Visual Offline Indicator (`OfflineIndicator.js`)
- Shows when app is offline (red badge)
- Shows pending sync count when online (orange badge)
- Auto-hides when fully synced and online
- Updates via BroadcastChannel across all tabs

## Usage in Components

### Reading Data
```javascript
import useOfflineTable from '../hooks/useOfflineTable';

function MyComponent() {
  const { rows, loading, isOnline } = useOfflineTable('students');
  
  // rows will ALWAYS contain data (from cache if offline)
  // loading is only true during initial load
  // isOnline tells you current connectivity status
}
```

### Writing Data
```javascript
import { queueMutation } from '../utils/tableCache';

async function createStudent(data) {
  // Works offline - queues mutation for later sync
  const result = await queueMutation('students', 'insert', data);
  
  if (result.tempId) {
    // Offline: data queued with temporary ID
    console.log('Queued for sync:', result.mutationKey);
  } else {
    // Online: data saved immediately
    console.log('Saved:', result.id);
  }
}
```

### Checking Online Status
```javascript
import useOnlineStatus from '../hooks/useOnlineStatus';

function MyComponent() {
  const { isOnline, lastChanged, checkRealConnectivity } = useOnlineStatus();
  
  // isOnline: true if REAL internet (not just WiFi)
  // lastChanged: timestamp of last status change
  // checkRealConnectivity: function to manually check
}
```

## Testing Offline Mode

### 1. Browser DevTools
- Open DevTools → Network tab
- Click "Offline" dropdown → Select "Offline"
- App should continue working with cached data

### 2. WiFi with No Internet
- Connect to WiFi network with no internet access
- App will detect lack of real connectivity within 30 seconds
- All operations will use cache immediately

### 3. Slow Network
- Use Network throttling (3G/Slow 3G)
- Requests timeout after 3-10 seconds
- Cache data returned immediately on timeout

### 4. Verify Sync
- Make changes while offline
- Check console for "[tableCache] Queued mutation" messages
- Go online
- Check console for "[tableCache] Synced mutation" messages
- Verify data in database

## Troubleshooting

### App shows online but data not loading
- Check console for timeout messages
- Look for "Real connectivity check failed" warnings
- May indicate WiFi has no internet - will switch to offline mode automatically

### Changes not syncing
- Check browser console for sync errors
- Look for "[tableCache] Sync error" messages
- Mutations remain queued and retry with exponential backoff
- Use `getMutations()` to see pending changes

### Cache not working
- Open IndexedDB in DevTools → Application → Storage
- Check "GCU_Schools_offline" database
- Verify "tables" store has cached data
- Run `cacheFormSchemasIfOnline()` manually in console

### Service Worker issues
- Unregister service worker: `navigator.serviceWorker.getRegistrations().then(r => r.forEach(sw => sw.unregister()))`
- Clear cache: Open DevTools → Application → Clear storage
- Reload page

## Performance Benefits

### Before (Online-First)
- Network request: 500ms - 30s (with slow WiFi)
- Failed requests: 30s+ before timeout
- User sees loading spinners, blank screens

### After (Offline-First)
- Cache read: < 10ms
- Network timeout: 3-10s max
- User sees data instantly, syncs in background
- No loading spinners except initial page load

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                  User Action                     │
│           (Read data / Submit form)              │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│            useOfflineTable Hook                  │
│         - Checks navigator.onLine                │
│         - Checks real connectivity (3s timeout)  │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ IndexedDB    │    │ Supabase API     │
│ Cache        │    │ (with timeout)   │
│ ✓ Instant    │    │ ⏱ 3-10s max      │
└──────┬───────┘    └────────┬─────────┘
       │                     │
       │  On timeout/error   │
       │  ◄─────────────────┘
       │
       ▼
┌──────────────────┐
│  Return Data     │
│  to Component    │
└──────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Background Sync (if write)  │
│  - Queued mutations          │
│  - Exponential backoff       │
│  - Real connectivity check   │
└──────────────────────────────┘
```

## Configuration

### Timeout Settings
Located in respective files:
- Query timeout: `offlineClient.js` line 162 (3000ms)
- Table fetch timeout: `useOfflineTable.js` line 54 (5000ms)
- Mutation timeout: `tableCache.js` line 421 (10000ms)
- Connectivity check: `useOnlineStatus.js` line 17 (3000ms)

### Sync Settings
Located in `tableCache.js`:
- Minimum sync interval: line 651 (10000ms)
- Max backoff delay: line 682 (60000ms)
- Connectivity check interval: `useOnlineStatus.js` line 70 (30000ms)

### Tables to Cache
Located in `proactiveCache.js` line 13-28

## Best Practices

1. **Always use useOfflineTable** instead of direct API calls for data reading
2. **Always use queueMutation** instead of direct API calls for data writing
3. **Check isOnline status** before showing "sync required" messages
4. **Don't block UI** waiting for network - show cached data immediately
5. **Log liberally** - use console.log/warn for debugging offline issues
6. **Test offline** regularly during development
7. **Handle tempIds** in UI (data created offline has temporary IDs until synced)

## Future Improvements

- [ ] Conflict resolution for concurrent edits
- [ ] Partial sync (sync individual tables)
- [ ] Manual sync trigger button
- [ ] Sync progress indicator
- [ ] Offline data size limits
- [ ] Cache expiration policies
- [ ] Delta sync (only changed rows)
