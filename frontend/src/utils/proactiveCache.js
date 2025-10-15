import api from "../api/client";
import { cacheTable } from "./tableCache";

// Fetch and cache form_schemas on app start when online. This is safe to call
// repeatedly; it simply refreshes the cached table.
export async function cacheFormSchemasIfOnline() {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return; // don't try while offline
    }
    const tablesToCache = ["form_schemas", "schools", "workers", "students", "meals"];
    for (const table of tablesToCache) {
      try {
        const { data, error } = await api.from(table).select("*");
        if (error) {
          console.info(`[proactiveCache] failed to fetch ${table}:`, error.message || error);
          continue;
        }
        if (Array.isArray(data)) {
          await cacheTable(table, data);
          console.info(`[proactiveCache] cached ${table} (rows: ${data.length})`);
        }
      } catch (err) {
        console.warn(`[proactiveCache] unexpected error fetching ${table}:`, err);
      }
    }
  } catch (err) {
    console.warn("[proactiveCache] unexpected error:", err);
  }
}

export default cacheFormSchemasIfOnline;
