"""
Pipe class size rows as references into the fitting catalog (`fitting_standards` table).

A class selects one or more schedule catalogs (`pipe_schedule`) and reducer catalogs (`reducer`).
A size row is stored as a reference `{dn, catalog, sch, ca_mm}`; its NPS / OD / WT / ID are read from
the catalog row on every request, so catalog edits reach every class using them. Sizes no selected
catalog lists are stored as custom rows `{dn, nps, od_mm, wt_mm, sch, ca_mm, custom: true}`.
"""
import json
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from db.models import FittingStandard

DEFAULT_SCHEDULE_CATALOG = "ASME_B36_10M_SCHEDULES"
DEFAULT_REDUCER_CATALOG = "ASME_B16_9_REDUCERS"

# Matching a dimensioned size (TR2000, old libraries, migrated rows) to a catalog row
OD_TOLERANCE_MM = 0.15
WT_TOLERANCE_MM = 0.01

# {catalog code: {dn: catalog size row}}
Catalogs = Dict[str, Dict[int, Dict[str, Any]]]


def normalize_codes(codes: Any, fallback: Optional[str] = None) -> List[str]:
    """Upper-cased, de-duplicated catalog codes in order; a single code or JSON text is accepted."""
    if isinstance(codes, str):
        text = codes.strip()
        if text.startswith("["):
            try:
                codes = json.loads(text)
            except ValueError:
                codes = [text]
        else:
            codes = [text] if text else []
    result = []
    for code in codes or []:
        clean = str(code or "").strip().upper()
        if clean and clean not in result:
            result.append(clean)
    if not result and fallback:
        result.append(fallback)
    return result


def load_schedule_catalogs(db: Session, codes: Optional[Iterable[str]] = None) -> Catalogs:
    """Size rows of the pipe schedule catalogs by code and DN (all of them when `codes` is None)."""
    query = db.query(FittingStandard).filter(FittingStandard.fitting_type == "pipe_schedule")
    if codes is not None:
        query = query.filter(FittingStandard.code.in_(list(codes)))
    catalogs: Catalogs = {}
    for std in query.all():
        try:
            rows = json.loads(std.dimensions_json or "[]")
        except ValueError:
            rows = []
        catalogs[std.code] = {int(r.get("dn") or 0): r for r in rows if isinstance(r, dict)}
    return catalogs


def catalog_type_errors(db: Session, codes: List[str], expected_type: str, field: str) -> List[str]:
    """Every code must exist in the fitting catalog with the expected fitting type."""
    if not codes:
        return [f"{field} needs at least one catalog."]
    errors = []
    found = {s.code: s.fitting_type for s in db.query(FittingStandard).filter(FittingStandard.code.in_(codes)).all()}
    for code in codes:
        if code not in found:
            errors.append(f"{field} '{code}' does not exist in the fitting standards catalog.")
        elif found[code] != expected_type:
            errors.append(f"{field} '{code}' is a '{found[code]}' standard, expected '{expected_type}'.")
    return errors


def _schedule_key(catalog_row: Dict[str, Any], sch: Any) -> Optional[str]:
    """The catalog's own spelling of a schedule designation (case-insensitive), or None."""
    wanted = str(sch or "").strip().upper()
    for key in (catalog_row.get("schedules") or {}):
        if key.upper() == wanted:
            return key
    return None


def resolve_size(row: Dict[str, Any], catalogs: Catalogs) -> Dict[str, Any]:
    """A stored size row with NPS / OD / WT / ID filled in; `unresolved` when its catalog entry is gone."""
    if row.get("custom"):
        od = float(row.get("od_mm") or 0.0)
        wt = float(row.get("wt_mm") or 0.0)
        return {**row, "od_mm": od, "wt_mm": wt, "id_mm": round(od - 2 * wt, 3)}
    catalog_row = catalogs.get(row.get("catalog"), {}).get(int(row.get("dn") or 0))
    key = _schedule_key(catalog_row, row.get("sch")) if catalog_row else None
    if not key:
        return {**row, "unresolved": True}
    wall = catalog_row["schedules"][key]
    od = float(catalog_row.get("od_mm") or 0.0)
    wt = float(wall.get("wt_mm") or 0.0)
    return {
        "dn": int(row["dn"]),
        "catalog": row["catalog"],
        "sch": key,
        "ca_mm": float(row.get("ca_mm") or 0.0),
        "nps": str(catalog_row.get("nps") or ""),
        "od_mm": od,
        "wt_mm": wt,
        "id_mm": round(od - 2 * wt, 3),
    }


def resolve_sizes(rows: List[Dict[str, Any]], catalogs: Catalogs) -> List[Dict[str, Any]]:
    return [resolve_size(r, catalogs) for r in rows]


def match_catalog_size(dn: int, od: float, wt: float, sch: Any, catalogs: Catalogs,
                       preferred: Iterable[str] = ()) -> Optional[Tuple[str, str]]:
    """(catalog code, schedule key) of a catalog row with this DN, OD and WT; catalogs in `preferred`
    are tried first and a key spelled like `sch` wins over another key with the same wall."""
    order = [c for c in preferred if c in catalogs] + [c for c in catalogs if c not in preferred]
    for code in order:
        catalog_row = catalogs[code].get(int(dn))
        if not catalog_row or abs(float(catalog_row.get("od_mm") or 0.0) - od) > OD_TOLERANCE_MM:
            continue
        walls = catalog_row.get("schedules") or {}
        same = [k for k, w in walls.items() if abs(float(w.get("wt_mm") or 0.0) - wt) <= WT_TOLERANCE_MM]
        if same:
            named = _schedule_key(catalog_row, sch)
            return code, named if named in same else same[0]
    return None


def custom_row(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "dn": int(raw.get("dn") or 0),
        "nps": str(raw.get("nps") or ""),
        "od_mm": float(raw.get("od_mm") or 0.0),
        "wt_mm": float(raw.get("wt_mm") or 0.0),
        "sch": str(raw.get("sch") or ""),
        "ca_mm": float(raw.get("ca_mm") or 0.0),
        "custom": True,
    }


def reference_rows_from_dimensions(raw_sizes: List[Dict[str, Any]], catalogs: Catalogs,
                                   preferred: Iterable[str] = ()) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Turns dimensioned rows (TR2000, old libraries, older databases) into references where a catalog
    lists the same DN / OD / WT, else custom rows. Returns the rows and the catalog codes they use."""
    preferred = list(preferred)
    rows, used = [], []
    for raw in raw_sizes:
        if raw.get("catalog") and not raw.get("custom"):
            rows.append(storage_row(raw))
            if raw["catalog"] not in used:
                used.append(raw["catalog"])
            continue
        match = None
        if not raw.get("custom"):
            match = match_catalog_size(int(raw.get("dn") or 0), float(raw.get("od_mm") or 0.0),
                                       float(raw.get("wt_mm") or 0.0), raw.get("sch"), catalogs, preferred)
        if match:
            code, key = match
            rows.append({"dn": int(raw["dn"]), "catalog": code, "sch": key, "ca_mm": float(raw.get("ca_mm") or 0.0)})
            if code not in used:
                used.append(code)
        else:
            rows.append(custom_row(raw))
    used.sort(key=lambda c: (preferred.index(c) if c in preferred else len(preferred)))
    return rows, used


def storage_row(raw: Dict[str, Any]) -> Dict[str, Any]:
    """The stored form of a size row: reference fields only, or the dimensions of a custom row."""
    if raw.get("custom"):
        return custom_row(raw)
    return {
        "dn": int(raw.get("dn") or 0),
        "catalog": str(raw.get("catalog") or "").strip().upper(),
        "sch": str(raw.get("sch") or "").strip(),
        "ca_mm": float(raw.get("ca_mm") or 0.0),
    }


def size_errors(rows: List[Dict[str, Any]], schedule_codes: List[str], catalogs: Catalogs) -> List[str]:
    """Checks stored size rows: unique DN, references to a selected catalog that lists the DN and
    schedule, custom rows with OD > 2·WT."""
    errors = []
    seen = set()
    for row in rows:
        dn = int(row.get("dn") or 0)
        if dn <= 0:
            errors.append("A size row has no nominal diameter.")
            continue
        if dn in seen:
            errors.append(f"DN{dn} is listed more than once.")
        seen.add(dn)
        if row.get("custom"):
            if float(row.get("od_mm") or 0.0) <= 2 * float(row.get("wt_mm") or 0.0):
                errors.append(f"DN{dn}: OD must be greater than 2 × WT.")
            continue
        code = row.get("catalog")
        if code not in schedule_codes:
            errors.append(f"DN{dn}: catalog '{code}' is not selected for this class.")
            continue
        catalog_row = catalogs.get(code, {}).get(dn)
        if not catalog_row:
            errors.append(f"DN{dn} is not listed in {code}.")
        elif not _schedule_key(catalog_row, row.get("sch")):
            errors.append(f"DN{dn}: schedule '{row.get('sch')}' is not listed in {code}.")
    return errors


def references_to(rows: List[Dict[str, Any]], code: str) -> List[Tuple[int, str]]:
    """(DN, schedule) pairs of the reference rows that point at catalog `code`."""
    return [(int(r.get("dn") or 0), str(r.get("sch") or "")) for r in rows
            if not r.get("custom") and r.get("catalog") == code]
