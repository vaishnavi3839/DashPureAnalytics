-- How many rows each data problem affects, and what we do about it.

CREATE OR REPLACE VIEW DQ_AUDIT_SUMMARY AS
WITH totals AS (SELECT COUNT(*) AS N FROM STG_REPORT_USAGE)
SELECT RULE_CODE, ROWS_AFFECTED, ROUND(100.0 * ROWS_AFFECTED / totals.N, 1) AS PCT_OF_ROWS, TREATMENT
FROM (
    SELECT 1 AS ORD, 'ORPHANED_OWNER' AS RULE_CODE,
           SUM(CASE WHEN IS_ORPHANED THEN 1 ELSE 0 END) AS ROWS_AFFECTED,
           'Owner set to NULL; report surfaced in orphaned list for reassignment' AS TREATMENT
    FROM STG_REPORT_USAGE
    UNION ALL
    SELECT 2, 'NEGATIVE_CREDITS',
           SUM(CASE WHEN IS_NEGATIVE_CREDITS THEN 1 ELSE 0 END),
           'Raw value kept for audit; excluded from cost attribution (numerator and denominator)'
    FROM STG_REPORT_USAGE
    UNION ALL
    SELECT 3, 'LATENCY_BREACH_GT_15S',
           SUM(CASE WHEN IS_LATENCY_BREACH THEN 1 ELSE 0 END),
           'Kept; drives WARNING alerts (>15s)'
    FROM STG_REPORT_USAGE
    UNION ALL
    SELECT 4, 'LATENCY_CRITICAL_GT_30S',
           SUM(CASE WHEN LATENCY_BAND = 'CRITICAL' THEN 1 ELSE 0 END),
           'Kept; drives CRITICAL alerts (>30s)'
    FROM STG_REPORT_USAGE
    UNION ALL
    SELECT 5, 'UNKNOWN_REFRESH_STATUS',
           SUM(CASE WHEN LAST_REFRESH_STATUS = 'UNKNOWN' THEN 1 ELSE 0 END),
           'Excluded from refresh failure-rate denominator; does not raise or clear alerts'
    FROM STG_REPORT_USAGE
    UNION ALL
    SELECT 6, 'ZERO_VIEWS_WITH_COST',
           SUM(CASE WHEN IS_ZERO_VIEW_WITH_COST THEN 1 ELSE 0 END),
           'Cost per view undefined (NULLIF); listed as discrepancy'
    FROM STG_REPORT_USAGE
    UNION ALL
    SELECT 7, 'NON_NUMERIC_VALUES',
           SUM(CASE WHEN MONTHLY_ACTIVE_VIEWS IS NULL OR SNOWFLAKE_CREDITS_RAW IS NULL OR AVG_LOAD_TIME_SEC IS NULL
                      OR AWS_HOSTING_COST_USD IS NULL THEN 1 ELSE 0 END),
           'TRY_CAST to NULL'
    FROM STG_REPORT_USAGE
    UNION ALL
    SELECT 8, 'REPEATED_REPORT_ID',
           COUNT(*) - COUNT(DISTINCT REPORT_ID),
           'Interpreted as successive snapshots (SNAPSHOT_SEQ); no dedup - latest snapshot = current state'
    FROM STG_REPORT_USAGE
) rules
CROSS JOIN totals
ORDER BY ORD;

SELECT * FROM DQ_AUDIT_SUMMARY;
