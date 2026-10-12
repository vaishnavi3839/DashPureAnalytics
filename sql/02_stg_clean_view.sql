-- Cleaned view of the raw data. No rows are dropped, each problem just gets a flag.

CREATE OR REPLACE VIEW STG_REPORT_USAGE AS
WITH typed AS (
    SELECT
        SOURCE_ROW_NUMBER,
        UPPER(TRIM(REPORT_ID))                                        AS REPORT_ID,
        TRIM(REPORT_NAME)                                             AS REPORT_NAME,
        OWNER_EMAIL                                                   AS OWNER_EMAIL_RAW,
        LOWER(TRIM(OWNER_EMAIL))                                      AS OWNER_EMAIL_NORM,
        UPPER(REPLACE(TRIM(LAST_REFRESH_STATUS), ' ', '_'))           AS STATUS_NORM,
        TRY_CAST(MONTHLY_ACTIVE_VIEWS       AS INTEGER)               AS MONTHLY_ACTIVE_VIEWS,
        TRY_CAST(SNOWFLAKE_CREDITS_CONSUMED AS DECIMAL(18,4))         AS CREDITS_RAW,
        TRY_CAST(AVG_LOAD_TIME_SEC          AS DECIMAL(10,2))         AS AVG_LOAD_TIME_SEC,
        TRY_CAST(AWS_HOSTING_COST_USD       AS DECIMAL(18,4))         AS AWS_HOSTING_COST_USD,
        TRY_CAST(QUERY_COUNT_LAST_30D       AS INTEGER)               AS QUERY_COUNT_LAST_30D,
        TRY_CAST(CONCURRENT_USER_PEAK       AS INTEGER)               AS CONCURRENT_USER_PEAK
    FROM RAW_REPORT_USAGE_LOG
),
thresholds AS (
    SELECT
        MAX(CASE WHEN CONFIG_KEY = 'LATENCY_WARN_SEC'     THEN CONFIG_VALUE END) AS WARN_SEC,
        MAX(CASE WHEN CONFIG_KEY = 'LATENCY_CRITICAL_SEC' THEN CONFIG_VALUE END) AS CRIT_SEC
    FROM COST_CONFIG
)
SELECT
    t.SOURCE_ROW_NUMBER,
    -- no timestamp in the file, so the nth time a report appears = snapshot n
    ROW_NUMBER() OVER (PARTITION BY t.REPORT_ID ORDER BY t.SOURCE_ROW_NUMBER)      AS SNAPSHOT_SEQ,
    t.REPORT_ID,
    t.REPORT_NAME,

    -- owner
    t.OWNER_EMAIL_RAW,
    CASE
        WHEN t.OWNER_EMAIL_NORM IS NULL
          OR t.OWNER_EMAIL_NORM IN ('', 'nan', 'null', 'none', 'n/a', 'unknown', 'orphaned_report')
          OR t.OWNER_EMAIL_NORM NOT LIKE '%_@_%._%'
        THEN NULL
        ELSE t.OWNER_EMAIL_NORM
    END                                                                            AS OWNER_EMAIL,
    CASE
        WHEN t.OWNER_EMAIL_NORM IS NULL
          OR t.OWNER_EMAIL_NORM IN ('', 'nan', 'null', 'none', 'n/a', 'unknown', 'orphaned_report')
          OR t.OWNER_EMAIL_NORM NOT LIKE '%_@_%._%'
        THEN TRUE ELSE FALSE
    END                                                                            AS IS_ORPHANED,

    -- refresh
    CASE WHEN t.STATUS_NORM IN ('SUCCESS', 'FAILED', 'TIMED_OUT') THEN t.STATUS_NORM ELSE 'UNKNOWN' END
                                                                                   AS LAST_REFRESH_STATUS,
    CASE WHEN t.STATUS_NORM IN ('FAILED', 'TIMED_OUT') THEN TRUE ELSE FALSE END    AS IS_REFRESH_FAILURE,

    -- usage
    t.MONTHLY_ACTIVE_VIEWS,
    t.QUERY_COUNT_LAST_30D,
    t.CONCURRENT_USER_PEAK,

    -- credits: keep the raw value, use CREDITS_VALID for cost maths
    t.CREDITS_RAW                                                                  AS SNOWFLAKE_CREDITS_RAW,
    CASE WHEN t.CREDITS_RAW >= 0 THEN t.CREDITS_RAW END                            AS SNOWFLAKE_CREDITS_VALID,
    CASE WHEN t.CREDITS_RAW <  0 THEN TRUE ELSE FALSE END                          AS IS_NEGATIVE_CREDITS,

    -- load time
    t.AVG_LOAD_TIME_SEC,
    CASE
        WHEN t.AVG_LOAD_TIME_SEC IS NULL          THEN 'UNKNOWN'
        WHEN t.AVG_LOAD_TIME_SEC >  th.CRIT_SEC   THEN 'CRITICAL'
        WHEN t.AVG_LOAD_TIME_SEC >  th.WARN_SEC   THEN 'WARNING'
        ELSE 'OK'
    END                                                                            AS LATENCY_BAND,
    CASE WHEN t.AVG_LOAD_TIME_SEC > th.WARN_SEC THEN TRUE ELSE FALSE END           AS IS_LATENCY_BREACH,

    -- AWS cost vs usage
    t.AWS_HOSTING_COST_USD,
    t.AWS_HOSTING_COST_USD / NULLIF(t.MONTHLY_ACTIVE_VIEWS, 0)                     AS AWS_COST_PER_VIEW,
    CASE WHEN t.MONTHLY_ACTIVE_VIEWS = 0
          AND (COALESCE(t.AWS_HOSTING_COST_USD, 0) > 0 OR COALESCE(t.CREDITS_RAW, 0) > 0)
         THEN TRUE ELSE FALSE END                                                  AS IS_ZERO_VIEW_WITH_COST
FROM typed t
CROSS JOIN thresholds th;
