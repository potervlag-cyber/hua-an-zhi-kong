#!/usr/bin/env python3
"""Fetch compact, source-attributed GHS safety verification for APK chemicals."""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app" / "data" / "source-data.json"
OUTPUT = ROOT / "db" / "pubchem-safety-1400.json"
WORKERS = 4
MIN_REQUEST_INTERVAL = 0.28
USER_AGENT = "HuaAnZhiKong/0.2.2 safety-verification-builder"
AUTHORITATIVE_SOURCE_MARKERS = (
    "regulation (ec) no 1272/2008",
    "european chemicals agency",
    "nite-cmc",
    "safe work australia",
    "national institute of technology and evaluation",
    "united nations economic commission for europe",
)

_rate_lock = threading.Lock()
_last_request = 0.0


def fetch_json(url: str, attempts: int = 4) -> dict:
    global _last_request
    for attempt in range(attempts):
        with _rate_lock:
            delay = MIN_REQUEST_INTERVAL - (time.monotonic() - _last_request)
            if delay > 0:
                time.sleep(delay)
            _last_request = time.monotonic()
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return {}
            if error.code not in (429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == attempts - 1:
                raise
        time.sleep(min(20, 2 ** attempt))
    return {}


def value_strings(value: dict) -> list[dict]:
    return value.get("StringWithMarkup", []) if isinstance(value, dict) else []


def find_ghs_information(sections: list[dict]) -> list[dict]:
    found: list[dict] = []
    for section in sections or []:
        if section.get("TOCHeading") == "GHS Classification":
            found.extend(section.get("Information", []))
        found.extend(find_ghs_information(section.get("Section", [])))
    return found


def parse_compound(cid: int) -> dict:
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON?heading=GHS%20Classification"
    payload = fetch_json(url)
    record = payload.get("Record", {})
    references = {
        int(reference["ReferenceNumber"]): {
            "name": str(reference.get("SourceName", "Unknown source")),
            "url": str(reference.get("URL", "")),
        }
        for reference in record.get("Reference", [])
        if reference.get("ReferenceNumber") is not None
    }
    grouped: dict[int, dict] = {}
    for information in find_ghs_information(record.get("Section", [])):
        reference_number = int(information.get("ReferenceNumber", 0))
        group = grouped.setdefault(reference_number, {"h": {}, "p": set(), "pictograms": set(), "signals": set()})
        name = str(information.get("Name", ""))
        for item in value_strings(information.get("Value", {})):
            text = re.sub(r"\s+", " ", str(item.get("String", ""))).strip()
            if name == "GHS Hazard Statements":
                for code in re.findall(r"\b(?:EUH\d{3}|H\d{3})\b", text):
                    group["h"].setdefault(code, text[:500])
            elif name == "Precautionary Statement Codes":
                group["p"].update(re.findall(r"P\d{3}(?:\+P?\d{3})*", text))
            elif name == "Pictogram(s)":
                for markup in item.get("Markup", []):
                    extra = str(markup.get("Extra", "")).strip()
                    if extra:
                        group["pictograms"].add(extra)
            elif name == "Signal" and text:
                group["signals"].add(text)

    source_groups = []
    all_h: dict[str, str] = {}
    all_p: set[str] = set()
    all_pictograms: set[str] = set()
    all_signals: set[str] = set()
    code_frequency: dict[str, int] = {}
    authoritative = False
    for reference_number, group in grouped.items():
        if not group["h"]:
            continue
        source = references.get(reference_number, {"name": "Unknown source", "url": ""})
        source_name_lower = source["name"].lower()
        is_authoritative = any(marker in source_name_lower for marker in AUTHORITATIVE_SOURCE_MARKERS)
        authoritative = authoritative or is_authoritative
        for code, statement in group["h"].items():
            all_h.setdefault(code, statement)
            code_frequency[code] = code_frequency.get(code, 0) + 1
        all_p.update(group["p"])
        all_pictograms.update(group["pictograms"])
        all_signals.update(group["signals"])
        source_groups.append(
            {
                "name": source["name"],
                "url": source["url"],
                "authoritative": is_authoritative,
                "hCodes": sorted(group["h"]),
            }
        )

    h_codes = sorted(all_h)
    if h_codes and authoritative:
        status = "verified"
    elif h_codes:
        status = "partial"
    else:
        status = "unavailable"
    return {
        "CID": cid,
        "status": status,
        "hCodes": h_codes,
        "hazardStatements": {code: all_h[code] for code in h_codes},
        "consensusHCodes": sorted(code for code, count in code_frequency.items() if count >= 2),
        "pCodes": sorted(all_p),
        "pictograms": sorted(all_pictograms),
        "signals": sorted(all_signals),
        "sources": source_groups,
        "sourceCount": len(source_groups),
        "pubchem": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}#section=Safety-and-Hazards",
    }


def target_cids() -> list[int]:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    rows = source["chemicals"]["化学品安全数据"][4:]
    cids = []
    for row in rows[100:]:
        match = re.search(r"/compound/(\d+)", str(row[20]))
        if match:
            cids.append(int(match.group(1)))
    if len(cids) != 1400 or len(set(cids)) != 1400:
        raise ValueError(f"Expected 1400 unique PubChem CIDs, found {len(cids)} rows / {len(set(cids))} unique")
    return cids


def save(records: dict[int, dict], complete: bool = False) -> None:
    counts: dict[str, int] = {}
    for record in records.values():
        status = record["status"]
        counts[status] = counts.get(status, 0) + 1
    payload = {
        "source": "PubChem PUG-View GHS Classification",
        "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/docs/pug-view",
        "retrievedAt": time.strftime("%Y-%m-%d"),
        "complete": complete,
        "method": "Union of source-attributed GHS H/P codes; verified requires at least one listed regulatory/authority source",
        "statusCounts": counts,
        "records": [records[cid] for cid in sorted(records)],
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    targets = target_cids()
    records: dict[int, dict] = {}
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
        records = {int(record["CID"]): record for record in previous.get("records", [])}
        print(f"Resuming with {len(records)} records", flush=True)
    pending = [cid for cid in targets if cid not in records]
    for offset in range(0, len(pending), 25):
        batch = pending[offset : offset + 25]
        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = {executor.submit(parse_compound, cid): cid for cid in batch}
            for future in as_completed(futures):
                cid = futures[future]
                try:
                    records[cid] = future.result()
                except Exception as error:
                    print(f"CID {cid} failed: {error}", flush=True)
        save(records)
        counts = {status: sum(record["status"] == status for record in records.values()) for status in ("verified", "partial", "unavailable")}
        print(f"GHS progress {len(records)}/{len(targets)}: {counts}", flush=True)

    missing = [cid for cid in targets if cid not in records]
    if missing:
        raise RuntimeError(f"Safety download incomplete; {len(missing)} CIDs missing")
    save(records, complete=True)
    print(f"Saved {len(records)} source-attributed GHS records to {OUTPUT}", flush=True)


if __name__ == "__main__":
    main()
