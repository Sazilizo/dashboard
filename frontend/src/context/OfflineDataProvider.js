import React, { createContext, useContext, useState } from "react";

const OfflineDataContext = createContext();

export function OfflineDataProvider({ children }) {
  const [tables, setTables] = useState({});

  const updateTable = (name, rows) => {
    setTables((prev) => ({ ...prev, [name]: rows }));
  };

  return (
    <OfflineDataContext.Provider value={{ tables, updateTable }}>
      {children}
    </OfflineDataContext.Provider>
  );
}

export const useOfflineData = () => useContext(OfflineDataContext);
