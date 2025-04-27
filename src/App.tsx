import { Suspense } from "react";
import { Navigate, Route, Routes, useRoutes } from "react-router-dom";
import routes from "tempo-routes";
import LoginForm from "./components/auth/LoginForm";
import SignUpForm from "./components/auth/SignUpForm";
import Dashboard from "./components/pages/dashboard";
import Success from "./components/pages/success";
import Home from "./components/pages/home";
import Generator from "./components/pages/generator";
import Inspiration from "./components/pages/inspiration";
import AdminTemplates from "./components/pages/AdminTemplates";
import TemplateGallery from "./components/pages/TemplateGallery";
import TemplateGenerator from "./components/pages/TemplateGenerator";
import LipsyncPage from "./components/pages/Lipsync";
import { AuthProvider, useAuth } from "../supabase/auth";
import { Toaster } from "./components/ui/toaster";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="/signup" element={<SignUpForm />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/generator"
          element={
            <PrivateRoute>
              <Generator />
            </PrivateRoute>
          }
        />
        <Route
          path="/inspiration"
          element={
            <PrivateRoute>
              <Inspiration />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/templates"
          element={
            <PrivateRoute>
              <AdminTemplates />
            </PrivateRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <PrivateRoute>
              <TemplateGallery />
            </PrivateRoute>
          }
        />
        <Route
          path="/template/:templateId"
          element={
            <PrivateRoute>
              <TemplateGenerator />
            </PrivateRoute>
          }
        />
        <Route
          path="/lipsync"
          element={
            <PrivateRoute>
              <LipsyncPage />
            </PrivateRoute>
          }
        />
        <Route path="/success" element={<Success />} />
      </Routes>
      {import.meta.env.VITE_TEMPO === "true" && useRoutes(routes)}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<p>Loading...</p>}>
        <AppRoutes />
      </Suspense>
      <Toaster />
    </AuthProvider>
  );
}

export default App;
