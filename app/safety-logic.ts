export type ChemicalRiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
export type InspectionRiskLevel = "低风险" | "一般风险" | "较高风险" | "重大风险";

const CRITICAL_H_CODES = new Set([
  "H200", "H201", "H202", "H203", "H204", "H205", "H250", "H260",
  "H300", "H310", "H330", "H340", "H350", "H360", "H370",
]);

const HIGH_H_CODES = new Set([
  "H220", "H221", "H222", "H224", "H225", "H226", "H228", "H240",
  "H241", "H242", "H251", "H252", "H261", "H270", "H271", "H272",
  "H301", "H311", "H314", "H317", "H318", "H331", "H334", "H341",
  "H351", "H361", "H372",
]);

/**
 * Classifies known hazards independently from source-verification status.
 * A partial verification marker must not hide an already reported H code.
 */
export function classifyChemicalRisk(hazards: string, toxicity: string): ChemicalRiskLevel {
  const value = `${hazards}${toxicity}`;
  const hCodes = new Set(value.match(/\bH\d{3}\b/g) ?? []);
  if ([...hCodes].some((code) => CRITICAL_H_CODES.has(code))) return "critical";
  if ([...hCodes].some((code) => HIGH_H_CODES.has(code))) return "high";
  if (hCodes.size) return "medium";
  if (/待核验|未核验/.test(value)) return "unknown";

  // Remove explicit low/negative acute-toxicity phrases before keyword fallback.
  const keywordValue = value.replace(
    /(?:低|较低|很低|无|无明显|未见|未发现|不具有|非)\s*(?:急性)?毒性|急性毒性\s*(?:低|较低|很低)/g,
    "",
  );
  if (/剧毒|爆炸|致癌|死亡|急性毒性|自燃|有机过氧化物/.test(keywordValue)) return "critical";
  if (/高度易燃|极度易燃|腐蚀|有毒|氧化性|特异性靶器官/.test(keywordValue)) return "high";
  if (/易燃|刺激|有害|窒息|健康危害/.test(keywordValue)) return "medium";
  return "low";
}

export function inspectionRiskLevel(
  score: number,
  hasCriticalAbnormal: boolean,
  hasCriticalReview: boolean,
): InspectionRiskLevel {
  if (hasCriticalAbnormal || score >= 40) return "重大风险";
  if (hasCriticalReview || score >= 26) return "较高风险";
  if (score >= 11) return "一般风险";
  return "低风险";
}

/** Prevent spreadsheet applications from interpreting user-controlled CSV cells as formulas. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  const firstVisible = text.replace(/^[\s\u0000-\u001f]+/u, "");
  if (/^[=+\-@]/.test(firstVisible)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const MAX_SIMULATION_POINTS = 10_000;

export function simulationPointCount(duration: number, dt: number): number {
  if (!Number.isFinite(duration) || !Number.isFinite(dt) || duration <= 0 || dt <= 0) return 0;
  return Math.floor(duration / dt) + 1;
}
