DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly') THEN
    CREATE ROLE readonly;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly') THEN
    CREATE ROLE readonly;
  END IF;
END $$;



DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly') THEN
    CREATE ROLE readonly;
  END IF;
END $$;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."enum_anchors_value_type" AS ENUM (
    'absolute',
    'relative'
);


ALTER TYPE "public"."enum_anchors_value_type" OWNER TO "postgres";


CREATE TYPE "public"."enum_api_keys_key_type" AS ENUM (
    'public',
    'secret'
);


ALTER TYPE "public"."enum_api_keys_key_type" OWNER TO "postgres";


CREATE TYPE "public"."enum_kyc_level_2_document_type" AS ENUM (
    'RG',
    'CNH'
);


ALTER TYPE "public"."enum_kyc_level_2_document_type" OWNER TO "postgres";


CREATE TYPE "public"."enum_kyc_level_2_status" AS ENUM (
    'Requested',
    'DataCollected',
    'BrlaValidating',
    'Rejected',
    'Accepted',
    'Cancelled'
);


ALTER TYPE "public"."enum_kyc_level_2_status" OWNER TO "postgres";


CREATE TYPE "public"."enum_partners_markup_type" AS ENUM (
    'absolute',
    'relative',
    'none'
);


ALTER TYPE "public"."enum_partners_markup_type" OWNER TO "postgres";


CREATE TYPE "public"."enum_partners_vortex_fee_type" AS ENUM (
    'absolute',
    'relative',
    'none'
);


ALTER TYPE "public"."enum_partners_vortex_fee_type" OWNER TO "postgres";


CREATE TYPE "public"."enum_quote_tickets_status" AS ENUM (
    'pending',
    'consumed',
    'expired'
);


ALTER TYPE "public"."enum_quote_tickets_status" OWNER TO "postgres";


CREATE TYPE "public"."enum_subsidies_token" AS ENUM (
    'GLMR',
    'PEN',
    'XLM',
    'USDC.axl',
    'BRLA',
    'EURC',
    'USDC',
    'MATIC',
    'BRL'
);


ALTER TYPE "public"."enum_subsidies_token" OWNER TO "postgres";


CREATE TYPE "public"."enum_tax_ids_account_type" AS ENUM (
    'INDIVIDUAL',
    'COMPANY'
);


ALTER TYPE "public"."enum_tax_ids_account_type" OWNER TO "postgres";


CREATE TYPE "public"."enum_tax_ids_internal_status" AS ENUM (
    'Consulted',
    'Requested',
    'Accepted',
    'Rejected'
);


ALTER TYPE "public"."enum_tax_ids_internal_status" OWNER TO "postgres";


CREATE TYPE "public"."ramp_direction_enum" AS ENUM (
    'BUY',
    'SELL'
);


ALTER TYPE "public"."ramp_direction_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_volumes"("month_param" "text") RETURNS TABLE("day" "text", "buy_usd" numeric, "sell_usd" numeric, "total_usd" numeric)
    LANGUAGE "sql"
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
      AND date_trunc('month', rs.created_at) = (month_param || '-01')::date
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


ALTER FUNCTION "public"."get_daily_volumes"("month_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_volumes"("start_date" "date", "end_date" "date") RETURNS TABLE("day" "text", "buy_usd" numeric, "sell_usd" numeric, "total_usd" numeric)
    LANGUAGE "sql"
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


ALTER FUNCTION "public"."get_daily_volumes"("start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_volumes"("year_param" integer DEFAULT NULL::integer) RETURNS TABLE("month" "text", "buy_usd" numeric, "sell_usd" numeric, "total_usd" numeric)
    LANGUAGE "sql"
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


ALTER FUNCTION "public"."get_monthly_volumes"("year_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_volumes_by_chain"("year_param" integer DEFAULT NULL::integer) RETURNS TABLE("month" "text", "chains" "jsonb")
    LANGUAGE "sql"
    AS $$
  WITH base AS (
    SELECT
      to_char(date_trunc('month', rs.created_at), 'YYYY-MM') AS month,
      CASE WHEN qt.ramp_type = 'BUY' THEN qt.to ELSE qt.from END AS chain,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount ELSE 0 END), 0) AS buy_usd,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'SELL' THEN qt.input_amount  ELSE 0 END), 0) AS sell_usd,
      COALESCE(SUM(CASE WHEN qt.ramp_type = 'BUY'  THEN qt.output_amount 
                        WHEN qt.ramp_type = 'SELL' THEN qt.input_amount ELSE 0 END), 0) AS total_usd
    FROM public.ramp_states AS rs
    JOIN public.quote_tickets AS qt ON qt.id = rs.quote_id
    WHERE rs.current_phase = 'complete'
      AND (year_param IS NULL OR date_trunc('year', rs.created_at) = make_date(year_param, 1, 1))
    GROUP BY 1, 2
  )
  SELECT
    month,
    jsonb_agg(
      jsonb_build_object(
        'chain', chain,
        'buy_usd', buy_usd,
        'sell_usd', sell_usd,
        'total_usd', total_usd
      )
    ) AS chains
  FROM base
  GROUP BY month
  ORDER BY month;
$$;


ALTER FUNCTION "public"."get_monthly_volumes_by_chain"("year_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."SequelizeMeta" (
    "name" character varying(255) NOT NULL
);


ALTER TABLE "public"."SequelizeMeta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anchors" (
    "id" "uuid" NOT NULL,
    "ramp_type" "public"."ramp_direction_enum" NOT NULL,
    "identifier" character varying(100),
    "value_type" "public"."enum_anchors_value_type" NOT NULL,
    "value" numeric(10,4) NOT NULL,
    "currency" character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."anchors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."anchors"."identifier" IS 'Optional context, e.g., network name, anchor name, or "default"';



CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "created_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone,
    "id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "key_hash" character varying(255),
    "key_prefix" character varying(16) NOT NULL,
    "key_type" "public"."enum_api_keys_key_type" DEFAULT 'secret'::"public"."enum_api_keys_key_type" NOT NULL,
    "key_value" character varying(255),
    "last_used_at" timestamp with time zone,
    "name" character varying(100),
    "partner_name" character varying(100) NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."api_keys"."key_hash" IS 'Bcrypt hash for secret keys only (NULL for public keys)';



COMMENT ON COLUMN "public"."api_keys"."key_prefix" IS 'First 8-10 chars for quick lookup (pk_live, sk_live, etc)';



COMMENT ON COLUMN "public"."api_keys"."key_value" IS 'Plaintext value for public keys only (NULL for secret keys)';



CREATE TABLE IF NOT EXISTS "public"."kyc_level_2" (
    "id" "uuid" NOT NULL,
    "subaccount_id" character varying(255) NOT NULL,
    "document_type" "public"."enum_kyc_level_2_document_type" NOT NULL,
    "status" "public"."enum_kyc_level_2_status" DEFAULT 'Requested'::"public"."enum_kyc_level_2_status" NOT NULL,
    "error_logs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "upload_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."kyc_level_2" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_schedules" (
    "id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "start_datetime" timestamp with time zone NOT NULL,
    "end_datetime" timestamp with time zone NOT NULL,
    "message_to_display" "text" NOT NULL,
    "is_active_config" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."maintenance_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "logo_url" character varying(255),
    "markup_type" "public"."enum_partners_markup_type" DEFAULT 'none'::"public"."enum_partners_markup_type" NOT NULL,
    "markup_value" numeric(10,4) DEFAULT 0 NOT NULL,
    "markup_currency" character varying(8),
    "payout_address" character varying(255),
    "ramp_type" "public"."ramp_direction_enum" DEFAULT 'BUY'::"public"."ramp_direction_enum" NOT NULL,
    "vortex_fee_type" "public"."enum_partners_vortex_fee_type" DEFAULT 'none'::"public"."enum_partners_vortex_fee_type" NOT NULL,
    "vortex_fee_value" numeric(10,4) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "target_discount" numeric(10,4) DEFAULT 0 NOT NULL,
    "max_subsidy" numeric(10,4) DEFAULT 0 NOT NULL,
    "discount" numeric(10,4) DEFAULT 0 NOT NULL,
    "min_dynamic_difference" numeric(10,4) DEFAULT 0 NOT NULL,
    "max_dynamic_difference" numeric(10,4) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."partners" OWNER TO "postgres";


COMMENT ON COLUMN "public"."partners"."target_discount" IS 'Relative discount applied to the partner''s quote, denoted as decimal value.';



COMMENT ON COLUMN "public"."partners"."discount" IS 'Relative discount applied to the partner''s quote, denoted as decimal value.';



CREATE TABLE IF NOT EXISTS "public"."price_data" (
    "id" character varying(255) NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    "source" character varying(255) NOT NULL,
    "currency_pair" character varying(255) NOT NULL,
    "amount" double precision NOT NULL,
    "rate" double precision NOT NULL
);


ALTER TABLE "public"."price_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "created_at" timestamp with time zone NOT NULL,
    "email" character varying(255) NOT NULL,
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."id" IS 'User ID from Supabase Auth (synced)';



CREATE TABLE IF NOT EXISTS "public"."quote_tickets" (
    "id" "uuid" NOT NULL,
    "ramp_type" "public"."ramp_direction_enum" NOT NULL,
    "from" character varying(20) NOT NULL,
    "to" character varying(20) NOT NULL,
    "input_amount" numeric(38,18) NOT NULL,
    "input_currency" character varying(8) NOT NULL,
    "output_amount" numeric(38,18) NOT NULL,
    "output_currency" character varying(8) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "public"."enum_quote_tickets_status" DEFAULT 'pending'::"public"."enum_quote_tickets_status" NOT NULL,
    "metadata" "jsonb" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "partner_id" "uuid",
    "payment_method" character varying(20),
    "country_code" character varying(2),
    "network" character varying(20),
    "api_key" character varying(255),
    "fee" "jsonb" NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."quote_tickets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."quote_tickets"."api_key" IS 'Public API key used to create this quote (for tracking)';



CREATE TABLE IF NOT EXISTS "public"."ramp_states" (
    "id" "uuid" NOT NULL,
    "type" "public"."ramp_direction_enum" NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "current_phase" character varying(32) DEFAULT 'initial'::character varying NOT NULL,
    "from" character varying(20) NOT NULL,
    "to" character varying(20) NOT NULL,
    "state" "jsonb" NOT NULL,
    "phase_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "error_logs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "processing_lock" "jsonb" DEFAULT '{"locked": false, "lockedAt": null}'::"jsonb" NOT NULL,
    "post_complete_state" "jsonb" DEFAULT '{"cleanup": {"error": null, "cleanupAt": null, "cleanupCompleted": false}}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "unsigned_txs" "jsonb" NOT NULL,
    "presigned_txs" "jsonb",
    "payment_method" character varying(20) NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."ramp_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subsidies" (
    "amount" double precision NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "id" "uuid" NOT NULL,
    "payer_account" character varying(255) NOT NULL,
    "payment_date" timestamp with time zone NOT NULL,
    "phase" character varying(32) NOT NULL,
    "ramp_id" "uuid" NOT NULL,
    "token" "public"."enum_subsidies_token" NOT NULL,
    "transaction_hash" character varying(255) NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."subsidies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subsidies"."amount" IS 'Amount of subsidy payment as float32';



COMMENT ON COLUMN "public"."subsidies"."payer_account" IS 'Account address that made the subsidy payment';



COMMENT ON COLUMN "public"."subsidies"."payment_date" IS 'Date when the subsidy payment was made';



COMMENT ON COLUMN "public"."subsidies"."phase" IS 'Ramp phase during which the subsidy was applied';



COMMENT ON COLUMN "public"."subsidies"."ramp_id" IS 'Reference to the ramp state that received the subsidy';



COMMENT ON COLUMN "public"."subsidies"."token" IS 'Token used for the subsidy payment';



COMMENT ON COLUMN "public"."subsidies"."transaction_hash" IS 'Transaction hash or external identifier for the subsidy payment';



CREATE TABLE IF NOT EXISTS "public"."tax_ids" (
    "account_type" "public"."enum_tax_ids_account_type" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "kyc_attempt" character varying(255),
    "sub_account_id" character varying(255) NOT NULL,
    "tax_id" character varying(255) NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "initial_quote_id" character varying(255),
    "final_quote_id" character varying(255),
    "final_timestamp" timestamp with time zone,
    "internal_status" "public"."enum_tax_ids_internal_status",
    "requested_date" timestamp with time zone,
    "initial_session_id" character varying(255),
    "final_session_id" character varying(255),
    "user_id" "uuid"
);


ALTER TABLE "public"."tax_ids" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhooks" (
    "created_at" timestamp with time zone NOT NULL,
    "events" character varying(255)[] DEFAULT ARRAY['TRANSACTION_CREATED'::character varying(255), 'STATUS_CHANGE'::character varying(255)] NOT NULL,
    "id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "quote_id" "uuid",
    "session_id" character varying(255),
    "updated_at" timestamp with time zone NOT NULL,
    "url" character varying(500) NOT NULL
);


ALTER TABLE "public"."webhooks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."anchors"
    ADD CONSTRAINT "anchors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_value_key" UNIQUE ("key_value");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kyc_level_2"
    ADD CONSTRAINT "kyc_level_2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_schedules"
    ADD CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_data"
    ADD CONSTRAINT "price_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_tickets"
    ADD CONSTRAINT "quote_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ramp_states"
    ADD CONSTRAINT "ramp_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subsidies"
    ADD CONSTRAINT "subsidies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_ids"
    ADD CONSTRAINT "tax_ids_pkey" PRIMARY KEY ("tax_id");



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_anchors_lookup" ON "public"."anchors" USING "btree" ("ramp_type", "identifier", "is_active");



CREATE INDEX "idx_api_keys_active" ON "public"."api_keys" USING "btree" ("is_active");



CREATE INDEX "idx_api_keys_active_prefix_type" ON "public"."api_keys" USING "btree" ("is_active", "key_prefix", "key_type") WHERE ("is_active" = true);



CREATE INDEX "idx_api_keys_key_prefix" ON "public"."api_keys" USING "btree" ("key_prefix");



CREATE INDEX "idx_api_keys_key_type" ON "public"."api_keys" USING "btree" ("key_type");



CREATE INDEX "idx_api_keys_key_value" ON "public"."api_keys" USING "btree" ("key_value");



CREATE INDEX "idx_api_keys_partner_name" ON "public"."api_keys" USING "btree" ("partner_name");



CREATE INDEX "idx_kyc_level_2_status" ON "public"."kyc_level_2" USING "btree" ("status");



CREATE INDEX "idx_kyc_level_2_subaccount" ON "public"."kyc_level_2" USING "btree" ("subaccount_id");



CREATE INDEX "idx_kyc_level_2_user_id" ON "public"."kyc_level_2" USING "btree" ("user_id");



CREATE INDEX "idx_maintenance_schedules_active" ON "public"."maintenance_schedules" USING "btree" ("is_active_config");



CREATE INDEX "idx_maintenance_schedules_active_period" ON "public"."maintenance_schedules" USING "btree" ("is_active_config", "start_datetime", "end_datetime");



CREATE INDEX "idx_partners_name_ramp_type" ON "public"."partners" USING "btree" ("name", "ramp_type");



CREATE UNIQUE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_quote_chain_expiry" ON "public"."quote_tickets" USING "btree" ("from", "to", "expires_at") WHERE ("status" = 'pending'::"public"."enum_quote_tickets_status");



CREATE INDEX "idx_quote_tickets_api_key" ON "public"."quote_tickets" USING "btree" ("api_key");



CREATE INDEX "idx_quote_tickets_partner" ON "public"."quote_tickets" USING "btree" ("partner_id");



CREATE INDEX "idx_quote_tickets_user_id" ON "public"."quote_tickets" USING "btree" ("user_id");



CREATE INDEX "idx_ramp_current_phase" ON "public"."ramp_states" USING "btree" ("current_phase");



CREATE INDEX "idx_ramp_quote" ON "public"."ramp_states" USING "btree" ("quote_id");



CREATE INDEX "idx_ramp_states_user_id" ON "public"."ramp_states" USING "btree" ("user_id");



CREATE INDEX "idx_subsidies_phase" ON "public"."subsidies" USING "btree" ("phase");



CREATE INDEX "idx_subsidies_ramp_id" ON "public"."subsidies" USING "btree" ("ramp_id");



CREATE INDEX "idx_tax_ids_sub_account_id" ON "public"."tax_ids" USING "btree" ("sub_account_id");



CREATE INDEX "idx_tax_ids_user_id" ON "public"."tax_ids" USING "btree" ("user_id");



CREATE INDEX "idx_webhooks_active" ON "public"."webhooks" USING "btree" ("is_active");



CREATE INDEX "idx_webhooks_active_events" ON "public"."webhooks" USING "btree" ("is_active", "events");



CREATE INDEX "idx_webhooks_quote_id" ON "public"."webhooks" USING "btree" ("quote_id");



CREATE INDEX "idx_webhooks_session_id" ON "public"."webhooks" USING "btree" ("session_id");



CREATE OR REPLACE TRIGGER "SlackNotifier" AFTER UPDATE ON "public"."ramp_states" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://kglbssavflprkvsohcbg.supabase.co/functions/v1/slack-notifier', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbGJzc2F2Zmxwcmt2c29oY2JnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Mzc4MjMwMywiZXhwIjoyMDU5MzU4MzAzfQ.MlmXlQFvCGzFKEFROqgodLuPwTGeQtjificJjFJAjRA"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "update_maintenance_schedules_updated_at" BEFORE UPDATE ON "public"."maintenance_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "fk_webhooks_quote_id" FOREIGN KEY ("quote_id") REFERENCES "public"."quote_tickets"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kyc_level_2"
    ADD CONSTRAINT "kyc_level_2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_tickets"
    ADD CONSTRAINT "quote_tickets_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_tickets"
    ADD CONSTRAINT "quote_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ramp_states"
    ADD CONSTRAINT "ramp_states_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quote_tickets"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ramp_states"
    ADD CONSTRAINT "ramp_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subsidies"
    ADD CONSTRAINT "subsidies_ramp_id_fkey" FOREIGN KEY ("ramp_id") REFERENCES "public"."ramp_states"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tax_ids"
    ADD CONSTRAINT "tax_ids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



CREATE POLICY "Allow owners and admins to delete" ON "public"."quote_tickets" FOR DELETE TO "authenticated" USING ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "Allow owners and admins to insert" ON "public"."quote_tickets" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "Allow owners and admins to select" ON "public"."quote_tickets" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "Allow owners and admins to update" ON "public"."quote_tickets" FOR UPDATE TO "authenticated" USING ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "Read access for readonly user" ON "public"."price_data" FOR SELECT TO "readonly" USING (true);



CREATE POLICY "Read access for readonly user" ON "public"."quote_tickets" FOR SELECT TO "readonly" USING (true);



CREATE POLICY "Read access for readonly user" ON "public"."ramp_states" FOR SELECT TO "readonly" USING (true);



CREATE POLICY "Read access for readonly user" ON "public"."subsidies" FOR SELECT TO "readonly" USING (true);



ALTER TABLE "public"."SequelizeMeta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anchors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kyc_level_2" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quote_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ramp_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subsidies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tax_ids" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhooks" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "readonly";




















































































































































































GRANT ALL ON FUNCTION "public"."get_daily_volumes"("month_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_volumes"("month_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_volumes"("month_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_volumes"("start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_volumes"("start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_volumes"("start_date" "date", "end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_volumes"("year_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_volumes"("year_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_volumes"("year_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_volumes_by_chain"("year_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_volumes_by_chain"("year_param" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_volumes_by_chain"("year_param" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."SequelizeMeta" TO "anon";
GRANT ALL ON TABLE "public"."SequelizeMeta" TO "authenticated";
GRANT ALL ON TABLE "public"."SequelizeMeta" TO "service_role";
GRANT SELECT ON TABLE "public"."SequelizeMeta" TO "readonly";



GRANT ALL ON TABLE "public"."anchors" TO "anon";
GRANT ALL ON TABLE "public"."anchors" TO "authenticated";
GRANT ALL ON TABLE "public"."anchors" TO "service_role";
GRANT SELECT ON TABLE "public"."anchors" TO "readonly";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";
GRANT SELECT ON TABLE "public"."api_keys" TO "readonly";



GRANT ALL ON TABLE "public"."kyc_level_2" TO "anon";
GRANT ALL ON TABLE "public"."kyc_level_2" TO "authenticated";
GRANT ALL ON TABLE "public"."kyc_level_2" TO "service_role";
GRANT SELECT ON TABLE "public"."kyc_level_2" TO "readonly";



GRANT ALL ON TABLE "public"."maintenance_schedules" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_schedules" TO "service_role";
GRANT SELECT ON TABLE "public"."maintenance_schedules" TO "readonly";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";
GRANT SELECT ON TABLE "public"."partners" TO "readonly";



GRANT ALL ON TABLE "public"."price_data" TO "anon";
GRANT ALL ON TABLE "public"."price_data" TO "authenticated";
GRANT ALL ON TABLE "public"."price_data" TO "service_role";
GRANT SELECT ON TABLE "public"."price_data" TO "readonly";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "readonly";



GRANT ALL ON TABLE "public"."quote_tickets" TO "anon";
GRANT ALL ON TABLE "public"."quote_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_tickets" TO "service_role";
GRANT SELECT ON TABLE "public"."quote_tickets" TO "readonly";



GRANT ALL ON TABLE "public"."ramp_states" TO "anon";
GRANT ALL ON TABLE "public"."ramp_states" TO "authenticated";
GRANT ALL ON TABLE "public"."ramp_states" TO "service_role";
GRANT SELECT ON TABLE "public"."ramp_states" TO "readonly";



GRANT ALL ON TABLE "public"."subsidies" TO "anon";
GRANT ALL ON TABLE "public"."subsidies" TO "authenticated";
GRANT ALL ON TABLE "public"."subsidies" TO "service_role";
GRANT SELECT ON TABLE "public"."subsidies" TO "readonly";



GRANT ALL ON TABLE "public"."tax_ids" TO "anon";
GRANT ALL ON TABLE "public"."tax_ids" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_ids" TO "service_role";
GRANT SELECT ON TABLE "public"."tax_ids" TO "readonly";



GRANT ALL ON TABLE "public"."webhooks" TO "anon";
GRANT ALL ON TABLE "public"."webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."webhooks" TO "service_role";
GRANT SELECT ON TABLE "public"."webhooks" TO "readonly";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES  TO "readonly";






























