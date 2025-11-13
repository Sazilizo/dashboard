import React,{useEffect, useState} from "react"
import { useParams } from "react-router-dom"
import { useResourceFilters } from "../../hooks/useResouceFilters"
import FiltersPanel from "../filters/FiltersPanel"
import { useAuth } from "../../context/AuthProvider"
import PieChartStats from "../charts/PieChart"
import DashboardSummary from "../charts/DashboardSummary"
import SeoHelmet from '../../components/SeoHelmet';

const gradeOptions = ["1", "2", "3", "4", "5", "6", "7"];
const groupByOptions = ["ww", "pr", "un"];

const SchoolProfile =()=>{
    const {id} = useParams();
    const {user} = useAuth();
    const [studentCat, setStudentCat] = useState([])
    const [gradeBreakdown, setGradeBreakdown] = useState([]);

    const {
          data,
          filters,
          setFilters,
          loading,
          setLoading,
          error,
          setError
        } = useResourceFilters("/schools/summary", {
        school_id: id,
        include_details: true 
    });
    
    const school = data?.[0];
    const schools = data; // or schools.length === 1 ? schools[0] : null

    const students = school?.students


    useEffect(() => {
    if (!students || students.length === 0) return;

    const gradeMap = {};

    for (const student of students) {
        const grade = student.grade || "Unknown";
        const category = student.category || "unknown";

        if (!gradeMap[grade]) {
        gradeMap[grade] = {};
        }

        gradeMap[grade][category] = (gradeMap[grade][category] || 0) + 1;
    }

    const breakdown = Object.entries(gradeMap).map(([grade, catCounts]) => ({
        grade,
        ...catCounts
    }));

    setGradeBreakdown(breakdown);
    }, [students]);

    useEffect(()=>{
        const categoryCounts = students && students.reduce((acc, student) => {
            const category = student.category || "unknown";
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});
        if(categoryCounts !== undefined){
            setStudentCat(categoryCounts)
        }
    },[school, students])
    
    useEffect(()=>{
        console.log("filters school profile: ", filters)
    },[filters])

    const pieChartData = Object.entries(studentCat).map(([label, value]) => ({
      label,
      value,
    }));
    if (!school) return <div>No school data available</div>;

    return (
    <>
      <SeoHelmet title={`${school.name} - School Profile`} description={`Overview and statistics for ${school.name}`} />
      <div>
      <h2>Schools Dashboard</h2>
      <div className="page-filters">
        <FiltersPanel
                user={user}
                schools={schools}
                filters={filters}
                setFilters={setFilters}
                resource="schools"
                gradeOptions={gradeOptions}
                // sessionTypeOptions={sessionTypeOptions}
                groupByOptions={groupByOptions}
                showDeletedOption={["admin", "hr", "superviser"].includes(user.role)}
        />
      </div>
        <div style={{ border: "1px solid #ccc", margin: 12, padding: 12 }}>
            <h3>{school.name}</h3>
            <div>Address: {school.address || "N/A"}</div>
            <div>
            Contact: {school.contact_number || "N/A"} | {school.email || "N/A"}
            </div>
            <div>Students: {school.stats?.student_count ?? 0}</div>
            <div>Workers: {school.stats?.worker_count ?? 0}</div>
            <div>Meals: {school.stats?.meal_count ?? 0}</div>
            <div>Users: {school.stats?.user_count ?? 0}</div>
        </div>
        <div className="page-stats">
          <div className="stats-header">
            <h3>Statistics</h3>
          </div>
          <div className="stats-presentation">
            {students && students.length > 0 && (
              <>
                <div className="stats-item">
                  <PieChartStats title="Student Category Breakdown" data={pieChartData} />
                </div>
                <div className="stats-item">
                  <DashboardSummary title="Grade Category Distribution " data={gradeBreakdown} dataKey={["pr", "ww", "rw"]}/>
                </div>
              </>
            )}
          </div>
      </div>
    </div>
    </>
  );

}

export default SchoolProfile;