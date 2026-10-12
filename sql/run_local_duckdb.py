#!/usr/bin/env python3
"""Runs sql/01-07 against the CSV with DuckDB, so they can be tested without Snowflake.

Usage: pip install duckdb pandas, then python sql/run_local_duckdb.py
00 and 08 are Snowflake-only and are skipped. Results go to sql/output/.
"""
import pathlib
import sys

import duckdb
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_CSV = HERE.parent / "backend" / "data" / "pure_insights_monitoring.csv"
PORTABLE_FILES = [
    "01_raw_table_and_cost_config.sql",
    "02_stg_clean_view.sql",
    "03_data_quality_audit.sql",
    "04_credit_attribution.sql",
    "05_unit_cost_per_view.sql",
    "06_usage_vs_aws_cost_discrepancy.sql",
    "07_orphaned_reports_and_health.sql",
]


def split_statements(sql: str) -> list[str]:
    """Strip -- comments and split on ';' while respecting single-quoted strings."""
    statements, buf, in_str, i = [], [], False, 0
    while i < len(sql):
        ch = sql[i]
        if not in_str and sql.startswith("--", i):
            i = sql.find("\n", i)
            i = len(sql) if i == -1 else i
            continue
        if ch == "'":
            in_str = not in_str
        if ch == ";" and not in_str:
            statements.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    statements.append("".join(buf).strip())
    return [s for s in statements if s]


def main() -> None:
    csv_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    out_dir = HERE / "output"
    out_dir.mkdir(exist_ok=True)
    con = duckdb.connect()

    # after 01 creates the raw table, load the CSV into it as text plus a row number, like COPY INTO
    for fname in PORTABLE_FILES:
        print(f"\n{'=' * 80}\n{fname}\n{'=' * 80}")
        statements = split_statements((HERE / fname).read_text())
        select_no = 0
        for stmt in statements:
            if stmt.upper().startswith("SELECT"):
                select_no += 1
                df = con.execute(stmt).df()
                out = out_dir / f"{fname[:-4]}__result{select_no}.csv"
                df.to_csv(out, index=False)
                with pd.option_context("display.width", 200, "display.max_columns", 20):
                    print(df.to_string(index=False, max_rows=20))
                print(f"-> {len(df)} rows saved to {out.relative_to(HERE.parent)}")
            else:
                con.execute(stmt)
        if fname.startswith("01_"):
            raw = pd.read_csv(csv_path, dtype=str, keep_default_na=False)  # keep 'nan' as a literal string
            raw.insert(0, "source_row_number", range(1, len(raw) + 1))  # file order, like METADATA$FILE_ROW_NUMBER
            raw.insert(0, "source_file", csv_path.name)
            con.register("raw_df", raw)
            con.execute("INSERT INTO RAW_REPORT_USAGE_LOG SELECT * FROM raw_df")
            n = con.execute("SELECT COUNT(*) FROM RAW_REPORT_USAGE_LOG").fetchone()[0]
            print(f"Loaded {n} raw rows from {csv_path.name}")


if __name__ == "__main__":
    main()
