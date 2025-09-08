// src/App.js
import React from "react";
import { RouterProvider } from "react-router-dom";
import router from "./router"; 
import { AuthProvider } from "./context/AuthProvider";
import { SchoolsProvider } from "./context/SchoolsContext";
import { FilterProvider } from "./context/FiltersContext";
import "./styles/main.css";

function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <SchoolsProvider>
          <RouterProvider router={router} />
        </SchoolsProvider>
      </FilterProvider>
    </AuthProvider>
 )
}

export default App;
