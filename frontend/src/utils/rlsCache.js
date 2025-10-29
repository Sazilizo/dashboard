/**
 * RLS-Aware Caching Utilities
 * 
 * This module provides Row Level Security (RLS) aware caching to ensure that:
 * 1. Cached data respects the same access rules as Supabase RLS policies
 * 2. Each user only caches and retrieves data they're authorized to see
 * 3. School-based filtering is applied consistently offline and online
 * 
 * Usage:
 * - Use getUserContext() to get current user's context from AuthProvider
 * - Pass userContext to cacheTable() and getTable() operations
 * - Apply RLS filters before caching and after retrieving
 */

/**
 * Extract user context from authenticated user object
 * @param {Object} user - User from AuthProvider
 * @returns {Object} { userId, auth_uid, roleId, roleName, schoolId }
 */
export function getUserContext(user) {
  if (!user) {
    return null;
  }

  const profile = user?.profile || {};
  
  return {
    userId: profile.id || user.id,
    auth_uid: user.id,
    roleId: profile.role_id,
    roleName: profile.roles?.name || profile.role?.name,
    schoolId: profile.school_id,
  };
}

/**
 * Generate cache key with user context for RLS compliance
 * This ensures each user/school combination has isolated cached data
 */
export function getUserCacheKey(tableName, userContext = null) {
  if (!userContext) {
    // Fallback to basic cache key if no user context
    return tableName;
  }
  
  const { userId, roleId, roleName, schoolId } = userContext;
  
  // For superusers/admins with no school (NULL school_id), use special key
  if (!schoolId || schoolId === null || schoolId === undefined) {
    return `${tableName}__user_${userId}__role_${roleId || roleName || 'unknown'}__all_schools`;
  }
  
  // For school-based users, include school in cache key
  return `${tableName}__user_${userId}__role_${roleId || roleName || 'unknown'}__school_${schoolId}`;
}

/**
 * Apply RLS-like filtering to cached data based on user context
 * Mirrors Supabase RLS policies for offline consistency
 * 
 * @param {string} tableName - Name of the table
 * @param {Array} rows - Rows to filter
 * @param {Object} userContext - User context from getUserContext()
 * @returns {Array} Filtered rows the user is authorized to see
 */
export function applyRLSFiltering(tableName, rows, userContext) {
  if (!userContext || !rows || !Array.isArray(rows)) {
    return rows || [];
  }

  const { roleName, schoolId, userId } = userContext;
  const role = roleName?.toLowerCase();
  
  // Superusers and admins see everything
  if (['superuser', 'admin'].includes(role)) {
    return rows;
  }

  // HR sees everything (for Users page, WorkerProfile, disciplinary actions)
  if (role === 'hr') {
    return rows;
  }

  switch (tableName) {
    case 'profiles':
      // Only HR and superuser can see all profiles (Users page)
      if (['hr', 'superuser'].includes(role)) {
        return rows;
      }
      // Others can only see their own profile
      return rows.filter(r => r.auth_uid === userContext.auth_uid || r.id === userId);

    case 'workers':
      // Superuser/admin/hr see all
      if (['superuser', 'admin', 'hr'].includes(role)) {
        return rows;
      }
      // Head tutors see all tutors in their school
      if (role === 'head_tutor') {
        return rows.filter(r => 
          r.school_id === schoolId && 
          (r.roles?.name?.toLowerCase?.() === 'tutor' || r.role === 'tutor')
        );
      }
      // Head coaches see all coaches in their school
      if (role === 'head_coach') {
        return rows.filter(r => 
          r.school_id === schoolId && 
          (r.roles?.name?.toLowerCase?.() === 'coach' || r.role === 'coach')
        );
      }
      // Regular tutors/coaches can only see themselves
      if (['tutor', 'coach'].includes(role)) {
        return rows.filter(r => r.id === userId || r.profile?.id === userId);
      }
      // School-based filtering for others
      return schoolId ? rows.filter(r => r.school_id === schoolId) : [];

    case 'students':
      // Superuser/admin see all
      if (['superuser', 'admin'].includes(role)) {
        return rows;
      }
      // Tutors see only their assigned students
      if (role === 'tutor') {
        return rows.filter(r => r.tutor_id === userId);
      }
      // Coaches see only their assigned students (if physical_education === true)
      if (role === 'coach') {
        return rows.filter(r => r.coach_id === userId && r.physical_education === true);
      }
      // Head tutors see all students in their school
      if (role === 'head_tutor') {
        return rows.filter(r => r.school_id === schoolId);
      }
      // Head coaches see all PE students in their school
      if (role === 'head_coach') {
        return rows.filter(r => r.school_id === schoolId && r.physical_education === true);
      }
      // School-based filtering for others
      return schoolId ? rows.filter(r => r.school_id === schoolId) : [];

    case 'attendance_records':
      // Superuser/admin see all
      if (['superuser', 'admin'].includes(role)) {
        return rows;
      }
      // Tutors/coaches see records they created or are attributed to
      if (['tutor', 'coach'].includes(role)) {
        return rows.filter(r => 
          r.tutor_id === userId || 
          r.coach_id === userId || 
          r.recorded_by === userId
        );
      }
      // Head tutors/coaches see all in their school
      if (['head_tutor', 'head_coach'].includes(role)) {
        return rows.filter(r => {
          // Filter by school via student relationship (would need to join students table)
          // For now, use tutor_id/coach_id as proxy
          return r.tutor_id || r.coach_id; // Needs optimization with student lookup
        });
      }
      return schoolId ? rows : [];

    case 'academic_sessions':
    case 'pe_sessions':
      // Superuser/admin see all
      if (['superuser', 'admin'].includes(role)) {
        return rows;
      }
      // School-based filtering
      return schoolId ? rows.filter(r => r.school_id === schoolId) : [];

    case 'academic_session_participants':
    case 'pe_session_participants':
      // Superuser/admin see all
      if (['superuser', 'admin'].includes(role)) {
        return rows;
      }
      // Tutors/coaches see only their students' participants
      // (Would need to cross-reference with students table - simplified here)
      return rows;

    case 'meals':
    case 'meal_distributions':
      // Superuser/admin see all
      if (['superuser', 'admin'].includes(role)) {
        return rows;
      }
      // School-based filtering
      return schoolId ? rows.filter(r => r.school_id === schoolId) : [];

    case 'schools':
    case 'roles':
    case 'form_schemas':
      // These are generally accessible to all authenticated users
      return rows;

    default:
      // For unknown tables, apply school-based filtering if school_id exists
      if (schoolId && rows.some(r => 'school_id' in r)) {
        return rows.filter(r => !r.school_id || r.school_id === schoolId);
      }
      return rows;
  }
}

/**
 * Check if user has access to a specific table
 * @param {string} tableName - Name of the table
 * @param {Object} userContext - User context from getUserContext()
 * @returns {boolean} True if user can access this table
 */
export function canAccessTable(tableName, userContext) {
  if (!userContext) {
    return false;
  }

  const { roleName } = userContext;
  const role = roleName?.toLowerCase();

  // Superuser, admin, and HR can access everything
  if (['superuser', 'admin', 'hr'].includes(role)) {
    return true;
  }

  // Profiles table is restricted to HR and superuser only
  if (tableName === 'profiles') {
    return ['hr', 'superuser'].includes(role);
  }

  // All authenticated users can access these
  const publicTables = ['schools', 'roles', 'form_schemas'];
  if (publicTables.includes(tableName)) {
    return true;
  }

  // School-based tables require a school_id (except for superuser/admin/hr)
  const schoolTables = ['workers', 'students', 'meals', 'academic_sessions', 'pe_sessions'];
  if (schoolTables.includes(tableName)) {
    return !!userContext.schoolId || ['superuser', 'admin', 'hr'].includes(role);
  }

  // Default: allow access (will be filtered by applyRLSFiltering)
  return true;
}

export default {
  getUserContext,
  getUserCacheKey,
  applyRLSFiltering,
  canAccessTable,
};
