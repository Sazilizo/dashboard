import { createClient } from '@supabase/supabase-js';
import { createOfflineClient } from './offlineClient';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Create both online and offline-capable clients
const onlineApi = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

const api = createOfflineClient(supabaseUrl, supabaseAnonKey);

// Export the offline-capable client by default
export default api;

// Also export the online-only client for cases where we specifically need it
export { onlineApi };
