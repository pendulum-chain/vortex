-- PostgreSQL functions used for volume aggregations

-- Monthly volumes function
CREATE OR REPLACE FUNCTION get_daily_volumes(start_date DATE, end_date DATE)
RETURNS TABLE(day TEXT, chains JSONB)
LANGUAGE SQL
AS $$
  WITH base AS (
    SELECT
      to_char(date_trunc('day', rs.created_at), 'YYYY-MM-DD') AS day,
      CASE WHEN qt.ramp_type = 'BUY' THEN qt.to_chain ELSE qt.from_chain END AS chain,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount ELSE 0 END), 0) AS buy_usd,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'SELL' THEN qt.input_amount  ELSE 0 END), 0) AS sell_usd,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount 
                        WHEN qt.ramp_type = 'SELL' THEN qt.input_amount ELSE 0 END), 0) AS total_usd
    FROM public.ramp_states AS rs
    JOIN public.quote_tickets AS qt ON qt.id = rs.quote_id
    WHERE rs.current_phase = 'complete'
      AND rs.created_at >= start_date
      AND rs.created_at < end_date + interval '1 day'
    GROUP BY 1, 2
  )
  SELECT
    day,
    jsonb_agg(
      jsonb_build_object(
        'chain', chain,
        'buy_usd', buy_usd,
        'sell_usd', sell_usd,
        'total_usd', total_usd
      )
    ) AS chains
  FROM base
  GROUP BY day
  ORDER BY day;
$$;

-- Daily volumes function
CREATE OR REPLACE FUNCTION get_daily_volumes(start_date DATE, end_date DATE)
RETURNS TABLE(day TEXT, chains JSONB)
LANGUAGE SQL
AS $$
  WITH base AS (
    SELECT
      to_char(date_trunc('day', rs.created_at), 'YYYY-MM-DD') AS day,
      CASE WHEN qt.ramp_type = 'BUY' THEN qt.to ELSE qt.from END AS chain,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount ELSE 0 END), 0) AS buy_usd,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'SELL' THEN qt.input_amount  ELSE 0 END), 0) AS sell_usd,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount 
                        WHEN qt.ramp_type = 'SELL' THEN qt.input_amount ELSE 0 END), 0) AS total_usd
    FROM public.ramp_states AS rs
    JOIN public.quote_tickets AS qt ON qt.id = rs.quote_id
    WHERE rs.current_phase = 'complete'
      AND rs.created_at >= start_date
      AND rs.created_at < end_date + interval '1 day'
    GROUP BY 1, 2
  )
  SELECT
    day,
    jsonb_agg(
      jsonb_build_object(
        'chain', chain,
        'buy_usd', buy_usd,
        'sell_usd', sell_usd,
        'total_usd', total_usd
      )
    ) AS chains
  FROM base
  GROUP BY day
  ORDER BY day;
$$;