import React,{ useEffect, useState } from "react";
import { useSite } from "../context/siteContext";
// import axios from "axios";

const SiteSelector = () => {
  const { selectedSite, setSelectedSite } = useSite();
  const [sites, setSites] = useState([]);

//   useEffect(() => {
//     axios.get("/api/sites").then((res) => {
//       setSites(res.data);
//     });
//   }, []);

  return (
    <div className="site-selector">
      <label htmlFor="site">Select Site: </label>
      <select
        id="site"
        value={selectedSite}
        onChange={(e) => setSelectedSite(e.target.value)}
      >
        <option value="all">All Sites</option>
        <option value="heideveld">Heideveld</option>
        <option value="vanguard">Vanguard</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SiteSelector;
