import { useSite } from '../context/siteContext';
import { useEffect, useState } from 'react';
// import axios from 'axios';

const Dashboard = () => {
  const { selectedSite } = useSite();
//   const [data, setData] = useState({});

//   useEffect(() => {
//     const url =
//       selectedSite === "all"
//         ? "/api/dashboard/summary"
//         : `/api/dashboard/summary?site_id=${selectedSite}`;

//     axios.get(url).then((res) => setData(res.data));
//   }, [selectedSite]);

  return (
    <div>
      {/* <h2>Dashboard for: {selectedSite === "all" ? "All Sites" : selectedSite}</h2>
      <p>Schools: {data.totalSchools}</p>
      <p>Students: {data.totalStudents}</p>
      <p>Tutors: {data.totalTutors}</p> */}
    </div>
  );
};
export default Dashboard;