#!/usr/bin/env python3
"""Fetch 500 CAS-indexed compounds with experimental physical properties.

The output is a compact, checked-in snapshot. CAS annotations and experimental
values come from PubChem PUG-View; computed identifiers come from PUG-REST.
Requests are rate-limited and retried according to PubChem usage guidance.
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "db" / "pubchem-physchem-500.json"
SOURCE = ROOT / "app" / "data" / "source-data.json"
TARGET = 500
CAS_PAGES = 2
WORKERS = 4
MIN_REQUEST_INTERVAL = 0.27
USER_AGENT = "HuaAnZhiKong/0.2.2 offline-dataset-builder"

_rate_lock = threading.Lock()
_last_request = 0.0


def fetch_json(url: str, attempts: int = 6) -> dict:
    global _last_request
    for attempt in range(attempts):
        with _rate_lock:
            delay = MIN_REQUEST_INTERVAL - (time.monotonic() - _last_request)
            if delay > 0:
                time.sleep(delay)
            _last_request = time.monotonic()
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=75) as response:
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


def valid_cas(value: str) -> bool:
    if not re.fullmatch(r"\d{2,7}-\d{2}-\d", value):
        return False
    digits = value.replace("-", "")
    checksum = sum(int(digit) * multiplier for multiplier, digit in enumerate(reversed(digits[:-1]), 1)) % 10
    return checksum == int(digits[-1])


def strings_from_value(value: dict) -> list[str]:
    strings: list[str] = []
    for item in value.get("StringWithMarkup", []):
        text = re.sub(r"\s+", " ", str(item.get("String", ""))).strip()
        if text:
            strings.append(text)
    if not strings and value.get("Number"):
        numbers = value["Number"] if isinstance(value["Number"], list) else [value["Number"]]
        unit = str(value.get("Unit", "")).strip()
        strings.append(" ".join([", ".join(str(number) for number in numbers), unit]).strip())
    return strings


def walk_sections(sections: list[dict], found: dict[str, list[str]]) -> None:
    wanted = {
        "Physical Description",
        "Color/Form",
        "Odor",
        "Melting Point",
        "Boiling Point",
        "Solubility",
        "Density",
        "Flash Point",
        "Vapor Pressure",
        "Refractive Index",
        "Viscosity",
    }
    for section in sections or []:
        heading = section.get("TOCHeading", "")
        if heading in wanted:
            bucket = found.setdefault(heading, [])
            for information in section.get("Information", []):
                for text in strings_from_value(information.get("Value", {})):
                    if text not in bucket:
                        bucket.append(text)
        walk_sections(section.get("Section", []), found)


def concise(values: list[str], maximum: int = 2) -> str:
    selected: list[str] = []
    for value in values:
        cleaned = value[:500].strip(" ;")
        if cleaned and cleaned not in selected:
            selected.append(cleaned)
        if len(selected) == maximum:
            break
    return "；".join(selected)


def parse_experimental(cid: int, cas: str, cas_source: str, prop: dict) -> dict | None:
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON?heading=Experimental%20Properties"
    payload = fetch_json(url)
    record = payload.get("Record")
    if not record:
        return None
    found: dict[str, list[str]] = {}
    walk_sections(record.get("Section", []), found)

    appearance_parts = []
    for chinese, heading in (("外观", "Physical Description"), ("颜色/形态", "Color/Form"), ("气味", "Odor")):
        value = concise(found.get(heading, []), 1)
        if value:
            appearance_parts.append(f"{chinese}：{value}")
    fields = {
        "appearance": "；".join(appearance_parts),
        "melting_point": concise(found.get("Melting Point", [])),
        "boiling_point": concise(found.get("Boiling Point", [])),
        "density": concise(found.get("Density", [])),
        "solubility": concise(found.get("Solubility", [])),
        "flash_point": concise(found.get("Flash Point", [])),
        "vapor_pressure": concise(found.get("Vapor Pressure", [])),
        "refractive_index": concise(found.get("Refractive Index", [])),
        "viscosity": concise(found.get("Viscosity", [])),
    }
    core_coverage = sum(bool(fields[key]) for key in ("appearance", "melting_point", "boiling_point", "density", "solubility"))
    total_coverage = sum(bool(value) for value in fields.values())
    if core_coverage < 5:
        return None
    return {
        "CID": cid,
        "CAS": cas,
        "CASSource": cas_source,
        "Title": prop.get("Title", ""),
        "IUPACName": prop.get("IUPACName", ""),
        "MolecularFormula": prop.get("MolecularFormula", ""),
        "MolecularWeight": prop.get("MolecularWeight", ""),
        **fields,
        "coverage": {"core": core_coverage, "total": total_coverage},
        "pubchem": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
    }


def existing_identifiers() -> tuple[set[int], set[str]]:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    rows = source["chemicals"]["化学品安全数据"][4:]
    cids: set[int] = set()
    cases: set[str] = set()
    for row in rows:
        match = re.search(r"(?:CID\s+|/compound/)(\d+)", str(row[20]) + " " + str(row[22]))
        if match:
            cids.add(int(match.group(1)))
        cas = str(row[3]).strip()
        if valid_cas(cas):
            cases.add(cas)
    return cids, cases


def collect_cas_candidates(existing_cids: set[int], existing_cas: set[str]) -> list[tuple[int, str, str]]:
    by_cid: dict[int, tuple[str, str]] = {}
    selected_cas = set(existing_cas)
    for page in range(1, CAS_PAGES + 1):
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/annotations/heading/CAS/JSON?page={page}"
        payload = fetch_json(url)
        annotations = payload.get("Annotations", {}).get("Annotation", [])
        for annotation in annotations:
            cas_values: list[str] = []
            for data in annotation.get("Data", []):
                cas_values.extend(strings_from_value(data.get("Value", {})))
            cas = next((value for value in cas_values if valid_cas(value)), "")
            if not cas or cas in selected_cas:
                continue
            for cid in annotation.get("LinkedRecords", {}).get("CID", []):
                cid = int(cid)
                if cid not in existing_cids and cid not in by_cid:
                    by_cid[cid] = (cas, str(annotation.get("SourceName", "PubChem CAS annotation")))
                    selected_cas.add(cas)
                    break
        print(f"CAS page {page}: {len(by_cid)} unique new candidates", flush=True)
    return [(cid, cas, source) for cid, (cas, source) in by_cid.items()]


def fetch_properties(candidates: list[tuple[int, str, str]]) -> dict[int, dict]:
    properties: dict[int, dict] = {}
    for offset in range(0, len(candidates), 80):
        ids = ",".join(str(cid) for cid, _, _ in candidates[offset : offset + 80])
        url = (
            f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{ids}/property/"
            "Title,IUPACName,MolecularFormula,MolecularWeight/JSON"
        )
        payload = fetch_json(url)
        for prop in payload.get("PropertyTable", {}).get("Properties", []):
            properties[int(prop["CID"])] = prop
        print(f"Identifier properties: {min(offset + 80, len(candidates))}/{len(candidates)}", flush=True)
    return properties


def main() -> None:
    existing_cids, existing_cas = existing_identifiers()
    accepted: list[dict] = []
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text(encoding="utf-8")).get("records", [])
        best_by_cas: dict[str, dict] = {}
        for record in previous:
            cas = str(record.get("CAS", ""))
            current = best_by_cas.get(cas)
            if record.get("coverage", {}).get("core") != 5:
                continue
            if valid_cas(cas) and (current is None or record["coverage"]["total"] > current["coverage"]["total"]):
                best_by_cas[cas] = record
        accepted = list(best_by_cas.values())
        existing_cids.update(int(record["CID"]) for record in accepted)
        existing_cas.update(str(record["CAS"]) for record in accepted)
        print(f"Resuming with {len(accepted)} unique verified records", flush=True)
    candidates = collect_cas_candidates(existing_cids, existing_cas)
    properties = fetch_properties(candidates)
    eligible = [(cid, cas, source, properties[cid]) for cid, cas, source in candidates if cid in properties]

    for offset in range(0, len(eligible), 100):
        batch = eligible[offset : offset + 100]
        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = {
                executor.submit(parse_experimental, cid, cas, source, prop): cid
                for cid, cas, source, prop in batch
            }
            for future in as_completed(futures):
                try:
                    record = future.result()
                except Exception as error:
                    print(f"CID {futures[future]} failed: {error}", flush=True)
                    continue
                if record:
                    accepted.append(record)
        accepted.sort(key=lambda item: int(item["CID"]))
        print(f"Experimental properties: checked {min(offset + 100, len(eligible))}/{len(eligible)}, accepted {len(accepted)}", flush=True)
        if len(accepted) >= TARGET:
            break

    if len(accepted) < TARGET:
        raise RuntimeError(f"Only {len(accepted)} compounds met physical-property coverage requirements")
    accepted = accepted[:TARGET]
    payload = {
        "source": "PubChem PUG-REST and PUG-View",
        "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/docs/pug-view",
        "retrievedAt": time.strftime("%Y-%m-%d"),
        "selection": "Valid unique CAS checksum and CID; all 5 core experimental properties present (appearance, melting point, boiling point, density, solubility)",
        "records": accepted,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(accepted)} CAS-indexed physchem records to {OUTPUT}", flush=True)


if __name__ == "__main__":
    main()
