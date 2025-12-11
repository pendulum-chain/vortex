-- PostgreSQL functions used for volume aggregations

-- Monthly volumes function
CREATE OR REPLACE FUNCTION get_monthly_volumes(year_param INTEGER DEFAULT NULL)
RETURNS TABLE(month TEXT, buy_usd NUMERIC, sell_usd NUMERIC, total_usd NUMERIC)
LANGUAGE SQL
AS $$
  WITH base AS (
    SELECT
      to_char(date_trunc('month', rs.created_at), 'YYYY-MM') AS month,
      qt.ramp_type,
      CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount
           WHEN qt.ramp_type = 'SELL' THEN qt.input_amount
           ELSE 0 END AS usd
    FROM public.ramp_states AS rs
    JOIN public.quote_tickets AS qt ON qt.id = rs.quote_id
    WHERE rs.current_phase = 'complete'
      AND (year_param IS NULL OR date_trunc('year', rs.created_at) = (year_param || '-01-01')::date)
  )
  SELECT
    month,
    COALESCE(SUM(CASE WHEN ramp_type = 'BUY'  THEN usd END), 0)::numeric AS buy_usd,
    COALESCE(SUM(CASE WHEN ramp_type = 'SELL' THEN usd END), 0)::numeric AS sell_usd,
    COALESCE(SUM(usd), 0)::numeric AS total_usd
  FROM base
  GROUP BY month
  ORDER BY month;
$$;

-- Daily volumes function
CREATE OR REPLACE FUNCTION get_daily_volumes(start_date DATE, end_date DATE)
RETURNS TABLE(day TEXT, buy_usd NUMERIC, sell_usd NUMERIC, total_usd NUMERIC)
LANGUAGE SQL
AS $$
  WITH base AS (
    SELECT
      date_trunc('day', rs.created_at)::date AS day,
      qt.ramp_type,
      CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount
           WHEN qt.ramp_type = 'SELL' THEN qt.input_amount
           ELSE 0 END AS usd
    FROM public.ramp_states AS rs
    JOIN public.quote_tickets AS qt ON qt.id = rs.quote_id
    WHERE rs.current_phase = 'complete'
      AND rs.created_at >= start_date
      AND rs.created_at < end_date + interval '1 day'
  )
  SELECT
    to_char(day, 'YYYY-MM-DD') AS day,
    COALESCE(SUM(CASE WHEN ramp_type = 'BUY'  THEN usd END), 0)::numeric AS buy_usd,
    COALESCE(SUM(CASE WHEN ramp_type = 'SELL' THEN usd END), 0)::numeric AS sell_usd,
    COALESCE(SUM(usd), 0)::numeric AS total_usd
  FROM base
  GROUP BY day
  ORDER BY day;
$$;
