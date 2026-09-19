import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage, RegisterPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ChallengeDetailPage, ChallengeListPage, ChallengeNewPage } from "@/pages/ChallengePages";
import { ClusterDetailPage, ClusterListPage } from "@/pages/ClusterPages";
import { ImpactPage, ProjectDetailPage, ProjectListPage } from "@/pages/ProjectPages";
import { AdminPage, IndustryPage, MapPage, NotificationsPage, UniversitiesPage } from "@/pages/OtherPages";
import { ChallengeWizard } from "@/pages/ChallengeWizard";
import { homeFor } from "@/lib/paths";
import { AboutPage, PublicChallengePage, PublicChallengesPage } from "@/pages/PublicPages";

function Guard() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-muted-foreground">Loading session…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user?.role_id)} replace />;
}

function RoleArea() {
  const { role } = useParams();
  const { user } = useAuth();
  const roleKey = role === "university" ? "university_admin" : role;
  if (roleKey !== user?.role_id && user?.role_id !== "admin") return <Navigate to={homeFor(user?.role_id)} replace />;
  return <AppLayout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/challenges" element={<PublicChallengesPage />} />
      <Route path="/challenge/:id" element={<PublicChallengePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/app" element={<Guard />}>
        <Route element={<AppLayout />}>
          <Route index element={<RoleHome />} />
          <Route path="challenges" element={<ChallengeListPage />} />
          <Route path="challenges/new" element={<ChallengeNewPage />} />
          <Route path="challenges/:id" element={<ChallengeDetailPage />} />
          <Route path="clusters" element={<ClusterListPage />} />
          <Route path="clusters/:id" element={<ClusterDetailPage />} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="universities" element={<UniversitiesPage />} />
          <Route path="industry" element={<IndustryPage />} />
          <Route path="impact" element={<ImpactPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route element={<Guard />}>
        <Route path="/:role" element={<RoleArea />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="challenges" element={<ChallengeListPage />} />
          <Route path="challenges/new" element={<ChallengeWizard />} />
          <Route path="challenges/:id" element={<ChallengeDetailPage />} />
          <Route path="clusters" element={<ClusterListPage />} />
          <Route path="clusters/:id" element={<ClusterDetailPage />} />
          <Route path="matches" element={<ClusterListPage />} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="team" element={<ProjectListPage />} />
          <Route path="tasks" element={<ProjectListPage />} />
          <Route path="reviews" element={<ProjectListPage />} />
          <Route path="interests" element={<ProjectListPage />} />
          <Route path="collaborations" element={<ProjectListPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="analytics" element={<DashboardPage />} />
          <Route path="universities" element={<UniversitiesPage />} />
          <Route path="industry" element={<IndustryPage />} />
          <Route path="impact" element={<ImpactPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<DashboardPage />} />
          <Route path="users" element={<AdminPage />} />
          <Route path="institutions" element={<UniversitiesPage />} />
          <Route path="industries" element={<IndustryPage />} />
          <Route path="settings" element={<AdminPage />} />
          <Route path="audit" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
