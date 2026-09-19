import { v4 as uuid } from "uuid";
import { query, queryOne } from "../db/index.js";
import { getAIProvider } from "../ai/index.js";
import { computePriority } from "./priority.js";

export const GOLDEN_RELATED = "irrigation-voltage-related";
export const GOLDEN_MAIN = "irrigation-voltage-main";

async function userId(email: string) {
  const row = await queryOne<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  return row?.id;
}

export async function ensureGoldenRelated() {
  const existing = await queryOne("SELECT id FROM challenges WHERE golden_key = $1 LIMIT 1", [GOLDEN_RELATED]);
  if (existing) return;
  const citizen = await userId("citizen@demo.in");
  if (!citizen) return;
  const agri = await queryOne<{ id: string }>("SELECT id FROM challenge_categories WHERE slug = 'agriculture'");
  if (!agri) return;
  const ai = getAIProvider();
  const rows = [
    {
      title: "Borewell pump trips during evening load-shedding in Giridih",
      description:
        "Farmers in Bengabad say irrigation pumps stop when village voltage drops in the evening. Standing crop in two hamlets is stressed. They need a reliable stabilizer or solar-assist option that a local mechanic can service.",
      district: "Giridih",
      block: "Bengabad",
      lat: 24.18,
      lng: 86.3,
    },
    {
      title: "Voltage drop burns irrigation motors in Palamu hamlets",
      description:
        "Three neighbouring villages report irrigation motors overheating because of voltage fluctuation. Crop watering is delayed. Request an engineering team to design a shared protection unit for pump-sets.",
      district: "Palamu",
      block: "Patan",
      lat: 24.18,
      lng: 84.15,
    },
  ];
  for (const r of rows) {
    const id = uuid();
    await query(
      `INSERT INTO challenges (id, title, description, category_id, reporter_id, status, district, block_or_ward, severity, urgency, population_estimate, is_demo, golden_key, impact_description, language)
       VALUES ($1,$2,$3,$4,$5,'validated',$6,$7,4,4,1800,TRUE,$8,$9,'en')`,
      [
        id,
        r.title,
        r.description,
        agri.id,
        citizen,
        r.district,
        r.block,
        GOLDEN_RELATED,
        "Crop stress and delayed watering when pumps stop.",
      ]
    );
    await query(
      `INSERT INTO challenge_locations (id, challenge_id, district, locality, lat, lng) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), id, r.district, r.block, r.lat, r.lng]
    );
    const classified = await ai.classify(`${r.title} ${r.description}`);
    await query(
      `INSERT INTO ai_analysis (id, challenge_id, provider, mode, category_slug, secondary_slug, sub_domain, summary, suggested_tags, skills_json, technologies_json, pipeline_json, confidence, confidence_label, human_reviewed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE)`,
      [
        uuid(),
        id,
        ai.name,
        ai.mode,
        classified.categorySlug,
        classified.secondarySlug ?? null,
        classified.subDomain ?? null,
        classified.summary,
        JSON.stringify(classified.suggestedTags),
        JSON.stringify(classified.skills),
        JSON.stringify(classified.technologies),
        JSON.stringify(classified.pipeline),
        classified.confidence,
        "Demo / system score — not a measured ML accuracy",
      ]
    );
    const embedding = await ai.embed(`${r.title} ${r.description}`);
    await query(`INSERT INTO ai_embeddings (id, challenge_id, vector_json, provider) VALUES ($1,$2,$3,$4)`, [
      uuid(),
      id,
      JSON.stringify(embedding),
      ai.name,
    ]);
    await computePriority(id);
  }
}

export async function resetGoldenDemo(actorId: string) {
  const mains = (await query<{ id: string; cluster_id: string | null }>(
    "SELECT id, cluster_id FROM challenges WHERE golden_key = $1",
    [GOLDEN_MAIN]
  )).rows;
  const clusterIds = new Set<string>();
  for (const r of mains) if (r.cluster_id) clusterIds.add(r.cluster_id);
  const extraClusters = (
    await query<{ id: string }>("SELECT id FROM challenge_clusters WHERE title ILIKE $1", ["%irrigation pump%"])
  ).rows;
  for (const c of extraClusters) clusterIds.add(c.id);

  const goldenProjects = (await query<{ id: string }>("SELECT id FROM projects WHERE golden_key = $1", [GOLDEN_MAIN])).rows;
  for (const p of goldenProjects) await query("DELETE FROM projects WHERE id = $1", [p.id]);

  for (const cid of clusterIds) {
    const projs = (await query<{ id: string }>("SELECT id FROM projects WHERE cluster_id = $1", [cid])).rows;
    for (const p of projs) await query("DELETE FROM projects WHERE id = $1", [p.id]);
    await query("UPDATE challenges SET cluster_id = NULL WHERE cluster_id = $1", [cid]);
    await query("DELETE FROM university_matches WHERE cluster_id = $1", [cid]);
    await query("DELETE FROM challenge_clusters WHERE id = $1", [cid]);
  }
  for (const ch of mains) {
    await query("DELETE FROM challenges WHERE id = $1", [ch.id]);
  }
  await query(`DELETE FROM notifications WHERE body ILIKE $1 OR title ILIKE $1`, ["%Golden Demo%"]);
  await ensureGoldenRelated();
  await query(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, detail) VALUES ($1,$2,'demo.reset','golden_demo',$3,'Reset irrigation voltage Golden Demo')`,
    [uuid(), actorId, GOLDEN_MAIN]
  );
  return { ok: true, message: "Golden Demo irrigation scenario restored. Related reports remain for similarity." };
}
