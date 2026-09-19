import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { baseFor } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Input, Label, Textarea } from "@/components/ui/form";

interface ProjectRow {
  id: string;
  title: string;
  stage: string;
  university_name: string;
  cluster_title: string;
}

export function ProjectListPage() {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  useEffect(() => {
    api<{ data: ProjectRow[] }>("/api/projects")
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="text-destructive">{error}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Innovation projects</h1>
      <p className="text-sm text-muted-foreground">Execution after a human-approved university match.</p>
      {rows.length === 0 && <p>No projects yet.</p>}
      {rows.map((p) => (
        <Link key={p.id} to={`${base}/projects/${p.id}`}>
          <Card className="mb-3 hover:border-secondary/40">
            <CardHeader>
              <div className="flex justify-between">
                <CardTitle>{p.title}</CardTitle>
                <Badge variant="secondary">{p.stage.replaceAll("_", " ")}</Badge>
              </div>
              <CardDescription>
                {p.university_name} · {p.cluster_title}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const { has, user } = useAuth();
  const [pack, setPack] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState("");

  async function load() {
    setPack(await api(`/api/projects/${id}`));
  }
  useEffect(() => {
    load().catch(console.error);
  }, [id]);

  if (!pack) return <p>Loading project…</p>;
  const p = pack.project as Record<string, string>;
  const impact = pack.impact as {
    name: string;
    unit: string;
    predicted_value: number | null;
    verified_value: number | null;
    verification_note: string | null;
  }[];

  async function send(e: FormEvent) {
    e.preventDefault();
    await api(`/api/projects/${id}/messages`, { method: "POST", body: JSON.stringify({ body: msg }) });
    setMsg("");
    load();
  }

  async function offer(kind: string) {
    await api(`/api/projects/${id}/offers`, {
      method: "POST",
      body: JSON.stringify({
        kind,
        organization_name: "Demo industry desk",
        amount_inr: 100000,
        expertise: "Field operations",
        interest_type: "collaboration",
        notes: "Prototype offer from the industry demo account",
      }),
    });
    load();
  }

  async function updateTask(taskId: string, status: string) {
    await api(`/api/projects/${id}/tasks/${taskId}`, { method: "POST", body: JSON.stringify({ status }) });
    setNotice("Task status saved.");
    load();
  }

  async function advanceStage() {
    const order = ["proposal", "prototype", "lab_testing", "pilot", "field_validation", "deployment", "impact_measurement", "completed"];
    const current = order.indexOf(String(p.stage));
    if (current < 0 || current === order.length - 1) return;
    await api(`/api/projects/${id}/stage`, { method: "POST", body: JSON.stringify({ stage: order[current + 1] }) });
    setNotice(`Project advanced to ${order[current + 1].replaceAll("_", " ")}.`);
    load();
  }

  async function submitIrl(e: FormEvent) {
    e.preventDefault();
    const level = Math.min(8, Number(p.irl_level || 1) + 1);
    await api(`/api/projects/${id}/irl`, { method: "POST", body: JSON.stringify({ level, evidence }) });
    setEvidence("");
    setNotice(`IRL-${level} evidence submitted for faculty review.`);
    load();
  }

  async function reviewIrl(recordId: string, status: "approved" | "changes_requested") {
    await api(`/api/projects/${id}/irl/${recordId}/review`, { method: "POST", body: JSON.stringify({ status }) });
    setNotice(`IRL evidence ${status.replaceAll("_", " ")}.`);
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-primary">{p.title}</h1>
        <p className="text-sm text-muted-foreground">
          Stage: {p.stage.replaceAll("_", " ")} · {p.university_name} · Prototype project
        </p>
      </div>
      <Card>
        <CardContent className="pt-5 text-sm">{p.summary}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Lifecycle & Innovation Readiness</CardTitle><CardDescription>Every transition is persisted, permission-checked, and logged.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Current stage: <Badge variant="secondary">{String(p.stage).replaceAll("_", " ")}</Badge> · Current IRL: <Badge variant="ai">IRL-{String(p.irl_level || 1)}</Badge></p>
          {notice && <p className="text-success" role="status">{notice}</p>}
          {has("project:write") && String(p.stage) !== "completed" && <Button size="sm" onClick={advanceStage}>Advance to next allowed stage</Button>}
          {(pack.irl as { id: string; level: number; title: string; evidence: string; status: string; submitter?: string; reviewer?: string }[]).map((r) => (
            <div key={r.id} className="rounded border p-3"><p className="font-medium">{r.title} · {r.status}</p><p className="text-muted-foreground">{r.evidence}</p><p className="text-xs text-muted-foreground">Submitted by {r.submitter || "team member"}{r.reviewer ? ` · reviewed by ${r.reviewer}` : ""}</p>{has("irl:approve") && r.status === "submitted" && <div className="mt-2 flex gap-2"><Button size="sm" variant="success" onClick={() => reviewIrl(r.id, "approved")}>Approve</Button><Button size="sm" variant="outline" onClick={() => reviewIrl(r.id, "changes_requested")}>Request changes</Button></div>}</div>
          ))}
          {has("project:write") && <form className="flex gap-2" onSubmit={submitIrl}><Input value={evidence} onChange={(e) => setEvidence(e.target.value)} minLength={8} required placeholder="Evidence for next IRL (prototype file, test note, field observation)" /><Button type="submit">Submit IRL evidence</Button></form>}
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Multidisciplinary team</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {(pack.members as { full_name: string; role_in_team: string }[]).map((m) => (
              <p key={m.full_name}>
                {m.full_name} — {m.role_in_team}
              </p>
            ))}
            {(pack.mentors as { full_name: string; faculty_title: string }[]).map((m) => (
              <p key={m.full_name}>
                Mentor: {m.full_name} ({m.faculty_title})
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {(pack.milestones as { id: string; title: string; status: string }[]).map((m) => (
              <p key={m.id}>
                <Badge variant={m.status === "done" ? "success" : m.status === "in_progress" ? "warning" : "outline"}>
                  {m.status.replaceAll("_", " ")}
                </Badge>{" "}
                {m.title}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Prototype & tests</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {(pack.prototypes as { name: string; description: string; status: string }[]).map((pr) => (
            <div key={pr.name}>
              <p className="font-medium">
                {pr.name} <Badge>{pr.status}</Badge>
              </p>
              <p className="text-muted-foreground">{pr.description}</p>
            </div>
          ))}
          {(pack.tests as { name: string; result: string; notes: string }[]).map((t) => (
            <p key={t.name}>
              <strong>{t.name}:</strong> {t.result} <span className="text-muted-foreground">({t.notes})</span>
            </p>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tasks</CardTitle><CardDescription>Team work is stored against project milestones.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">{(pack.tasks as { id: string; title: string; status: string; notes?: string }[]).map((t) => <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"><span><Badge variant={t.status === "done" ? "success" : t.status === "review" ? "warning" : "outline"}>{t.status.replaceAll("_", " ")}</Badge> {t.title}</span>{has("project:write") && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => updateTask(t.id, "in_progress")}>Start</Button><Button size="sm" variant="outline" onClick={() => updateTask(t.id, "review")}>Request review</Button><Button size="sm" variant="success" onClick={() => updateTask(t.id, "done")}>Done</Button></div>}</div>)}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pilot</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {(pack.pilots as { location: string; status: string; beneficiaries_estimate: number }[]).map((pi) => (
            <p key={pi.location}>
              {pi.location} — {pi.status} · estimated households {pi.beneficiaries_estimate} (predicted scale)
            </p>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Industry / CSR collaboration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {(pack.funding as { organization_name: string; amount_inr: number; status: string; notes: string }[]).map((f) => (
            <p key={f.organization_name}>
              Funding: ₹{f.amount_inr.toLocaleString("en-IN")} from {f.organization_name} ({f.status}) — {f.notes}
            </p>
          ))}
          {(pack.mentorship as { from_name: string; expertise: string; status: string }[]).map((m) => (
            <p key={m.from_name}>
              Mentorship: {m.from_name} — {m.expertise} ({m.status})
            </p>
          ))}
          {has("industry:offer") && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => offer("funding")}>
                Propose funding
              </Button>
              <Button size="sm" variant="outline" onClick={() => offer("mentorship")}>
                Offer mentorship
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Impact — predicted vs verified</CardTitle>
          <CardDescription>Never treat a predicted number as an audited result.</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={impact.map((i) => ({
                name: i.name,
                predicted: Number(i.predicted_value ?? 0),
                verified: Number(i.verified_value ?? 0),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="predicted" fill="#94a3b8" name="Predicted" />
              <Bar dataKey="verified" fill="#15803d" name="Verified" />
            </BarChart>
          </ResponsiveContainer>
          <ul className="mt-3 text-sm space-y-1">
            {impact.map((i) => (
              <li key={i.name}>
                {i.name} ({i.unit}): predicted {i.predicted_value ?? "—"} · verified {i.verified_value ?? "not yet"} —{" "}
                {i.verification_note}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Team messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm mb-3">
            {(pack.messages as { full_name: string; body: string }[]).map((m, i) => (
              <p key={i}>
                <strong>{m.full_name}:</strong> {m.body}
              </p>
            ))}
          </div>
          {has("project:write") && (
            <form onSubmit={send} className="flex gap-2">
              <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write to the team" />
              <Button type="submit">Send</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ImpactPage() {
  const { user } = useAuth();
  const base = baseFor(user?.role_id);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  useEffect(() => {
    api<{ data: ProjectRow[] }>("/api/projects").then((r) => setProjects(r.data));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">Measured impact</h1>
      <p className="text-sm text-muted-foreground">
        Open a project to compare predicted vs verified metrics. This page lists active innovation projects only
        (prototype data).
      </p>
      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>
              <Link to={`${base}/projects/${p.id}`} className="hover:underline">
                {p.title}
              </Link>
            </CardTitle>
            <CardDescription>Stage {p.stage.replaceAll("_", " ")}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
