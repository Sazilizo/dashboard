import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";


console.log("supabaseUrl",process.env.REACT_APP_SUPABASE_URL)
console.log("supabaseAnonKey",process.env.REACT_APP_SUPABASE_ANON_KEY)


const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
