import { createClient } from "@supabase/supabase-js";

// Grab env variables injected by Webpack
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// if (!supabaseUrl || !supabaseAnonKey) {
//   throw new Error(
//     "Supabase environment variables are missing! Check your .env file."
//   );
// }
console.log("Supabase URL:", process.env.REACT_APP_SUPABASE_URL);
console.log("Supabase Key:", process.env.REACT_APP_SUPABASE_ANON_KEY);

const api = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export default api;
