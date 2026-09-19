import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { baseFor } from "@/lib/paths";

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: { id: string; title: string; district: string; status: string; category_slug: string };
}

export function MapPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ features: Feature[]; provenance: string }>("/api/challenges/geojson")
      .then((r) => setFeatures(r.features))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Challenge map</h1>
      <p className="text-sm text-muted-foreground">
        OpenStreetMap · prototype pins near Jharkhand districts. Coordinates are illustrative, not official GIS.
      </p>
      {error && <p className="text-destructive">{error}</p>}
      <Card>
        <CardContent className="h-[520px] p-2">
          <MapContainer center={[23.6, 85.3]} zoom={7} scrollWheelZoom>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {features.map((f) => (
              <Marker key={f.properties.id} position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}>
                <Popup>
                  <Link to={`${base}/challenges/${f.properties.id}`} className="font-medium">
                    {f.properties.title}
                  </Link>
                  <div className="text-xs">
                    {f.properties.district} · {f.properties.status} · {f.properties.category_slug}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export function UniversitiesPage() {
  const [data, setData] = useState<{
    universities: { id: string; name: string; district: string }[];
    departments: { university_id: string; name: string; domain: string }[];
    laboratories: { university_id: string; name: string; capability: string }[];
    provenance: string;
  } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>("/api/universities").then(setData);
  }, []);
  if (!data) return <p>Loading universities…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">University partners</h1>
      <p className="text-sm text-muted-foreground">{data.provenance}</p>
      {data.universities.map((u) => (
        <Card key={u.id}>
          <CardHeader>
            <CardTitle>{u.name}</CardTitle>
            <CardDescription>{u.district}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              Departments:{" "}
              {data.departments
                .filter((d) => d.university_id === u.id)
                .map((d) => `${d.name} (${d.domain})`)
                .join("; ") || "—"}
            </p>
            <p>
              Labs:{" "}
              {data.laboratories
                .filter((d) => d.university_id === u.id)
                .map((d) => `${d.name}: ${d.capability}`)
                .join("; ") || "—"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function IndustryPage() {
  const [data, setData] = useState<{
    industries: { name: string; sector: string; district: string }[];
    startups: { name: string; focus: string }[];
    csr: { name: string; focus: string }[];
    provenance: string;
  } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>("/api/industry").then(setData);
  }, []);
  if (!data) return <p>Loading partners…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Industry, startups & CSR</h1>
      <p className="text-sm text-muted-foreground">{data.provenance}</p>
      <div className="grid md:grid-cols-3 gap-4">
        {data.industries.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="text-base">{i.name}</CardTitle>
              <CardDescription>
                {i.sector} · {i.district}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
        {data.startups.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="text-base">{i.name}</CardTitle>
              <CardDescription>{i.focus}</CardDescription>
            </CardHeader>
          </Card>
        ))}
        {data.csr.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="text-base">{i.name}</CardTitle>
              <CardDescription>{i.focus}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const [rows, setRows] = useState<{ id: string; title: string; body: string; is_read: boolean; link_url?: string }[]>([]);
  const navigate = useNavigate();
  async function load() {
    const r = await api<{ data: typeof rows }>("/api/notifications");
    setRows(r.data);
  }
  useEffect(() => {
    load();
  }, []);
  async function open(n: (typeof rows)[number]) {
    if (!n.is_read) await api(`/api/notifications/${n.id}/read`, { method: "POST" });
    if (n.link_url) navigate(n.link_url);
    else load();
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold text-primary">Notifications</h1><Button variant="outline" size="sm" onClick={async () => { await api("/api/notifications/read-all", { method: "POST" }); load(); }}>Mark all read</Button></div>
      {rows.length === 0 && <p className="text-muted-foreground">No notifications.</p>}
      {rows.map((n) => (
        <Card key={n.id} className={`${n.is_read ? "opacity-70" : ""} cursor-pointer`} onClick={() => open(n)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(n); }}>
          <CardHeader>
            <CardTitle className="text-base">{n.title}</CardTitle>
            <CardDescription>{n.body}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function AdminPage() {
  const [settings, setSettings] = useState<{ key: string; value_json: string; description: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; full_name: string; role_id: string; is_demo: boolean; is_active: boolean }[]>(
    []
  );
  const [audit, setAudit] = useState<{ action: string; full_name: string; detail: string; created_at: string }[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ data: typeof settings }>("/api/admin/settings").then((r) => setSettings(r.data));
    api<{ data: typeof users }>("/api/admin/users").then((r) => setUsers(r.data));
    api<{ data: typeof audit }>("/api/admin/audit").then((r) => setAudit(r.data));
  }, []);

  async function save(key: string, raw: string) {
    try {
      await api(`/api/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ value: JSON.parse(raw) }) });
      setMsg("Saved. New reports and match runs will use these weights.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  async function resetGoldenDemo() {
    if (!window.confirm("Reset the Golden Demo irrigation workflow? Unrelated records will not be deleted.")) return;
    try {
      const result = await api<{ message: string }>("/api/admin/demo/reset", { method: "POST" });
      setMsg(result.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Golden Demo reset failed.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">System admin</h1>
      <p className="text-sm text-muted-foreground">Scoring weights are configuration, not a universal scientific formula.</p>
      {msg && <p className="text-sm text-secondary">{msg}</p>}
      <Card>
        <CardHeader><CardTitle className="text-base">Golden Demo</CardTitle><CardDescription>Admin-only; restores the irrigation workflow without deleting unrelated data.</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={resetGoldenDemo}>Reset Golden Demo</Button></CardContent>
      </Card>
      {settings.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="text-base">{s.key}</CardTitle>
            <CardDescription>{s.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <WeightEditor initial={s.value_json} onSave={(raw) => save(s.key, raw)} />
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {users.map((u) => (
            <p key={u.id}>
              {u.full_name} · {u.email} · {u.role_id}
              {u.is_demo ? " · Demo account" : ""} · {u.is_active ? "active" : "disabled"}
            </p>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 max-h-80 overflow-auto">
          {audit.map((a, i) => (
            <p key={i}>
              {a.created_at}: {a.full_name} — {a.action} {a.detail}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function WeightEditor({ initial, onSave }: { initial: string; onSave: (raw: string) => void }) {
  const [raw, setRaw] = useState(JSON.stringify(JSON.parse(initial), null, 2));
  return (
    <div className="space-y-2">
      <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="font-mono text-xs" />
      <Button size="sm" onClick={() => onSave(raw)}>
        Save JSON
      </Button>
    </div>
  );
}
