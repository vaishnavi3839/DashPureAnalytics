-- Raw table (same as in 00, repeated here so 01-07 also run on DuckDB) and cost settings.

CREATE TABLE IF NOT EXISTS RAW_REPORT_USAGE_LOG (
    SOURCE_FILE                 VARCHAR,
    SOURCE_ROW_NUMBER           INTEGER       NOT NULL,
    REPORT_ID                   VARCHAR,
    REPORT_NAME                 VARCHAR,
    OWNER_EMAIL                 VARCHAR,
    LAST_REFRESH_STATUS         VARCHAR,
    MONTHLY_ACTIVE_VIEWS        VARCHAR,
    SNOWFLAKE_CREDITS_CONSUMED  VARCHAR,
    AVG_LOAD_TIME_SEC           VARCHAR,
    AWS_HOSTING_COST_USD        VARCHAR,
    QUERY_COUNT_LAST_30D        VARCHAR,
    CONCURRENT_USER_PEAK        VARCHAR
);

CREATE OR REPLACE TABLE COST_CONFIG (
    CONFIG_KEY      VARCHAR,
    CONFIG_VALUE    DECIMAL(12,4),
    NOTE            VARCHAR
);

INSERT INTO COST_CONFIG VALUES
    ('CREDIT_PRICE_USD',      3.0000, 'Assumed Snowflake on-demand Enterprise price per credit (AWS US). Replace with contracted rate.'),
    ('LATENCY_WARN_SEC',     15.0000, 'Dashboard load SLA from case brief'),
    ('LATENCY_CRITICAL_SEC', 30.0000, 'Escalation tier used by the alert engine'),
    ('OUTLIER_IQR_K',         1.5000, 'Tukey fence multiplier for AWS cost-per-view outliers');
