#!/usr/bin/env python3
"""Build the APK's deterministic chemical SQLite database.

With --refresh-source, the script expands the curated 100-row JSON table to
1,500 rows using two checked-in PubChem snapshots: 900 basic identifier rows
and 500 unique-CAS rows with experimental physicochemical properties.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "app" / "data" / "source-data.json"
DEFAULT_CATALOG = ROOT / "db" / "pubchem-catalog.json"
DEFAULT_PHYSCHEM = ROOT / "db" / "pubchem-physchem-500.json"
DEFAULT_SAFETY = ROOT / "db" / "pubchem-safety-1400.json"
DEFAULT_OUTPUT = ROOT / "android" / "assets" / "databases" / "chemicals.db"
SHEET = "化学品安全数据"
TARGET_COUNT = 1500
CURATED_COUNT = 100
BASIC_CATALOG_COUNT = 900
PHYSCHEM_COUNT = 500
DATA_VERSION = "2026-07-18"


def cell(value: object) -> str:
    return "" if value is None else str(value)


def classify_risk(hazards: str, toxicity: str) -> str:
    value = hazards + toxicity
    h_codes = set(re.findall(r"\bH\d{3}\b", value))
    if h_codes & {"H200", "H201", "H202", "H203", "H204", "H205", "H250", "H260", "H300", "H310", "H330", "H340", "H350", "H360", "H370"}:
        return "critical"
    if h_codes & {"H220", "H221", "H222", "H224", "H225", "H226", "H228", "H240", "H241", "H242", "H251", "H252", "H261", "H270", "H271", "H272", "H301", "H311", "H314", "H317", "H318", "H331", "H334", "H341", "H351", "H361", "H372"}:
        return "high"
    if h_codes:
        return "medium"
    if "待核验" in value or "未核验" in value:
        return "unknown"
    keyword_value = re.sub(
        r"(?:低|较低|很低|无|无明显|未见|未发现|不具有|非)\s*(?:急性)?毒性|急性毒性\s*(?:低|较低|很低)",
        "",
        value,
    )
    if re.search(r"剧毒|爆炸|致癌|死亡|急性毒性|自燃|有机过氧化物", keyword_value):
        return "critical"
    if re.search(r"高度易燃|极度易燃|腐蚀|有毒|氧化性|特异性靶器官", keyword_value):
        return "high"
    if re.search(r"易燃|刺激|有害|窒息|健康危害", keyword_value):
        return "medium"
    return "low"


def hazard_tags(hazards: str) -> list[str]:
    candidates = [
        ("易燃", r"易燃|可燃|H22[0-8]|H24[01]|H25[0-2]|H26[01]"),
        ("有毒", r"毒性|有毒|中毒|H30[0-2]|H31[0-2]|H33[0-2]"),
        ("腐蚀", r"腐蚀|H290|H314"),
        ("氧化", r"氧化|H27[0-2]"),
        ("爆炸", r"爆炸|爆炸性|H20[0-5]"),
        ("健康危害", r"致癌|靶器官|健康危害|窒息|H3\d{2}"),
        ("环境危害", r"环境|水生|H4\d{2}"),
    ]
    return [label for label, pattern in candidates if re.search(pattern, hazards)]


def catalog_row(row_id: int, record: dict[str, object]) -> list[object]:
    cid = int(record["CID"])
    title = cell(record.get("Title")) or cell(record.get("IUPACName")) or f"PubChem CID {cid}"
    iupac = cell(record.get("IUPACName"))
    safety_unknown = "安全危害数据待核验；使用、储存或运输前必须查阅具体产品最新版 SDS"
    property_unknown = "未收录；请查阅具体产品 SDS 或权威数据库"
    return [
        row_id,
        title,
        iupac if iupac.lower() != title.lower() else title,
        f"未收录（PubChem CID {cid}）",
        cell(record.get("MolecularFormula")),
        cell(record.get("MolecularWeight")),
        property_unknown,
        property_unknown,
        property_unknown,
        property_unknown,
        property_unknown,
        safety_unknown,
        property_unknown,
        property_unknown,
        "毒性与健康危害数据未核验；不得依据本条目制定防护或急救措施",
        "按具体产品 SDS、标签及相容性要求储存；未核验前不得据此确定储存条件",
        "按具体产品 SDS 和现场风险评估选择个体防护装备",
        "立即隔离并查阅具体产品 SDS；未知物质按高风险原则由专业人员处置",
        "根据具体产品 SDS 选择灭火剂；未知情况下联系专业消防救援",
        "相容性数据未核验；不得与其他化学品混存或混合，直至完成专项评估",
        f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
        "https://chemicalsafety.ilo.org/dyn/icsc/showcard.home",
        f"PubChem CID {cid} 基础属性快照；安全参数未核验；数据版本 {DATA_VERSION}",
    ]


def physchem_row(row_id: int, record: dict[str, object]) -> list[object]:
    cid = int(record["CID"])
    title = cell(record.get("Title")) or cell(record.get("IUPACName")) or f"PubChem CID {cid}"
    iupac = cell(record.get("IUPACName"))
    missing = "PubChem实验性质中未收录该项；使用前请核对具体产品最新版 SDS"
    hazards = "CAS和实验理化性质已收录；安全危险数据待核验，操作前必须查阅具体产品最新版 SDS"
    extra_properties = "；".join(
        f"{label}：{cell(record.get(key))}"
        for label, key in (("蒸气压", "vapor_pressure"), ("折射率", "refractive_index"), ("黏度", "viscosity"))
        if cell(record.get(key))
    )
    cas_source = cell(record.get("CASSource")) or "PubChem CAS annotation"
    note = (
        f"PubChem CID {cid}；CAS注释来源：{cas_source}；理化性质来自PubChem Experimental Properties，"
        "保留原始单位及最多两条实验值，不对冲突数据擅自平均"
    )
    if extra_properties:
        note += f"；补充性质：{extra_properties}"
    note += f"；数据版本 {DATA_VERSION}"
    return [
        row_id,
        title,
        iupac if iupac and iupac.lower() != title.lower() else title,
        cell(record.get("CAS")),
        cell(record.get("MolecularFormula")),
        cell(record.get("MolecularWeight")),
        cell(record.get("appearance")) or missing,
        cell(record.get("melting_point")) or missing,
        cell(record.get("boiling_point")) or missing,
        cell(record.get("density")) or missing,
        cell(record.get("solubility")) or missing,
        hazards,
        cell(record.get("flash_point")) or missing,
        "PubChem实验性质中未提供统一爆炸极限；必须查阅具体产品 SDS",
        "毒性与健康危害未在本批次核验；不得仅依据理化性质制定防护或急救措施",
        "按具体产品 SDS、标签、温度条件及相容性要求储存",
        "按具体产品 SDS 和现场风险评估选择护目、防化、呼吸及防静电装备",
        "立即隔离、消除点火源并查阅具体产品 SDS，由受训人员按物质特性处置",
        "根据具体产品 SDS 选择灭火剂；未知情况下联系专业消防救援",
        "反应性与禁忌物未在本批次核验；完成专项相容性评估前不得混存或混合",
        f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
        "https://chemicalsafety.ilo.org/dyn/icsc/showcard.home",
        note,
    ]


def clean_ghs_statement(value: str) -> str:
    value = re.sub(r"\s*\[[^\]]+\]\s*$", "", value)
    value = re.sub(r"^(H\d{3})\s*\([^)]*\)\s*:", r"\1:", value)
    return re.sub(r"\s+", " ", value).strip()


def safety_enrich(row: list[object], record: dict[str, object]) -> list[object]:
    status = cell(record.get("status"))
    if status == "unavailable":
        return row
    h_codes = [cell(code) for code in record.get("hCodes", [])]
    statements = record.get("hazardStatements", {})
    statement_values = [clean_ghs_statement(cell(statements.get(code, code))) for code in h_codes]
    source_count = int(record.get("sourceCount", 0))
    sources = record.get("sources", [])
    source_names = list(dict.fromkeys(cell(source.get("name")) for source in sources if cell(source.get("name"))))
    status_label = "GHS来源核验" if status == "verified" else "安全数据部分核验"
    pictograms = "、".join(cell(value) for value in record.get("pictograms", [])) or "未提供"
    signals = "、".join(cell(value) for value in record.get("signals", [])) or "未提供"
    row[11] = f"{status_label}（{source_count}个来源；信号词：{signals}；图示：{pictograms}）：" + "；".join(statement_values)

    health = [statement for code, statement in zip(h_codes, statement_values) if code.startswith("H3")]
    row[14] = "；".join(health) if health else f"{status_label}未检出H3xx健康危害代码；仍须核对具体产品SDS、浓度和暴露限值"
    p_codes = [cell(code) for code in record.get("pCodes", [])]
    storage_codes = [code for code in p_codes if code.startswith("P4") or "P4" in code]
    prevention_codes = [code for code in p_codes if code.startswith(("P26", "P27", "P28"))]
    response_codes = [code for code in p_codes if code.startswith("P3")]
    fire_codes = [code for code in p_codes if re.match(r"P37[0-8]|P38[01]", code)]
    row[15] = ("GHS储存/处置代码：" + "、".join(storage_codes)) if storage_codes else f"{status_label}未提供明确P4xx储存代码"
    row[15] += "；具体温度、分区和相容性条件以产品SDS为准"
    row[16] = ("GHS预防/个体防护代码：" + "、".join(prevention_codes)) if prevention_codes else f"{status_label}未提供明确P26x/P27x/P28x防护代码"
    row[16] += "；结合暴露评估选择护目、防化和呼吸防护"
    row[17] = ("GHS响应代码：" + "、".join(response_codes)) if response_codes else f"{status_label}未提供明确P3xx响应代码"
    row[17] += "；泄漏隔离、回收和环境保护细节仍须核对SDS"
    row[18] = ("GHS消防响应代码：" + "、".join(fire_codes)) if fire_codes else f"{status_label}未提供明确消防P代码"
    row[18] += "；灭火剂和冷却方式以具体产品SDS及消防指挥为准"
    row[19] = "GHS分类不能替代反应性评估；禁忌物、聚合及分解条件仍须核对具体产品SDS"

    verification_note = (
        f"GHS核验状态：{'来源已核验' if status == 'verified' else '部分核验'}；"
        f"来源数：{source_count}；来源：{'、'.join(source_names[:6]) or 'PubChem提交来源'}；"
        f"一致H代码：{'、'.join(record.get('consensusHCodes', [])) or '无多来源一致代码'}；"
        f"核验日期：{DATA_VERSION}；详情：{cell(record.get('pubchem'))}"
    )
    row[22] = re.sub(r"；安全参数未核验", "；GHS分类已完成来源核验" if status == "verified" else "；GHS分类仅部分核验", cell(row[22]))
    row[22] += "；" + verification_note
    return row


def refresh_source(source_path: Path, catalog_path: Path, physchem_path: Path, safety_path: Path) -> dict[str, object]:
    source = json.loads(source_path.read_text(encoding="utf-8"))
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    physchem = json.loads(physchem_path.read_text(encoding="utf-8"))
    safety = json.loads(safety_path.read_text(encoding="utf-8"))
    sheet = source["chemicals"][SHEET]
    headers = sheet[:4]
    curated = sheet[4 : 4 + CURATED_COUNT]
    if len(curated) != CURATED_COUNT:
        raise ValueError(f"Expected {CURATED_COUNT} curated rows, found {len(curated)}")

    existing_names = {
        cell(value).strip().lower()
        for row in curated
        for value in (row[1], row[2])
        if cell(value).strip()
    }
    additions: list[list[object]] = []
    seen_cids: set[int] = set()
    for record in catalog["records"]:
        cid = int(record["CID"])
        title = cell(record.get("Title")).strip()
        iupac = cell(record.get("IUPACName")).strip()
        formula = cell(record.get("MolecularFormula")).strip()
        weight = cell(record.get("MolecularWeight")).strip()
        if not title or not formula or not weight or cid in seen_cids:
            continue
        if title.lower() in existing_names or (iupac and iupac.lower() in existing_names):
            continue
        additions.append(catalog_row(CURATED_COUNT + len(additions) + 1, record))
        seen_cids.add(cid)
        if len(additions) == BASIC_CATALOG_COUNT:
            break

    if len(additions) != BASIC_CATALOG_COUNT:
        raise ValueError(f"Catalog supplied only {len(additions)} usable new rows")

    physchem_records = physchem.get("records", [])
    if len(physchem_records) != PHYSCHEM_COUNT:
        raise ValueError(f"Expected {PHYSCHEM_COUNT} physicochemical records, found {len(physchem_records)}")
    physchem_cas = [cell(record.get("CAS")) for record in physchem_records]
    physchem_cids = [int(record["CID"]) for record in physchem_records]
    if len(set(physchem_cas)) != PHYSCHEM_COUNT or len(set(physchem_cids)) != PHYSCHEM_COUNT:
        raise ValueError("Physicochemical records must contain 500 unique CAS numbers and CIDs")
    enriched = [
        physchem_row(CURATED_COUNT + BASIC_CATALOG_COUNT + index + 1, record)
        for index, record in enumerate(physchem_records)
    ]
    safety_by_cid = {int(record["CID"]): record for record in safety.get("records", [])}
    if len(safety_by_cid) != BASIC_CATALOG_COUNT + PHYSCHEM_COUNT:
        raise ValueError(f"Expected 1400 safety verification records, found {len(safety_by_cid)}")
    for row in additions + enriched:
        match = re.search(r"/compound/(\d+)", cell(row[20]))
        if not match or int(match.group(1)) not in safety_by_cid:
            raise ValueError(f"Missing safety verification for row {row[0]}")
        safety_enrich(row, safety_by_cid[int(match.group(1))])

    headers[0][0] = "1500种化学品理化与安全处置数据表"
    headers[1][0] = (
        "前100条为人工整理的常见化学品安全数据；第101—1000条为PubChem基础属性目录，"
        "第1001—1500条为具有唯一有效CAS和实验理化性质的PubChem记录。未核验的安全字段均有明确标记；"
        "本表不替代具体产品SDS、作业许可、风险评估或适用法规。"
    )
    source["chemicals"][SHEET] = headers + curated + additions + enriched
    source_path.write_text(
        json.dumps(source, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return source


def row_to_record(row: list[object]) -> tuple[object, ...]:
    hazards = cell(row[11])
    toxicity = cell(row[14])
    pubchem_match = re.search(r"/compound/(\d+)", cell(row[20]))
    return (
        int(row[0]),
        cell(row[1]),
        cell(row[2]),
        cell(row[3]),
        cell(row[4]),
        cell(row[5]),
        cell(row[6]),
        cell(row[7]),
        cell(row[8]),
        cell(row[9]),
        cell(row[10]),
        hazards,
        cell(row[12]),
        cell(row[13]),
        toxicity,
        cell(row[15]),
        cell(row[16]),
        cell(row[17]),
        cell(row[18]),
        cell(row[19]),
        cell(row[20]),
        cell(row[21]),
        cell(row[22]),
        classify_risk(hazards, toxicity),
        json.dumps(hazard_tags(hazards), ensure_ascii=False, separators=(",", ":")),
        "curated_safety" if int(row[0]) <= CURATED_COUNT
        else "pubchem_catalog" if int(row[0]) <= CURATED_COUNT + BASIC_CATALOG_COUNT
        else "pubchem_physchem",
        int(pubchem_match.group(1)) if pubchem_match else None,
    )


def build_database(source: dict[str, object], output_path: Path) -> None:
    rows = source["chemicals"][SHEET][4:]
    if len(rows) != TARGET_COUNT:
        raise ValueError(f"Expected exactly {TARGET_COUNT} chemical rows, found {len(rows)}")
    ids = [int(row[0]) for row in rows]
    if ids != list(range(1, TARGET_COUNT + 1)):
        raise ValueError(f"Chemical IDs must be unique and contiguous from 1 to {TARGET_COUNT}")
    ghs_verified_count = sum("GHS核验状态：来源已核验" in cell(row[22]) for row in rows)
    ghs_partial_count = sum("GHS核验状态：部分核验" in cell(row[22]) for row in rows)
    ghs_unavailable_count = BASIC_CATALOG_COUNT + PHYSCHEM_COUNT - ghs_verified_count - ghs_partial_count

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.unlink(missing_ok=True)
    connection = sqlite3.connect(output_path)
    try:
        connection.executescript(
            """
            PRAGMA application_id = 1212367691;
            PRAGMA user_version = 3;
            CREATE TABLE metadata (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            ) WITHOUT ROWID;
            CREATE TABLE chemicals (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                english_name TEXT NOT NULL,
                cas TEXT NOT NULL,
                formula TEXT NOT NULL,
                molecular_weight TEXT NOT NULL,
                appearance TEXT NOT NULL,
                melting_point TEXT NOT NULL,
                boiling_point TEXT NOT NULL,
                density TEXT NOT NULL,
                solubility TEXT NOT NULL,
                hazards TEXT NOT NULL,
                flash_point TEXT NOT NULL,
                explosive_limits TEXT NOT NULL,
                toxicity TEXT NOT NULL,
                storage TEXT NOT NULL,
                ppe TEXT NOT NULL,
                spill TEXT NOT NULL,
                firefighting TEXT NOT NULL,
                incompatibilities TEXT NOT NULL,
                pubchem TEXT NOT NULL,
                icsc TEXT NOT NULL,
                note TEXT NOT NULL,
                risk TEXT NOT NULL CHECK (risk IN ('unknown','low','medium','high','critical')),
                tags_json TEXT NOT NULL,
                source_kind TEXT NOT NULL CHECK (source_kind IN ('curated_safety','pubchem_catalog','pubchem_physchem')),
                pubchem_cid INTEGER
            );
            CREATE INDEX chemicals_name_idx ON chemicals(name COLLATE NOCASE);
            CREATE INDEX chemicals_english_name_idx ON chemicals(english_name COLLATE NOCASE);
            CREATE INDEX chemicals_cas_idx ON chemicals(cas);
            CREATE INDEX chemicals_formula_idx ON chemicals(formula);
            CREATE INDEX chemicals_risk_idx ON chemicals(risk);
            """
        )
        connection.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            [
                ("schema_version", "3"),
                ("data_version", DATA_VERSION),
                ("chemical_count", str(TARGET_COUNT)),
                ("curated_safety_count", str(CURATED_COUNT)),
                ("pubchem_catalog_count", str(BASIC_CATALOG_COUNT)),
                ("pubchem_physchem_count", str(PHYSCHEM_COUNT)),
                ("ghs_verified_count", str(ghs_verified_count)),
                ("ghs_partial_count", str(ghs_partial_count)),
                ("ghs_unavailable_count", str(ghs_unavailable_count)),
                ("source", "Curated safety dataset + PubChem PUG-REST identifiers + PUG-View CAS/experimental properties/GHS classifications"),
            ],
        )
        placeholders = ",".join("?" for _ in range(27))
        connection.executemany(
            f"INSERT INTO chemicals VALUES ({placeholders})",
            [row_to_record(row) for row in rows],
        )
        connection.commit()
        connection.execute("VACUUM")
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--physchem", type=Path, default=DEFAULT_PHYSCHEM)
    parser.add_argument("--safety", type=Path, default=DEFAULT_SAFETY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--refresh-source", action="store_true")
    args = parser.parse_args()

    source = (
        refresh_source(args.source, args.catalog, args.physchem, args.safety)
        if args.refresh_source
        else json.loads(args.source.read_text(encoding="utf-8"))
    )
    build_database(source, args.output)

    connection = sqlite3.connect(args.output)
    try:
        count = connection.execute("SELECT COUNT(*) FROM chemicals").fetchone()[0]
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        connection.close()
    if count != TARGET_COUNT or integrity != "ok":
        raise RuntimeError(f"Database verification failed: count={count}, integrity={integrity}")
    print(f"Built {args.output} with {count} chemicals; integrity={integrity}")


if __name__ == "__main__":
    main()
