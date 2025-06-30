import React from "react";
import { SiteProvider } from './context/siteContext';
import Dashboard from './components/dashboard';
// import Students from './components/Students';
import SiteSelector from './components/siteSelector';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <SiteProvider>
      <BrowserRouter>
        <div className="layout">
          <SiteSelector />
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            {/* <Route path="/students" element={<Students />} /> */}
          </Routes>
        </div>
      </BrowserRouter>
    </SiteProvider>
  );
}

export default App;