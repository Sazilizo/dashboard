import api from "../api/client";
import { cacheTable } from "./tableCache";
import { cacheAllUserImages, cacheAllStudentImages } from "./proactiveImageCache";
import { getUserContext, applyRLSFiltering, getUserCacheKey, canAccessTable } from "./rlsCache";

/**
 * Proactively cache tables with RLS-aware filtering and aggressive timeout
 * This ensures the app works offline with respect to user permissions
 * 
 * @param {Object} user - Current authenticated user from AuthProvider
 */
export async function cacheFormSchemasIfOnline(user = null) {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.info("[proactiveCache] navigator.onLine=false, skipping cache refresh");
      return;
    }

    // Get user context for RLS filtering
    const userContext = getUserContext(user);
    
    if (!userContext) {
      console.warn("[proactiveCache] No user context available, skipping RLS-aware caching");
      return;
    }

    const tablesToCache = [
      "form_schemas", 
      "roles", 
      "schools", 
      "profiles",  // HR and superuser only
      "workers", 
      "students", 
      "meals",
      "academic_sessions",
      "academic_session_participants", 
      "pe_sessions", 
      "pe_session_participants", 
      "assessments", 
      "attendance_records", 
      "meal_distributions"
    ];

    console.info(`[proactiveCache] Starting RLS-aware cache refresh for user: ${userContext.roleName} (school: ${userContext.schoolId || 'ALL'})`);

    for (const table of tablesToCache) {
      // Check if user has access to this table
      if (!canAccessTable(table, userContext)) {
        console.info(`[proactiveCache] ⊘ Skipping ${table} (no access for ${userContext.roleName})`);
        continue;
      }

      try {
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutMs = 5000;

        // Build query and attach abort signal only if supported by client version
        let query = api.from(table).select("*");
        if (typeof query?.abortSignal === "function") {
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          try {
            query = query.abortSignal(controller.signal);
            var result = await query;
          } finally {
            clearTimeout(timeoutId);
          }
        } else {
          // Fallback: emulate timeout with Promise.race when abortSignal is unavailable
          const resultPromise = Promise.resolve(query);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(Object.assign(new Error('Timeout'), { name: 'AbortError' })), timeoutMs);
          });
          var result = await Promise.race([resultPromise, timeoutPromise]);
        }
        const { data, error } = result || {};

        if (error) {
          console.warn(`[proactiveCache] failed to fetch ${table}:`, error.message || error);
          continue;
        }

        if (Array.isArray(data)) {
          // Cache with RLS filtering applied
          await cacheTable(table, data, userContext);
          
          // Log with cache key to show user-specific caching
          const cacheKey = getUserCacheKey(table, userContext);
          const filteredCount = applyRLSFiltering(table, data, userContext).length;
          console.info(`[proactiveCache] ✓ cached ${cacheKey} (${filteredCount}/${data.length} rows after RLS)`);
        }
      } catch (err) {
        // Network error or timeout - don't break the loop, just log and continue
        if (err.name === 'AbortError') {
          console.warn(`[proactiveCache] ${table} fetch timed out (5s) - using cached data`);
        } else {
          console.warn(`[proactiveCache] ${table} fetch failed:`, err.message);
        }
        // Continue to next table regardless of error
        continue;
      }
    }

    console.info("[proactiveCache] RLS-aware cache refresh complete");
    
    // Cache profile images in background (don't block)
    cacheProfileImagesInBackground();
  } catch (err) {
    console.warn("[proactiveCache] unexpected error:", err);
  }
}

/**
 * Cache profile images in background without blocking
 * This runs asynchronously after table caching completes
 */
async function cacheProfileImagesInBackground() {
  try {
    console.info("[proactiveCache] Starting background image cache...");
    
    // Wait a bit to not compete with table caching
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Always cache user images (small, flat bucket); defer student images unless explicitly enabled
    const userResults = await cacheAllUserImages();
    console.info(`[proactiveCache] User images cache complete: ${userResults.cached} cached, ${userResults.failed} failed, ${userResults.skipped} skipped`);

    const ENABLE_STUDENT_IMAGE_PREFETCH = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_PREFETCH_STUDENT_IMAGES === 'true');
    if (ENABLE_STUDENT_IMAGE_PREFETCH) {
      // Extra delay before heavy student image prefetch
      await new Promise(resolve => setTimeout(resolve, 4000));
      const studentResults = await cacheAllStudentImages();
      console.info(`[proactiveCache] Student images cache complete: ${studentResults.cached} cached, ${studentResults.failed} failed, ${studentResults.skipped} skipped`);
    } else {
      console.info("[proactiveCache] Skipping student image prefetch (REACT_APP_PREFETCH_STUDENT_IMAGES != 'true')");
    }
  } catch (err) {
    console.warn("[proactiveCache] Background image cache failed:", err);
  }
}

export default cacheFormSchemasIfOnline;