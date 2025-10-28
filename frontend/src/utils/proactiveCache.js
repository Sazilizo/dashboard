import api from "../api/client";
import { cacheTable } from "./tableCache";

/**
 * Proactively cache tables with aggressive timeout and error handling
 * This ensures the app works offline even if WiFi is connected but has no data
 */
export async function cacheFormSchemasIfOnline() {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.info("[proactiveCache] navigator.onLine=false, skipping cache refresh");
      return;
    }

    const tablesToCache = [
      "form_schemas", 
      "roles", 
      "schools", 
      "profiles",  // Added for Users list component
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

    console.info(`[proactiveCache] Starting cache refresh for ${tablesToCache.length} tables...`);

    for (const table of tablesToCache) {
      try {
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per table

        const { data, error } = await api.from(table).select("*").abortSignal(controller.signal);
        
        clearTimeout(timeoutId);

        if (error) {
          console.warn(`[proactiveCache] failed to fetch ${table}:`, error.message || error);
          continue;
        }

        if (Array.isArray(data)) {
          await cacheTable(table, data);
          console.info(`[proactiveCache] ✓ cached ${table} (${data.length} rows)`);
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

    console.info("[proactiveCache] Cache refresh complete");
  } catch (err) {
    console.warn("[proactiveCache] unexpected error:", err);
  }
}

export default cacheFormSchemasIfOnline;