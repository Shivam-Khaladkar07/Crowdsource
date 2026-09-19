import { Router } from "express";
import { body } from "express-validator";
import { query, queryOne } from "../db/index.js";
import { authRequired, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { handleValidation } from "../middleware/error.js";
import { audit } from "../services/audit.js";

export const adminRouter = Router();
adminRouter.use(authRequired);

adminRouter.get("/settings", requirePermission("admin:settings"), async (_req, res) => {
  const rows = await query("SELECT key, value_json, description, updated_at FROM system_settings");
  res.json({ data: rows.rows });
});

adminRouter.put(
  "/settings/:key",
  requirePermission("admin:settings"),
  body("value").isObject(),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const key = req.params.key as string;
    const existing = await queryOne("SELECT key FROM system_settings WHERE key = $1", [key]);
    if (!existing) return res.status(404).json({ error: "Unknown setting" });
    await query("UPDATE system_settings SET value_json = $1, updated_at = NOW() WHERE key = $2", [
      JSON.stringify(req.body.value),
      key,
    ]);
    await audit(req.user!.id, "settings.update", "system_settings", key);
    res.json({ ok: true });
  }
);

adminRouter.get("/users", requirePermission("admin:users"), async (_req, res) => {
  const rows = await query(
    `SELECT id, email, full_name, role_id, is_demo, is_active, created_at FROM users ORDER BY created_at`
  );
  res.json({ data: rows.rows });
});

adminRouter.post("/users/:id/active", requirePermission("admin:users"), async (req: AuthedRequest, res) => {
  await query("UPDATE users SET is_active = $1 WHERE id = $2", [Boolean(req.body.is_active), req.params.id]);
  await audit(req.user!.id, "user.active", "user", req.params.id as string);
  res.json({ ok: true });
});

adminRouter.post("/users/:id/role", requirePermission("admin:users"), body("role_id").isString(), handleValidation, async (req: AuthedRequest, res) => {
  const role = await queryOne("SELECT id FROM roles WHERE id = $1", [req.body.role_id]);
  if (!role) return res.status(400).json({ error: "Unknown role" });
  await query("UPDATE users SET role_id = $1 WHERE id = $2", [req.body.role_id, req.params.id]);
  await audit(req.user!.id, "user.role", "user", req.params.id as string, req.body.role_id);
  res.json({ ok: true });
});

adminRouter.post("/demo/reset", requirePermission("demo:reset"), async (req: AuthedRequest, res) => {
  const { resetGoldenDemo } = await import("../services/goldenDemo.js");
  const result = await resetGoldenDemo(req.user!.id);
  res.json(result);
});

adminRouter.get("/search", requirePermission("search:use"), async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (q.length < 2) return res.json({ challenges: [], clusters: [], projects: [], universities: [], industries: [] });
  const like = `%${q}%`;
  const challenges = await query(
    `SELECT id, title, district, status FROM challenges WHERE title ILIKE $1 OR description ILIKE $1 LIMIT 8`,
    [like]
  );
  const clusters = await query(`SELECT id, title, district_focus FROM challenge_clusters WHERE title ILIKE $1 LIMIT 5`, [like]);
  const projects = await query(`SELECT id, title, stage FROM projects WHERE title ILIKE $1 OR summary ILIKE $1 LIMIT 5`, [like]);
  const universities = await query(`SELECT id, name, district FROM universities WHERE name ILIKE $1 LIMIT 5`, [like]);
  const industries = await query(`SELECT id, name, sector FROM industries WHERE name ILIKE $1 OR sector ILIKE $1 LIMIT 5`, [like]);
  const faculty = await query(
    `SELECT f.id, u.full_name, f.title FROM faculty f LEFT JOIN users u ON u.id = f.user_id WHERE u.full_name ILIKE $1 OR f.bio ILIKE $1 LIMIT 5`,
    [like]
  );
  res.json({
    challenges: challenges.rows,
    clusters: clusters.rows,
    projects: projects.rows,
    universities: universities.rows,
    industries: industries.rows,
    faculty: faculty.rows,
  });
});


export const catalogRouter = Router();
catalogRouter.use(authRequired);

catalogRouter.get("/categories", async (_req, res) => {
  res.json({ data: (await query("SELECT * FROM challenge_categories ORDER BY name")).rows });
});

catalogRouter.get("/universities", async (_req, res) => {
  const unis = await query("SELECT * FROM universities");
  const depts = await query("SELECT * FROM departments");
  const labs = await query("SELECT * FROM laboratories");
  const faculty = await query(
    `SELECT f.*, u.full_name FROM faculty f LEFT JOIN users u ON u.id = f.user_id`
  );
  res.json({
    universities: unis.rows,
    departments: depts.rows,
    laboratories: labs.rows,
    faculty: faculty.rows,
    provenance: "Demo institutional profiles — not official rankings",
  });
});

catalogRouter.get("/industry", async (_req, res) => {
  res.json({
    industries: (await query("SELECT * FROM industries")).rows,
    startups: (await query("SELECT * FROM startups")).rows,
    csr: (await query("SELECT * FROM csr_organizations")).rows,
    provenance: "Demo partner profiles",
  });
});

catalogRouter.get("/dashboard", async (_req, res) => {
  const counts = await queryOne<{
    challenges: string;
    validated: string;
    clusters: string;
    projects: string;
    pilots: string;
  }>(
    `SELECT
      (SELECT COUNT(*)::text FROM challenges) AS challenges,
      (SELECT COUNT(*)::text FROM challenges WHERE status = 'validated') AS validated,
      (SELECT COUNT(*)::text FROM challenge_clusters) AS clusters,
      (SELECT COUNT(*)::text FROM projects) AS projects,
      (SELECT COUNT(*)::text FROM projects WHERE stage NOT IN ('completed')) AS active_projects,
      (SELECT COUNT(*)::text FROM universities) AS heis,
      (SELECT COUNT(*)::text FROM industries) AS industry_partners,
      (SELECT COUNT(*)::text FROM prototypes) AS prototypes,
      (SELECT COUNT(*)::text FROM pilots) AS pilots,
      (SELECT COUNT(*)::text FROM pilots WHERE status IN ('active','completed')) AS deployments,
      (SELECT COALESCE(SUM(CASE WHEN verified_value IS NOT NULL THEN verified_value ELSE 0 END),0)::text FROM impact_metrics WHERE unit = 'households') AS communities_impacted`
  );
  const byDistrict = await query(
    `SELECT district, COUNT(*)::int AS count FROM challenges GROUP BY district ORDER BY count DESC`
  );
  const byCategory = await query(
    `SELECT cat.name, COUNT(*)::int AS count
     FROM challenges c JOIN challenge_categories cat ON cat.id = c.category_id
     GROUP BY cat.name ORDER BY count DESC`
  );
  const byStage = await query(`SELECT stage, COUNT(*)::int AS count FROM projects GROUP BY stage`);
  const pipeline = await query(
    `SELECT status, COUNT(*)::int AS count FROM challenges GROUP BY status`
  );
  const unvalidated = await query(
    `SELECT c.id, c.title, c.district, c.status,
            (SELECT score FROM priority_scores ps WHERE ps.challenge_id = c.id ORDER BY created_at DESC LIMIT 1) AS priority_score
     FROM challenges c WHERE c.status IN ('submitted','ai_screened','validation_pending')
     ORDER BY priority_score DESC NULLS LAST LIMIT 8`
  );
  const delayed = await query(
    `SELECT id, title, stage FROM projects WHERE stage IN ('proposal','prototype','lab_testing') ORDER BY created_at LIMIT 8`
  );
  const awaitingUni = await query(
    `SELECT m.id, u.name AS university_name, m.status, m.institution_status, cl.title AS cluster_title
     FROM university_matches m
     JOIN universities u ON u.id = m.university_id
     JOIN challenge_clusters cl ON cl.id = m.cluster_id
     WHERE m.status = 'approved' AND COALESCE(m.institution_status,'pending') = 'pending'
     LIMIT 8`
  );
  res.json({
    counts,
    byDistrict: byDistrict.rows,
    byCategory: byCategory.rows,
    byStage: byStage.rows,
    pipeline: pipeline.rows,
    attention: {
      unvalidated: unvalidated.rows,
      delayed: delayed.rows,
      awaiting_university: awaitingUni.rows,
    },
    provenance: "DEMO / SYNTHETIC DATA — not official government statistics",
  });
});

catalogRouter.get("/notifications", async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id]
  );
  res.json({ data: rows.rows });
});

catalogRouter.post("/notifications/:id/read", async (req: AuthedRequest, res) => {
  await query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.user!.id,
  ]);
  res.json({ ok: true });
});

catalogRouter.get("/roles", async (_req, res) => {
  res.json({ data: (await query("SELECT * FROM roles")).rows });
});

catalogRouter.get("/search", async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (q.length < 2) return res.json({ challenges: [], clusters: [], projects: [], universities: [], industries: [], faculty: [] });
  const like = `%${q}%`;
  res.json({
    challenges: (await query(`SELECT id, title, district, status FROM challenges WHERE title ILIKE $1 LIMIT 8`, [like])).rows,
    clusters: (await query(`SELECT id, title, district_focus FROM challenge_clusters WHERE title ILIKE $1 LIMIT 5`, [like])).rows,
    projects: (await query(`SELECT id, title, stage FROM projects WHERE title ILIKE $1 LIMIT 5`, [like])).rows,
    universities: (await query(`SELECT id, name, district FROM universities WHERE name ILIKE $1 LIMIT 5`, [like])).rows,
    industries: (await query(`SELECT id, name, sector FROM industries WHERE name ILIKE $1 LIMIT 5`, [like])).rows,
    faculty: (
      await query(
        `SELECT f.id, u.full_name, f.title FROM faculty f LEFT JOIN users u ON u.id = f.user_id WHERE COALESCE(u.full_name,'') ILIKE $1 LIMIT 5`,
        [like]
      )
    ).rows,
  });
});

catalogRouter.post("/notifications/read-all", async (req: AuthedRequest, res) => {
  await query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1", [req.user!.id]);
  res.json({ ok: true });
});
