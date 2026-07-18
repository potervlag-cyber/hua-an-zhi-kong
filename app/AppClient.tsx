"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chemical,
  EmergencyType,
  InspectionItem,
  ResponseLevel,
  RiskLevel,
  chemicals,
  dataVersion,
  emergencyStepNames,
  emergencyTypes,
  equipmentTypes,
  inspectionItems,
  responseProfiles,
} from "./data";

type PageId = "home" | "chemicals" | "inspection" | "emergency" | "cleaner" | "simulation";
type InspectionStatus = "normal" | "abnormal" | "na" | "review";
type InspectionAnswer = { status: InspectionStatus; value: string; note: string };
type InspectionRecord = {
  id: string;
  equipment: string;
  tag: string;
  inspector: string;
  date: string;
  score: number;
  level: string;
  abnormal: number;
};

declare global {
  interface Window {
    AndroidBridge?: {
      getChemicalsJson: () => string;
      getChemicalDatabaseInfoJson: () => string;
      saveTextFile: (filename: string, content: string, mimeType: string) => void;
      printPage: () => void;
    };
  }
}

const navItems: Array<{ id: PageId; label: string; short: string; icon: string }> = [
  { id: "home", label: "工作台", short: "首页", icon: "⌂" },
  { id: "chemicals", label: "化学品安全查询", short: "化学品", icon: "◉" },
  { id: "inspection", label: "设备巡检与风险", short: "巡检", icon: "✓" },
  { id: "emergency", label: "事故应急指导", short: "应急", icon: "!" },
  { id: "cleaner", label: "清洁生产评价", short: "清洁", icon: "♻" },
  { id: "simulation", label: "反应釜控制仿真", short: "仿真", icon: "⌁" },
];

const modules: Array<{
  id: Exclude<PageId, "home">;
  title: string;
  subtitle: string;
  icon: string;
  metric: string;
  tone: string;
}> = [
  { id: "chemicals", title: "化学品安全查询", subtitle: "理化性质、危害与处置一站式检索", icon: "◉", metric: `${chemicals.length} 种化学品`, tone: "blue" },
  { id: "inspection", title: "设备安全巡检", subtitle: "分步检查、异常提示与风险评分", icon: "✓", metric: `${equipmentTypes.length} 类设备`, tone: "teal" },
  { id: "emergency", title: "事故应急指导", subtitle: "按事故类型逐步执行安全处置", icon: "!", metric: `${emergencyTypes.length} 类流程`, tone: "red" },
  { id: "cleaner", title: "清洁生产评价", subtitle: "能耗、物耗与排放指标自动计算", icon: "♻", metric: "6 维度评价", tone: "green" },
  { id: "simulation", title: "反应釜控制仿真", subtitle: "PID 参数调节与温度动态分析", icon: "⌁", metric: "离散 PID 模型", tone: "purple" },
];

const riskMeta: Record<RiskLevel, { label: string; className: string }> = {
  unknown: { label: "安全数据待核验", className: "risk-unknown" },
  low: { label: "一般风险", className: "risk-low" },
  medium: { label: "中等风险", className: "risk-medium" },
  high: { label: "较高风险", className: "risk-high" },
  critical: { label: "重大风险", className: "risk-critical" },
};

const ghsVerifiedCount = chemicals.filter((chemical) => chemical.note.includes("GHS核验状态：来源已核验")).length;

const inspectionValueExamples: Record<number, string> = {
  1: "例如：78.5 ℃（工艺上限 85 ℃）",
  2: "例如：0.32 MPa，压力趋势稳定",
  3: "例如：冷却水流量 80 m³/h，进/出口温度 25/32 ℃",
  4: "例如：转速 120 r/min，电流 18.6 A，振动 2.1 mm/s",
  8: "例如：加料流量 1.8 m³/h，累计量 4.5 m³",
  9: "例如：接地电阻 3.2 Ω，跨接线完好",
  11: "例如：液位 62%，高高液位报警测试正常",
  15: "例如：可燃气探测器 0%LEL，测试响应正常",
  18: "例如：罐温 23.6 ℃，罐压 1.8 kPa",
  19: "例如：塔顶 68.2 ℃，塔釜 105.4 ℃",
  20: "例如：塔顶压力 18 kPa，塔段压差 6.2 kPa",
  21: "例如：回流量 2.4 m³/h，冷凝液温度 31 ℃",
  22: "例如：蒸汽压力 0.45 MPa，再沸器液位 58%",
  23: "例如：塔釜出料流量 1.2 m³/h，无停滞",
  24: "例如：氮封压力 1.5 kPa，放空通道畅通",
  26: "例如：热侧 120/78 ℃，冷侧 25/61 ℃",
  27: "例如：入口 0.48 MPa，出口 0.43 MPa，压差 0.05 MPa",
  28: "例如：出口 pH 7.2，电导率 580 μS/cm",
  29: "例如：冷却水流量 76 m³/h，入口压力 0.28 MPa",
  32: "例如：出口压力 0.42 MPa，流量 24 m³/h",
  34: "例如：振动 2.4 mm/s，轴承温度 52 ℃，无异响",
  35: "例如：入口压力 0.12 MPa，运行电流 16.8 A",
  37: "例如：电机电流 17.2 A，外壳温度 46 ℃",
  38: "例如：一级排气 0.62 MPa/86 ℃，二级排气 1.25 MPa/98 ℃",
  39: "例如：油压 0.26 MPa，油位 65%，油温 48 ℃",
  40: "例如：冷却水流量 42 m³/h，进/出口温差 7 ℃",
  42: "例如：振动 3.1 mm/s，轴承温度 61 ℃",
  44: "例如：转速 1450 r/min，低于上限 1500 r/min",
  45: "例如：振动 2.8 mm/s，无周期性冲击",
  47: "例如：进料 1.6 m³/h，电流 22 A，装料 420 kg",
  49: "例如：氧含量 4.2%vol，氮气压力 0.35 MPa",
  50: "例如：物料温度 62 ℃，安全上限 75 ℃",
  51: "例如：真空度 -86 kPa，30 min 内波动小于 2 kPa",
  52: "例如：冷凝温度 18 ℃，回收量 120 kg/h，尾气 35 ppm",
  54: "例如：氧含量 3.8%vol，低于工艺上限 5%vol",
  56: "例如：入口 0.36 MPa，出口 0.29 MPa，压差 0.07 MPa",
  57: "例如：液压压力 16 MPa，锁紧销全部到位",
  59: "例如：压力表 0 MPa，排空口无介质排出",
  60: "例如：滤饼温度 32 ℃，含湿量 18%",
  61: "例如：现场水位 +35 mm，远传水位 +37 mm",
  62: "例如：蒸汽压力 0.78 MPa，允许压力 1.00 MPa",
  63: "例如：炉膛压力 -35 Pa，烟气氧含量 3.5%",
  65: "例如：给水压力 1.25 MPa，电导率 18 μS/cm",
  67: "例如：压力 0.56 MPa，温度 42 ℃",
  70: "例如：液位 48%，排凝 12 L，无气体窜出",
  73: "例如：最小壁厚 6.8 mm，振动 1.9 mm/s",
  75: "例如：支架位移 3 mm，补偿器无卡阻",
  77: "例如：跨接电阻 0.02 Ω，接地连续",
  78: "例如：供/回水 7/12 ℃，流量 95 m³/h",
  79: "例如：高压 1.42 MPa，低压 0.38 MPa，排气 72 ℃",
  83: "例如：转速 96 r/min，电流 12.5 A",
  84: "例如：液位 71%，低于最高工作液位 80%",
  86: "例如：罩口风速 0.6 m/s，系统负压 -180 Pa",
  88: "例如：循环液 68 m³/h，喷淋压力 0.24 MPa",
  89: "例如：pH 9.2，有效碱浓度 6.5%",
  90: "例如：塔压差 1.8 kPa，趋势稳定",
  92: "例如：循环槽液位 55%，泵密封无滴漏",
  93: "例如：积尘厚度小于 0.5 mm，现场已清理",
  94: "例如：风量 12500 m³/h，除尘器压差 1.2 kPa",
  95: "例如：轴承温度 49 ℃，振动 2.0 mm/s",
  106: "例如：UPS 负载率 42%，电池电压 216 V，切换正常",
};

function inspectionValuePlaceholder(item: InspectionItem) {
  return inspectionValueExamples[item.id] ?? `例如：${item.equipment}—${item.item.replace(/[？?]/g, "")}，现场检查正常`;
}

function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      // Browser storage must be restored after hydration to keep SSR markup stable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setValue(JSON.parse(saved) as T);
    } catch {
      // Device-local history is optional; the app remains usable without it.
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore unavailable or full browser storage.
    }
  }, [key, ready, value]);
  return [value, setValue] as const;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  if (window.AndroidBridge?.saveTextFile) {
    window.AndroidBridge.saveTextFile(filename, content, type);
    return;
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printPage() {
  if (window.AndroidBridge?.printPage) {
    window.AndroidBridge.printPage();
    return;
  }
  window.print();
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function ScrollingInspectionExample({ text }: { text: string }) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const update = () => {
      const viewport = viewportRef.current;
      const content = textRef.current;
      if (viewport && content) setScrolling(content.scrollWidth > viewport.clientWidth);
    };
    update();
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    return () => { window.removeEventListener("resize", update); observer?.disconnect(); };
  }, [text]);

  const duration = Math.max(10, Math.min(24, text.length * 0.48));
  return (
    <span ref={viewportRef} className={`measurement-example-scroll ${scrolling ? "is-scrolling" : ""}`} tabIndex={0} aria-label={`填写示例：${text}`}>
      <span className="measurement-example-track" style={{ animationDuration: `${duration}s` }}>
        <span ref={textRef}>{text}</span>
        {scrolling && <span aria-hidden="true">{text}</span>}
      </span>
    </span>
  );
}

function Modal({ title, children, onClose, tone = "default" }: { title: string; children: React.ReactNode; onClose: () => void; tone?: "default" | "danger" }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${tone === "danger" ? "modal-danger" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span>⌕</span><h3>{title}</h3><p>{text}</p></div>;
}

export default function AppClient() {
  const [page, setPage] = useState<PageId>("home");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [recentChemicals, setRecentChemicals] = usePersistentState<number[]>("huazhi-recent-chemicals", [1, 4, 8]);
  const [inspectionHistory, setInspectionHistory] = usePersistentState<InspectionRecord[]>("huazhi-inspection-history", []);

  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "") as PageId;
    // URL state is browser-only and is intentionally restored after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (navItems.some((item) => item.id === fromHash)) setPage(fromHash);
  }, []);

  const navigate = (next: PageId) => {
    setPage(next);
    setMobileMenu(false);
    window.location.hash = next;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand" onClick={() => navigate("home")} role="button" tabIndex={0}>
          <div className="brand-mark"><span>化</span></div>
          <div><strong>化安智控</strong><small>CHEM SAFE CONTROL</small></div>
        </div>
        <div className="sidebar-label">智能辅助系统</div>
        <nav aria-label="主导航">
          {navItems.map((item) => (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="system-dot"><i />系统离线数据可用</div>
          <small>数据版本 {dataVersion}</small>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="打开导航">☰</button>
          <div className="breadcrumb"><span>化安智控</span><b>/</b>{navItems.find((item) => item.id === page)?.label}</div>
          <div className="topbar-actions">
            <div className="sync-pill"><i /> 本地知识库已同步</div>
            <button className="notification-button" aria-label="风险提醒">●<span>2</span></button>
            <div className="avatar">安</div>
          </div>
        </header>

        <main>
          {page === "home" && <Dashboard navigate={navigate} recentIds={recentChemicals} history={inspectionHistory} />}
          {page === "chemicals" && <ChemicalModule recentIds={recentChemicals} setRecentIds={setRecentChemicals} navigate={navigate} />}
          {page === "inspection" && <InspectionModule history={inspectionHistory} setHistory={setInspectionHistory} navigate={navigate} />}
          {page === "emergency" && <EmergencyModule />}
          {page === "cleaner" && <CleanerModule />}
          {page === "simulation" && <SimulationModule />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.map((item) => (
          <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
            <span>{item.icon}</span><small>{item.short}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Dashboard({ navigate, recentIds, history }: { navigate: (page: PageId) => void; recentIds: number[]; history: InspectionRecord[] }) {
  const recent = recentIds.map((id) => chemicals.find((chemical) => chemical.id === id)).filter(Boolean) as Chemical[];
  const criticalCount = chemicals.filter((chemical) => chemical.risk === "critical").length;
  return (
    <div className="page dashboard-page">
      <section className="hero-panel">
        <div className="hero-content">
          <div className="hero-badge"><span />过程安全 · 清洁生产 · 智能辅助</div>
          <h1>让每一次操作，<br /><em>都有安全依据。</em></h1>
          <p>面向化工学习、实验与一线生产场景，快速查询安全信息、识别设备风险、执行应急流程并分析过程绩效。</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => navigate("chemicals")}>开始安全查询 <span>→</span></button>
            <button className="button button-ghost" onClick={() => navigate("inspection")}>发起设备巡检</button>
          </div>
        </div>
        <div className="hero-status">
          <div className="status-ring"><strong>98</strong><span>系统就绪度</span></div>
          <div className="status-lines">
            <div><span>化学品数据库</span><b>已加载</b></div>
            <div><span>巡检知识库</span><b>已加载</b></div>
            <div><span>设备数据接口</span><b className="muted">预留</b></div>
          </div>
        </div>
      </section>

      <div className="section-title"><div><p className="eyebrow">核心能力</p><h2>选择你的工作任务</h2></div><span>五大模块协同覆盖化工过程全周期</span></div>
      <section className="module-grid">
        {modules.map((module) => (
          <button className={`module-card tone-${module.tone}`} key={module.id} onClick={() => navigate(module.id)}>
            <div className="module-icon">{module.icon}</div><span className="module-arrow">↗</span>
            <h3>{module.title}</h3><p>{module.subtitle}</p><small>{module.metric}</small>
          </button>
        ))}
      </section>

      <section className="stats-grid">
        <div className="stat-card"><span className="stat-icon blue">▦</span><div><small>化学品数据</small><strong>{chemicals.length}<em>种</em></strong></div><b>完整</b></div>
        <div className="stat-card"><span className="stat-icon teal">✓</span><div><small>设备检查项</small><strong>{inspectionItems.length}<em>条</em></strong></div><b>已同步</b></div>
        <div className="stat-card"><span className="stat-icon red">!</span><div><small>重大风险物质</small><strong>{criticalCount}<em>种</em></strong></div><b className="warning">需关注</b></div>
        <div className="stat-card"><span className="stat-icon green">⌁</span><div><small>本机巡检报告</small><strong>{history.length}<em>份</em></strong></div><b>本地保存</b></div>
      </section>

      <section className="dashboard-columns">
        <div className="panel recent-panel">
          <div className="panel-head"><div><h2>最近查询</h2><p>快速回到近期查看的化学品</p></div><button className="text-button" onClick={() => navigate("chemicals")}>查看全部 →</button></div>
          {recent.length ? <div className="recent-list">{recent.slice(0, 4).map((chemical) => (
            <button key={chemical.id} onClick={() => navigate("chemicals")}>
              <span className={`risk-dot ${riskMeta[chemical.risk].className}`} />
              <div><strong>{chemical.name}</strong><small>{chemical.englishName} · CAS {chemical.cas}</small></div>
              <span className={`risk-badge ${riskMeta[chemical.risk].className}`}>{riskMeta[chemical.risk].label}</span><b>›</b>
            </button>
          ))}</div> : <EmptyState title="暂无查询记录" text="进入化学品模块开始检索" />}
        </div>
        <div className="panel alert-panel">
          <div className="panel-head"><div><h2>风险预警</h2><p>基于当前演示数据的安全提示</p></div><span className="live-label"><i /> 实时</span></div>
          <div className="alert-item danger"><span>!</span><div><strong>高温风险预警</strong><p>反应釜温控仿真可用于测试超调和联锁逻辑。</p><small>建议：先验证高温切断阈值</small></div></div>
          <div className="alert-item caution"><span>i</span><div><strong>巡检记录待完善</strong><p>{history.length ? `已有 ${history.length} 份本机记录，请按期复查异常项。` : "尚未生成本机巡检记录。"}</p><button onClick={() => navigate("inspection")}>进入巡检模块</button></div></div>
        </div>
      </section>

      <div className="disclaimer"><span>i</span><p><strong>使用说明</strong> 本系统用于学习、辅助判断和初步风险识别，不替代化学品 SDS、企业操作规程、应急预案、设备说明书及专业人员判断。</p></div>
    </div>
  );
}

function ChemicalModule({ recentIds, setRecentIds, navigate }: { recentIds: number[]; setRecentIds: (value: number[]) => void; navigate: (page: PageId) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [selected, setSelected] = useState<Chemical | null>(null);
  const [favorites, setFavorites] = usePersistentState<number[]>("huazhi-favorite-chemicals", []);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);
  const filters = ["全部", "易燃", "有毒", "腐蚀", "氧化", "爆炸", "GHS已核验", "一般工业品", "待核验"];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return chemicals.filter((chemical) => {
      const matchesText = !normalized || [chemical.name, chemical.englishName, chemical.cas, chemical.formula, chemical.hazards].some((value) => value.toLowerCase().includes(normalized));
      const matchesFilter = filter === "全部"
        || (filter === "GHS已核验" ? chemical.note.includes("GHS核验状态：来源已核验")
          : filter === "待核验" ? chemical.risk === "unknown"
          : filter === "一般工业品" ? chemical.risk !== "unknown" && chemical.tags.length === 0
            : chemical.tags.some((tag) => tag.includes(filter)));
      return matchesText && matchesFilter;
    });
  }, [filter, query]);

  const visibleChemicals = filtered.slice(0, visibleCount);

  const openChemical = (chemical: Chemical) => {
    setSelected(chemical);
    setRecentIds([chemical.id, ...recentIds.filter((id) => id !== chemical.id)].slice(0, 8));
  };
  const toggleFavorite = (id: number) => setFavorites(favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]);
  const toggleCompare = (id: number) => {
    if (compareIds.includes(id)) setCompareIds(compareIds.filter((item) => item !== id));
    else if (compareIds.length < 2) setCompareIds([...compareIds, id]);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="CHEMICAL SAFETY" title="化学品安全查询" description={`离线检索 ${chemicals.length} 种化学品；其中 ${ghsVerifiedCount} 条新增记录已完成 GHS 权威来源核验，未覆盖条目仍明确标为待核验。`} actions={<button className="button button-outline" onClick={() => { setFilter("全部"); setVisibleCount(60); }}>重置筛选</button>} />
      <section className="search-panel">
        <div className="search-box"><span>⌕</span><div className="chemical-search-input"><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(60); }} aria-label="输入中文名、英文名、CAS号、分子式或危险关键词" autoFocus />{!query ? <div className="chemical-search-placeholder" aria-hidden="true"><div className="chemical-search-placeholder-track"><span>输入中文名、英文名、CAS 号、分子式或危险关键词</span><span>输入中文名、英文名、CAS 号、分子式或危险关键词</span></div></div> : null}</div><kbd>{filtered.length} 条</kbd></div>
        <div className="filter-row">{filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => { setFilter(item); setVisibleCount(60); }}>{item}</button>)}</div>
      </section>

      <div className="result-toolbar"><p>找到 <strong>{filtered.length}</strong> 种化学品</p><div><span>灰色 待核验</span><span>绿色 一般</span><span>黄色 中等</span><span>橙色 较高</span><span>红色 重大</span></div></div>
      {filtered.length ? <section className="chemical-grid">
        {visibleChemicals.map((chemical) => (
          <article className="chemical-card" key={chemical.id}>
            <div className="chemical-card-head"><span className={`risk-strip ${riskMeta[chemical.risk].className}`} /><div><h3>{chemical.name}</h3><p>{chemical.englishName}</p></div><button className={`favorite ${favorites.includes(chemical.id) ? "active" : ""}`} onClick={() => toggleFavorite(chemical.id)} aria-label="收藏">★</button></div>
            <div className="chemical-identifiers"><span>CAS <b>{chemical.cas}</b></span><span>分子式 <b>{chemical.formula}</b></span></div>
            <p className="hazard-summary">{chemical.hazards}</p>
            <div className="tag-row">{chemical.note.includes("GHS核验状态：来源已核验") ? <span className="verified-tag">✓ GHS来源已核验</span> : null}{chemical.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="chemical-card-foot"><label className={`risk-badge ${riskMeta[chemical.risk].className}`}>{riskMeta[chemical.risk].label}</label><div><button className={compareIds.includes(chemical.id) ? "selected" : ""} onClick={() => toggleCompare(chemical.id)}>⇄ 对比</button><button onClick={() => openChemical(chemical)}>查看详情 →</button></div></div>
          </article>
        ))}
      </section> : <EmptyState title="未找到匹配结果" text="请尝试其他名称、CAS 号或危险类别" />}
      {visibleCount < filtered.length ? <div className="chemical-load-more"><button className="button button-outline" onClick={() => setVisibleCount((count) => count + 60)}>继续加载（已显示 {visibleChemicals.length}/{filtered.length}）</button></div> : null}

      {compareIds.length > 0 && <div className="compare-dock"><div><span>⇄</span><p><strong>化学品对比</strong><small>已选择 {compareIds.length}/2 种</small></p>{compareIds.map((id) => <b key={id}>{chemicals.find((item) => item.id === id)?.name}<button onClick={() => toggleCompare(id)}>×</button></b>)}</div><button className="button button-primary" disabled={compareIds.length !== 2} onClick={() => setShowCompare(true)}>开始对比</button></div>}

      {selected && <ChemicalDrawer chemical={selected} favorite={favorites.includes(selected.id)} onFavorite={() => toggleFavorite(selected.id)} onClose={() => setSelected(null)} navigate={navigate} />}
      {showCompare && <ChemicalCompare ids={compareIds} onClose={() => setShowCompare(false)} />}
    </div>
  );
}

function ChemicalDrawer({ chemical, favorite, onFavorite, onClose, navigate }: { chemical: Chemical; favorite: boolean; onFavorite: () => void; onClose: () => void; navigate: (page: PageId) => void }) {
  const fields = [
    ["分子式", chemical.formula], ["分子量", `${chemical.molecularWeight} g/mol`], ["外观与状态", chemical.appearance], ["熔点/凝固点", chemical.meltingPoint],
    ["沸点", chemical.boilingPoint], ["密度/相对密度", chemical.density], ["水溶性", chemical.solubility], ["闪点", chemical.flashPoint], ["爆炸极限", chemical.explosiveLimits],
  ];
  const cardText = [`${chemical.name}安全信息卡`, `英文名：${chemical.englishName}`, `CAS：${chemical.cas}`, `危险类别：${chemical.hazards}`, `健康危害：${chemical.toxicity}`, `储存：${chemical.storage}`, `PPE：${chemical.ppe}`, `泄漏处置：${chemical.spill}`, `灭火：${chemical.firefighting}`, `禁忌物：${chemical.incompatibilities}`, "提示：使用前核对供应商最新版SDS及企业规程。"].join("\n");
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="chemical-drawer">
        <div className="drawer-head"><button className="icon-button" onClick={onClose}>×</button><div className="drawer-actions"><button onClick={onFavorite}>{favorite ? "★ 已收藏" : "☆ 收藏"}</button><button onClick={() => downloadText(`${chemical.name}-安全信息卡.txt`, cardText)}>↓ 生成安全卡</button></div></div>
        <div className="chemical-title"><div><p>{chemical.englishName}</p><h2>{chemical.name}</h2><span>CAS {chemical.cas}</span></div><label className={`risk-badge large ${riskMeta[chemical.risk].className}`}>{riskMeta[chemical.risk].label}</label></div>
        <div className="ghs-panel"><strong>主要危险类别</strong><p>{chemical.hazards}</p><div className="tag-row">{chemical.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
        <div className="property-grid">{fields.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "—"}</strong></div>)}</div>
        <InfoBlock title="毒性与健康危害" tone="danger" text={chemical.toxicity} />
        <InfoBlock title="储存要求" text={chemical.storage} />
        <InfoBlock title="个体防护措施" text={chemical.ppe} />
        <InfoBlock title="泄漏处理方法" tone="warning" text={chemical.spill} />
        <InfoBlock title="灭火方式" text={chemical.firefighting} />
        <InfoBlock title="禁忌物质" tone="danger" text={chemical.incompatibilities} />
        <InfoBlock title="数据核验与来源" text={chemical.note} />
        <div className="source-links"><strong>数据来源</strong><a href={chemical.pubchem} target="_blank">PubChem ↗</a><a href={chemical.icsc} target="_blank">ICSC ↗</a></div>
        <div className="drawer-warning"><span>!</span><p>以上为典型参考值。混合物、浓度、纯度与温压会改变数据，操作前必须核对具体产品 SDS。</p></div>
        <button className="button button-danger full" onClick={() => { onClose(); navigate("emergency"); }}>发生事故？进入应急处置指导 →</button>
      </aside>
    </div>
  );
}

function InfoBlock({ title, text, tone = "default" }: { title: string; text: string; tone?: "default" | "danger" | "warning" }) {
  return <div className={`info-block ${tone}`}><strong>{title}</strong><p>{text || "暂无数据"}</p></div>;
}

function ChemicalCompare({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const items = ids.map((id) => chemicals.find((chemical) => chemical.id === id)).filter(Boolean) as Chemical[];
  const incompatibilityWarning = items.length === 2 && [items[0].incompatibilities, items[1].incompatibilities].some((value) => /氧化剂|强酸|强碱|过氧化物/.test(value));
  const rows: Array<[string, keyof Chemical]> = [["CAS号", "cas"], ["分子式", "formula"], ["主要危险", "hazards"], ["闪点", "flashPoint"], ["爆炸极限", "explosiveLimits"], ["储存要求", "storage"], ["禁忌物质", "incompatibilities"]];
  return <Modal title="化学品安全对比" onClose={onClose}>{incompatibilityWarning && <div className="compare-warning">! 两种物质均涉及强反应性禁忌物，混存或混合前必须进行专项相容性评估。</div>}<div className="compare-table"><div className="compare-row header"><span>对比项目</span>{items.map((item) => <strong key={item.id}>{item.name}<small>{riskMeta[item.risk].label}</small></strong>)}</div>{rows.map(([label, key]) => <div className="compare-row" key={label}><span>{label}</span>{items.map((item) => <p key={item.id}>{String(item[key]) || "—"}</p>)}</div>)}</div></Modal>;
}

function InspectionModule({ history, setHistory, navigate }: { history: InspectionRecord[]; setHistory: (value: InspectionRecord[]) => void; navigate: (page: PageId) => void }) {
  const [equipment, setEquipment] = useState("反应釜");
  const [tag, setTag] = useState("R-101");
  const [inspector, setInspector] = useState("安全员");
  const [mobileStage, setMobileStage] = useState<"equipment" | "details" | "check">("equipment");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, InspectionAnswer>>({});
  const [alertItem, setAlertItem] = useState<InspectionItem | null>(null);
  const [report, setReport] = useState<InspectionRecord | null>(null);
  const items = useMemo(() => inspectionItems.filter((item) => item.equipment === equipment), [equipment]);
  const current = items[step];
  const answered = items.filter((item) => answers[item.id]?.status).length;

  const updateAnswer = (item: InspectionItem, patch: Partial<InspectionAnswer>) => {
    const previous = answers[item.id] ?? { status: "normal", value: "", note: "" };
    const next = { ...previous, ...patch } as InspectionAnswer;
    setAnswers({ ...answers, [item.id]: next });
    if (patch.status === "abnormal") setAlertItem(item);
  };

  const score = useMemo(() => {
    const abnormalItems = items.filter((item) => answers[item.id]?.status === "abnormal");
    const base = items.reduce((sum, item) => {
      const status = answers[item.id]?.status;
      const severity = status === "review" ? 1 : status === "abnormal" ? (item.weight >= 5 ? 5 : 2) : 0;
      return sum + item.weight * severity;
    }, 0);
    return Math.round(base * (1 + Math.max(0, abnormalItems.length - 1) * 0.1));
  }, [answers, items]);
  const level = score >= 40 ? "重大风险" : score >= 26 ? "较高风险" : score >= 11 ? "一般风险" : "低风险";

  const submitReport = () => {
    if (answered < items.length) { window.alert(`还有 ${items.length - answered} 项未完成判定。`); return; }
    if (!window.confirm(`确认提交 ${equipment}（${tag}）巡检报告？提交后将保存到本机记录。`)) return;
    const record: InspectionRecord = { id: `${Date.now()}`, equipment, tag, inspector, date: new Date().toLocaleString("zh-CN"), score, level, abnormal: items.filter((item) => answers[item.id]?.status === "abnormal").length };
    setHistory([record, ...history]); setReport(record);
  };
  const showMobileStage = (stage: "equipment" | "details" | "check") => {
    setMobileStage(stage);
    if (window.matchMedia("(max-width: 620px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const selectEquipment = (value: string) => { setEquipment(value); setStep(0); setAnswers({}); showMobileStage("details"); };
  const exportReport = () => {
    if (!report) return;
    const rows = [["设备名称", report.equipment], ["设备位号", report.tag], ["检查人员", report.inspector], ["检查时间", report.date], ["综合得分", report.score], ["风险等级", report.level], ["异常数量", report.abnormal], [], ["检查项目", "结果", "实测值/现场情况", "备注"]];
    items.forEach((item) => rows.push([item.item, answers[item.id]?.status || "", answers[item.id]?.value || "", answers[item.id]?.note || ""]));
    downloadText(`${report.tag}-巡检报告.csv`, `\ufeff${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}`, "text/csv;charset=utf-8");
  };

  return <div className="page inspection-page">
    <PageHeader eyebrow="EQUIPMENT INSPECTION" title="设备安全检查与风险评估" description="从设备类型开始，逐项完成现场检查；异常选择会即时触发风险提示。" actions={<button className="button button-outline" onClick={() => navigate("emergency")}>应急处置入口</button>} />
    <section className={`inspection-layout mobile-stage-${mobileStage}`}>
      <aside className="equipment-selector panel">
        <div className="panel-head"><div><h2>选择设备</h2><p>{equipmentTypes.length} 类常用化工设备</p></div></div>
        <div className="equipment-list">{equipmentTypes.map((item) => <button key={item.name} className={equipment === item.name ? "active" : ""} onClick={() => selectEquipment(item.name)}><span>{item.category.slice(0, 1)}</span><div><strong>{item.name}</strong><small>{item.count} 个检查项 · {item.category}</small></div><b>›</b></button>)}</div>
      </aside>
      <div className="inspection-main">
        <section className="panel inspection-meta">
          <div className="inspection-mobile-only details-toolbar"><button onClick={() => showMobileStage("equipment")}>← 重新选择设备</button><span>设备信息 · 第 2/3 步</span></div>
          <div className="inspection-meta-fields"><label>设备名称<input value={equipment} readOnly /></label><label>设备位号<input value={tag} onChange={(event) => setTag(event.target.value)} /></label><label>检查人员<input value={inspector} onChange={(event) => setInspector(event.target.value)} /></label></div>
          <div className="progress-head"><span>巡检进度 <b>{answered}/{items.length}</b></span><strong>{items.length ? Math.round((answered / items.length) * 100) : 0}%</strong></div><div className="progress-bar"><i style={{ width: `${items.length ? answered / items.length * 100 : 0}%` }} /></div>
          <div className="inspection-mobile-only mobile-meta-actions"><button className="button button-primary" onClick={() => showMobileStage("check")}>开始分步检查 <span>→</span></button></div>
        </section>
        {current ? <section className="panel wizard-card">
          <div className="inspection-mobile-only check-toolbar"><button onClick={() => showMobileStage("details")}>← 设备信息</button><span>分步检查 · 第 3/3 步</span></div>
          <div className="wizard-step"><span>步骤 {step + 1}</span><small>共 {items.length} 项</small><label className={`weight weight-${current.weight}`}>风险权重 {current.weight}</label></div>
          <h2>{current.item}</h2>
          <div className="inspection-guidance"><div><span>检查方法</span><p>{current.method}</p></div><div><span>正常判定标准</span><p>{current.standard}</p></div></div>
          <div className="status-picker"><label>现场判定</label><div>{([['normal','正常'],['abnormal','异常'],['na','不适用'],['review','待复核']] as Array<[InspectionStatus,string]>).map(([value, label]) => <button key={value} className={`${value} ${answers[current.id]?.status === value ? "active" : ""}`} onClick={() => updateAnswer(current, { status: value })}><i />{label}</button>)}</div></div>
          <div className="inspection-inputs"><label>实测值 / 现场情况<input placeholder="请输入实测值或现场情况" value={answers[current.id]?.value || ""} onChange={(event) => updateAnswer(current, { value: event.target.value })} /><ScrollingInspectionExample text={inspectionValuePlaceholder(current)} /></label><label>现场备注<textarea placeholder="补充设备状态、照片编号或异常描述" value={answers[current.id]?.note || ""} onChange={(event) => updateAnswer(current, { note: event.target.value })} /></label></div>
          {answers[current.id]?.status === "abnormal" && <div className="inline-risk"><span>!</span><div><strong>异常可能后果</strong><p>{current.consequence}</p><small>建议：{current.action}</small></div></div>}
          <div className="wizard-actions"><button className="button button-outline" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>← 上一步</button>{step < items.length - 1 ? <button className="button button-primary" onClick={() => setStep((value) => value + 1)}>下一项 →</button> : <button className="button button-primary" onClick={submitReport}>提交巡检报告</button>}</div>
        </section> : <EmptyState title="此设备暂无检查项" text="请在知识库中新增对应检查内容" />}
        <section className="risk-summary"><div><small>实时风险得分</small><strong>{score}</strong></div><div><small>当前风险等级</small><strong className={score >= 40 ? "red" : score >= 26 ? "orange" : score >= 11 ? "yellow" : "green"}>{level}</strong></div><div><small>异常 / 待复核</small><strong>{items.filter((item) => answers[item.id]?.status === "abnormal").length} / {items.filter((item) => answers[item.id]?.status === "review").length}</strong></div><p>得分 = 风险权重 × 异常严重度 × 异常数量修正系数</p></section>
      </div>
    </section>
    {alertItem && <Modal title="检测到设备异常" tone="danger" onClose={() => setAlertItem(null)}><div className="abnormal-modal"><div className="danger-symbol">!</div><h3>{alertItem.item}</h3><div><strong>可能造成的后果</strong><p>{alertItem.consequence}</p></div><div><strong>建议立即采取</strong><p>{alertItem.action}</p></div><ul><li className={alertItem.weight >= 5 ? "yes" : ""}>是否建议停止设备：{alertItem.weight >= 5 ? "是，按规程紧急停车" : "根据现场条件与规程判断"}</li><li className="yes">是否上报负责人：是</li><li>是否启动应急流程：持续恶化、泄漏或联锁失效时立即启动</li></ul><button className="button button-danger full" onClick={() => setAlertItem(null)}>确认已知晓风险</button></div></Modal>}
    {report && <Modal title="巡检风险报告" onClose={() => setReport(null)}><div className="report-summary"><div className={`report-grade ${report.score >= 40 ? "red" : report.score >= 26 ? "orange" : report.score >= 11 ? "yellow" : "green"}`}><span>{report.score}</span><strong>{report.level}</strong></div><div className="report-details"><p><span>设备</span><b>{report.equipment} · {report.tag}</b></p><p><span>检查人员</span><b>{report.inspector}</b></p><p><span>检查时间</span><b>{report.date}</b></p><p><span>异常项</span><b>{report.abnormal} 项</b></p></div></div><div className="modal-actions"><button className="button button-outline" onClick={printPage}>打印 / 导出 PDF</button><button className="button button-primary" onClick={exportReport}>导出 Excel 兼容 CSV</button></div></Modal>}
  </div>;
}

const responseLevelRank: Record<ResponseLevel, number> = { "蓝色": 0, "黄色": 1, "橙色": 2, "红色": 3 };

function getBaseResponseLevel(levelText: string): ResponseLevel {
  const normalized = levelText.trim();

  if (normalized.startsWith("原则上红色") || normalized.startsWith("红色")) return "红色";
  if (normalized.startsWith("橙色")) return "橙色";
  if (normalized.startsWith("黄色")) return "黄色";
  if (normalized.startsWith("蓝色")) return "蓝色";

  if (normalized.includes("红色")) return "红色";
  if (normalized.includes("橙色")) return "橙色";
  if (normalized.includes("黄色")) return "黄色";
  return "蓝色";
}

function maxResponseLevel(...levels: ResponseLevel[]): ResponseLevel {
  return levels.reduce((highest, level) => responseLevelRank[level] > responseLevelRank[highest] ? level : highest, "蓝色");
}

type EmergencyStage = "select" | "advice" | "flow";

function EmergencyModule() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EmergencyType>(emergencyTypes[0]);
  const [stage, setStage] = useState<EmergencyStage>("select");
  const [adviceViewed, setAdviceViewed] = useState(false);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const [scale, setScale] = useState("small");
  const [injury, setInjury] = useState(false);
  const [offsite, setOffsite] = useState(false);
  const filtered = emergencyTypes.filter((item) => `${item.name}${item.category}${item.signs}`.toLowerCase().includes(query.toLowerCase()));
  const baseResponseLevel = getBaseResponseLevel(selected.level);
  const assessedResponseLevel: ResponseLevel = injury || offsite || scale === "large" ? "红色" : scale === "medium" ? "橙色" : "蓝色";
  const responseLevel = maxResponseLevel(baseResponseLevel, assessedResponseLevel);
  const responseProfile = responseProfiles[responseLevel];
  const startFlow = () => { if (window.confirm(`确认启动“${selected.name}”应急指导？真实事故必须同时服从现场指挥和企业预案。`)) { setStarted(true); setStep(0); setCompleted([]); } };
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const showStage = (nextStage: EmergencyStage) => { setStage(nextStage); scrollToTop(); };
  const openAdvice = () => { setAdviceViewed(true); showStage("advice"); };
  const openFlow = () => showStage("flow");
  const selectType = (item: EmergencyType) => { setSelected(item); setAdviceViewed(false); setStarted(false); setStep(0); setCompleted([]); setScale("small"); setInjury(false); setOffsite(false); };
  const headerActions = stage === "advice"
    ? <div className="emergency-actions"><button className="button button-outline" onClick={() => showStage("select")}>重新选择事故</button><button className="button button-danger" onClick={openFlow}>进入应急流程</button></div>
    : stage === "flow"
      ? <div className="emergency-actions"><button className="button button-outline" onClick={openAdvice}>查看响应建议</button>{!started ? <button className="button button-danger" onClick={startFlow}>启动应急指导</button> : null}</div>
      : undefined;
  return <div className={`page emergency-page emergency-stage-${stage}`}>
    <PageHeader eyebrow="EMERGENCY RESPONSE" title="事故应急处置指导" description="依次选择事故、研判响应建议，再进入分步应急流程。" actions={headerActions} />
    <nav className="emergency-stage-nav" aria-label="事故应急处置步骤">
      <button className={stage === "select" ? "active" : "done"} onClick={() => showStage("select")}><span>{stage === "select" ? "1" : "✓"}</span><div><strong>选择事故</strong><small>确定事故类型与场景</small></div></button>
      <button className={stage === "advice" ? "active" : adviceViewed ? "done" : ""} onClick={openAdvice}><span>{adviceViewed && stage === "flow" ? "✓" : "2"}</span><div><strong>响应建议</strong><small>研判等级与组织措施</small></div></button>
      <button className={stage === "flow" ? "active" : ""} disabled={!adviceViewed} onClick={openFlow}><span>3</span><div><strong>应急流程</strong><small>按步骤执行并记录</small></div></button>
    </nav>
    <div className="emergency-banner"><span>!</span><p><strong>安全边界</strong>普通人员仅执行报警、撤离、提醒、人员清点和可从安全位置完成的远程停机/关阀；堵漏、受限空间救援及进入有毒缺氧区域仅限专业队伍。</p></div>
    {stage === "select" ? <section className="emergency-selection-stage">
      <aside className="panel accident-list"><div className="emergency-selection-head"><div><h2>选择事故类型</h2><p>{emergencyTypes.length} 类典型化工事故处置指导</p></div><div className="accident-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索事故类型或征兆" /></div></div><div className="accident-items">{filtered.map((item) => <button key={item.id} className={selected.id === item.id ? "active" : ""} onClick={() => selectType(item)}><i /><div><strong>{item.name}</strong><small>{item.category} · {item.level}</small><p>{item.scenario}</p></div><span>›</span></button>)}</div>{!filtered.length ? <div className="accident-empty">未找到匹配的事故类型，请尝试其他关键词。</div> : null}<div className="emergency-stage-actions"><div><small>当前选择</small><strong>{selected.name}</strong><span>{selected.category} · {selected.level}</span></div><button className="button button-danger" onClick={openAdvice}>确认事故，查看响应建议 →</button></div></aside>
    </section> : null}
    {stage === "advice" ? <section className="emergency-advice-stage"><div className="emergency-main">
        <section className="panel incident-overview"><div className="incident-title"><div><p>{selected.category}</p><h2>{selected.name}</h2><span>{selected.scenario}</span></div><label className={`response-badge level-${responseLevel}`}>{responseLevel}响应建议</label></div><div className="incident-grid"><div><small>典型征兆</small><p>{selected.signs}</p></div><div><small>主要风险</small><p>{selected.risks}</p></div><div className="wide"><small>首要动作</small><p>{selected.steps[0]}</p></div></div></section>
        <section className="panel response-assessor"><div><h3>响应等级快速研判</h3><p>基础等级 {baseResponseLevel}；当前建议执行“{responseProfile.name}”。</p></div><label>事故规模<select value={scale} onChange={(event) => setScale(event.target.value)}><option value="small">少量 / 局部</option><option value="medium">持续 / 车间范围</option><option value="large">大量 / 装置范围</option></select></label><label className="switch-row"><input type="checkbox" checked={injury} onChange={(event) => setInjury(event.target.checked)} /><span>有人受伤</span></label><label className="switch-row"><input type="checkbox" checked={offsite} onChange={(event) => setOffsite(event.target.checked)} /><span>可能影响厂外</span></label><strong className={`response-badge level-${responseLevel}`}>{responseLevel}</strong></section>
        <section className={`panel level-guidance level-guidance-${responseLevel}`}>
          <div className="level-guidance-head"><div><small>当前等级的组织响应措施</small><h3>{responseProfile.name}</h3><p>{responseProfile.trigger}</p></div><span className={`response-badge level-${responseLevel}`}>{responseLevel}响应</span></div>
          <div className="level-guidance-grid">
            <div><strong>指挥层级</strong><p>{responseProfile.command}</p></div>
            <div><strong>报警与报告</strong><p>{responseProfile.reporting}</p></div>
            <div><strong>警戒与撤离</strong><p>{responseProfile.evacuation}</p></div>
            <div><strong>处置力量</strong><p>{responseProfile.resources}</p></div>
            <div><strong>外部联动</strong><p>{responseProfile.external}</p></div>
            <div><strong>升级条件</strong><p>{responseProfile.upgrade}</p></div>
          </div>
          <div className="level-guidance-recovery"><strong>恢复 / 降级要求</strong><p>{responseProfile.recovery}</p></div>
          <p className="level-guidance-note">本等级为系统辅助研判；实际启动条件、报告程序和指挥权限以本单位应急预案、属地规定和现场指挥为准。</p>
        </section>
        <div className="emergency-stage-actions advice-actions"><button className="button button-outline" onClick={() => showStage("select")}>← 返回选择事故</button><button className="button button-danger" onClick={openFlow}>确认建议，进入应急流程 →</button></div>
      </div></section> : null}
    {stage === "flow" ? <section className="emergency-flow-stage"><div className="emergency-flow-context"><div><small>当前事故</small><strong>{selected.name}</strong><span>{selected.category} · {responseLevel}响应</span></div><button onClick={openAdvice}>查看响应建议</button></div>
      {started ? <section className="panel emergency-wizard"><div className="emergency-progress">{selected.steps.map((_, index) => <button key={index} className={`${step === index ? "active" : ""} ${completed.includes(index) ? "done" : ""}`} onClick={() => setStep(index)}><span>{completed.includes(index) ? "✓" : index + 1}</span><small>{emergencyStepNames[index]}</small></button>)}</div><div className="emergency-step-content"><div className="step-number">STEP {step + 1}</div><h2>{emergencyStepNames[step]}</h2><p className="main-action">{selected.steps[step]}</p><div className="emergency-detail-grid"><div className="prohibit"><strong>禁止操作</strong><p>{selected.prohibited}</p></div><div><strong>所需防护</strong><p>{selected.ppe}</p></div><div><strong>升级条件</strong><p>{selected.escalation}</p></div><div><strong>恢复条件</strong><p>{selected.recovery}</p></div></div><div className="wizard-actions"><button className="button button-outline" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>← 上一步</button><label className="complete-check"><input type="checkbox" checked={completed.includes(step)} onChange={(event) => setCompleted(event.target.checked ? [...completed, step] : completed.filter((value) => value !== step))} />当前步骤已完成</label>{step < selected.steps.length - 1 ? <button className="button button-danger" onClick={() => setStep((value) => value + 1)}>下一步 →</button> : <button className="button button-primary" onClick={() => window.alert("流程记录完成。恢复生产前必须完成检测、完整性确认与批准。")}>完成并记录</button>}</div></div></section> : <section className="panel flow-preview"><div><span className="preview-symbol">!</span><h2>准备启动分步应急流程</h2><p>系统将按 6 个阶段逐步展示操作、禁忌、防护和升级条件。</p><button className="button button-danger" onClick={startFlow}>二次确认并启动</button></div><ol>{selected.steps.map((content, index) => <li key={content}><span>{index + 1}</span><div><strong>{emergencyStepNames[index]}</strong><p>{content}</p></div></li>)}</ol></section>}
    </section> : null}
  </div>;
}

type CleanerInputs = { product: number; raw: number; water: number; recycledWater: number; electricity: number; steam: number; gas: number; fuel: number; wastewater: number; wastegas: number; solid: number; effectiveRaw: number; recoverable: number; recovered: number; theoretical: number; batches: number; hours: number };
type CleanerStage = "input" | "score";

function CleanerModule() {
  const [values, setValues] = useState<CleanerInputs>({ product: 100, raw: 118, water: 420, recycledWater: 180, electricity: 18500, steam: 35, gas: 1200, fuel: 0, wastewater: 280, wastegas: 42, solid: 6, effectiveRaw: 105, recoverable: 8, recovered: 6.5, theoretical: 108, batches: 12, hours: 168 });
  const [stage, setStage] = useState<CleanerStage>("input");
  const [evaluated, setEvaluated] = useState(false);
  const setValue = (key: keyof CleanerInputs, value: string) => {
    setValues({ ...values, [key]: Number(value) || 0 });
    setEvaluated(false);
  };
  const result = useMemo(() => {
    const product = Math.max(values.product, 0.0001);
    const water = values.water / product;
    const electricity = values.electricity / product;
    const energy = (values.electricity * 0.1229 + values.steam * 128.6 + values.gas * 1.2143 + values.fuel * 1457.1) / product;
    const rawUse = values.raw ? values.effectiveRaw / values.raw * 100 : 0;
    const yieldRate = values.theoretical ? values.product / values.theoretical * 100 : 0;
    const wastewater = values.wastewater / product;
    const solid = values.solid / product;
    const waterReuse = values.water + values.recycledWater ? values.recycledWater / (values.water + values.recycledWater) * 100 : 0;
    const byproduct = values.recoverable ? values.recovered / values.recoverable * 100 : 0;
    const dimensionScores = {
      "能源消耗": clamp(200 / Math.max(energy, 1) * 100, 0, 100),
      "水资源消耗": clamp(5 / Math.max(water, 0.1) * 100, 0, 100),
      "原料利用率": clamp(rawUse / 90 * 100, 0, 100),
      "废水排放": clamp(3 / Math.max(wastewater, 0.1) * 100, 0, 100),
      "废气排放": clamp(0.5 / Math.max(values.wastegas / product, 0.01) * 100, 0, 100),
      "固废与回收": clamp(((0.1 / Math.max(solid, 0.01) * 60) + (byproduct / 100 * 40)), 0, 100),
    };
    const weights = [0.25, 0.2, 0.2, 0.15, 0.1, 0.1];
    const score = Object.values(dimensionScores).reduce((sum, value, index) => sum + value * weights[index], 0);
    const grade = score >= 90 ? "一级 · 先进水平" : score >= 75 ? "二级 · 较好水平" : score >= 60 ? "三级 · 基本水平" : "四级 · 重点改进";
    const suggestions: string[] = [];
    if (water > 5) suggestions.push("单位产品耗水偏高：优化清洗流程，采用逆流清洗并增加中水回用。");
    if (energy > 200) suggestions.push("综合能耗偏高：开展换热网络优化、余热回收和蒸汽冷凝水回收。");
    if (rawUse < 90) suggestions.push("原料利用率偏低：优化反应条件、配比和分离回收工艺。");
    if (wastewater > 3) suggestions.push("废水产生量偏高：实施分质收集、源头减量和循环利用。");
    if (solid > 0.1) suggestions.push("固废产生量偏高：推进副产物回收与资源化利用。");
    if (!suggestions.length) suggestions.push("主要指标表现良好，建议保持监测并优先提升水重复利用率。");
    return { water, electricity, energy, rawUse, yieldRate, wastewater, solid, waterReuse, byproduct, dimensionScores, score, grade, suggestions };
  }, [values]);
  const inputs: Array<[keyof CleanerInputs, string, string]> = [["product","产品产量","t"],["raw","原料投入量","t"],["effectiveRaw","产品中有效原料量","t"],["theoretical","理论产品产量","t"],["water","新鲜水使用量","m³"],["recycledWater","循环使用水量","m³"],["electricity","电力使用量","kWh"],["steam","蒸汽使用量","t"],["gas","天然气使用量","m³"],["fuel","燃煤/燃油折算量","t"],["wastewater","废水产生量","m³"],["wastegas","废气排放量","t"],["solid","固体废物产生量","t"],["recoverable","可回收副产物总量","t"],["recovered","实际回收副产物量","t"],["batches","生产批次数","批"],["hours","运行时间","h"]];
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const openInput = () => { setStage("input"); scrollToTop(); };
  const showScore = () => {
    const required = values.product > 0 && values.raw > 0 && values.theoretical > 0 && values.batches > 0 && values.hours > 0;
    const nonNegative = Object.values(values).every((value) => Number.isFinite(value) && value >= 0);
    if (!required || !nonNegative) {
      window.alert("请检查生产过程数据：产品产量、原料投入量、理论产品产量、生产批次数和运行时间必须大于 0，其他数据不能为负数。");
      return;
    }
    setEvaluated(true);
    setStage("score");
    scrollToTop();
  };
  const clearConsumption = () => {
    setValues({ ...values, water: 0, electricity: 0, steam: 0, gas: 0, wastewater: 0, wastegas: 0, solid: 0 });
    setEvaluated(false);
  };
  return <div className={`page cleaner-page cleaner-stage-${stage}`}>
    <PageHeader eyebrow="CLEANER PRODUCTION" title="清洁生产与能耗排放评价" description="先填写生产过程数据，完成后进入综合评分与改进建议界面。" actions={stage === "score" ? <div className="cleaner-actions"><button className="button button-outline" onClick={openInput}>修改数据</button><button className="button button-primary" onClick={printPage}>打印评价报告</button></div> : undefined} />
    <nav className="cleaner-stage-nav" aria-label="清洁生产评价步骤">
      <button className={stage === "input" ? "active" : "done"} onClick={openInput}><span>{stage === "score" ? "✓" : "1"}</span><div><strong>生产过程数据</strong><small>填写产量、能耗与排放</small></div></button>
      <button className={stage === "score" ? "active" : ""} disabled={!evaluated} onClick={() => { setStage("score"); scrollToTop(); }}><span>2</span><div><strong>综合评分</strong><small>查看指标与改进建议</small></div></button>
    </nav>
    {stage === "input" ? <section className="cleaner-input-stage"><div className="panel cleaner-form"><div className="panel-head"><div><h2>生产过程数据</h2><p>示例单位按一个生产周期的总量填写</p></div><button className="text-button" onClick={clearConsumption}>清空消耗数据</button></div><div className="form-section production-section"><h3>产量与原料</h3><div className="input-grid">{inputs.slice(0,4).map(([key,label,unit]) => <NumberField key={key} label={label} unit={unit} value={values[key]} onChange={(value) => setValue(key,value)} />)}</div></div><div className="form-section resource-section"><h3>资源与能源</h3><div className="input-grid">{inputs.slice(4,10).map(([key,label,unit]) => <NumberField key={key} label={label} unit={unit} value={values[key]} onChange={(value) => setValue(key,value)} />)}</div></div><div className="form-section output-section"><h3>排放、回收与运行</h3><div className="input-grid">{inputs.slice(10).map(([key,label,unit]) => <NumberField key={key} label={label} unit={unit} value={values[key]} onChange={(value) => setValue(key,value)} />)}</div></div><div className="cleaner-stage-actions"><span>第 1 步，共 2 步</span><button className="button button-primary" onClick={showScore}>填写完成，生成评分 →</button></div></div></section> : null}
    {stage === "score" ? <section className="cleaner-score-stage"><div className="cleaner-results"><section className="score-card"><div className="score-top"><div><p>清洁生产综合评分</p><strong>{result.score.toFixed(1)}<small>/100</small></strong><span>{result.grade}</span></div><div className="score-gauge" style={{ "--score": `${result.score * 3.6}deg` } as React.CSSProperties}><i>{Math.round(result.score)}</i></div></div><p className="score-note">基于能源 25%、水资源 20%、原料利用 20%、废水 15%、废气 10%、固废与回收 10% 加权评价。</p></section>
      <section className="panel indicator-panel"><div className="panel-head"><div><h2>核心指标</h2><p>单位产品与循环利用表现</p></div></div><div className="indicator-grid"><Metric label="单位产品耗水" value={result.water.toFixed(2)} unit="m³/t" /><Metric label="单位产品耗电" value={result.electricity.toFixed(1)} unit="kWh/t" /><Metric label="综合能耗" value={result.energy.toFixed(1)} unit="kgce/t" /><Metric label="原料利用率" value={result.rawUse.toFixed(1)} unit="%" /><Metric label="产品收率" value={result.yieldRate.toFixed(1)} unit="%" /><Metric label="水重复利用率" value={result.waterReuse.toFixed(1)} unit="%" /></div></section>
      <section className="panel dimension-panel"><div className="panel-head"><div><h2>分维度表现</h2><p>与原型目标值的差距</p></div></div>{Object.entries(result.dimensionScores).map(([label,value]) => <div className="dimension-row" key={label}><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><strong>{value.toFixed(0)}</strong></div>)}</section>
      <section className="panel suggestion-panel"><div className="panel-head"><div><h2>优先改进建议</h2><p>按当前输入动态生成</p></div></div><ol>{result.suggestions.map((suggestion,index) => <li key={suggestion}><span>{index + 1}</span><p>{suggestion}</p></li>)}</ol></section></div><div className="cleaner-stage-actions cleaner-score-actions"><button className="button button-outline" onClick={openInput}>← 返回修改数据</button><button className="button button-primary" onClick={printPage}>打印评价报告</button></div></section> : null}
  </div>;
}

function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (value: string) => void }) { return <label className="number-field"><span>{label}</span><div><input type="number" min="0" step="any" value={value} onChange={(event) => onChange(event.target.value)} /><b>{unit}</b></div></label>; }
function Metric({ label, value, unit }: { label: string; value: string; unit: string }) { return <div className="metric"><small>{label}</small><strong>{value}<em>{unit}</em></strong></div>; }

type SimParams = { initial: number; target: number; ambient: number; mass: number; cp: number; maxHeat: number; maxCool: number; duration: number; dt: number; kp: number; ki: number; kd: number; reactionHeat: number; heatLoss: number; alarm: number };
type SimPoint = { time: number; temp: number; target: number; error: number; heat: number; cool: number; output: number; rate: number };

function runSimulation(params: SimParams) {
  const points: SimPoint[] = []; let temp = params.initial; let integral = 0; let previousError = params.target - temp;
  for (let time = 0; time <= params.duration; time += params.dt) {
    const error = params.target - temp; const derivative = (error - previousError) / params.dt;
    const proposedIntegral = clamp(integral + error * params.dt, -500, 500);
    const raw = params.kp * error + params.ki * proposedIntegral + params.kd * derivative;
    if ((raw < 100 || error < 0) && (raw > -100 || error > 0)) integral = proposedIntegral;
    const output = clamp(params.kp * error + params.ki * integral + params.kd * derivative, -100, 100);
    let heat = clamp(output, 0, 100); const cool = clamp(-output + Math.max(0, temp - params.target) * 6, 0, 100);
    if (temp >= params.alarm + 2) heat = 0;
    const qHeat = params.maxHeat * heat / 100; const qReaction = params.reactionHeat * Math.exp(-time / Math.max(params.duration * 0.35, 1));
    const coolingFactor = Math.max(0.2, (temp - params.ambient) / Math.max(params.target - params.ambient, 1));
    const qCool = params.maxCool * cool / 100 * coolingFactor; const qLoss = params.heatLoss * (temp - params.ambient);
    const rate = (qHeat + qReaction - qCool - qLoss) / Math.max(params.mass * params.cp, 0.1);
    points.push({ time, temp, target: params.target, error, heat, cool, output, rate });
    temp += rate * params.dt; previousError = error;
  }
  return points;
}

type SimulationStage = "params" | "curve" | "result";

function SimulationModule() {
  const [params, setParams] = useState<SimParams>({ initial: 25, target: 80, ambient: 22, mass: 500, cp: 4.0, maxHeat: 160, maxCool: 220, duration: 900, dt: 2, kp: 5.2, ki: 0.035, kd: 18, reactionHeat: 12, heatLoss: 0.12, alarm: 88 });
  const [points, setPoints] = useState<SimPoint[]>(() => runSimulation(params));
  const [visible, setVisible] = useState(1);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<SimulationStage>("params");
  const [completed, setCompleted] = useState(false);
  const [comparison, setComparison] = useState<{ overshoot: number; steadyError: number } | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setVisible((value) => Math.min(points.length, value + Math.max(1, Math.floor(points.length / 180)))), 40);
    return () => window.clearInterval(timer);
  }, [points.length, running]);

  useEffect(() => {
    if (!running || visible < points.length) return;
    const frame = window.requestAnimationFrame(() => {
      setRunning(false);
      setCompleted(true);
      setStage("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [points.length, running, visible]);

  const setParam = (key: keyof SimParams, value: string) => {
    setParams({ ...params, [key]: Number(value) || 0 });
    setRunning(false);
    setVisible(1);
    setCompleted(false);
    setComparison(null);
  };

  const start = () => {
    if (params.mass <= 0 || params.cp <= 0 || params.duration <= 0 || params.dt <= 0 || params.maxHeat < 0 || params.maxCool < 0) {
      window.alert("请检查模型参数：质量、比热容、仿真时间和时间步长必须大于 0，加热与冷却能力不能为负数。");
      setStage("params");
      return;
    }
    const next = runSimulation(params);
    setPoints(next);
    setVisible(1);
    setCompleted(false);
    setComparison(null);
    setStage("curve");
    setRunning(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openStage = (next: SimulationStage) => {
    if (next === "result" && !completed) return;
    if (next === "curve" && stage === "params" && visible <= 1 && !completed) return;
    setRunning(false);
    setStage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const shown = points.slice(0, visible);
  const current = shown.at(-1) || points[0];
  const metrics = useMemo(() => {
    const maxTemp = Math.max(...points.map((point) => point.temp));
    const overshoot = Math.max(0, maxTemp - params.target);
    const steadyError = Math.abs(points.at(-1)?.error || 0);
    const band = Math.max(params.target * 0.02, 1);
    let settleTime = params.duration;
    for (let index = 0; index < points.length; index += 1) if (points.slice(index).every((point) => Math.abs(point.error) <= band)) { settleTime = points[index].time; break; }
    return { maxTemp, overshoot, steadyError, settleTime, stable: steadyError <= band && overshoot < params.target * 0.1 };
  }, [params.duration, params.target, points]);
  const comparePid = () => { const alternate = runSimulation({ ...params, kp: params.kp * 0.75, kd: params.kd * 1.25 }); const max = Math.max(...alternate.map((point) => point.temp)); setComparison({ overshoot: Math.max(0, max - params.target), steadyError: Math.abs(alternate.at(-1)?.error || 0) }); };
  const exportCsv = () => downloadText("PID温度仿真数据.csv", `\ufeff时间(s),设定温度(℃),实际温度(℃),偏差(℃),加热功率(%),冷却阀开度(%),PID输出(%)\n${points.map((point) => [point.time,point.target,point.temp.toFixed(3),point.error.toFixed(3),point.heat.toFixed(2),point.cool.toFixed(2),point.output.toFixed(2)].join(",")).join("\n")}`, "text/csv;charset=utf-8");
  const paramFields: Array<[keyof SimParams,string,string]> = [["initial","初始温度","℃"],["target","目标温度","℃"],["ambient","环境温度","℃"],["mass","物料质量","kg"],["cp","物料比热容","kJ/(kg·K)"],["maxHeat","最大加热功率","kW"],["maxCool","最大冷却能力","kW"],["duration","仿真总时间","s"],["dt","时间步长","s"],["reactionHeat","初始反应放热","kW"],["heatLoss","散热系数","kW/K"],["alarm","高温报警值","℃"]];
  const stageIndex = stage === "params" ? 0 : stage === "curve" ? 1 : 2;

  return <div className={`page simulation-page simulation-stage-${stage}`}>
    <PageHeader eyebrow="REACTOR SIMULATION" title="反应釜温度智能控制模拟" description="依次完成模型参数设置、动态仿真和控制效果评价。" actions={stage === "result" ? <div className="simulation-actions"><button className="button button-outline" onClick={exportCsv}>导出数据</button><button className="button button-primary" onClick={() => openStage("params")}>调整参数</button></div> : undefined} />
    <nav className="simulation-stage-nav" aria-label="仿真流程">
      {([['params','1','模型参数'],['curve','2','仿真曲线'],['result','3','结果评价']] as Array<[SimulationStage,string,string]>).map(([value, number, label], index) => {
        const disabled = (value === "curve" && stage === "params" && visible <= 1 && !completed) || (value === "result" && !completed);
        return <button key={value} className={`${stage === value ? "active" : ""} ${index < stageIndex ? "done" : ""}`} disabled={disabled} onClick={() => openStage(value)}><span>{index < stageIndex ? "✓" : number}</span><small>{label}</small></button>;
      })}
    </nav>

    {stage === "params" && <section className="simulation-parameter-stage">
      <aside className="panel parameter-panel"><div className="panel-head"><div><h2>模型参数</h2><p>确认过程、设备和 PID 参数后进入动态仿真</p></div></div><div className="param-scroll"><div className="param-group"><h3>过程与设备</h3>{paramFields.map(([key,label,unit]) => <NumberField key={key} label={label} unit={unit} value={params[key]} onChange={(value) => setParam(key,value)} />)}</div><div className="param-group pid-group"><h3>PID 参数</h3><NumberField label="比例系数 Kp" unit="" value={params.kp} onChange={(value) => setParam("kp",value)} /><NumberField label="积分系数 Ki" unit="" value={params.ki} onChange={(value) => setParam("ki",value)} /><NumberField label="微分系数 Kd" unit="" value={params.kd} onChange={(value) => setParam("kd",value)} /></div></div><div className="simulation-stage-actions"><span>第 1 步，共 3 步</span><button className="button button-primary" onClick={start}>参数填写完成，开始仿真 →</button></div></aside>
    </section>}

    {stage === "curve" && <section className="simulation-curve-stage"><div className="simulation-main">
      <section className="sim-kpis"><div><small>实际温度</small><strong>{current.temp.toFixed(1)}<em>℃</em></strong><span className={current.temp >= params.alarm ? "red" : "green"}>{current.temp >= params.alarm ? "高温报警" : "温度正常"}</span></div><div><small>温度偏差</small><strong>{current.error.toFixed(2)}<em>℃</em></strong><span>设定 {params.target}℃</span></div><div><small>加热功率</small><strong>{current.heat.toFixed(0)}<em>%</em></strong><span>最大 {params.maxHeat} kW</span></div><div><small>冷却阀开度</small><strong>{current.cool.toFixed(0)}<em>%</em></strong><span>PID {current.output.toFixed(1)}%</span></div></section>
      <section className="panel chart-panel"><div className="panel-head"><div><h2>温度响应曲线</h2><p>{running ? "仿真运行中，完成后自动进入结果评价" : "仿真已暂停，可继续或重新开始"}</p></div><div className="chart-legend"><span className="target">设定温度</span><span className="actual">实际温度</span><span className="alarm">报警线</span></div></div><LineChart points={shown} alarm={params.alarm} duration={params.duration} /><div className="chart-controls"><button onClick={() => setRunning(true)} disabled={running}>▶ 继续</button><button onClick={() => setRunning(false)} disabled={!running}>Ⅱ 暂停</button><button onClick={start}>↺ 重新开始</button><span>t = {current.time.toFixed(0)} / {params.duration}s</span></div></section>
      <section className="panel output-chart"><div className="panel-head"><div><h2>控制器输出</h2><p>加热功率与冷却阀门开度</p></div></div><OutputBars point={current} /></section>
      <div className="simulation-stage-actions"><button className="button button-outline" onClick={() => openStage("params")}>← 返回模型参数</button><span>{running ? "正在计算…" : "仿真已暂停"}</span></div>
    </div></section>}

    {stage === "result" && <section className="simulation-result-stage">
      <section className="result-overview panel"><div><small>最终温度</small><strong>{points.at(-1)?.temp.toFixed(2)} ℃</strong></div><div><small>目标温度</small><strong>{params.target.toFixed(2)} ℃</strong></div><div><small>系统状态</small><strong className={metrics.stable ? "green" : "red"}>{metrics.stable ? "稳定" : "需要调参"}</strong></div></section>
      <section className="simulation-evaluation"><div className="panel evaluation-card"><div className="panel-head"><div><h2>仿真结果评价</h2><p>自动分析控制品质</p></div><span className={metrics.stable ? "stable" : "unstable"}>{metrics.stable ? "系统稳定" : "需要调参"}</span></div><div className="evaluation-grid"><Metric label="最大温度" value={metrics.maxTemp.toFixed(2)} unit="℃" /><Metric label="最大超调量" value={metrics.overshoot.toFixed(2)} unit="℃" /><Metric label="稳态误差" value={metrics.steadyError.toFixed(2)} unit="℃" /><Metric label="调节时间" value={metrics.settleTime.toFixed(0)} unit="s" /></div><div className="tuning-tip"><strong>调参建议</strong><p>{metrics.overshoot > 5 ? "超调较大，建议减小 Kp 或 Ki，并适当增大 Kd。" : metrics.settleTime > params.duration * 0.7 ? "响应较慢，可适当增大 Kp；若长期有稳态误差，可小幅增大 Ki。" : "当前参数响应较平稳，可继续在不同反应放热负荷下验证鲁棒性。"}</p></div></div><div className="panel compare-card"><h2>PID 对比实验</h2><p>与“降低 Kp 25%、提高 Kd 25%”的保守参数组比较。</p><button className="button button-outline full" onClick={comparePid}>运行对比参数组</button>{comparison && <div className="compare-metrics"><p><span>当前超调</span><b>{metrics.overshoot.toFixed(2)}℃</b></p><p><span>对比超调</span><b>{comparison.overshoot.toFixed(2)}℃</b></p><p><span>对比稳态误差</span><b>{comparison.steadyError.toFixed(2)}℃</b></p></div>}</div></section>
      <div className="simulation-stage-actions"><button className="button button-outline" onClick={() => openStage("curve")}>← 查看完整曲线</button><button className="button button-primary" onClick={() => openStage("params")}>调整参数并重新仿真</button></div>
    </section>}
  </div>;
}

function LineChart({ points, alarm, duration }: { points: SimPoint[]; alarm: number; duration: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const parent = canvas.parentElement; if (!parent) return;
    const draw = () => { const width = parent.clientWidth; const height = width < 520 ? 260 : 330; const dpr = window.devicePixelRatio || 1; canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(dpr,dpr); ctx.clearRect(0,0,width,height); const pad = {l:48,r:18,t:18,b:35}; const plotW=width-pad.l-pad.r, plotH=height-pad.t-pad.b; const maxY=Math.max(alarm+8,...points.map((p)=>p.temp),...points.map((p)=>p.target)); const minY=Math.min(0,...points.map((p)=>p.temp))-2; const x=(t:number)=>pad.l+t/Math.max(duration,1)*plotW; const y=(v:number)=>pad.t+(maxY-v)/(maxY-minY)*plotH;
      ctx.strokeStyle="#e1e8f2";ctx.lineWidth=1;ctx.fillStyle="#8190a5";ctx.font="11px system-ui";for(let i=0;i<=5;i++){const value=minY+(maxY-minY)*(5-i)/5;const py=pad.t+plotH*i/5;ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(width-pad.r,py);ctx.stroke();ctx.fillText(value.toFixed(0),6,py+4);}for(let i=0;i<=6;i++){const value=duration*i/6;const px=pad.l+plotW*i/6;ctx.fillText(`${value.toFixed(0)}s`,px-12,height-10);}
      const line=(getter:(p:SimPoint)=>number,color:string,dash:number[]=[])=>{ctx.beginPath();points.forEach((point,index)=>{const px=x(point.time),py=y(getter(point));if(index===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}; line((p)=>p.target,"#255bc7",[7,5]);line((p)=>p.temp,"#10a37f");ctx.beginPath();ctx.moveTo(pad.l,y(alarm));ctx.lineTo(width-pad.r,y(alarm));ctx.strokeStyle="#e34850";ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);
    }; draw(); const observer=new ResizeObserver(draw);observer.observe(parent);return()=>observer.disconnect();
  },[alarm,duration,points]);
  return <canvas ref={ref} aria-label="温度响应曲线" />;
}

function OutputBars({ point }: { point: SimPoint }) { return <div className="output-bars"><div><span>加热功率</span><div><i className="heat" style={{ width: `${point.heat}%` }} /></div><strong>{point.heat.toFixed(0)}%</strong></div><div><span>冷却阀门</span><div><i className="cool" style={{ width: `${point.cool}%` }} /></div><strong>{point.cool.toFixed(0)}%</strong></div><div><span>温变速率</span><div><i className="rate" style={{ width: `${clamp(Math.abs(point.rate)*800,0,100)}%` }} /></div><strong>{point.rate.toFixed(3)}℃/s</strong></div></div>; }
