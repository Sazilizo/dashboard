import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./pages/Dashboard";
import DashboardHome from "./pages/DashboardHome";
import StudentList from "./components/lists/StudentList";
import DynamicForm from "./utils/dynamicForm";
import WorkerList from "./components/lists/WorkerList";
import WorkerForm from "./components/forms/WorkerForm";
import SessionList from "./components/lists/SessionList";
import SessionForm from "./components/forms/SessionForm";
import TrainingList from "./components/lists/TrainingList";
import TrainingForm from "./components/forms/TrainingForm";
import BulkUploadSessions from "./components/forms/BulkUploadSessions";
import MealList from "./components/lists/MealList";
import MealForm from "./components/forms/MealForm";
import DistributeMealForm from "./components/forms/DistributeMealForm";
import RecordSessionForm from "./components/forms/RecordSessionForm";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import SchoolsDashboard from "./pages/SchoolsDashboard";
import LearnerProfile from "./components/profiles/LearnerProfile";
import SchoolProfile from "./components/profiles/schoolProfile";
import StudentForm from "./components/forms/StudentForm"

// import DynamicFormForStudents from "./utils/DynamicFormForStudents";
import DynamicBulkForm from "./components/forms/DynamicBulkForm";
import {DynamicFormForStudents} from "./utils/dynamicForm"
import UpdateLearnerProfile from "./components/updates/UpdateLearnerProfile";
// import StudentAttendace from "./components/profiles/StudentAttendance";
import LearnerAttendanceCalendar from "./components/profiles/LearnerAttendance";
export default function DashboardRoutes() {
  console.log("DashboardRoutes rendered");
  return (
    <Routes>
      <Route path="/" element={<DashboardLayout />}> 
        <Route index element={<DashboardHome />} />
        <Route path="schools" element={<SchoolsDashboard />} />
        <Route path="schools/:id" element={<SchoolProfile/>}></Route>
        <Route path="students" element={<StudentList />} />
        <Route path="students/create" element={<StudentForm />} />
        <Route path="students/:id" element={<LearnerProfile />} />
        <Route path="students/attandance/:id" element={<LearnerAttendanceCalendar/>} />
        <Route path="students/update/:id" element={<UpdateLearnerProfile/>} />
        <Route path="students/deleted" element={<StudentList deleted />} />
        <Route path="workers" element={<WorkerList />} />
        <Route path="workers/create" element={<WorkerForm />} />
        <Route path="workers/:id/edit" element={<DynamicForm model="Worker" mode="edit" id={":workerId"} />} />
        <Route path="workers/deleted" element={<WorkerList deleted />} />
        <Route path="sessions" element={<SessionList />} />
        <Route path="sessions/create" element={<SessionForm />} />
        <Route path="sessions/:id/edit" element={<DynamicForm  mode="edit" id={":sessionId"} />} />
        <Route path="sessions/bulk-upload" element={<BulkUploadSessions />} />
        <Route path="sessions/record/:id" element={<SessionForm />} />
        <Route path="trainings" element={<TrainingList />} />
        <Route path="trainings/create" element={<TrainingForm />} />
        <Route path="trainings/:id/edit" element={<DynamicForm  mode="edit" id={":trainingId"} />} />
        <Route path="meals" element={<MealList />} />
        <Route path="meals/create" element={<MealForm />} />
        <Route path="meals/distribute/:id" element={<DistributeMealForm />} />
        {/* ...other routes... */}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Route>
        <Route path="register" element={<Register />} />
        <Route path="/logout" element={<Logout />} />
    </Routes>
  );
}
