export interface ProjectLayoutInput {
  path: string;
  mcpCount: number;
}

export interface PlanetPosition {
  path: string;
  x: number;
  y: number;
  planetRadius: number;
  orbitRadius: number;
  safeRadius: number;
}

const MIN_PLANET_RADIUS = 50;
const MAX_PLANET_RADIUS = 90;
const MIN_ORBIT_RADIUS = 30;
const MAX_ORBIT_RADIUS = 66;
const MIN_SAFE_GAP = 32;

function radius(mcpCount: number): {
  planetRadius: number;
  orbitRadius: number;
  safeRadius: number;
} {
  const planetRadius = Math.min(
    MAX_PLANET_RADIUS,
    MIN_PLANET_RADIUS + Math.min(mcpCount, 10) * 4,
  );
  const orbitRadius = Math.min(
    MAX_ORBIT_RADIUS,
    MIN_ORBIT_RADIUS + Math.min(mcpCount, 10) * 3.6,
  );
  const safeRadius = planetRadius + orbitRadius + MIN_SAFE_GAP;
  return { planetRadius, orbitRadius, safeRadius };
}

// Polar-spiral layout: place from center outward with golden angle, collision-checked
export function computeOrbitLayout(
  projects: ProjectLayoutInput[],
): PlanetPosition[] {
  if (!projects.length) return [];
  const result: PlanetPosition[] = [];
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees

  for (let i = 0; i < projects.length; i++) {
    const r = radius(projects[i].mcpCount);
    let x: number, y: number;
    let placed = false;
    for (let ring = 0; !placed; ring++) {
      const d = ring * 200;
      const angle = i * GOLDEN_ANGLE + ring * 0.1;
      x = d * Math.cos(angle) + 500;
      y = d * Math.sin(angle) + 400;
      let collides = false;
      for (const p of result) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < r.safeRadius + p.safeRadius) {
          collides = true;
          break;
        }
      }
      if (!collides || ring > 500) placed = true;
    }
    result.push({ path: projects[i].path, x: x!, y: y!, ...r });
  }
  return result;
}
