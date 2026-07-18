import sourceData from "./data/source-data.json";

type Cell = string | number | boolean | null;
type Row = Cell[];

const raw = sourceData as unknown as {
  chemicals: Record<string, Row[]>;
  equipment: Record<string, Row[]>;
  emergency: Record<string, Row[]>;
};

const text = (value: Cell) => (value == null ? "" : String(value));

export type RiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
export type ResponseLevel = "蓝色" | "黄色" | "橙色" | "红色";

export type Chemical = {
  id: number;
  name: string;
  englishName: string;
  cas: string;
  formula: string;
  molecularWeight: string;
  appearance: string;
  meltingPoint: string;
  boilingPoint: string;
  density: string;
  solubility: string;
  hazards: string;
  flashPoint: string;
  explosiveLimits: string;
  toxicity: string;
  storage: string;
  ppe: string;
  spill: string;
  firefighting: string;
  incompatibilities: string;
  pubchem: string;
  icsc: string;
  note: string;
  risk: RiskLevel;
  tags: string[];
};

function chemicalRisk(hazards: string, toxicity: string): RiskLevel {
  const value = `${hazards}${toxicity}`;
  if (/待核验|未核验|部分核验/.test(value)) return "unknown";
  const hCodes = new Set(value.match(/\bH\d{3}\b/g) ?? []);
  if (["H200", "H201", "H202", "H203", "H204", "H205", "H250", "H260", "H300", "H310", "H330", "H340", "H350", "H360", "H370"].some((code) => hCodes.has(code))) return "critical";
  if (["H220", "H221", "H222", "H224", "H225", "H226", "H228", "H240", "H241", "H242", "H251", "H252", "H261", "H270", "H271", "H272", "H301", "H311", "H314", "H317", "H318", "H331", "H334", "H341", "H351", "H361", "H372"].some((code) => hCodes.has(code))) return "high";
  if (hCodes.size) return "medium";
  if (/剧毒|爆炸|致癌|死亡|急性毒性|自燃|有机过氧化物/.test(value)) return "critical";
  if (/高度易燃|极度易燃|腐蚀|有毒|氧化性|特异性靶器官/.test(value)) return "high";
  if (/易燃|刺激|有害|窒息|健康危害/.test(value)) return "medium";
  return "low";
}

function hazardTags(hazards: string) {
  const candidates = [
    ["易燃", /易燃|可燃|H22[0-8]|H24[01]|H25[0-2]|H26[01]/],
    ["有毒", /毒性|有毒|中毒|H30[0-2]|H31[0-2]|H33[0-2]/],
    ["腐蚀", /腐蚀|H290|H314/],
    ["氧化", /氧化|H27[0-2]/],
    ["爆炸", /爆炸|爆炸性|H20[0-5]/],
    ["健康危害", /致癌|靶器官|健康危害|窒息|H3\d{2}/],
    ["环境危害", /环境|水生|H4\d{2}/],
  ] as const;
  return candidates.filter(([, pattern]) => pattern.test(hazards)).map(([label]) => label);
}

const bundledChemicals: Chemical[] = raw.chemicals["化学品安全数据"]
  .slice(4)
  .filter((row) => row[1])
  .map((row) => {
    const hazards = text(row[11]);
    const toxicity = text(row[14]);
    return {
      id: Number(row[0]),
      name: text(row[1]),
      englishName: text(row[2]),
      cas: text(row[3]),
      formula: text(row[4]),
      molecularWeight: text(row[5]),
      appearance: text(row[6]),
      meltingPoint: text(row[7]),
      boilingPoint: text(row[8]),
      density: text(row[9]),
      solubility: text(row[10]),
      hazards,
      flashPoint: text(row[12]),
      explosiveLimits: text(row[13]),
      toxicity,
      storage: text(row[15]),
      ppe: text(row[16]),
      spill: text(row[17]),
      firefighting: text(row[18]),
      incompatibilities: text(row[19]),
      pubchem: text(row[20]),
      icsc: text(row[21]),
      note: text(row[22]),
      risk: chemicalRisk(hazards, toxicity),
      tags: hazardTags(hazards),
    };
  });

function loadAndroidChemicals(fallback: Chemical[]): Chemical[] {
  if (typeof window === "undefined") return fallback;
  const bridge = (window as Window & {
    AndroidBridge?: { getChemicalsJson?: () => string };
  }).AndroidBridge;
  if (!bridge?.getChemicalsJson) return fallback;
  try {
    const parsed = JSON.parse(bridge.getChemicalsJson()) as Chemical[];
    return parsed.length === 1500 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Android reads this array from the packaged SQLite database via the native bridge. */
export const chemicals: Chemical[] = loadAndroidChemicals(bundledChemicals);

export type EquipmentType = {
  category: string;
  name: string;
  count: number;
  focus: string;
  risks: string;
};

export const equipmentTypes: EquipmentType[] = raw.equipment["设备速查"]
  .slice(4)
  .filter((row) => row[1])
  .map((row) => ({
    category: text(row[0]),
    name: text(row[1]),
    count: Number(row[2]),
    focus: text(row[3]),
    risks: text(row[4]),
  }));

export type InspectionItem = {
  id: number;
  category: string;
  equipment: string;
  item: string;
  method: string;
  standard: string;
  consequence: string;
  action: string;
  frequency: string;
  role: string;
  weight: number;
};

function inspectionWeight(item: string, consequence: string) {
  const value = `${item}${consequence}`;
  if (/爆炸|容器破裂|飞温|失控|超压|联锁失效/.test(value)) return 5;
  if (/泄漏|火灾|中毒|窒息|安全阀|高高液位/.test(value)) return 3;
  if (/异常|故障|腐蚀|堵塞/.test(value)) return 2;
  return 1;
}

export const inspectionItems: InspectionItem[] = raw.equipment["检查知识库"]
  .slice(4)
  .filter((row) => row[2])
  .map((row) => {
    const item = text(row[3]);
    const consequence = text(row[6]);
    return {
      id: Number(row[0]),
      category: text(row[1]),
      equipment: text(row[2]),
      item,
      method: text(row[4]),
      standard: text(row[5]),
      consequence,
      action: text(row[7]),
      frequency: text(row[8]),
      role: text(row[9]),
      weight: inspectionWeight(item, consequence),
    };
  });

export type EmergencyType = {
  id: number;
  category: string;
  name: string;
  signs: string;
  risks: string;
  level: string;
  steps: string[];
  prohibited: string;
  ppe: string;
  escalation: string;
  recovery: string;
  scenario: string;
  note: string;
};

export const emergencyTypes: EmergencyType[] = raw.emergency["分步应急流程"]
  .slice(4)
  .filter((row) => row[2])
  .map((row) => ({
    id: Number(row[0]),
    category: text(row[1]),
    name: text(row[2]),
    signs: text(row[3]),
    risks: text(row[4]),
    level: text(row[5]),
    steps: row.slice(6, 12).map(text),
    prohibited: text(row[12]),
    ppe: text(row[13]),
    escalation: text(row[14]),
    recovery: text(row[15]),
    scenario: text(row[16]),
    note: text(row[17]),
  }));

export type ResponseProfile = {
  level: ResponseLevel;
  name: string;
  trigger: string;
  command: string;
  reporting: string;
  evacuation: string;
  resources: string;
  external: string;
  upgrade: string;
  recovery: string;
};

export const responseProfiles = Object.fromEntries(
  raw.emergency["响应分级措施"]
    .slice(4)
    .filter((row) => ["蓝色", "黄色", "橙色", "红色"].includes(text(row[0])))
    .map((row) => {
      const profile: ResponseProfile = {
        level: text(row[0]) as ResponseLevel,
        name: text(row[1]),
        trigger: text(row[2]),
        command: text(row[3]),
        reporting: text(row[4]),
        evacuation: text(row[5]),
        resources: text(row[6]),
        external: text(row[7]),
        upgrade: text(row[8]),
        recovery: text(row[9]),
      };
      return [profile.level, profile];
    }),
) as Record<ResponseLevel, ResponseProfile>;

export const emergencyStepNames = [
  "报警撤离",
  "切断停车",
  "警戒检测",
  "专业控制",
  "救护与环境",
  "监测恢复",
];

export const dataVersion = "2026-07-18";
