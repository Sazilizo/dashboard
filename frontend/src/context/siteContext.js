import React from "react";
import { createContext, useState, useContext } from "react";

const SiteContext = createContext();

export const SiteProvider = ({ children }) => {
  const [selectedSite, setSelectedSite] = useState("all"); // or site id

  return (
    <SiteContext.Provider value={{ selectedSite, setSelectedSite }}>
      {children}
    </SiteContext.Provider>
  );
};

export const useSite = () => useContext(SiteContext);