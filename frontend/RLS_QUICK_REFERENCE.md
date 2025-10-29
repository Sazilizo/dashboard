# RLS Caching - Quick Reference

## Import Statements

```javascript
// In any component that needs RLS filtering
import { getUserContext, applyRLSFiltering, getUserCacheKey, canAccessTable } from '../../utils/rlsCache';
import { cacheTable, getTable } from '../../utils/tableCache';
import { useAuth } from '../../context/AuthProvider';
```

## Common Patterns

### Pattern 1: Fetch and Cache with RLS

```javascript
const { user } = useAuth();
const userContext = getUserContext(user);

// Online: Fetch, filter, cache
if (isOnline) {
  const { data } = await api.from('students').select('*');
  const filtered = applyRLSFiltering('students', data, userContext);
  await cacheTable('students', data, userContext);
  setStudents(filtered);
}
```

### Pattern 2: Load from Cache with RLS

```javascript
const { user } = useAuth();
const userContext = getUserContext(user);

// Offline: Load and filter
const cached = await getTable('students');
const filtered = applyRLSFiltering('students', cached, userContext);
setStudents(filtered);
```

### Pattern 3: Check Table Access

```javascript
const { user } = useAuth();
const userContext = getUserContext(user);

if (!canAccessTable('profiles', userContext)) {
  console.log('User cannot access profiles table');
  return;
}
```

### Pattern 4: Check Record Access

```javascript
const { user } = useAuth();
const userContext = getUserContext(user);
const { roleName, schoolId, userId } = userContext;

// Custom access check for specific record
function canViewWorker(worker) {
  if (['hr', 'superuser', 'admin'].includes(roleName?.toLowerCase())) {
    return true;
  }
  
  if (roleName?.toLowerCase() === 'head_tutor') {
    return worker.school_id === schoolId && 
           worker.roles?.name?.toLowerCase() === 'tutor';
  }
  
  return worker.id === userId;
}

if (!canViewWorker(workerData)) {
  setError('Access denied');
  return;
}
```

## Access Quick Reference

### Superuser/Admin/HR
```javascript
// Can access ALL tables, ALL schools, ALL records
['superuser', 'admin', 'hr'].includes(roleName) → Full access
```

### Head Tutor
```javascript
// Workers: tutors in their school
workers.filter(w => w.school_id === schoolId && w.role === 'tutor')

// Students: all in their school
students.filter(s => s.school_id === schoolId)

// Sessions: academic sessions in their school
sessions.filter(s => s.school_id === schoolId)
```

### Head Coach
```javascript
// Workers: coaches in their school
workers.filter(w => w.school_id === schoolId && w.role === 'coach')

// Students: PE students in their school
students.filter(s => s.school_id === schoolId && s.physical_education === true)

// Sessions: PE sessions in their school
pe_sessions.filter(s => s.school_id === schoolId)
```

### Tutor
```javascript
// Workers: only self
workers.filter(w => w.id === userId)

// Students: only assigned students
students.filter(s => s.tutor_id === userId)

// Attendance: only own records
attendance.filter(a => a.tutor_id === userId || a.recorded_by === userId)
```

### Coach
```javascript
// Workers: only self
workers.filter(w => w.id === userId)

// Students: only assigned PE students
students.filter(s => s.coach_id === userId && s.physical_education === true)

// Attendance: only own PE records
attendance.filter(a => a.coach_id === userId || a.recorded_by === userId)
```

## Cache Keys by Role

```javascript
// Superuser (no school)
"students__user_1__role_superuser__all_schools"

// Admin (no school)
"workers__user_2__role_admin__all_schools"

// HR (no school)
"profiles__user_3__role_hr__all_schools"

// Head Tutor (School 3)
"students__user_10__role_head_tutor__school_3"

// Tutor (School 5)
"students__user_15__role_tutor__school_5"

// Coach (School 2)
"students__user_20__role_coach__school_2"
```

## Debugging

### Log User Context
```javascript
const userContext = getUserContext(user);
console.log('User Context:', userContext);
// { userId: 10, auth_uid: 'abc123', roleId: 5, roleName: 'tutor', schoolId: 3 }
```

### Log Cache Key
```javascript
const key = getUserCacheKey('students', userContext);
console.log('Cache Key:', key);
// "students__user_10__role_tutor__school_3"
```

### Log Filtering Results
```javascript
console.log('Before RLS:', allData.length);
const filtered = applyRLSFiltering('students', allData, userContext);
console.log('After RLS:', filtered.length);
// Before RLS: 150
// After RLS: 25 (tutor's students only)
```

### Check Table Access
```javascript
const tables = ['profiles', 'workers', 'students', 'schools'];
tables.forEach(table => {
  const hasAccess = canAccessTable(table, userContext);
  console.log(`Can access ${table}:`, hasAccess);
});
```

## Common Issues

### Issue: Empty data after login
```javascript
// Check if user context is correct
const userContext = getUserContext(user);
console.log('Is user context valid?', userContext !== null);
console.log('User role:', userContext?.roleName);
console.log('User school:', userContext?.schoolId);
```

### Issue: Access denied errors
```javascript
// Verify role matches expected
const role = userContext?.roleName?.toLowerCase();
console.log('User role:', role);
console.log('Expected roles:', ['hr', 'superuser']);
console.log('Has access:', ['hr', 'superuser'].includes(role));
```

### Issue: Cache not updating
```javascript
// Force cache refresh by passing user to proactive cache
import cacheFormSchemasIfOnline from '../../utils/proactiveCache';
const { user } = useAuth();
await cacheFormSchemasIfOnline(user);
```

## Console Output Examples

### Successful Cache
```
[AuthProvider] Triggering RLS-aware cache refresh for user
[proactiveCache] Starting RLS-aware cache refresh for user: tutor (school: 3)
[proactiveCache] ✓ cached students__user_10__role_tutor__school_3 (25/150 rows after RLS)
[proactiveCache] ⊘ Skipping profiles (no access for tutor)
[Users] RLS filtered: 0/50 profiles visible to tutor
```

### Access Denied
```
[WorkerProfile] Access denied: You do not have permission to view this worker profile
[Users] RLS filtered: 1/50 profiles visible to tutor (own profile only)
```

### Offline Fallback
```
[Users] Offline - loading profiles from cache...
[Users] ✓ Loaded 1 profiles from cache (RLS filtered)
```

---

## Remember

1. **Always** get user context: `getUserContext(user)`
2. **Always** apply RLS filtering: `applyRLSFiltering(table, data, userContext)`
3. **Always** pass user context to cacheTable: `cacheTable(table, data, userContext)`
4. **Never** skip RLS filtering when retrieving from cache
5. **Check** table access before fetching: `canAccessTable(table, userContext)`

---

## Files to Check

- `src/utils/rlsCache.js` - Core RLS utilities
- `src/utils/proactiveCache.js` - Background caching
- `src/context/AuthProvider.js` - Login trigger
- `RLS_CACHING_GUIDE.md` - Full documentation
- `RLS_CACHING_SUMMARY.md` - Implementation summary
