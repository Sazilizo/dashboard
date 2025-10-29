# RLS-Aware Caching Implementation Guide

## Overview

This document explains the Row Level Security (RLS) aware caching system that ensures cached data respects the same access control rules as your Supabase RLS policies.

## Problem Solved

**Before**: The caching system stored all data without filtering, potentially exposing data that users shouldn't see based on their role and school assignment.

**After**: Data is filtered before caching and after retrieval based on user context, mirroring your Supabase RLS policies for offline consistency.

---

## Architecture

### Core Components

1. **`rlsCache.js`** - RLS filtering utilities
2. **`proactiveCache.js`** - RLS-aware background caching
3. **`tableCache.js`** - IndexedDB storage (updated to support user context)
4. **`AuthProvider.js`** - Triggers RLS cache refresh on login

### Data Flow

```
User Logs In
    ↓
AuthProvider gets user profile (role, school_id)
    ↓
Extract userContext: { userId, roleId, roleName, schoolId, auth_uid }
    ↓
Trigger RLS-aware cache refresh
    ↓
For each table:
    - Fetch from Supabase (with timeout)
    - Apply RLS filtering based on user context
    - Cache filtered data with user-specific key
    ↓
Offline: Retrieve from cache with RLS filtering
```

---

## Access Rules by Role

### Superuser & Admin
- **Profiles**: All profiles
- **Workers**: All workers
- **Students**: All students
- **Schools**: All schools
- **Meals, Sessions, Attendance**: All records

### HR
- **Profiles**: All profiles (for Users page)
- **Workers**: All workers (for WorkerProfile, disciplinary)
- **Students, Sessions, Attendance**: Same as superuser/admin

### Head Tutor
- **Workers**: All tutors in their school only
- **Students**: All students in their school
- **Sessions**: Academic sessions in their school
- **Attendance**: Records in their school

### Head Coach
- **Workers**: All coaches in their school only
- **Students**: All PE students in their school (where `physical_education = true`)
- **Sessions**: PE sessions in their school
- **Attendance**: PE records in their school

### Tutor
- **Workers**: Only themselves
- **Students**: Only students assigned to them (`student.tutor_id = user.id`)
- **Sessions**: Sessions for their students
- **Attendance**: Records they created or are attributed to

### Coach
- **Workers**: Only themselves
- **Students**: Only PE students assigned to them (`student.coach_id = user.id AND physical_education = true`)
- **Sessions**: PE sessions for their students
- **Attendance**: PE records they created or are attributed to

### Learner
- **Profiles**: Only their own profile
- **Workers**: None (unless they're also a worker)
- **Students**: Only themselves

---

## Implementation Details

### 1. User Context Extraction

```javascript
import { getUserContext } from '../../utils/rlsCache';

const userContext = getUserContext(user);
// Returns: { userId, auth_uid, roleId, roleName, schoolId }
```

### 2. Cache Key Generation

```javascript
import { getUserCacheKey } from '../../utils/rlsCache';

// For superuser with no school
const key = getUserCacheKey('students', userContext);
// → "students__user_123__role_1__all_schools"

// For tutor at School 5
const key = getUserCacheKey('students', userContext);
// → "students__user_456__role_tutor__school_5"
```

This ensures each user has isolated cached data.

### 3. RLS Filtering

```javascript
import { applyRLSFiltering } from '../../utils/rlsCache';

const allData = await fetchFromAPI();
const filteredData = applyRLSFiltering('students', allData, userContext);
// Returns only students the user is authorized to see
```

### 4. Caching with RLS

```javascript
import { cacheTable } from '../../utils/tableCache';
import { getUserContext } from '../../utils/rlsCache';

const userContext = getUserContext(user);
const data = await api.from('students').select('*');

// Cache with user context - automatically filters and uses user-specific key
await cacheTable('students', data.data, userContext);
```

### 5. Retrieving Cached Data

```javascript
import { getTable } from '../../utils/tableCache';
import { applyRLSFiltering } from '../../utils/rlsCache';

const userContext = getUserContext(user);

// Get from cache (uses user-specific key automatically)
const cachedData = await getTable('students');

// Apply RLS filtering (in case cache has stale data)
const filteredData = applyRLSFiltering('students', cachedData, userContext);
```

---

## Usage Examples

### Example 1: Users List Component

```javascript
import { getUserContext, applyRLSFiltering } from '../../utils/rlsCache';
import { cacheTable, getTable } from '../../utils/tableCache';

function UsersList() {
  const { user } = useAuth();
  const userContext = getUserContext(user);

  useEffect(() => {
    async function loadProfiles() {
      if (isOnline) {
        // Fetch from API
        const { data } = await api.from('profiles').select('*');
        
        // Apply RLS and cache
        const filtered = applyRLSFiltering('profiles', data, userContext);
        await cacheTable('profiles', data, userContext);
        setProfiles(filtered);
      } else {
        // Load from cache with RLS
        const cached = await getTable('profiles');
        const filtered = applyRLSFiltering('profiles', cached, userContext);
        setProfiles(filtered);
      }
    }
    
    loadProfiles();
  }, [user, isOnline]);
}
```

### Example 2: Worker Profile Access Control

```javascript
import { getUserContext } from '../../utils/rlsCache';

function WorkerProfile() {
  const { user } = useAuth();
  const { id } = useParams();
  
  useEffect(() => {
    async function loadWorker() {
      const workerData = await fetchWorker(id);
      
      // Check access before displaying
      const userContext = getUserContext(user);
      const canView = checkWorkerAccess(workerData, userContext);
      
      if (!canView) {
        setError('Access denied: You do not have permission to view this worker');
        return;
      }
      
      setWorker(workerData);
    }
    
    loadWorker();
  }, [id, user]);
}

function checkWorkerAccess(workerData, userContext) {
  const { roleName, schoolId, userId } = userContext;
  const role = roleName?.toLowerCase();
  
  // HR, superuser, admin see all
  if (['hr', 'superuser', 'admin'].includes(role)) {
    return true;
  }
  
  // Head tutors see tutors in their school
  if (role === 'head_tutor') {
    return workerData.school_id === schoolId && 
           workerData.roles?.name?.toLowerCase() === 'tutor';
  }
  
  // Tutors/coaches see only themselves
  if (['tutor', 'coach'].includes(role)) {
    return workerData.id === userId;
  }
  
  return false;
}
```

---

## Testing RLS Caching

### Test Scenario 1: Tutor Access

```javascript
// Login as tutor (user ID: 10, school ID: 3)
// Cache students table

const userContext = { 
  userId: 10, 
  roleName: 'tutor', 
  schoolId: 3 
};

const allStudents = [
  { id: 1, tutor_id: 10, school_id: 3, name: 'Alice' },  // ✓ Own student
  { id: 2, tutor_id: 15, school_id: 3, name: 'Bob' },    // ✗ Different tutor
  { id: 3, tutor_id: 10, school_id: 5, name: 'Charlie' } // ✓ Own student (different school)
];

const filtered = applyRLSFiltering('students', allStudents, userContext);
// Result: [{ id: 1 }, { id: 3 }] - Only students with tutor_id = 10
```

### Test Scenario 2: Head Tutor Access

```javascript
// Login as head_tutor (user ID: 20, school ID: 3)

const userContext = { 
  userId: 20, 
  roleName: 'head_tutor', 
  schoolId: 3 
};

const allStudents = [
  { id: 1, tutor_id: 10, school_id: 3, name: 'Alice' },  // ✓ Same school
  { id: 2, tutor_id: 15, school_id: 3, name: 'Bob' },    // ✓ Same school
  { id: 3, tutor_id: 10, school_id: 5, name: 'Charlie' } // ✗ Different school
];

const filtered = applyRLSFiltering('students', allStudents, userContext);
// Result: [{ id: 1 }, { id: 2 }] - All students in school_id = 3
```

### Test Scenario 3: HR/Superuser Access

```javascript
// Login as HR or superuser

const userContext = { 
  userId: 1, 
  roleName: 'hr', 
  schoolId: null 
};

const allProfiles = [
  { id: 1, email: 'admin@example.com' },
  { id: 2, email: 'tutor@example.com' },
  { id: 3, email: 'student@example.com' }
];

const filtered = applyRLSFiltering('profiles', allProfiles, userContext);
// Result: All 3 profiles - HR sees everything
```

---

## Migration Guide

### Before (Insecure Caching)

```javascript
// ❌ Old way - no RLS filtering
await cacheTable('students', allStudents);
const cached = await getTable('students');
// Problem: All students cached and retrieved regardless of user
```

### After (RLS-Aware Caching)

```javascript
// ✅ New way - with RLS filtering
const userContext = getUserContext(user);
await cacheTable('students', allStudents, userContext);
const cached = await getTable('students');
const filtered = applyRLSFiltering('students', cached, userContext);
// Secure: Only authorized students cached and retrieved
```

---

## Security Considerations

1. **Client-Side Security**: RLS filtering on the client is for UX/offline consistency only. Server-side RLS policies are the primary security boundary.

2. **Cache Isolation**: Each user's cache is isolated by their user ID, role, and school. Switching users will trigger new cache refresh.

3. **Stale Data**: Always apply RLS filtering when retrieving from cache, even if data was cached with RLS, to handle edge cases where user context changes.

4. **Sensitive Tables**: The `profiles` table is restricted to HR and superuser roles only. Other roles will see empty results.

5. **School Isolation**: Users with `school_id = NULL` (superuser, admin) see all schools. Users with a school ID only see their school's data.

---

## Troubleshooting

### Issue: User sees no data after login

**Cause**: RLS filtering is too restrictive or user context is incorrect.

**Solution**:
```javascript
// Check user context
const userContext = getUserContext(user);
console.log('User context:', userContext);
// Verify: roleName, schoolId are correct

// Check if user has access to table
import { canAccessTable } from '../../utils/rlsCache';
const hasAccess = canAccessTable('students', userContext);
console.log('Can access students:', hasAccess);
```

### Issue: Cache key mismatch errors

**Cause**: User context changed between cache write and read.

**Solution**:
```javascript
// Always pass same user context
const userContext = getUserContext(user);

// When caching
await cacheTable('students', data, userContext);

// When retrieving
const cached = await getTable('students'); // Uses same context
```

### Issue: Data leakage between users

**Cause**: Not applying RLS filtering after cache retrieval.

**Solution**:
```javascript
// ❌ Bad - no filtering
const cached = await getTable('students');
setStudents(cached); // May contain unauthorized data

// ✅ Good - always filter
const cached = await getTable('students');
const filtered = applyRLSFiltering('students', cached, userContext);
setStudents(filtered);
```

---

## Performance Implications

### Cache Size

- Each user has their own cache keys
- Superuser caches may be large (all schools)
- School-based users have smaller caches (one school only)

### Recommended Cache Limits

```javascript
// In rlsCache.js
const MAX_CACHE_ENTRIES = {
  superuser: 10000,  // All schools
  hr: 10000,         // All schools
  admin: 10000,      // All schools
  head_tutor: 2000,  // One school
  head_coach: 2000,  // One school
  tutor: 500,        // Own students only
  coach: 500,        // Own students only
};
```

### Cache Cleanup

```javascript
// Clear old cache entries (> 7 days)
import { cleanupCache } from '../../utils/tableCache';

setInterval(async () => {
  await cleanupCache();
}, 24 * 60 * 60 * 1000); // Daily
```

---

## Future Enhancements

1. **Fine-Grained Attendance Filtering**: Currently head tutors/coaches see all attendance records. Could filter by student school lookup.

2. **Session Participant Cross-References**: Implement proper student lookups for session participants filtering.

3. **Dynamic RLS Rules**: Load RLS rules from server config instead of hardcoding.

4. **Cache Versioning**: Track RLS rule versions and invalidate cache when rules change.

5. **Audit Logging**: Log when users attempt to access data outside their permissions.

---

## Summary

The RLS-aware caching system ensures that:

✅ Users only cache data they're authorized to see  
✅ Offline mode respects the same access rules as online  
✅ School-based isolation is maintained  
✅ HR and superuser can manage all data  
✅ Tutors/coaches see only their assigned students  
✅ Cache keys are user-specific to prevent data leakage  

This implementation mirrors your Supabase RLS policies on the client side for a secure, consistent offline experience.
