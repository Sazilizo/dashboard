# RLS Caching - Testing Guide

## Pre-Testing Checklist

- [ ] Clear browser cache and IndexedDB
- [ ] Open browser DevTools (F12)
- [ ] Enable Console, Network, and Application tabs
- [ ] Create test users for each role (if not already exists)

---

## Test Users Setup

Create these test accounts in Supabase:

```sql
-- Superuser (no school)
INSERT INTO profiles (auth_uid, username, email, role_id, school_id)
VALUES ('superuser-uid', 'superuser', 'super@test.com', (SELECT id FROM roles WHERE name = 'superuser'), NULL);

-- HR (no school)
INSERT INTO profiles (auth_uid, username, email, role_id, school_id)
VALUES ('hr-uid', 'hr_user', 'hr@test.com', (SELECT id FROM roles WHERE name = 'hr'), NULL);

-- Head Tutor (School 1)
INSERT INTO profiles (auth_uid, username, email, role_id, school_id)
VALUES ('head-tutor-uid', 'head_tutor_1', 'head.tutor@test.com', (SELECT id FROM roles WHERE name = 'head_tutor'), 1);

-- Tutor (School 1)
INSERT INTO profiles (auth_uid, username, email, role_id, school_id)
VALUES ('tutor-uid', 'tutor_1', 'tutor@test.com', (SELECT id FROM roles WHERE name = 'tutor'), 1);

-- Coach (School 2)
INSERT INTO profiles (auth_uid, username, email, role_id, school_id)
VALUES ('coach-uid', 'coach_2', 'coach@test.com', (SELECT id FROM roles WHERE name = 'coach'), 2);
```

---

## Test 1: Superuser Access

### Steps
1. Login as `super@test.com`
2. Navigate to Users page
3. Check Workers list
4. Check Students list

### Expected Results
- ✅ Can access Users page
- ✅ See ALL profiles (all schools)
- ✅ See ALL workers (all schools)
- ✅ See ALL students (all schools)

### Verify in Console
```javascript
// Should see these logs:
[AuthProvider] Triggering RLS-aware cache refresh for user
[proactiveCache] Starting RLS-aware cache refresh for user: superuser (school: ALL)
[proactiveCache] ✓ cached profiles__user_X__role_superuser__all_schools (50/50 rows after RLS)
[proactiveCache] ✓ cached workers__user_X__role_superuser__all_schools (30/30 rows after RLS)
[proactiveCache] ✓ cached students__user_X__role_superuser__all_schools (200/200 rows after RLS)
```

### Verify in IndexedDB
1. Open DevTools → Application → IndexedDB → GCU_Schools_offline → tables
2. Look for cache keys with `__all_schools`
3. Check row counts match total records

---

## Test 2: HR Access (Users Page)

### Steps
1. Login as `hr@test.com`
2. Navigate to Users page
3. Try to access a worker profile
4. Check if disciplinary notice is available

### Expected Results
- ✅ Can access Users page
- ✅ See ALL profiles
- ✅ Can view any worker profile
- ✅ Disciplinary notice button visible
- ✅ Can send disciplinary emails

### Verify in Console
```javascript
[Users] RLS filtered: 50/50 profiles visible to hr
[proactiveCache] ✓ cached profiles__user_Y__role_hr__all_schools (50/50 rows after RLS)
```

### Verify UI
- [ ] Users page loads
- [ ] All user emails visible
- [ ] Can click "Edit" on any user
- [ ] WorkerProfile shows disciplinary button

---

## Test 3: Head Tutor Access

### Steps
1. Login as `head.tutor@test.com` (School 1)
2. Navigate to Workers list
3. Navigate to Students list
4. Try to access Users page
5. Try to view a coach profile

### Expected Results
- ✅ See only tutors in School 1 (workers list)
- ✅ See all students in School 1
- ❌ Cannot access Users page (no permission)
- ✅ Can view tutor profiles in School 1
- ❌ Cannot view coach profiles

### Verify in Console
```javascript
[proactiveCache] ⊘ Skipping profiles (no access for head_tutor)
[proactiveCache] ✓ cached workers__user_Z__role_head_tutor__school_1 (5/30 rows after RLS)
// Only tutors from school 1

[proactiveCache] ✓ cached students__user_Z__role_head_tutor__school_1 (50/200 rows after RLS)
// All students from school 1
```

### Verify Access Control
```javascript
// Try accessing a coach profile (should fail)
// Navigate to /dashboard/workers/profile/15 (coach ID)
[WorkerProfile] Access denied: You do not have permission to view this worker profile
```

---

## Test 4: Tutor Access (Own Students Only)

### Steps
1. Login as `tutor@test.com` (School 1)
2. Navigate to Students list
3. Check worker list
4. Try to access Users page
5. Try to view another tutor's profile

### Expected Results
- ✅ See only students assigned to this tutor (`student.tutor_id = user.id`)
- ✅ See only self in workers list
- ❌ Cannot access Users page
- ❌ Cannot view other tutors' profiles
- ✅ Can view own profile

### Verify in Console
```javascript
[proactiveCache] ⊘ Skipping profiles (no access for tutor)
[proactiveCache] ✓ cached students__user_A__role_tutor__school_1 (8/200 rows after RLS)
// Only students with tutor_id = A

[proactiveCache] ✓ cached workers__user_A__role_tutor__school_1 (1/30 rows after RLS)
// Only self
```

### Verify Data Filtering
```javascript
// Check students list
const students = await getTable('students');
console.log('Students:', students);
// Should only show students where tutor_id matches logged-in user
```

---

## Test 5: Coach Access (PE Students Only)

### Steps
1. Login as `coach@test.com` (School 2)
2. Navigate to Students list
3. Check filters
4. Try to view non-PE student profile

### Expected Results
- ✅ See only PE students assigned to this coach
  - `student.coach_id = user.id`
  - `student.physical_education = true`
- ✅ See only self in workers list
- ❌ Cannot see academic (non-PE) students

### Verify in Console
```javascript
[proactiveCache] ✓ cached students__user_B__role_coach__school_2 (5/200 rows after RLS)
// Only PE students with coach_id = B

// Each student should have:
students.forEach(s => {
  console.log('Student:', s.full_name, 'PE:', s.physical_education, 'Coach ID:', s.coach_id);
});
// All should show: PE: true, Coach ID: B
```

---

## Test 6: Offline Mode (Cached Data Integrity)

### Steps
1. Login as tutor
2. Wait for cache to complete
3. Open DevTools → Network → Enable "Offline" mode
4. Refresh page
5. Navigate to Students list
6. Navigate to Workers list

### Expected Results
- ✅ App loads offline
- ✅ See same students as when online (own students only)
- ✅ See self in workers list
- ✅ No access to profiles not cached for this user

### Verify in Console
```javascript
[Users] Offline - loading profiles from cache...
[Users] ✓ Loaded 1 profiles from cache (RLS filtered)
// Should be 1 (own profile)

[DataContext] Loading from cache (offline)
[DataContext] Cached students: 8
// Same count as when online
```

### Verify IndexedDB
1. Application → IndexedDB → GCU_Schools_offline → tables
2. Look for cache key: `students__user_A__role_tutor__school_1`
3. Verify only contains tutor's students (count: 8)
4. No `profiles` cache key should exist (tutor can't access)

---

## Test 7: School Isolation

### Setup
- School 1: 100 students, 10 tutors
- School 2: 50 students, 5 coaches
- School 3: 30 students, 3 tutors

### Test 7a: Head Tutor at School 1
```javascript
// Expected cache
students__user_X__role_head_tutor__school_1: 100 rows (only School 1)
workers__user_X__role_head_tutor__school_1: 10 rows (only tutors from School 1)
```

### Test 7b: Coach at School 2
```javascript
// Expected cache
students__user_Y__role_coach__school_2: 25 rows (only PE students from School 2)
workers__user_Y__role_coach__school_2: 1 row (self only)
```

### Test 7c: Tutor at School 3
```javascript
// Expected cache
students__user_Z__role_tutor__school_3: 5 rows (own students from School 3)
workers__user_Z__role_tutor__school_3: 1 row (self)
```

### Verify
- [ ] No cross-school data leakage
- [ ] Cache keys include correct school_id
- [ ] Row counts match expected filters

---

## Test 8: Role Transition

### Steps
1. Login as tutor (see 8 students)
2. Logout
3. Login as head_tutor (see 100 students)
4. Check cache keys in IndexedDB

### Expected Results
- ✅ New cache keys created for head_tutor
- ✅ Old tutor cache keys still exist (but not used)
- ✅ Correct data shown for each role
- ❌ No cache key collision

### Verify in IndexedDB
```
tables:
  - students__user_A__role_tutor__school_1 (8 rows)
  - students__user_B__role_head_tutor__school_1 (100 rows)
```

Both cache keys can coexist without conflict.

---

## Test 9: Access Control Error Handling

### Test 9a: Tutor Accessing Another Tutor's Profile

```javascript
// Login as tutor (user ID: 10)
// Navigate to /dashboard/workers/profile/15 (another tutor)

// Expected:
Error: "Access denied: You do not have permission to view this worker profile"
```

### Test 9b: Coach Accessing Tutor Profile

```javascript
// Login as coach
// Navigate to /dashboard/workers/profile/20 (tutor)

// Expected:
Error: "Access denied: You do not have permission to view this worker profile"
```

### Test 9c: Tutor Accessing Users Page

```javascript
// Login as tutor
// Navigate to /dashboard/users

// Expected:
<div>Access denied</div>
```

---

## Test 10: Cache Size Validation

### Steps
1. Login as superuser
2. Wait for cache
3. Check IndexedDB size
4. Login as tutor
5. Wait for cache
6. Compare IndexedDB sizes

### Expected Results
```
Superuser cache:
  - profiles: ~50 rows
  - workers: ~30 rows
  - students: ~200 rows
  - Total: ~5 MB

Tutor cache:
  - profiles: 0 rows (no access)
  - workers: 1 row (self)
  - students: ~8 rows (own students)
  - Total: ~100 KB
```

### Verify
- [ ] Superuser cache >> Tutor cache
- [ ] No unnecessary data in tutor cache
- [ ] Cache keys are user-specific

---

## Automated Test Script

```javascript
// Run in browser console after login

async function testRLSFiltering() {
  const { getUserContext, applyRLSFiltering } = await import('./src/utils/rlsCache.js');
  const { getTable } = await import('./src/utils/tableCache.js');
  const { useAuth } = await import('./src/context/AuthProvider.js');
  
  // Get user context
  const { user } = useAuth();
  const userContext = getUserContext(user);
  console.log('User Context:', userContext);
  
  // Test students filtering
  const students = await getTable('students');
  const filteredStudents = applyRLSFiltering('students', students, userContext);
  console.log(`Students: ${filteredStudents.length}/${students.length} visible`);
  
  // Test workers filtering
  const workers = await getTable('workers');
  const filteredWorkers = applyRLSFiltering('workers', workers, userContext);
  console.log(`Workers: ${filteredWorkers.length}/${workers.length} visible`);
  
  // Test profiles filtering
  const profiles = await getTable('profiles');
  const filteredProfiles = applyRLSFiltering('profiles', profiles, userContext);
  console.log(`Profiles: ${filteredProfiles.length}/${profiles.length} visible`);
  
  return {
    userContext,
    students: filteredStudents.length,
    workers: filteredWorkers.length,
    profiles: filteredProfiles.length
  };
}

testRLSFiltering().then(console.log);
```

---

## Success Criteria

All tests should pass with these results:

| Role | Profiles | Workers | Students | Users Page | Worker Profiles |
|------|----------|---------|----------|------------|-----------------|
| Superuser | All | All | All | ✅ | All |
| HR | All | All | All | ✅ | All |
| Head Tutor | 0 | Tutors (school) | All (school) | ❌ | Tutors (school) |
| Head Coach | 0 | Coaches (school) | PE (school) | ❌ | Coaches (school) |
| Tutor | 0 | Self | Own students | ❌ | Self only |
| Coach | 0 | Self | Own PE students | ❌ | Self only |

---

## Troubleshooting Failed Tests

### Issue: Seeing too much data
```javascript
// Check if RLS filtering is being applied
const userContext = getUserContext(user);
console.log('User context:', userContext);

// Manually apply RLS
const allData = await getTable('students');
const filtered = applyRLSFiltering('students', allData, userContext);
console.log('Before:', allData.length, 'After:', filtered.length);
```

### Issue: Seeing too little data (or none)
```javascript
// Check if cache was successful
const key = getUserCacheKey('students', userContext);
console.log('Cache key:', key);

// Check IndexedDB directly
// DevTools → Application → IndexedDB → GCU_Schools_offline → tables
// Look for the cache key and verify row count
```

### Issue: Access denied when it shouldn't be
```javascript
// Check access function logic
const { roleName, schoolId } = getUserContext(user);
console.log('Role:', roleName, 'School:', schoolId);

// Verify worker data
console.log('Worker school:', workerData.school_id);
console.log('Worker role:', workerData.roles?.name);

// Manual access check
const canView = checkWorkerAccess(workerData, userContext);
console.log('Can view:', canView);
```

---

## Performance Benchmarks

Expected cache times (first login):

| Role | Tables Cached | Expected Time | Cache Size |
|------|---------------|---------------|------------|
| Superuser | All (14 tables) | ~10-15s | ~5 MB |
| HR | All (14 tables) | ~10-15s | ~5 MB |
| Head Tutor | 12 tables | ~5-8s | ~1 MB |
| Tutor | 11 tables | ~3-5s | ~500 KB |
| Coach | 11 tables | ~3-5s | ~300 KB |

If times are significantly longer:
- Check network throttling
- Verify Supabase response times
- Check for large tables (>1000 rows)

---

## Test Completion Checklist

- [ ] All 10 tests completed
- [ ] All roles tested (superuser, hr, head_tutor, tutor, coach)
- [ ] Cache keys verified in IndexedDB
- [ ] Console logs show correct RLS filtering
- [ ] Access control errors work as expected
- [ ] Offline mode works correctly
- [ ] No data leakage between users/schools
- [ ] Performance within expected ranges
- [ ] Documentation reviewed and accurate

---

**Ready for Production!** ✅

Once all tests pass, the RLS-aware caching system is production-ready and secure.
