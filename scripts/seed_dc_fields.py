#!/usr/bin/env python3
"""
Seed TBM Evaluator with 86 real DC-area fields from the Fields Master File.

Usage:
    python3 scripts/seed_dc_fields.py --api-url https://tbm-evaluator-production.up.railway.app --admin-key YOUR_KEY
"""
import argparse
import os
import sys

import httpx
import openpyxl

EXCEL_PATH = os.path.join(os.path.dirname(__file__), "..", "docs", "Fields Master File.xlsx")

# Map Excel Type column to our size model
SIZE_MAP = {
    "Full Field": "full",
    "Stadium Field": "full",
    "Turf Field": "full",
    "North Field": "full",
    "Lower Field": "full",
    "Field": "full",
    "Field 1": "full",
    "Grass": "full",
    "grass": "full",
    "Missing": "full",
    "Mini Pitch": "small",
}


def load_fields_from_excel(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    fields = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        field_id, name, ftype, surface, lat, lng, number, street, city = row
        if not name:
            continue
        # Build address from Number + Street + City
        addr_parts = []
        if number:
            addr_parts.append(str(int(number)) if isinstance(number, float) else str(number))
        if street:
            addr_parts.append(str(street))
        if city:
            addr_parts.append(str(city))
        address = ", ".join(addr_parts) if addr_parts else None

        # Surface normalization
        surface_type = str(surface).lower().strip() if surface else "grass"
        if surface_type not in ("turf", "grass", "hardcourt", "indoor"):
            surface_type = "grass"

        # Size from Type
        size = SIZE_MAP.get(str(ftype).strip(), "full") if ftype else "full"

        # Lights: default true for turf, false for grass
        has_lights = surface_type == "turf"

        fields.append({
            "name": str(name).strip(),
            "location_address": address,
            "latitude": float(lat) if lat else None,
            "longitude": float(lng) if lng else None,
            "surface_type": surface_type,
            "size": size,
            "has_lights": has_lights,
        })
    wb.close()
    return fields


def find_org_id(client: httpx.Client, api_url: str, headers: dict) -> str:
    """Auto-detect the DC Soccer Club org ID."""
    resp = client.get(f"{api_url}/api/organizations", headers=headers)
    resp.raise_for_status()
    orgs = resp.json()
    # Try to find DC Soccer Club
    for org in orgs:
        if "dc" in org["name"].lower() or "soccer" in org["name"].lower():
            return org["id"]
    # Fall back to first org
    if orgs:
        return orgs[0]["id"]
    print("ERROR: No organizations found. Create one first.")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Seed 86 DC-area fields from Excel")
    parser.add_argument("--api-url", required=True, help="Base API URL")
    parser.add_argument("--admin-key", required=True, help="Admin API key")
    parser.add_argument("--org-id", default=None, help="Organization ID (auto-detected if omitted)")
    args = parser.parse_args()

    api_url = args.api_url.rstrip("/")
    headers = {"X-Admin-Key": args.admin_key, "Content-Type": "application/json"}

    client = httpx.Client(timeout=30)

    # Find org
    org_id = args.org_id or find_org_id(client, api_url, headers)
    print(f"Using organization: {org_id}")

    # Load existing fields to skip duplicates
    resp = client.get(f"{api_url}/api/organizations/{org_id}/fields", headers=headers)
    resp.raise_for_status()
    existing_names = {f["name"] for f in resp.json()}
    print(f"Existing fields: {len(existing_names)}")

    # Load from Excel
    fields = load_fields_from_excel(EXCEL_PATH)
    print(f"Fields in Excel: {len(fields)}")

    created = 0
    skipped = 0
    errors = 0

    for field in fields:
        if field["name"] in existing_names:
            print(f"  SKIP (exists): {field['name']}")
            skipped += 1
            continue

        try:
            resp = client.post(
                f"{api_url}/api/organizations/{org_id}/fields",
                headers=headers,
                json=field,
            )
            resp.raise_for_status()
            print(f"  CREATED: {field['name']}")
            created += 1
        except Exception as e:
            print(f"  ERROR: {field['name']} — {e}")
            errors += 1

    print(f"\nDone! Created: {created}, Skipped: {skipped}, Errors: {errors}")
    client.close()


if __name__ == "__main__":
    main()
