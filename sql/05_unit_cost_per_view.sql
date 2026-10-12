-- Cost per active user view.
-- Rows with negative credits are left out of both the cost and the views,
-- otherwise a bad row would make the report look cheaper.

CREATE OR REPLACE VIEW RPT_UNIT_COST AS
WITH price AS (
    SELECT CONFIG_VALUE AS CREDIT_PRICE_USD FROM COST_CONFIG WHERE CONFIG_KEY = 'CREDIT_PRICE_USD'
),
per_report AS (
    SELECT
        REPORT_ID,
        MAX(REPORT_NAME)                                                                  AS REPORT_NAME,
        SUM(SNOWFLAKE_CREDITS_VALID)                                                      AS CREDITS,
        SUM(CASE WHEN SNOWFLAKE_CREDITS_VALID IS NOT NULL THEN MONTHLY_ACTIVE_VIEWS END)  AS VIEWS_ON_VALID_CREDIT_ROWS,
        SUM(MONTHLY_ACTIVE_VIEWS)                                                         AS TOTAL_VIEWS,
        SUM(AWS_HOSTING_COST_USD)                                                         AS AWS_COST_USD
    FROM STG_REPORT_USAGE
    GROUP BY REPORT_ID
),
rates AS (
    SELECT
        r.*,
        r.CREDITS * p.CREDIT_PRICE_USD                                       AS SNOWFLAKE_COST_USD,
        r.CREDITS * p.CREDIT_PRICE_USD / NULLIF(r.VIEWS_ON_VALID_CREDIT_ROWS, 0) AS SF_PER_VIEW,
        r.AWS_COST_USD / NULLIF(r.TOTAL_VIEWS, 0)                            AS AWS_PER_VIEW
    FROM per_report r
    CROSS JOIN price p
)
SELECT
    REPORT_ID,
    REPORT_NAME,
    TOTAL_VIEWS,
    ROUND(SNOWFLAKE_COST_USD, 2)                         AS SNOWFLAKE_COST_USD,
    ROUND(AWS_COST_USD, 2)                               AS AWS_HOSTING_COST_USD,
    ROUND(SNOWFLAKE_COST_USD + AWS_COST_USD, 2)          AS TOTAL_COST_USD,
    ROUND(SF_PER_VIEW, 4)                                AS SNOWFLAKE_COST_PER_VIEW,
    ROUND(AWS_PER_VIEW, 4)                               AS AWS_COST_PER_VIEW,
    ROUND(SF_PER_VIEW + AWS_PER_VIEW, 4)                 AS TOTAL_COST_PER_VIEW,
    -- 4 = most expensive quarter
    NTILE(4) OVER (ORDER BY SF_PER_VIEW + AWS_PER_VIEW)  AS COST_PER_VIEW_QUARTILE
FROM rates;

-- most expensive per view
SELECT *
FROM RPT_UNIT_COST
ORDER BY TOTAL_COST_PER_VIEW DESC NULLS LAST
LIMIT 15;
