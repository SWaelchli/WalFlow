"""
Equinor TR2000 REST API Service for WalFlow.
Provides querying, retrieval, normalization, and local database ingestion of Equinor TR2000 piping specifications.
Reference Documentation: https://tr2000api.equinor.com/Home/Help
Terms & Conditions: https://www.equinor.com/about-us/terms-and-conditions
"""

import httpx
import logging
from typing import List, Dict, Any, Optional

TR2000_PRIMARY_URL = "https://tr2000api.equinor.com"
TR2000_FALLBACK_URL = "https://equinor.pipespec-api.presight.com"
DEFAULT_PLANT_CODE = "UON"
DEFAULT_PLANT_ID = 109

# Standard ASME / ISO NPS (inch) to DN (mm) nominal conversion table
NPS_TO_DN_MAP: Dict[str, int] = {
    "0.125": 6, "1/8": 6,
    "0.25": 8, "1/4": 8,
    "0.375": 10, "3/8": 10,
    "0.5": 15, "1/2": 15,
    "0.75": 20, "3/4": 20,
    "1": 25, "1.0": 25,
    "1.25": 32, "1 1/4": 32,
    "1.5": 40, "1 1/2": 40,
    "2": 50, "2.0": 50,
    "2.5": 65, "2 1/2": 65,
    "3": 80, "3.0": 80,
    "3.5": 90, "3 1/2": 90,
    "4": 100, "4.0": 100,
    "5": 125, "5.0": 125,
    "6": 150, "6.0": 150,
    "8": 200, "8.0": 200,
    "10": 250, "10.0": 250,
    "12": 300, "12.0": 300,
    "14": 350, "14.0": 350,
    "16": 400, "16.0": 400,
    "18": 450, "18.0": 450,
    "20": 500, "20.0": 500,
    "22": 550, "22.0": 550,
    "24": 600, "24.0": 600,
    "26": 650, "26.0": 650,
    "28": 700, "28.0": 700,
    "30": 750, "30.0": 750,
    "32": 800, "32.0": 800,
    "34": 850, "34.0": 850,
    "36": 900, "36.0": 900,
    "40": 1000, "40.0": 1000,
    "42": 1050, "42.0": 1050,
    "48": 1200, "48.0": 1200,
}

# Material Group to Surface Roughness epsilon (in mm) standard engineering mapping
MATERIAL_ROUGHNESS_MAP: Dict[str, float] = {
    "CS": 0.045,      # Carbon Steel
    "CSLT": 0.045,    # Low-Temp Carbon Steel
    "CSNT": 0.045,    # Normalized Carbon Steel
    "LTCS": 0.045,
    "316SS": 0.015,   # Austenitic Stainless Steel 316
    "304SS": 0.015,   # Austenitic Stainless Steel 304
    "SS": 0.015,      # Generic Stainless Steel
    "22CR": 0.015,    # Duplex Stainless Steel (22Cr)
    "25CR": 0.015,    # Super Duplex (25Cr)
    "DX": 0.015,      # Duplex
    "SDX": 0.015,     # Super Duplex
    "TI": 0.005,      # Titanium
    "CU-NI": 0.025,   # Copper-Nickel
    "PVC": 0.005,     # Plastic / PVC
    "GRP": 0.010,     # Glass Reinforced Plastic
}

def get_material_roughness_mm(material_group: Optional[str], material_desc: Optional[str] = "") -> float:
    """Infers hydraulic surface roughness (mm) from material code or description."""
    if material_group:
        mg_upper = material_group.upper().strip()
        for key, val in MATERIAL_ROUGHNESS_MAP.items():
            if key == mg_upper or key in mg_upper:
                return val
    if material_desc:
        desc_upper = material_desc.upper()
        for key, val in MATERIAL_ROUGHNESS_MAP.items():
            if key in desc_upper:
                return val
    return 0.045  # Standard commercial steel default


async def _fetch_get(path: str, client: Optional[httpx.AsyncClient] = None) -> Any:
    """Performs an async GET request trying primary URL then fallback URL, bypassing SSL proxy barriers if needed."""
    headers = {"User-Agent": "WalFlow/1.0", "Accept": "application/json"}
    last_err = None
    
    for base_url in [TR2000_PRIMARY_URL, TR2000_FALLBACK_URL]:
        url = f"{base_url}{path}"
        try:
            if client is not None:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code == 404:
                    return None
                else:
                    resp.raise_for_status()
            else:
                async with httpx.AsyncClient(timeout=15.0, verify=False, headers=headers) as new_client:
                    resp = await new_client.get(url)
                    if resp.status_code == 200:
                        return resp.json()
                    elif resp.status_code == 404:
                        return None
                    else:
                        resp.raise_for_status()
        except Exception as e:
            last_err = e
            logging.warning(f"TR2000 request failed for {url}: {e}")
            continue

    if last_err:
        raise last_err
    return None


async def fetch_tr2000_plants() -> List[Dict[str, Any]]:
    """Fetches all plants from Equinor TR2000 API, placing UON (PlantID=109) at the top."""
    data = await _fetch_get("/plants")
    if not data:
        return []
        
    raw_plants = data.get("getPlant", []) if isinstance(data, dict) else data
    plants = []
    for p in raw_plants:
        plant_id = p.get("PlantID")
        short_desc = p.get("ShortDescription") or ""
        long_desc = p.get("LongDescription") or ""
        area = p.get("Area") or ""
        
        code = short_desc or f"P{plant_id}"
        name = f"{short_desc} - {long_desc}".strip(" -") if short_desc and long_desc else (short_desc or long_desc or f"Plant {plant_id}")
        
        plants.append({
            "id": plant_id,
            "PlantID": plant_id,
            "PlantCode": code,
            "PlantName": name,
            "ShortDescription": short_desc,
            "LongDescription": long_desc,
            "Area": area,
            "InitialRevision": p.get("InitialRevision", "0")
        })

    # Sort plants so default plant (UON / 109) is at the top
    def sort_key(p: Dict[str, Any]):
        is_default = (p.get("PlantID") == DEFAULT_PLANT_ID or p.get("PlantCode") == DEFAULT_PLANT_CODE)
        return (0 if is_default else 1, p.get("PlantName", ""))

    plants.sort(key=sort_key)
    return plants


async def search_tr2000_pcs(plant_id: int = DEFAULT_PLANT_ID, query: str = "") -> List[Dict[str, Any]]:
    """Searches pipe class specifications (PCS) inside a selected plant."""
    data = await _fetch_get(f"/plants/{plant_id}/pcs")
    if not data:
        return []
        
    raw_list = data.get("getPCS", []) if isinstance(data, dict) else data

    normalized_list = []
    for p in raw_list:
        pcs_code = p.get("PCS") or p.get("PcsCode") or ""
        mat_group = p.get("MaterialGroup") or ""
        rating_class = p.get("RatingClass") or ""
        description = p.get("Description") or f"{mat_group} {rating_class}".strip() or pcs_code
        revision = str(p.get("Revision") or "0")
        
        normalized_list.append({
            "pcs_code": pcs_code,
            "PcsCode": pcs_code,
            "PCS": pcs_code,
            "revision": revision,
            "Revision": revision,
            "description": description,
            "Description": description,
            "rating_class": rating_class,
            "RatingClass": rating_class,
            "material_group": mat_group,
            "MaterialGroup": mat_group,
            "design_code": p.get("DesignCode") or "ASME B31.3",
            "DesignCode": p.get("DesignCode") or "ASME B31.3",
            "rev_date": p.get("RevDate") or "",
            "RevDate": p.get("RevDate") or ""
        })

    if query:
        q_lower = query.lower().strip()
        normalized_list = [
            p for p in normalized_list
            if q_lower in (p.get("pcs_code") or "").lower()
            or q_lower in (p.get("description") or "").lower()
            or q_lower in (p.get("rating_class") or "").lower()
            or q_lower in (p.get("material_group") or "").lower()
        ]
        
    return normalized_list


async def fetch_and_normalize_tr2000_pcs(
    plant_id: int,
    pcs_code: str,
    rev_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fetches full specification, sizes grid, and P-T ratings for a PCS code from Equinor TR2000,
    normalizing dimensions into clean WalFlow pipe class format.
    """
    # 1. Fetch PCS Header via /rev/{rev_id} or /rev
    header_data = None
    if rev_id:
        header_data = await _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev/{rev_id}")
    if not header_data:
        header_data = await _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev")
        
    if not header_data:
        raise ValueError(f"No PCS found for code '{pcs_code}' in plant {plant_id}.")
        
    raw_headers = header_data.get("getPCS", []) if isinstance(header_data, dict) else header_data
    if not raw_headers:
        raise ValueError(f"No PCS found for code '{pcs_code}' in plant {plant_id}.")
    pcs_header = raw_headers[0] if isinstance(raw_headers, list) else raw_headers

    actual_rev = str(pcs_header.get("Revision") or pcs_header.get("RevID") or rev_id or "0")

    # 2 & 3. Fetch Pipe Sizes and Temp-Pressure tables concurrently
    headers = {"User-Agent": "WalFlow/1.0", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=15.0, verify=False, headers=headers) as client:
        sizes_task = _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev/{actual_rev}/pipe-sizes", client=client)
        pt_task = _fetch_get(f"/plants/{plant_id}/pcs/{pcs_code}/rev/{actual_rev}/temp-pressures", client=client)
        sizes_json, pt_json = await asyncio.gather(sizes_task, pt_task)

    sizes_data = (sizes_json.get("getPipeSize", []) if isinstance(sizes_json, dict) else sizes_json) or []
    pt_data = (pt_json.get("getTempPressure", []) if isinstance(pt_json, dict) else pt_json) or []

    # 4. Normalize Sizes Schedule
    normalized_sizes = []
    for s in sizes_data:
        nom_str = str(s.get("NomSize") or s.get("DN") or s.get("Nps") or "").strip()
        
        # Map NPS string to DN integer
        if nom_str in NPS_TO_DN_MAP:
            dn_val = NPS_TO_DN_MAP[nom_str]
        else:
            try:
                dn_val = int(round(float(nom_str) * 25.4)) if float(nom_str) < 10 else int(float(nom_str))
            except (ValueError, TypeError):
                dn_val = 0

        nps_val = str(s.get("NomSize") or nom_str)
        od_val = float(s.get("OuterDiam") or s.get("OuterDiameter") or 0.0)
        wt_val = float(s.get("WallThickness") or s.get("WT") or 0.0)
        sch_val = str(s.get("Schedule") or s.get("Sch") or "STD")
        ca_val = float(s.get("CorrosionAllowance") or s.get("CA") or 0.0)

        # Strict Clean ID formula
        id_val = round(od_val - 2.0 * wt_val, 3)
        if id_val <= 0:
            continue

        normalized_sizes.append({
            "dn": dn_val,
            "nps": nps_val,
            "od_mm": round(od_val, 2),
            "wt_mm": round(wt_val, 2),
            "id_mm": id_val,
            "sch": sch_val,
            "ca_mm": round(ca_val, 2)
        })

    # Sort sizes by DN ascending
    normalized_sizes.sort(key=lambda x: x["dn"])

    # 5. Normalize Temp-Pressure Curve
    normalized_pt = []
    for pt in pt_data:
        t_val = pt.get("Temperature") if pt.get("Temperature") is not None else pt.get("Temp")
        p_val = pt.get("Pressure") if pt.get("Pressure") is not None else pt.get("Press")
        if t_val is not None and p_val is not None:
            try:
                normalized_pt.append({
                    "temp_c": round(float(t_val), 1),
                    "press_bar": round(float(p_val), 2)
                })
            except (ValueError, TypeError):
                continue
                
    normalized_pt.sort(key=lambda x: x["temp_c"])

    # 6. Material Roughness calculation
    mat_group = pcs_header.get("MaterialGroup") or "CS"
    mat_grade = pcs_header.get("MaterialGrade") or pcs_header.get("MaterialDescription") or mat_group
    roughness_mm = get_material_roughness_mm(mat_group, mat_grade)

    ca_overall = float(pcs_header.get("CorrAllowance") or pcs_header.get("CorrosionAllowance") or (normalized_sizes[0]["ca_mm"] if normalized_sizes else 0.0))

    min_temp = None
    max_temp = None
    if normalized_pt:
        min_temp = normalized_pt[0]["temp_c"]
        max_temp = normalized_pt[-1]["temp_c"]
    else:
        min_temp = -29.0
        max_temp = 200.0

    description = pcs_header.get("Description") or f"{mat_group} {pcs_header.get('RatingClass', '')}".strip() or f"Equinor TR2000 {pcs_code}"

    return {
        "code": pcs_code.upper().strip(),
        "name": description,
        "standard": "TR2000",
        "material_group": mat_group,
        "material_grade": mat_grade,
        "rating_class": pcs_header.get("RatingClass") or "CL150",
        "design_code": pcs_header.get("DesignCode") or "ASME B31.3",
        "roughness_mm": roughness_mm,
        "corrosion_allowance_mm": ca_overall,
        "min_temp_c": min_temp,
        "max_temp_c": max_temp,
        "revision": str(actual_rev),
        "source_plant_id": plant_id,
        "sizes": normalized_sizes,
        "temp_pressures": normalized_pt
    }
