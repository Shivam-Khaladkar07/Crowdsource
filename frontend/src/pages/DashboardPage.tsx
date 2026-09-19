import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { baseFor } from "@/lib/paths";

interface Dash {
  counts: Record<string, string>;
  byDistrict: { district: string; count: number }[];
  byCategory: { name: string; count: number }[];
  pipeline: { status: string; count: number }[];
  attention?: {
    unvalidated: { id: string; title: string; district: string; priority_score: number | null }[];
    delayed: { id: string; title: string; stage: string }[];
    awaiting_university: { id: string; university_name: string; cluster_title: string }[];
  };
  provenance: string;
}

export function DashboardPage() {
  const { user, has } = useAuth();
  const base = baseFor(user?.role_id);
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dash>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!data) return <p className="text-muted-foreground">Loading overview…</p>;

  const cards = [
    ["Challenges", data.counts.challenges],
    ["Validated", data.counts.validated],
    ["Clusters", data.counts.clusters],
    ["Projects", data.counts.projects],
    ["Pilots", data.counts.pilots],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Overview</h1>
          <p className="text-sm text-muted-foreground">{data.provenance}</p>
        </div>
        <div className="flex gap-2">
          {has("challenge:create") && (
            <Button asChild>
              <Link to={`${base}/challenges/new`}>Report a challenge</Link>
            </Button>
          )}
          {has("challenge:validate") && (
            <Button variant="outline" asChild>
              <Link to={`${base}/challenges`}>Review queue</Link>
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm">
        Signed in as <strong>{user?.full_name}</strong>{" "}
        {user?.is_demo && <Badge variant="warning">Demo account</Badge>} — role{" "}
        <span className="capitalize">{user?.role_id.replaceAll("_", " ")}</span>
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map(([k, v]) => (
          <Card key={k}>
            <CardHeader>
              <CardDescription>{k}</CardDescription>
              <CardTitle className="text-2xl">{v}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Challenges by district</CardTitle>
            <CardDescription>Prototype counts only</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byDistrict}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="district" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
            <CardDescription>Prototype counts only</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byCategory} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pipeline status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data.pipeline.map((p) => (
            <Badge key={p.status} variant="outline">
              {p.status.replaceAll("_", " ")}: {p.count}
            </Badge>
          ))}
        </CardContent>
      </Card>
      {user?.role_id === "government" && data.attention && (
        <div className="grid lg:grid-cols-3 gap-4">
          <AttentionCard title="High-priority validation queue" empty="No challenges await validation." items={data.attention.unvalidated.map((x) => ({ label: x.title, detail: `${x.district} · score ${x.priority_score ?? "—"}`, to: `${base}/challenges/${x.id}` }))} />
          <AttentionCard title="Projects before pilot" empty="No early-stage projects need attention." items={data.attention.delayed.map((x) => ({ label: x.title, detail: x.stage.replaceAll("_", " "), to: `${base}/projects/${x.id}` }))} />
          <AttentionCard title="Institutions awaiting action" empty="No institutional responses are awaiting action." items={data.attention.awaiting_university.map((x) => ({ label: x.university_name, detail: x.cluster_title, to: `${base}/clusters` }))} />
        </div>
      )}
    </div>
  );
}

function AttentionCard({ title, empty, items }: { title: string; empty: string; items: { label: string; detail: string; to: string }[] }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{items.length === 0 ? <p className="text-muted-foreground">{empty}</p> : items.map((i) => <Link key={`${i.to}-${i.label}`} to={i.to} className="block rounded border p-2 hover:bg-accent"><strong>{i.label}</strong><span className="block text-xs text-muted-foreground">{i.detail}</span></Link>)}</CardContent></Card>;
}
