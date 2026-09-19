import { query, queryOne } from "./index.js";
import { v4 as uuid } from "uuid";
import { ensureGoldenRelated } from "../services/goldenDemo.js";

const EXTRA_PERMS: [string, string, string][] = [
  ["p15", "challenge:read_all", "Read all challenges"],
  ["p16", "match:accept", "University accept/decline match"],
  ["p17", "project:create", "Create innovation projects"],
  ["p18", "irl:approve", "Approve IRL progression"],
  ["p19", "demo:reset", "Reset Golden Demo"],
  ["p20", "search:use", "Global search"],
];

const GRANTS: Record<string, string[]> = {
  citizen: ["p20"],
  government: ["p15", "p20"],
  university_admin: ["p15", "p16", "p17", "p20"],
  faculty: ["p15", "p17", "p18", "p20"],
  student: ["p15", "p20"],
  industry: ["p15", "p20"],
  admin: ["p15", "p16", "p17", "p18", "p19", "p20"],
};

export async function ensureRuntimeExtras() {
  for (const p of EXTRA_PERMS) {
    await query("INSERT INTO permissions (id, code, description) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING", p);
  }
  for (const [role, ids] of Object.entries(GRANTS)) {
    for (const pid of ids) {
      await query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT (role_id, permission_id) DO NOTHING",
        [role, pid]
      );
    }
  }
  await query(
    `UPDATE system_settings SET value_json = $1, description = $2 WHERE key = 'priority_weights'`,
    [
      JSON.stringify({
        population: 0.2,
        urgency: 0.2,
        recurrence: 0.15,
        evidence: 0.1,
        geographic_spread: 0.1,
        validation: 0.15,
        strategic: 0.1,
      }),
      "CivicForge Decision Support Score weights — admin configurable, not a scientific formula",
    ]
  );
  await query(`UPDATE system_settings SET value_json = $1 WHERE key = 'match_weights'`, [
    JSON.stringify({
      category: 0.35,
      expertise: 0.25,
      labs: 0.15,
      location: 0.1,
      previous: 0.1,
      availability: 0.05,
    }),
  ]);
  await query(`UPDATE projects SET stage = 'proposal' WHERE stage IN ('team_forming','team forming')`);
  await query(`UPDATE projects SET irl_level = 1 WHERE irl_level IS NULL`);

  const uni = await queryOne<{ id: string }>("SELECT id FROM universities ORDER BY name LIMIT 1");
  if (uni) {
    const agri = await queryOne("SELECT id FROM departments WHERE university_id = $1 AND domain = 'agriculture'", [uni.id]);
    if (!agri) {
      await query("INSERT INTO departments (id, university_id, name, domain) VALUES ($1,$2,$3,$4)", [
        uuid(),
        uni.id,
        "Agricultural Engineering (demo)",
        "agriculture",
      ]);
    }
    const energy = await queryOne("SELECT id FROM departments WHERE university_id = $1 AND domain = 'energy'", [uni.id]);
    if (!energy) {
      await query("INSERT INTO departments (id, university_id, name, domain) VALUES ($1,$2,$3,$4)", [
        uuid(),
        uni.id,
        "Electrical & Energy Systems (demo)",
        "energy",
      ]);
    }
    const fac = await queryOne<{ id: string }>("SELECT id FROM faculty WHERE university_id = $1 LIMIT 1", [uni.id]);
    if (fac) {
      for (const tag of ["electrical engineering", "irrigation energy", "IoT"]) {
        const exists = await queryOne("SELECT id FROM expertise WHERE faculty_id = $1 AND tag = $2", [fac.id, tag]);
        if (!exists) await query("INSERT INTO expertise (id, faculty_id, tag) VALUES ($1,$2,$3)", [uuid(), fac.id, tag]);
      }
    }
  }
  await ensureGoldenRelated();
}
