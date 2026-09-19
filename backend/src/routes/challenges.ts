import { Router } from "express";
import { body, param } from "express-validator";
import { v4 as uuid } from "uuid";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { query, queryOne } from "../db/index.js";
import { authRequired, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { handleValidation, ah } from "../middleware/error.js";
import { persistAnalysis, createChallenge } from "../services/challenges.js";
import { similarChallenges } from "../services/similarity.js";
import { computePriority } from "../services/priority.js";
import { audit, notify, activity } from "../services/audit.js";
import { GOLDEN_MAIN } from "../services/goldenDemo.js";

export const challengeRouter = Router();
challengeRouter.use(authRequired);

const uploadDir = process.env.UPLOAD_DIR || "./uploads";
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/wav",
      "audio/mp4",
      "audio/webm",
    ].includes(file.mimetype);
    if (!ok) return cb(new Error("Allowed files: JPEG, PNG, WEBP, PDF, MP4, WEBM, MP3, WAV (max 25MB)"));
    cb(null, true);
  },
});

function canReadAll(req: AuthedRequest) {
  return Boolean(req.user && (req.user.role_id !== "citizen" || req.user.permissions.includes("challenge:read_all")));
}

challengeRouter.get(
  "/",
  requirePermission("challenge:read"),
  ah(async (req: AuthedRequest, res) => {
    const { status, district, category, q, mine } = req.query;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 30)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const params: unknown[] = [];
    const where: string[] = ["1=1"];
    if (!canReadAll(req) || mine === "1") {
      params.push(req.user!.id);
      where.push(`(c.reporter_id = $${params.length} OR c.status = 'validated')`);
      if (mine === "1") {
        where[where.length - 1] = `c.reporter_id = $${params.length}`;
      }
    }
    if (status) {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }
    if (district) {
      params.push(district);
      where.push(`c.district = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`cat.slug = $${params.length}`);
    }
    if (q) {
      params.push(`%${String(q).slice(0, 80)}%`);
      where.push(`(c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
    }
    params.push(limit, offset);
    const rows = await query(
      `SELECT c.*, cat.name AS category_name, cat.slug AS category_slug, u.full_name AS reporter_name,
              (SELECT score FROM priority_scores ps WHERE ps.challenge_id = c.id ORDER BY created_at DESC LIMIT 1) AS priority_score
       FROM challenges c
       JOIN challenge_categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.reporter_id
       WHERE ${where.join(" AND ")}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows.rows, provenance: "DEMO / SYNTHETIC DATA", limit, offset });
  })
);

challengeRouter.get(
  "/geojson",
  requirePermission("challenge:read"),
  ah(async (req: AuthedRequest, res) => {
    const { district, status } = req.query;
    const rows = await query<{
      id: string;
      title: string;
      district: string;
      status: string;
      lat: number;
      lng: number;
      category_slug: string;
      severity: number;
    }>(
      `SELECT c.id, c.title, c.district, c.status, c.severity, loc.lat, loc.lng, cat.slug AS category_slug
       FROM challenge_locations loc
       JOIN challenges c ON c.id = loc.challenge_id
       JOIN challenge_categories cat ON cat.id = c.category_id
       WHERE ($1::text IS NULL OR c.district = $1)
         AND ($2::text IS NULL OR c.status = $2)`,
      [(district as string) || null, (status as string) || null]
    );
    res.json({
      type: "FeatureCollection",
      provenance: "Prototype coordinates — not official GIS · DEMO / SYNTHETIC DATA",
      features: rows.rows.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: r,
      })),
    });
  })
);

challengeRouter.get(
  "/:id",
  requirePermission("challenge:read"),
  param("id").isString(),
  ah(async (req: AuthedRequest, res) => {
    const id = req.params.id as string;
    const ch = await queryOne(
      `SELECT c.*, cat.name AS category_name, cat.slug AS category_slug, u.full_name AS reporter_name
       FROM challenges c
       JOIN challenge_categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.reporter_id
       WHERE c.id = $1`,
      [id]
    );
    if (!ch) return res.status(404).json({ error: "Challenge not found" });
    const reporterId = (ch as { reporter_id: string }).reporter_id;
    if (!canReadAll(req) && reporterId !== req.user!.id && (ch as { status: string }).status !== "validated") {
      return res.status(403).json({ error: "You can only view your own or validated challenges." });
    }
    const loc = await query("SELECT * FROM challenge_locations WHERE challenge_id = $1", [id]);
    const tags = await query("SELECT tag FROM challenge_tags WHERE challenge_id = $1", [id]);
    const media = await query("SELECT id, file_name, mime_type, url FROM challenge_media WHERE challenge_id = $1", [id]);
    const ai = await query("SELECT * FROM ai_analysis WHERE challenge_id = $1 ORDER BY created_at DESC", [id]);
    const priority = await query("SELECT * FROM priority_scores WHERE challenge_id = $1 ORDER BY created_at DESC LIMIT 3", [id]);
    const comments = await query(
      `SELECT cm.*, u.full_name FROM comments cm JOIN users u ON u.id = cm.user_id
       WHERE cm.entity_type = 'challenge' AND cm.entity_id = $1 ORDER BY cm.created_at`,
      [id]
    );
    const duplicates = await query(
      `SELECT d.*, c.title AS related_title, c.district AS related_district, c.status AS related_status
       FROM duplicate_reviews d JOIN challenges c ON c.id = d.related_challenge_id
       WHERE d.challenge_id = $1 ORDER BY d.similarity DESC`,
      [id]
    );
    const activityRows = await query(
      `SELECT a.*, u.full_name FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity_type = 'challenge' AND a.entity_id = $1 ORDER BY a.created_at`,
      [id]
    );
    let reporterSensitive = null;
    if (req.user?.permissions.includes("citizen:read_sensitive") || req.user?.id === reporterId) {
      reporterSensitive = await queryOne("SELECT district, block_or_ward, health_notes FROM citizens WHERE user_id = $1", [
        reporterId,
      ]);
    } else {
      reporterSensitive = { restricted: true, note: "Health-related citizen fields require additional permission." };
    }
    res.json({
      challenge: ch,
      locations: loc.rows,
      tags: tags.rows,
      media: media.rows,
      ai_analysis: ai.rows,
      priority: priority.rows,
      comments: comments.rows,
      similar: duplicates.rows,
      activity: activityRows.rows,
      reporter_profile: reporterSensitive,
      provenance: "DEMO / SYNTHETIC DATA",
    });
  })
);

challengeRouter.post(
  "/",
  requirePermission("challenge:create"),
  body("title").isLength({ min: 8, max: 180 }),
  body("description").isLength({ min: 20, max: 4000 }),
  body("category_slug").isString(),
  body("district").isString(),
  body("severity").isInt({ min: 1, max: 5 }),
  handleValidation,
  ah(async (req: AuthedRequest, res) => {
    const body = req.body as Record<string, unknown>;
    const title = String(body.title);
    const golden =
      /irrigation pump/i.test(title) && /voltage/i.test(String(body.description))
        ? GOLDEN_MAIN
        : (body.golden_key as string | undefined);
    const created = await createChallenge(req.user!, {
      title,
      description: String(body.description),
      category_slug: String(body.category_slug),
      district: String(body.district),
      block_or_ward: body.block_or_ward as string | undefined,
      severity: Number(body.severity),
      urgency: body.urgency ? Number(body.urgency) : undefined,
      population_estimate: body.population_estimate ? Number(body.population_estimate) : null,
      lat: body.lat ? Number(body.lat) : undefined,
      lng: body.lng ? Number(body.lng) : undefined,
      locality: body.locality as string | undefined,
      language: (body.language as string) || "en",
      impact_description: body.impact_description as string | undefined,
      golden_key: golden,
      is_demo: true,
    });
    res.status(201).json({
      id: created.id,
      ai: {
        ...created.analysis.classified,
        summary: created.analysis.summary,
        mode: created.analysis.mode,
        provider: created.analysis.provider,
        confidence_label: "Demo / system score",
      },
      priority: created.analysis.priority,
      similar: created.analysis.similar,
      note: "AI is advisory. A government officer must validate before matching.",
    });
  })
);

challengeRouter.post(
  "/:id/media",
  requirePermission("challenge:create"),
  upload.single("file"),
  ah(async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "Please attach a file." });
    const ch = await queryOne<{ reporter_id: string }>("SELECT reporter_id FROM challenges WHERE id = $1", [req.params.id]);
    if (!ch) return res.status(404).json({ error: "Challenge not found" });
    if (ch.reporter_id !== req.user!.id && req.user!.role_id !== "admin") {
      return res.status(403).json({ error: "You can only attach files to your own report." });
    }
    const ext = path.extname(req.file.originalname);
    const id = uuid();
    const url = `/uploads/${req.file.filename}${ext}`;
    fs.renameSync(req.file.path, path.join(uploadDir, `${req.file.filename}${ext}`));
    await query(
      `INSERT INTO challenge_media (id, challenge_id, file_name, mime_type, url) VALUES ($1,$2,$3,$4,$5)`,
      [id, req.params.id, req.file.originalname, req.file.mimetype, url]
    );
    await computePriority(req.params.id as string);
    res.status(201).json({ id, url });
  })
);

challengeRouter.post(
  "/:id/validate",
  requirePermission("challenge:validate"),
  body("decision").isIn(["validated", "rejected", "needs_information"]),
  body("note").optional().isLength({ max: 1000 }),
  handleValidation,
  ah(async (req: AuthedRequest, res) => {
    const id = req.params.id as string;
    const { decision, note, assigned_department, is_sensitive, category_slug } = req.body as {
      decision: string;
      note?: string;
      assigned_department?: string;
      is_sensitive?: boolean;
      category_slug?: string;
    };
    const existing = await queryOne<{ reporter_id: string; title: string }>(
      "SELECT reporter_id, title FROM challenges WHERE id = $1",
      [id]
    );
    if (!existing) return res.status(404).json({ error: "Not found" });
    let catId: string | undefined;
    if (category_slug) {
      const cat = await queryOne<{ id: string }>("SELECT id FROM challenge_categories WHERE slug = $1", [category_slug]);
      if (cat) catId = cat.id;
    }
    await query(
      `UPDATE challenges SET status = $1, updated_at = NOW(), assigned_department = COALESCE($2, assigned_department),
       is_sensitive = COALESCE($3, is_sensitive), info_request = $4, category_id = COALESCE($5, category_id)
       WHERE id = $6`,
      [decision, assigned_department ?? null, is_sensitive ?? null, decision === "needs_information" ? note ?? null : null, catId ?? null, id]
    );
    await query("UPDATE ai_analysis SET human_reviewed = TRUE WHERE challenge_id = $1", [id]);
    await query("INSERT INTO comments (id, entity_type, entity_id, user_id, body) VALUES ($1,$2,$3,$4,$5)", [
      uuid(),
      "challenge",
      id,
      req.user!.id,
      note || `Human decision: ${decision}`,
    ]);
    await audit(req.user!.id, "challenge.validate", "challenge", id, decision);
    await activity("challenge", id, req.user!.id, decision, note);
    await computePriority(id);
    await notify(existing.reporter_id, `Challenge ${decision.replaceAll("_", " ")}`, `${existing.title}`, `/citizen/challenges/${id}`);
    res.json({ ok: true, status: decision, note: "AI recommendation is advisory; this was a human decision." });
  })
);

challengeRouter.post(
  "/:id/reanalyze",
  requirePermission("challenge:read"),
  ah(async (req: AuthedRequest, res) => {
    const id = req.params.id as string;
    const ch = await queryOne<{ title: string; description: string }>(
      "SELECT title, description FROM challenges WHERE id = $1",
      [id]
    );
    if (!ch) return res.status(404).json({ error: "Not found" });
    const analysis = await persistAnalysis(id, ch.title, ch.description);
    res.json({ ...analysis.classified, summary: analysis.summary, mode: analysis.mode, similar: analysis.similar, priority: analysis.priority });
  })
);

challengeRouter.get(
  "/:id/similar",
  requirePermission("challenge:read"),
  ah(async (req, res) => {
    const data = await similarChallenges(req.params.id as string);
    res.json({
      data,
      method: "In-app cosine similarity + district/domain/time (pgvector not required)",
    });
  })
);

challengeRouter.post(
  "/:id/duplicates/:reviewId",
  requirePermission("challenge:cluster"),
  body("decision").isIn(["merge", "separate", "ignore"]),
  handleValidation,
  ah(async (req: AuthedRequest, res) => {
    const review = await queryOne<{ related_challenge_id: string; challenge_id: string }>(
      "SELECT * FROM duplicate_reviews WHERE id = $1 AND challenge_id = $2",
      [req.params.reviewId, req.params.id]
    );
    if (!review) return res.status(404).json({ error: "Review not found" });
    const decision = req.body.decision as string;
    await query("UPDATE duplicate_reviews SET decision = $1, decided_by = $2 WHERE id = $3", [
      decision,
      req.user!.id,
      req.params.reviewId,
    ]);
    if (decision === "merge") {
      const from = await queryOne<{ cluster_id: string | null }>("SELECT cluster_id FROM challenges WHERE id = $1", [
        review.related_challenge_id,
      ]);
      if (from?.cluster_id) {
        await query("UPDATE challenges SET cluster_id = $1 WHERE id = $2", [from.cluster_id, req.params.id]);
      }
    }
    await audit(req.user!.id, "duplicate.decide", "challenge", req.params.id as string, decision);
    res.json({ ok: true, note: "No automatic merge — this records your confirmed decision." });
  })
);

challengeRouter.post(
  "/:id/comments",
  requirePermission("comment:write"),
  body("body").isLength({ min: 1, max: 2000 }),
  handleValidation,
  ah(async (req: AuthedRequest, res) => {
    const id = uuid();
    await query("INSERT INTO comments (id, entity_type, entity_id, user_id, body) VALUES ($1,'challenge',$2,$3,$4)", [
      id,
      req.params.id,
      req.user!.id,
      req.body.body,
    ]);
    res.status(201).json({ id });
  })
);
