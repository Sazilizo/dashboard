import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import DashboardLayout from "./pages/Dashboard";
import DashboardHome from "./pages/DashboardHome";
import StudentList from "./components/lists/StudentList";
import StudentForm from "./components/forms/StudentForm";
import LearnerProfile from "./components/profiles/LearnerProfile";
import UpdateLearnerProfile from "./components/updates/UpdateLearnerProfile";
import LearnerAttendanceCalendar from "./components/profiles/LearnerAttendance";
import WorkerList from "./components/lists/WorkerList";
import WorkerForm from "./components/forms/WorkerForm";
import DynamicForm from "./utils/dynamicForm";
import SessionList from "./components/lists/SessionList";
import SessionForm from "./components/forms/SessionForm";
import BulkUploadSessions from "./components/forms/BulkUploadSessions";
import TrainingList from "./components/lists/TrainingList";
import TrainingForm from "./components/forms/TrainingForm";
import MealList from "./components/lists/MealList";
import MealForm from "./components/forms/MealForm";
import DistributeMealForm from "./components/forms/DistributeMealForm";
import SchoolsDashboard from "./pages/SchoolsDashboard";
import SchoolProfile from "./components/profiles/schoolProfile";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import LandingPage from "./pages/LandingPage";
import SessionMarkingForm from "./components/forms/SessionMarkingForm";
import Users from "./components/lists/Users";
import OfflineSettings from "./components/Settings/OfflineSettings";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import IndividualSessionForm from "./components/forms/IndividualSession";
import WorkerProfile from "./components/profiles/WorkerProfile";
import DynamicBulkForm from "./components/forms/DynamicBulkForm";
import UpdateWorkerProfile from "./components/updates/UpdateWorkerProfile";
import RecordSessionForm from "./components/forms/RecordSessionForm";

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "/login",
    element: (
      <ProtectedRoute redirectIfAuthenticated={true}>
        <Login />
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundary />,
  },
  { 
    path: "register", 
    element: (
      <ProtectedRoute redirectIfAuthenticated={true}>
        <Register />
      </ProtectedRoute>
    ) 
  },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <DashboardHome /> },

      {
        path: "schools",
        errorElement: <ErrorBoundary />,
        children: [
          { index: true, element: <SchoolsDashboard /> },
          { path: ":id", element: <SchoolProfile /> },
        ],
      },

      {
        path: "students/",
        errorElement: <ErrorBoundary />,
        children: [
          { index: true, element: <StudentList /> },
          { path: "create", element: <StudentForm /> },
          { path: ":id", element: <LearnerProfile /> },
          { path: "attandance/:id", element: <LearnerAttendanceCalendar /> },
          { path: "update/:id", element: <UpdateLearnerProfile /> },
          { path: "deleted", element: <StudentList deleted /> },
        ],
      },

      {
        path: "workers",
        errorElement: <ErrorBoundary />,
        children: [
          { index: true, element: <WorkerList /> },
          { path: "create", element: <WorkerForm /> },
          { path: ":id", element:<WorkerProfile />},
          { path: "update/:id", element: <UpdateWorkerProfile /> },
          { path: ":id/edit", element: <DynamicForm model="Worker" mode="edit" /> },
          { path: "deleted", element: <WorkerList deleted /> },
          {path: "users", element:<Users/>}
        ],
      },

      {
        path: "sessions",
        errorElement: <ErrorBoundary />,
        children: [
          { index: true, element: <SessionList /> },
          { path: "create", element: <SessionForm /> },
          { path: "create/single/:id", element: <SessionForm/>},
          { path: ":id/edit", element: <DynamicForm mode="edit" /> },
          { path: "bulk-upload", element: <BulkUploadSessions /> },
          { path: "record/:id", element: <SessionForm /> },
          { path: "mark", element:<RecordSessionForm/>},
          { path: "mark/:id", element:<SessionMarkingForm/>},
        ],
      },

      {
        path: "trainings",
        errorElement: <ErrorBoundary />,
        children: [
          { index: true, element: <TrainingList /> },
          { path: "create", element: <TrainingForm /> },
          { path: ":id/edit", element: <DynamicForm mode="edit" /> },
        ],
      },

      {
        path: "meals",
        errorElement: <ErrorBoundary />,
        children: [
          { index: true, element: <MealList /> },
          { path: "create", element: <MealForm /> },
          { path: "distribute/:id", element: <DistributeMealForm /> },
        ],
      },

      { path: "register", element: <Register /> },
  { path: "logout", element: <Logout /> },
  { path: "settings", element: <OfflineSettings /> },

      { path: "*", element: <Navigate to="/dashboard" /> },
    ],
  },
]);

export default router;
