# RLS-Aware Caching System - Implementation Summary

## What Was Implemented

✅ **RLS Filtering Utilities** (`src/utils/rlsCache.js`)
- User context extraction from AuthProvider
- Cache key generation with user/school/role isolation
- RLS filtering functions mirroring Supabase policies
- Access control checks for table visibility

✅ **Proactive Cache with RLS** (`src/utils/proactiveCache.js`)
- User-aware background caching on app init
- Automatic RLS filtering before caching
- User-specific cache keys
- Access control checks before caching tables

✅ **AuthProvider Integration** (`src/context/AuthProvider.js`)
- Triggers RLS-aware cache refresh on login
- Passes user context to caching functions
- Ensures offline data respects user permissions

✅ **Users List with RLS** (`src/components/lists/Users.js`)
- Applies RLS filtering to profiles table
- HR and superuser see all profiles
- Other users see only their own profile
- User-aware caching and retrieval

✅ **Worker Profile Access Control** (`src/components/profiles/WorkerProfile.js`)
- Access checks before displaying worker data
- Head tutors can view tutors in their school
- Head coaches can view coaches in their school
- Tutors/coaches can only view themselves

✅ **Documentation** (`RLS_CACHING_GUIDE.md`)
- Complete implementation guide
- Access rules by role
- Usage examples and testing scenarios
- Troubleshooting guide

---

## Access Rules Summary

### By Role

| Role | Profiles | Workers | Students | Sessions | Attendance |
|------|----------|---------|----------|----------|------------|
| **Superuser** | All | All | All | All | All |
| **Admin** | All | All | All | All | All |
| **HR** | All | All | All | All | All |
| **Head Tutor** | Own | Tutors in school | All in school | School's academic | School's records |
| **Head Coach** | Own | Coaches in school | PE students in school | School's PE | School's PE records |
| **Tutor** | Own | Self | Own students (tutor_id) | Students' sessions | Own records |
| **Coach** | Own | Self | Own PE students (coach_id) | Students' PE sessions | Own PE records |
| **Learner** | Own | None | Self | Own sessions | Own records |

### School-Based Isolation

- **NULL school_id** (superuser/admin/hr): Access all schools
- **Has school_id** (tutors/coaches/head roles): Access only their school's data

---

## Files Modified

1. **`src/utils/rlsCache.js`** (NEW)
   - `getUserContext(user)` - Extract user context
   - `getUserCacheKey(tableName, userContext)` - Generate cache keys
   - `applyRLSFiltering(tableName, rows, userContext)` - Filter data
   - `canAccessTable(tableName, userContext)` - Check table access

2. **`src/utils/proactiveCache.js`** (UPDATED)
   - Now accepts `user` parameter
   - Calls `getUserContext()` to get user info
   - Uses `canAccessTable()` to skip unauthorized tables
   - Passes `userContext` to `cacheTable()`
   - Logs RLS filtering stats

3. **`src/context/AuthProvider.js`** (UPDATED)
   - Imports `cacheFormSchemasIfOnline`
   - Triggers RLS-aware cache on user login
   - Passes `fullUser` to proactive cache function

4. **`src/components/lists/Users.js`** (UPDATED)
   - Imports RLS utilities
   - Gets user context in fetch function
   - Applies RLS filtering to API responses
   - Applies RLS filtering to cached data
   - Caches with user context

5. **`src/components/profiles/WorkerProfile.js`** (UPDATED)
   - Imports `getUserContext`
   - Adds `checkWorkerAccess()` function
   - Checks access before displaying worker
   - Shows "Access denied" error if unauthorized
   - Added user to dependency array

6. **`RLS_CACHING_GUIDE.md`** (NEW)
   - Complete documentation
   - Implementation guide
   - Testing scenarios
   - Troubleshooting

---

## How It Works

### 1. Login Flow

```
User logs in
  ↓
AuthProvider.refreshUser() fetches profile with role and school_id
  ↓
Extracts userContext: { userId, roleId, roleName, schoolId }
  ↓
Calls cacheFormSchemasIfOnline(fullUser)
  ↓
For each table:
  - Check if user can access table (canAccessTable)
  - Fetch from Supabase
  - Apply RLS filtering (applyRLSFiltering)
  - Cache with user-specific key (cacheTable)
```

### 2. Data Retrieval Flow

```
Component requests data
  ↓
If online:
  - Fetch from Supabase
  - Apply RLS filtering
  - Cache with user context
  - Display filtered data
  ↓
If offline:
  - Load from cache (user-specific key)
  - Apply RLS filtering (double-check)
  - Display filtered data
```

### 3. Cache Key Isolation

```
Superuser (no school):
  "students__user_1__role_superuser__all_schools"
  
Tutor at School 3:
  "students__user_10__role_tutor__school_3"
  
Coach at School 5:
  "students__user_15__role_coach__school_5"
```

Each user's cache is completely isolated.

---

## Security Guarantees

✅ **Server-Side RLS is Primary**: Client-side filtering is for UX/offline only  
✅ **Cache Isolation**: Each user has separate cache keys  
✅ **Double Filtering**: Applied at cache-time AND retrieval-time  
✅ **Access Checks**: Tables restricted based on role (e.g., profiles → HR only)  
✅ **School Boundaries**: Users with school_id see only their school  

---

## Testing Checklist

- [ ] Tutor can see only their assigned students
- [ ] Coach can see only their assigned PE students
- [ ] Head Tutor can see all tutors + students in their school
- [ ] Head Coach can see all coaches + PE students in their school
- [ ] HR can see all profiles in Users page
- [ ] Superuser can see all profiles
- [ ] Regular tutor cannot see Users page
- [ ] Tutor cannot view other tutors' profiles (WorkerProfile)
- [ ] Head Tutor can view tutors in their school
- [ ] Offline mode respects same access rules as online
- [ ] Cache keys include user/role/school
- [ ] Switching users triggers new cache refresh

---

## Next Steps

1. **Test with Real Users**
   - Login as different roles
   - Verify data visibility matches expectations
   - Test offline mode for each role

2. **Monitor Cache Size**
   - Check IndexedDB usage in DevTools
   - Verify superuser cache vs tutor cache size difference
   - Implement cache cleanup if needed

3. **Add Audit Logging** (Optional)
   - Log when users attempt unauthorized access
   - Track cache hit/miss rates
   - Monitor RLS filter effectiveness

4. **Performance Optimization** (If Needed)
   - Add cache size limits per role
   - Implement lazy loading for large datasets
   - Consider pagination for superuser views

---

## Breaking Changes

⚠️ **Cache Format Changed**

Old cache keys:
```
"students"
"workers"
"profiles"
```

New cache keys:
```
"students__user_10__role_tutor__school_3"
"workers__user_1__role_superuser__all_schools"
"profiles__user_5__role_hr__all_schools"
```

**Impact**: Existing cached data will not be accessible. Users will need to re-cache on first login after update.

**Migration**: No action needed - cache will automatically refresh when users log in.

---

## Rollback Plan

If issues arise, you can disable RLS caching by:

1. **AuthProvider.js**: Comment out the cache trigger
```javascript
// CRITICAL: Trigger RLS-aware cache refresh when user profile is loaded
// if (isOnline && fullUser?.profile) {
//   cacheFormSchemasIfOnline(fullUser).catch(err => 
//     console.warn('[AuthProvider] RLS cache refresh failed:', err)
//   );
// }
```

2. **proactiveCache.js**: Revert to old signature
```javascript
export async function cacheFormSchemasIfOnline() {
  // Old implementation without user parameter
}
```

3. **Users.js**: Remove RLS filtering
```javascript
// Remove applyRLSFiltering calls
setProfiles(data); // Instead of applyRLSFiltering('profiles', data, userContext)
```

---

## Support

For questions or issues:
1. Check `RLS_CACHING_GUIDE.md` for detailed documentation
2. Review console logs for RLS filtering stats
3. Use browser DevTools → Application → IndexedDB to inspect cache
4. Check Supabase RLS policies match client-side rules

---

## Success Metrics

After implementation, you should see:

✅ Smaller cache sizes for school-based users  
✅ No unauthorized data in client-side cache  
✅ Consistent behavior online and offline  
✅ Clear console logs showing RLS filtering  
✅ Access denied errors for unauthorized access attempts  

Example console output:
```
[AuthProvider] Triggering RLS-aware cache refresh for user
[proactiveCache] Starting RLS-aware cache refresh for user: tutor (school: 3)
[proactiveCache] ⊘ Skipping profiles (no access for tutor)
[proactiveCache] ✓ cached students__user_10__role_tutor__school_3 (25/150 rows after RLS)
[proactiveCache] ✓ cached workers__user_10__role_tutor__school_3 (1/15 rows after RLS)
[proactiveCache] RLS-aware cache refresh complete
```

---

**Implementation completed successfully!** 🎉

Your caching system now respects Row Level Security rules and maintains school-based isolation for offline functionality.
