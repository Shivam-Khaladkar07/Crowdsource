import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, LogOut, Search, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { baseFor, homeFor, navFor } from "@/lib/paths";

const JOURNEY = [
  "Citizen",
  "AI",
  "Validation",
  "Cluster",
  "Match",
  "Team",
  "Industry",
  "Prototype",
  "Pilot",
  "Impact",
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ title?: string; name?: string; full_name?: string; id: string; status?: string; stage?: string }[] | null>(null);
  const links = navFor(user?.role_id);
  const base = baseFor(user?.role_id);

  useEffect(() => {
    api<{ data: { is_read: boolean }[] }>("/api/notifications")
      .then((r) => setUnread(r.data.filter((n) => !n.is_read).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      api<{
        challenges: { id: string; title: string; status: string }[];
        projects: { id: string; title: string; stage: string }[];
        universities: { id: string; name: string }[];
      }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => setHits([...r.challenges, ...r.projects, ...r.universities]))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r bg-white">
        <div className="p-5">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Shield className="h-5 w-5" />
            CivicForge
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Every validated challenge should have a pathway to a solution.</p>
        </div>
        <nav className="flex-1 px-3 space-y-1" aria-label="Role navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t text-xs text-muted-foreground">
          {user?.is_demo && <Badge variant="warning">Demo account</Badge>}
          <p className="mt-2 font-medium text-foreground">{user?.full_name}</p>
          <p className="capitalize">{user?.role_id.replaceAll("_", " ")}</p>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="bg-primary text-primary-foreground text-xs px-4 py-2 flex items-center justify-between gap-3">
          <span>Demo Environment — DEMO / SYNTHETIC DATA. Not official government statistics or certified ML accuracy.</span>
          <span className="hidden lg:inline opacity-80">SIH 2026 · CivicForge</span>
        </div>
        <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
          <div className="md:hidden font-semibold text-primary">CivicForge</div>
          <div className="hidden lg:flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            {JOURNEY.map((j, i) => (
              <span key={j} className="flex items-center gap-1">
                {i > 0 && <span>→</span>}
                <span>{j}</span>
              </span>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search challenges, projects…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search CivicForge"
            />
            {hits && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-card text-sm max-h-64 overflow-auto">
                {hits.length === 0 && <p className="p-3 text-muted-foreground">No matches</p>}
                {hits.map((h) => (
                  <button
                    key={h.id + (h.title || h.name || h.full_name)}
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-accent"
                    onClick={() => {
                      setQ("");
                      setHits(null);
                      if (h.status) navigate(`${base}/challenges/${h.id}`);
                      else if (h.stage) navigate(`${base}/projects/${h.id}`);
                      else navigate(`${base}/dashboard`);
                    }}
                  >
                    {h.title || h.name || h.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/notifications`)} className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-destructive text-[10px] text-white px-1">
                  {unread}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>
        <nav className="md:hidden flex overflow-x-auto gap-2 border-b bg-white px-3 py-2 text-xs">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "font-semibold text-primary" : "text-muted-foreground")}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <main className="p-4 md:p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function RoleHomeRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(homeFor(user?.role_id), { replace: true });
  }, [user, navigate]);
  return <p className="p-8 text-muted-foreground">Opening your workspace…</p>;
}
