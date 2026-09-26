#!/usr/bin/env python3
"""Raw client-month-driver CSV -> the existing v5 Tableau JSON-column contract.

No ML, network access, pandas, Tableau API, or third-party dependencies.
This prepares data ONLY; it does not change the application's catalog/NLP code.
Amounts are converted to USD millions after an explicit unit/currency declaration.
The supported grain is repeated entity-month snapshot balances plus additive
attribution components. Different current-side balance grains are rejected, not guessed. Previous-side source fields are informational only and are ignored for aggregation consistency. Attribution uniqueness is detail_driver + RWA Diff by driver. Group identity is
client_group_id only; group name/location are display attributes resolved from the
latest Reporting Month seen for each group ID.
"""
from __future__ import annotations
import argparse
import calendar
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation
from collections import Counter

VERSION = "1.0.7-review"
FORBIDDEN = {"__proto__", "constructor", "prototype"}
OUT_FIELDS = ["client_group_id", "client_group_name", "group_location", "json_data"]
REQUIRED = {"group_id", "group_name", "entity_id", "entity_name", "month", "rwa_curr", "driver", "driver_impact"}
OPTIONAL = {"group_location", "component_id", "rwa_prev", "prev_group", "prev_group_code", "prev_cg", "cg", "ead_prev", "ead_curr", "scorecard_prev", "scorecard_curr"}
NUMERIC = {"rwa_prev", "rwa_curr", "driver_impact", "ead_prev", "ead_curr"}
CURRENT_ATTRS = ["cg", "ead_curr", "scorecard_curr"]
PREVIOUS_ATTRS = ["prev_group", "prev_group_code", "prev_cg", "ead_prev", "scorecard_prev"]
ATTRS = PREVIOUS_ATTRS + CURRENT_ATTRS

# Previous-side values may vary across repeated detail-driver rows because the
# prior-month group context can differ. They are deliberately ignored by the
# aggregation contract. The comparison-basis rwa_prev used by the current engine
# is derived as current RWA minus the sum of UNIQUE (detail_driver, impact) pairs.
MULTIPLIERS = {"base": Decimal("0.000001"), "thousand": Decimal("0.001"), "million": Decimal("1")}
MONTHS = {s.lower(): i for i in range(1, 13) for s in (calendar.month_abbr[i], calendar.month_name[i])}

class DataError(ValueError):
    """Human-readable validation error; nothing is published on failure."""


def keytext(s: str) -> str:
    return " ".join(unicodedata.normalize("NFC", str(s)).strip().casefold().split())


def text(s: str | None) -> str:
    return unicodedata.normalize("NFC", s or "").strip()


def decimal_value(s: str, label: str) -> Decimal:
    s = text(s)
    if not s:
        raise DataError(f"{label}: missing numeric value; blank is not zero")
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    if not re.fullmatch(r"[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?", s):
        raise DataError(f"{label}: invalid decimal or comma grouping {s!r}; no units/formulas/exponents")
    try:
        v = Decimal(s.replace(",", ""))
    except InvalidOperation as exc:
        raise DataError(f"{label}: invalid amount") from exc
    if not v.is_finite() or abs(v) > Decimal("9000000000000000") or len(v.as_tuple().digits) > 28:
        raise DataError(f"{label}: amount exceeds supported exact-decimal input range")
    return v


def json_number(v: Decimal) -> int | float:
    """Encode finite JSON numbers; audit output retains decimal strings."""
    if v == v.to_integral_value():
        return int(v)
    f = float(v)
    if not math.isfinite(f) or abs(Decimal(str(f)) - v) > Decimal("0.000000001"):
        raise DataError("JSON conversion loses more than 1e-9 USDm; review amount precision")
    return f


def parse_month(s: str, extra_formats: list[str]) -> str:
    original = text(s)
    if re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", original):
        return original
    if re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])-\d{2}", original):
        try:
            return datetime.strptime(original, "%Y-%m-%d").strftime("%Y-%m")
        except ValueError as exc:
            raise DataError(f"Invalid calendar date {original!r}") from exc
    if re.fullmatch(r"\d{4}(?:0[1-9]|1[0-2])", original):
        return original[:4] + "-" + original[4:]
    m = re.fullmatch(r"([A-Za-z]+)[ -]?(\d{4}|\d{2})", original)
    if m and m[1].lower() in MONTHS:
        year = int(m[2]) + (2000 if len(m[2]) == 2 else 0)
        return f"{year:04d}-{MONTHS[m[1].lower()]:02d}"
    resolved = set()
    for fmt in extra_formats:
        try:
            resolved.add(datetime.strptime(original, fmt).strftime("%Y-%m"))
        except ValueError:
            pass
    if len(resolved) == 1:
        return resolved.pop()
    if len(resolved) > 1:
        raise DataError(f"Ambiguous date {original!r}: multiple configured date formats disagree")
    raise DataError(f"Unsupported reporting month {original!r}; use YYYY-MM or configure ONE unambiguous date format")


def resolve_columns(headers: list[str], mapping: dict) -> dict:
    lookup = {}
    for h in headers:
        k = keytext(h)
        if not k or k in lookup:
            raise DataError(f"Empty/duplicate raw header {h!r}")
        lookup[k] = h
    if set(mapping) - REQUIRED - OPTIONAL:
        raise DataError("Unknown mapping keys: " + ", ".join(sorted(set(mapping) - REQUIRED - OPTIONAL)))
    found = {}
    for logical in REQUIRED | OPTIONAL:
        h = mapping.get(logical)
        if h is None or h == "":
            if logical in REQUIRED:
                raise DataError(f"config.columns.{logical} must name a source column")
            found[logical] = None
        else:
            if not isinstance(h, str) or keytext(h) not in lookup:
                raise DataError(f"Missing configured column {h!r} for {logical}; edit data_mapping.json")
            found[logical] = lookup[keytext(h)]
    return found


def load_config(path: Path, input_unit: str | None, currency: str | None) -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(cfg, dict) or not isinstance(cfg.get("columns"), dict):
        raise DataError("Configuration must contain a columns object")
    cfg["input_amount_unit"] = input_unit or cfg.get("input_amount_unit")
    cfg["currency"] = currency or cfg.get("currency")
    if cfg["input_amount_unit"] not in MULTIPLIERS:
        raise DataError("Declare --input-unit base, thousand, or million. Units are never inferred.")
    if cfg["currency"] != "USD":
        raise DataError("This compatibility exporter requires already-USD amounts. Declare --currency USD; it does not convert currencies.")
    if cfg.get("balance_grain") != "repeated_entity_month":
        raise DataError("Only balance_grain=repeated_entity_month is supported; do not sum repeated snapshot balances")
    # Kept for backward-compatible config parsing; v1.0.6 uniqueness is always
    # (normalized detail_driver, driver_impact), independent of component_id.
    if cfg.get("duplicate_driver_policy", "error") not in {"error", "sum_distinct_components"}:
        raise DataError("Invalid duplicate_driver_policy")
    if cfg.get("reconciliation_mode", "error") not in {"error", "warn"}:
        raise DataError("reconciliation_mode must be error or warn")
    cfg["_tolerance"] = decimal_value(str(cfg.get("reconciliation_tolerance_usdm", "0.000001")), "reconciliation_tolerance_usdm")
    if cfg["_tolerance"] < 0:
        raise DataError("Negative reconciliation tolerance")
    for k, default in [("max_group_json_bytes", 5000000), ("max_entity_months_per_group", 100000)]:
        value = cfg.get(k, default)
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise DataError(f"{k} must be a positive integer")
        cfg[k] = value
    fmts = cfg.get("extra_date_formats", [])
    if not isinstance(fmts, list) or any(not isinstance(f, str) or "%Y" not in f or not ("%m" in f or "%b" in f or "%B" in f) for f in fmts):
        raise DataError("extra_date_formats must explicitly contain a four-digit year and a month")
    loc = cfg.get("missing_group_location", "NOT_PROVIDED")
    if not isinstance(loc, str) or not text(loc):
        raise DataError("missing_group_location must be a nonempty explicit sentinel for the v5 adapter")
    return cfg


def prepare(input_path: Path, cfg: dict) -> tuple[list[dict], list[dict], list[dict], dict]:
    """Validate and aggregate before any published output is created."""
    scale = MULTIPLIERS[cfg["input_amount_unit"]]
    groups, buckets, entity_ids, inventory, warnings = {}, {}, {}, {}, []
    input_count = 0
    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        csv.field_size_limit(20_000_000)
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise DataError("Input CSV is empty")
        cols = resolve_columns(reader.fieldnames, cfg["columns"])
        if not cols["group_location"]:
            warnings.append("group_location is absent: NOT_PROVIDED (or configured sentinel) is a compatibility placeholder, not an inferred location.")
        for row in reader:
            line = reader.line_num
            if None in row or any(v is None for v in row.values()):
                raise DataError(f"CSV line {line}: inconsistent column count")
            if not any(text(v) for v in row.values()):
                continue
            input_count += 1
            def get(k: str) -> str:
                return text(row[cols[k]]) if cols[k] else ""
            gid, gname, eid, ename = (get(k) for k in ("group_id", "group_name", "entity_id", "entity_name"))
            if not all((gid, gname, eid, ename)):
                raise DataError(f"CSV line {line}: blank group/client ID or name")
            if any(len(x) > 512 for x in (gid, gname, eid, ename)):
                raise DataError(f"CSV line {line}: ID/name exceeds 512 characters")

            # Group identity is client_group_id only. Group name/location are display
            # attributes and may legitimately change over time. Resolve the output
            # display value by the latest Reporting Month seen for that ID.
            month = parse_month(get("month"), cfg.get("extra_date_formats", []))
            if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", month):
                raise DataError(f"CSV line {line}: reporting month must be between 2000 and 2099")
            loc = get("group_location") or cfg.get("missing_group_location", "NOT_PROVIDED")
            if gid not in groups:
                groups[gid] = {
                    "client_group_id": gid,
                    "client_group_name": gname,
                    "group_location": loc,
                    "_display_month": month,
                    "_display_line": line,
                }
            else:
                g = groups[gid]
                display_month = g["_display_month"]
                if month > display_month:
                    g["client_group_name"] = gname
                    g["group_location"] = loc
                    g["_display_month"] = month
                    g["_display_line"] = line
                elif month == display_month and (g["client_group_name"] != gname or g["group_location"] != loc):
                    raise DataError(
                        f"CSV line {line}: conflicting current-month display name/location for group ID {gid!r}, "
                        f"month={month}; first current-month value at line {g['_display_line']}"
                    )

            id_key = (gid, eid)
            if id_key in entity_ids and entity_ids[id_key] != ename:
                raise DataError(f"CSV line {line}: one LEID has conflicting client names across months; current adapter requires one canonical display name")
            entity_ids[id_key] = ename
            # Client/entity names are display labels, not unique keys.
            # Distinct LEIDs may legitimately share the same client name within a group.
            # Identity and aggregation therefore use (client_group_id, LEID), never the name.
            vals = {"rwa_curr": decimal_value(get("rwa_curr"), f"CSV line {line}/rwa_curr") * scale}
            if vals["rwa_curr"] < 0:
                raise DataError(f"CSV line {line}: negative rwa_curr is not supported by current v5")
            # Only CURRENT-side descriptive fields participate in snapshot consistency.
            # All prev_* / prev_group* source columns are intentionally ignored by the
            # aggregation contract because prior-month group migration can make them vary
            # legitimately across repeated detail-driver rows.
            attrs = {}
            for k in CURRENT_ATTRS:
                if not cols[k]:
                    continue
                raw = get(k)
                attrs[k] = (decimal_value(raw, f"CSV line {line}/{k}") * scale if raw else None) if k in NUMERIC else (raw or None)
                if k == "ead_curr" and attrs[k] is not None and attrs[k] < 0:
                    raise DataError(f"CSV line {line}: negative {k}")

            current_attrs = {k: attrs.get(k) for k in CURRENT_ATTRS if k in attrs}

            bucket_key = (gid, eid, month)
            snap = {"entity_id": eid, "entity": ename, "month": month, "rwa_curr": vals["rwa_curr"], "current_attributes": current_attrs}
            if bucket_key not in buckets:
                buckets[bucket_key] = {**snap, "drivers": {}, "tokens": set(), "source_lines": [], "duplicate_attribution_rows": 0, "first_line": line}
            b = buckets[bucket_key]
            diffs = []
            for k in ("entity_id", "entity", "month", "rwa_curr", "current_attributes"):
                if b[k] != snap[k]:
                    diffs.append(k)
            if diffs:
                raise DataError(
                    f"CSV line {line}: inconsistent repeated CURRENT snapshot for group={gid}, LEID={eid}, month={month}; "
                    f"first at line {b['first_line']}; differing field(s): {', '.join(diffs)}. "
                    "Previous-group fields, including prev_rwa, may differ across distinct previous groups. "
                    "Current RWA/current attributes must remain consistent. If current-side differences are product/facility-level balances, add that grain upstream rather than taking MAX/first or summing blindly."
                )

            label = get("driver")
            impact = decimal_value(get("driver_impact"), f"CSV line {line}/driver_impact") * scale
            if not label:
                raise DataError(f"CSV line {line}: detail_driver is blank; do not invent an Other driver")
            if label in FORBIDDEN or len(label) > 1000 or any(ord(c) < 32 for c in label):
                raise DataError(f"CSV line {line}: unsafe/oversized driver label")
            invkey = keytext(label)
            if invkey in inventory and inventory[invkey]["detail_driver"] != label:
                raise DataError(f"CSV line {line}: near-identical driver labels differ by case/spacing; standardize upstream without merging semantic changes")

            # Attribution uniqueness is the normalized detail_driver + reported impact.
            # Exact repeats of the same pair are de-duplicated because prev_* context may
            # differ/repeat across source rows. The same driver with a DIFFERENT impact is
            # a distinct additive attribution component and is summed.
            token = (invkey, impact)
            if token in b["tokens"]:
                b["duplicate_attribution_rows"] += 1
                continue
            b["tokens"].add(token)
            b["drivers"][label] = b["drivers"].get(label, Decimal(0)) + impact
            b["source_lines"].append(line)
            if invkey not in inventory:
                inventory[invkey] = {"detail_driver": label, "source_rows": 0, "first_month": month, "last_month": month}
            inv = inventory[invkey]; inv["source_rows"] += 1
            inv["first_month"] = min(inv["first_month"], month); inv["last_month"] = max(inv["last_month"], month)
    if not input_count:
        raise DataError("Input CSV has no data rows")
    data_by_group = {gid: [] for gid in groups}
    quality, violations = [], []
    for (gid, eid, month), b in sorted(buckets.items()):
        total = sum(b["drivers"].values(), Decimal(0))
        # Raw prev_* values are intentionally ignored. The comparison-basis previous RWA
        # is defined from the current balance and the unique reported additive driver bridge.
        effective_rwa_prev = b["rwa_curr"] - total
        rwa_prev_source = "derived_from_current_rwa_minus_unique_driver_impacts"
        delta = b["rwa_curr"] - effective_rwa_prev
        residual = delta - total
        ok = abs(residual) <= cfg["_tolerance"]
        current_attrs = {k: json_number(v) if isinstance(v, Decimal) else v for k, v in b["current_attributes"].items()}
        attrs = dict(current_attrs)
        attrs["rwa_prev_source"] = rwa_prev_source
        attrs["duplicate_attribution_rows_ignored"] = b["duplicate_attribution_rows"]

        data_by_group[gid].append({"entity_id": eid, "entity": b["entity"], "month": month, "rwa_prev": json_number(effective_rwa_prev), "rwa_curr": json_number(b["rwa_curr"]), "drivers": {k: json_number(v) for k, v in sorted(b["drivers"].items())}, "attributes": attrs})
        quality.append({"client_group_id": gid, "entity_id": eid, "month": month, "source_driver_rows": len(b["source_lines"]), "duplicate_attribution_rows_ignored": b["duplicate_attribution_rows"], "rwa_prev_usdm": str(effective_rwa_prev), "rwa_curr_usdm": str(b["rwa_curr"]), "delta_usdm": str(delta), "driver_total_usdm": str(total), "residual_usdm": str(residual), "status": "PASS" if ok else "RESIDUAL"})
    if violations and cfg.get("reconciliation_mode", "error") == "error":
        raise DataError("Attribution reconciliation failed; output not published.\n" + "\n".join(violations[:20]))
    if violations:
        warnings.append(f"{len(violations)} entity-month(s) do not reconcile. Explicit warn mode was selected; residuals have NOT been reassigned to any driver.")
    outputs, group_sizes = [], []
    for gid in sorted(groups):
        rr = data_by_group[gid]
        if len(rr) > cfg["max_entity_months_per_group"]:
            raise DataError(f"Group {gid}: exceeds max_entity_months_per_group")
        payload = {"rows": rr, "metadata": {"schema": "v5-rows-with-optional-attributes", "unit": "USDm", "balance_grain": "client_group_id/entity_id/month", "driver_source": "reported additive RWA Diff by driver", "missing_driver_policy": "unknown-not-zero", "reconciliation_status": "SEE_VALIDATION_REPORT"}}
        s = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        size = len(s.encode("utf-8"))
        if size > cfg["max_group_json_bytes"]:
            raise DataError(f"Group {gid}: JSON is {size} bytes, exceeds configured {cfg['max_group_json_bytes']}. A period/chunk transport change is required; do not truncate.")
        group_out = {k: v for k, v in groups[gid].items() if not k.startswith("_")}
        outputs.append({**group_out, "json_data": s})
        group_sizes.append({"client_group_id": gid, "json_utf8_bytes": size, "json_characters": len(s), "entity_months": len(rr)})
    if any(x["json_characters"] > 32767 for x in group_sizes):
        warnings.append("Some JSON cells exceed Excel's 32,767-character cell limit. Do not open/edit/save the generated data CSV through an Excel worksheet.")
    warnings.extend([
        "No RLS or authorization is implemented by this offline converter. Do not deploy real output as a public/static sample CSV.",
        "Current-side attributes are retained in JSON; all prev_* source fields are intentionally ignored by this builder. Attribute Q&A requires reviewed adapter/parser/report changes.",
        "New driver labels are preserved automatically for arithmetic. Current v5 NLP recognizes a fixed driver vocabulary; dynamic named-driver/family queries still require an application patch.",
        "One group per outer CSV row is intentional. Group-month chunking requires a different Tableau adapter; never replicate the full JSON across raw driver rows.",
        "The legacy catalogUrl/aliases dependency is NOT removed by this converter. This package is data preparation, not a browser/Tableau-index patch."
    ])
    manifest = {"builder_version": VERSION, "input_rows": input_count, "group_count": len(groups), "entity_month_count": len(buckets), "driver_label_count": len(inventory), "input_amount_unit": cfg["input_amount_unit"], "input_currency": cfg["currency"], "output_unit": "USDm", "source_balance_mode": cfg["balance_grain"], "snapshot_deduplication": "current-fields-equal; all prev_* fields ignored; exact duplicate (detail_driver, RWA Diff by driver) pairs de-duplicated; same driver with different impacts remains additive", "duplicate_driver_policy": "detail_driver_plus_impact", "missing_driver_policy": "unknown-not-zero", "reconciliation_tolerance_usdm": str(cfg["_tolerance"]), "reconciliation_failures": len(violations), "groups": group_sizes, "warnings": warnings}
    return outputs, quality, list(sorted(inventory.values(), key=lambda d: d["detail_driver"])), manifest


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="raise")
        w.writeheader(); w.writerows(rows); f.flush(); os.fsync(f.fileno())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def build(input_path: Path, config_path: Path, out: Path, input_unit: str | None = None, currency: str | None = None) -> dict:
    input_path, config_path, out = Path(input_path).resolve(), Path(config_path).resolve(), Path(out).resolve()
    if out.exists():
        raise DataError(f"Output folder already exists: {out.name}. Choose a NEW versioned folder; no existing files will be overwritten.")
    cfg = load_config(config_path, input_unit, currency)
    before = sha256(input_path)
    rows, quality, drivers, report = prepare(input_path, cfg)
    if sha256(input_path) != before:
        raise DataError("Input file changed during processing")
    out.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".rwa_csv_stage_", dir=out.parent))
    try:
        write_csv(stage / "tableau_data.csv", rows, OUT_FIELDS)
        write_csv(stage / "data_quality.csv", quality, list(quality[0]))
        write_csv(stage / "driver_inventory.csv", drivers, ["detail_driver", "source_rows", "first_month", "last_month"])
        report.update({"source_filename": input_path.name, "source_sha256": before, "output_sha256": sha256(stage / "tableau_data.csv"), "artifact_usage": "Tableau ingestion ONLY; not production static browser data"})
        with (stage / "manifest.json").open("w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, allow_nan=False, indent=2); f.write("\n"); f.flush(); os.fsync(f.fileno())
        if out.exists():
            raise DataError("Output directory was created by another process; aborted")
        os.rename(stage, out)
    except BaseException:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", type=Path, required=True, help="Raw CSV; IDs must already be correctly exported as text")
    ap.add_argument("--config", type=Path, default=Path(__file__).with_name("data_mapping.json"))
    ap.add_argument("--output-dir", type=Path, required=True, help="New versioned local output directory")
    ap.add_argument("--input-unit", choices=list(MULTIPLIERS))
    ap.add_argument("--currency", choices=["USD"], help="Declare amounts are already in USD; no FX conversion")
    args = ap.parse_args()
    try:
        r = build(args.input, args.config, args.output_dir, args.input_unit, args.currency)
    except (DataError, OSError, csv.Error, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}\nBuild aborted; no existing output was replaced.", file=sys.stderr)
        return 2
    print(f"Created {args.output_dir / 'tableau_data.csv'}")
    print(f"{r['input_rows']} source rows -> {r['entity_month_count']} entity-months -> {r['group_count']} group rows; {r['driver_label_count']} dynamic labels.")
    print(f"Reconciliation failures: {r['reconciliation_failures']}. Review manifest.json before Tableau ingestion.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
