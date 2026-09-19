import { Router } from "express";
import { body } from "express-validator";
import { v4 as uuid } from "uuid";
import { query, queryOne } from "../db/index.js";
import { authRequired, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { handleValidation } from "../middleware/error.js";
import { audit, notify, activity } from "../services/audit.js";
import { assertTransition, irlLabel, stageToSuggestedIrl } from "../services/lifecycle.js";
import { IRL_LABELS } from "../types.js";

export const projectRouter = Router();
projectRouter.use(authRequired);

projectRouter.get("/", requirePermission("project:read"), async (_req, res) => {
  const rows = await query(
    `SELECT p.*, u.name AS university_name, cl.title AS cluster_title
     FROM projects p
     LEFT JOIN universities u ON u.id = p.university_id
     JOIN challenge_clusters cl ON cl.id = p.cluster_id
     ORDER BY p.created_at DESC`
  );
  res.json({ data: rows.rows, provenance: "DEMO / SYNTHETIC DATA" });
});

projectRouter.get("/directory/people", requirePermission("project:read"), async (_req, res) => {
  const students = await query("SELECT id, full_name, email, role_id FROM users WHERE role_id = 'student' AND is_active = TRUE");
  const faculty = await query(
    `SELECT f.id, f.title, u.full_name, u.id AS user_id FROM faculty f LEFT JOIN users u ON u.id = f.user_id`
  );
  res.json({ students: students.rows, faculty: faculty.rows });
});

projectRouter.use("/:id", async (req: AuthedRequest, res, next) => {
  if (req.method === "GET") return next();
  if (req.user?.role_id === "admin") return next();
  if (req.user?.role_id === "industry" && req.path.endsWith("/offers")) return next();
  const projectId = req.params.id as string;
  const direct = await queryOne<{ lead_user_id: string | null }>("SELECT lead_user_id FROM projects WHERE id = $1", [projectId]);
  if (!direct) return res.status(404).json({ error: "Project not found" });
  if (direct.lead_user_id === req.user?.id) return next();
  const member = await queryOne(
    `SELECT tm.id FROM team_members tm JOIN project_teams pt ON pt.id = tm.team_id
     WHERE pt.project_id = $1 AND tm.user_id = $2`,
    [projectId, req.user?.id]
  );
  const mentor = await queryOne(
    `SELECT m.id FROM mentors m JOIN faculty f ON f.id = m.faculty_id
     WHERE m.project_id = $1 AND f.user_id = $2`,
    [projectId, req.user?.id]
  );
  if (member || mentor) return next();
  return res.status(403).json({ error: "Only a project lead, assigned team member, or mentor can change this project." });
});

projectRouter.get("/:id", requirePermission("project:read"), async (req, res) => {
  const id = req.params.id as string;
  const project = await queryOne(
    `SELECT p.*, u.name AS university_name, cl.title AS cluster_title
     FROM projects p
     LEFT JOIN universities u ON u.id = p.university_id
     JOIN challenge_clusters cl ON cl.id = p.cluster_id
     WHERE p.id = $1`,
    [id]
  );
  if (!project) return res.status(404).json({ error: "Project not found" });
  const teams = await query("SELECT * FROM project_teams WHERE project_id = $1", [id]);
  const members = await query(
    `SELECT tm.*, us.full_name, us.role_id FROM team_members tm
     JOIN project_teams t ON t.id = tm.team_id
     JOIN users us ON us.id = tm.user_id
     WHERE t.project_id = $1`,
    [id]
  );
  const mentors = await query(
    `SELECT m.*, f.title AS faculty_title, us.full_name
     FROM mentors m
     JOIN faculty f ON f.id = m.faculty_id
     LEFT JOIN users us ON us.id = f.user_id
     WHERE m.project_id = $1`,
    [id]
  );
  const milestones = await query("SELECT * FROM milestones WHERE project_id = $1 ORDER BY sort_order", [id]);
  const tasks = await query(
    `SELECT t.* FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE m.project_id = $1`,
    [id]
  );
  const prototypes = await query("SELECT * FROM prototypes WHERE project_id = $1", [id]);
  const tests = await query(
    `SELECT te.* FROM tests te JOIN prototypes pr ON pr.id = te.prototype_id WHERE pr.project_id = $1`,
    [id]
  );
  const pilots = await query("SELECT * FROM pilots WHERE project_id = $1", [id]);
  const interests = await query("SELECT * FROM industry_interests WHERE project_id = $1", [id]);
  const funding = await query("SELECT * FROM funding_offers WHERE project_id = $1", [id]);
  const mentorship = await query("SELECT * FROM mentorship_offers WHERE project_id = $1", [id]);
  const impact = await query("SELECT * FROM impact_metrics WHERE project_id = $1", [id]);
  const messages = await query(
    `SELECT m.*, u.full_name FROM messages m JOIN users u ON u.id = m.user_id WHERE project_id = $1 ORDER BY m.created_at`,
    [id]
  );
  const documents = await query("SELECT * FROM documents WHERE project_id = $1", [id]);
  const irl = await query(
    `SELECT r.*, s.full_name AS submitter, rv.full_name AS reviewer
     FROM irl_records r
     LEFT JOIN users s ON s.id = r.submitted_by
     LEFT JOIN users rv ON rv.id = r.reviewed_by
     WHERE r.project_id = $1 ORDER BY r.level, r.created_at`,
    [id]
  );
  const collab = await query(
    `SELECT c.*, u.full_name FROM collaborations c JOIN users u ON u.id = c.offered_by WHERE project_id = $1 ORDER BY c.created_at`,
    [id]
  );
  const events = await query(
    `SELECT a.*, u.full_name FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entity_type = 'project' AND a.entity_id = $1 ORDER BY a.created_at`,
    [id]
  );
  res.json({
    project,
    teams: teams.rows,
    members: members.rows,
    mentors: mentors.rows,
    milestones: milestones.rows,
    tasks: tasks.rows,
    prototypes: prototypes.rows,
    tests: tests.rows,
    pilots: pilots.rows,
    industry_interests: interests.rows,
    funding: funding.rows,
    mentorship: mentorship.rows,
    impact: impact.rows,
    messages: messages.rows,
    documents: documents.rows,
    irl: irl.rows,
    collaborations: collab.rows,
    activity: events.rows,
    irl_labels: IRL_LABELS,
    provenance: "DEMO / SYNTHETIC DATA — predicted vs verified impact are labeled separately",
  });
});

projectRouter.post(
  "/",
  requirePermission("project:write"),
  body("cluster_id").isString(),
  body("title").isLength({ min: 8 }),
  body("summary").isLength({ min: 20 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const { cluster_id, university_id, title, summary } = req.body;
    const approved = await queryOne<{ university_id: string; institution_status?: string }>(
      "SELECT university_id, institution_status FROM university_matches WHERE cluster_id = $1 AND status = 'approved' AND institution_status = 'accepted' LIMIT 1",
      [cluster_id]
    );
    if (!approved) return res.status(400).json({ error: "Cluster needs a government-approved and university-accepted match first" });
    const id = uuid();
    await query(
      `INSERT INTO projects (id, cluster_id, university_id, title, summary, stage, irl_level, lead_user_id, golden_key)
       VALUES ($1,$2,$3,$4,$5,'proposal',2,$6,$7)`,
      [
        id,
        cluster_id,
        university_id ?? approved.university_id,
        title,
        summary,
        req.user!.id,
        req.body.golden_key ?? null,
      ]
    );
    const teamId = uuid();
    await query("INSERT INTO project_teams (id, project_id, name) VALUES ($1,$2,$3)", [teamId, id, "Core team"]);
    await query("INSERT INTO team_members (id, team_id, user_id, role_in_team) VALUES ($1,$2,$3,$4)", [
      uuid(),
      teamId,
      req.user!.id,
      "lead",
    ]);
    const stages = ["Problem framing", "Prototype", "Lab tests", "Pilot", "Field validation", "Deployment playbook"];
    for (let i = 0; i < stages.length; i++) {
      await query(`INSERT INTO milestones (id, project_id, title, status, sort_order) VALUES ($1,$2,$3,'pending',$4)`, [
        uuid(),
        id,
        stages[i],
        i + 1,
      ]);
    }
    await audit(req.user!.id, "project.create", "project", id);
    res.status(201).json({ id });
  }
);

projectRouter.post("/:id/stage", requirePermission("project:write"), body("stage").isString(), handleValidation, async (req: AuthedRequest, res) => {
  const project = await queryOne<{ stage: string }>("SELECT stage FROM projects WHERE id = $1", [req.params.id]);
  if (!project) return res.status(404).json({ error: "Project not found" });
  assertTransition(project.stage, req.body.stage);
  const irl = stageToSuggestedIrl(req.body.stage);
  await query("UPDATE projects SET stage = $1, irl_level = CASE WHEN COALESCE(irl_level,0) > $2 THEN irl_level ELSE $2 END WHERE id = $3", [
    req.body.stage,
    irl,
    req.params.id,
  ]);
  await audit(req.user!.id, "project.stage", "project", req.params.id as string, `${project.stage}→${req.body.stage}`);
  await activity("project", req.params.id as string, req.user!.id, "stage", `${project.stage} → ${req.body.stage}`);
  const members = await query<{ user_id: string }>(
    `SELECT tm.user_id FROM team_members tm JOIN project_teams t ON t.id = tm.team_id WHERE t.project_id = $1`,
    [req.params.id]
  );
  for (const m of members.rows) {
    await notify(m.user_id, "Project stage updated", `Now at ${req.body.stage.replaceAll("_", " ")}`, `/university/projects/${req.params.id}`);
  }
  res.json({ ok: true, stage: req.body.stage, suggested_irl: irlLabel(irl) });
});

projectRouter.post("/:id/milestones/:mid", requirePermission("project:write"), async (req, res) => {
  await query("UPDATE milestones SET status = $1 WHERE id = $2 AND project_id = $3", [
    req.body.status,
    req.params.mid,
    req.params.id,
  ]);
  res.json({ ok: true });
});

projectRouter.post(
  "/:id/prototypes",
  requirePermission("project:write"),
  body("name").isLength({ min: 4 }),
  body("description").isLength({ min: 10 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const id = uuid();
    await query("INSERT INTO prototypes (id, project_id, name, description, status) VALUES ($1,$2,$3,$4,$5)", [
      id,
      req.params.id,
      req.body.name,
      req.body.description,
      req.body.status || "in_lab",
    ]);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/pilots",
  requirePermission("project:write"),
  body("location").isLength({ min: 4 }),
  handleValidation,
  async (req, res) => {
    const id = uuid();
    await query(
      `INSERT INTO pilots (id, project_id, location, start_date, status, beneficiaries_estimate)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        req.params.id,
        req.body.location,
        req.body.start_date ?? null,
        req.body.status || "planned",
        req.body.beneficiaries_estimate ?? null,
      ]
    );
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/impact",
  requirePermission("project:write"),
  body("name").isString(),
  body("unit").isString(),
  handleValidation,
  async (req, res) => {
    const id = uuid();
    await query(
      `INSERT INTO impact_metrics (id, project_id, name, unit, predicted_value, verified_value, verification_note, measured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        req.params.id,
        req.body.name,
        req.body.unit,
        req.body.predicted_value ?? null,
        req.body.verified_value ?? null,
        req.body.verification_note ?? null,
        req.body.verified_value ? new Date().toISOString() : null,
      ]
    );
    res.status(201).json({ id, note: "Keep predicted and verified values distinct in all reports." });
  }
);

projectRouter.post(
  "/:id/messages",
  requirePermission("project:write"),
  body("body").isLength({ min: 1, max: 2000 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const id = uuid();
    await query("INSERT INTO messages (id, project_id, user_id, body) VALUES ($1,$2,$3,$4)", [
      id,
      req.params.id,
      req.user!.id,
      req.body.body,
    ]);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/offers",
  requirePermission("industry:offer"),
  body("kind").isIn(["funding", "mentorship", "interest"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const { kind } = req.body as { kind: string };
    const id = uuid();
    if (kind === "funding") {
      await query(
        `INSERT INTO funding_offers (id, project_id, organization_name, amount_inr, status, notes)
         VALUES ($1,$2,$3,$4,'proposed',$5)`,
        [id, req.params.id, req.body.organization_name, req.body.amount_inr, req.body.notes ?? "Demo offer"]
      );
    } else if (kind === "mentorship") {
      await query(
        `INSERT INTO mentorship_offers (id, project_id, from_name, expertise, status) VALUES ($1,$2,$3,$4,'open')`,
        [id, req.params.id, req.user!.full_name, req.body.expertise]
      );
    } else {
      await query(
        `INSERT INTO industry_interests (id, project_id, interest_type, notes) VALUES ($1,$2,$3,$4)`,
        [id, req.params.id, req.body.interest_type || "collaboration", req.body.notes ?? ""]
      );
    }
    await audit(req.user!.id, "industry.offer", "project", req.params.id as string, kind);
    await query(
      `INSERT INTO collaborations (id, project_id, offered_by, offer_type, notes, status) VALUES ($1,$2,$3,$4,$5,'expressed')`,
      [uuid(), req.params.id, req.user!.id, kind, req.body.notes ?? kind]
    );
    const leads = await query<{ lead_user_id: string | null }>("SELECT lead_user_id FROM projects WHERE id = $1", [req.params.id]);
    if (leads.rows[0]?.lead_user_id) {
      await notify(leads.rows[0].lead_user_id, "Industry interest", `${req.user!.full_name} offered ${kind}`, `/university/projects/${req.params.id}`);
    }
    res.status(201).json({ id, note: "Offer recorded. Funding is not guaranteed until approved." });
  }
);

projectRouter.post(
  "/:id/collaborations/:cid/decide",
  requirePermission("project:write"),
  body("status").isIn(["approved", "active", "completed", "rejected"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    await query("UPDATE collaborations SET status = $1, decided_by = $2 WHERE id = $3 AND project_id = $4", [
      req.body.status,
      req.user!.id,
      req.params.cid,
      req.params.id,
    ]);
    await audit(req.user!.id, "collaboration.decide", "project", req.params.id as string, req.body.status);
    res.json({ ok: true });
  }
);

projectRouter.post(
  "/:id/team",
  requirePermission("project:write"),
  body("user_id").isString(),
  body("role_in_team").isLength({ min: 2 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const team = await queryOne<{ id: string }>("SELECT id FROM project_teams WHERE project_id = $1 LIMIT 1", [req.params.id]);
    if (!team) return res.status(404).json({ error: "Team not found" });
    const id = uuid();
    await query("INSERT INTO team_members (id, team_id, user_id, role_in_team) VALUES ($1,$2,$3,$4)", [
      id,
      team.id,
      req.body.user_id,
      req.body.role_in_team,
    ]);
    await notify(req.body.user_id, "Added to a project team", req.body.role_in_team, `/student/projects/${req.params.id}`);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/mentors",
  requirePermission("project:write"),
  body("faculty_id").isString(),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const id = uuid();
    await query("INSERT INTO mentors (id, project_id, faculty_id, notes) VALUES ($1,$2,$3,$4)", [
      id,
      req.params.id,
      req.body.faculty_id,
      req.body.notes ?? null,
    ]);
    const fac = await queryOne<{ user_id: string | null }>("SELECT user_id FROM faculty WHERE id = $1", [req.body.faculty_id]);
    if (fac?.user_id) await notify(fac.user_id, "You were assigned as mentor", "A project needs your review.", `/faculty/projects/${req.params.id}`);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/tasks",
  requirePermission("project:write"),
  body("title").isLength({ min: 3 }),
  body("milestone_id").isString(),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const id = uuid();
    await query(
      `INSERT INTO tasks (id, milestone_id, title, assignee_id, status, notes) VALUES ($1,$2,$3,$4,'todo',$5)`,
      [id, req.body.milestone_id, req.body.title, req.body.assignee_id ?? null, req.body.notes ?? null]
    );
    if (req.body.assignee_id) {
      await notify(req.body.assignee_id, "Task assigned", req.body.title, `/student/tasks`);
    }
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/tasks/:tid",
  requirePermission("project:write"),
  body("status").isIn(["todo", "in_progress", "review", "done", "open"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    await query("UPDATE tasks SET status = $1, notes = COALESCE($2, notes) WHERE id = $3", [
      req.body.status,
      req.body.notes ?? null,
      req.params.tid,
    ]);
    if (req.body.status === "review") {
      const fac = await query<{ user_id: string }>(
        `SELECT f.user_id FROM mentors m JOIN faculty f ON f.id = m.faculty_id WHERE m.project_id = $1 AND f.user_id IS NOT NULL`,
        [req.params.id]
      );
      for (const f of fac.rows) await notify(f.user_id, "Review required", "A student requested mentor review.", `/faculty/reviews`);
    }
    res.json({ ok: true });
  }
);

projectRouter.post(
  "/:id/irl",
  requirePermission("project:write"),
  body("level").isInt({ min: 1, max: 8 }),
  body("evidence").isLength({ min: 8 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const id = uuid();
    await query(
      `INSERT INTO irl_records (id, project_id, level, title, evidence, status, submitted_by)
       VALUES ($1,$2,$3,$4,$5,'submitted',$6)`,
      [id, req.params.id, req.body.level, irlLabel(Number(req.body.level)), req.body.evidence, req.user!.id]
    );
    const fac = await query<{ user_id: string }>(
      `SELECT f.user_id FROM mentors m JOIN faculty f ON f.id = m.faculty_id WHERE m.project_id = $1 AND f.user_id IS NOT NULL`,
      [req.params.id]
    );
    for (const f of fac.rows) {
      await notify(f.user_id, "IRL evidence submitted", irlLabel(Number(req.body.level)), `/faculty/reviews`);
    }
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/irl/:rid/review",
  requirePermission("irl:approve"),
  body("status").isIn(["approved", "changes_requested"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const rec = await queryOne<{ level: number; project_id: string }>(
      "SELECT level, project_id FROM irl_records WHERE id = $1 AND project_id = $2",
      [req.params.rid, req.params.id]
    );
    if (!rec) return res.status(404).json({ error: "IRL record not found" });
    await query(
      `UPDATE irl_records SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3`,
      [req.body.status, req.user!.id, req.params.rid]
    );
    if (req.body.status === "approved") {
      await query("UPDATE projects SET irl_level = CASE WHEN COALESCE(irl_level,0) > $1 THEN irl_level ELSE $1 END WHERE id = $2", [rec.level, req.params.id]);
    }
    await audit(req.user!.id, "irl.review", "project", req.params.id as string, `${req.body.status} IRL-${rec.level}`);
    res.json({ ok: true });
  }
);

projectRouter.post(
  "/:id/tests",
  requirePermission("project:write"),
  body("prototype_id").isString(),
  body("name").isLength({ min: 3 }),
  body("result").isLength({ min: 3 }),
  handleValidation,
  async (req, res) => {
    const id = uuid();
    await query("INSERT INTO tests (id, prototype_id, name, result, notes) VALUES ($1,$2,$3,$4,$5)", [
      id,
      req.body.prototype_id,
      req.body.name,
      req.body.result,
      req.body.notes ?? "DEMO / SYNTHETIC DATA",
    ]);
    res.status(201).json({ id });
  }
);
