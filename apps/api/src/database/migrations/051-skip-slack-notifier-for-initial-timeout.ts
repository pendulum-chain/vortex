import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    DO $$
    DECLARE
      trigger_def text;
    BEGIN
      SELECT pg_get_triggerdef(t.oid)
        INTO trigger_def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.tgname = 'SlackNotifier'
        AND n.nspname = 'public'
        AND c.relname = 'ramp_states'
        AND NOT t.tgisinternal;

      IF trigger_def IS NULL THEN
        RETURN;
      END IF;

      EXECUTE 'DROP TRIGGER "SlackNotifier" ON public.ramp_states';

      trigger_def := regexp_replace(
        trigger_def,
        ' FOR EACH ROW( WHEN \\(.+\\))? EXECUTE FUNCTION ',
        ' FOR EACH ROW WHEN (NOT (OLD.current_phase = ''initial'' AND NEW.current_phase = ''timedOut'')) EXECUTE FUNCTION '
      );

      EXECUTE trigger_def;
    END $$;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    DO $$
    DECLARE
      trigger_def text;
    BEGIN
      SELECT pg_get_triggerdef(t.oid)
        INTO trigger_def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.tgname = 'SlackNotifier'
        AND n.nspname = 'public'
        AND c.relname = 'ramp_states'
        AND NOT t.tgisinternal;

      IF trigger_def IS NULL THEN
        RETURN;
      END IF;

      EXECUTE 'DROP TRIGGER "SlackNotifier" ON public.ramp_states';

      trigger_def := regexp_replace(
        trigger_def,
        ' FOR EACH ROW WHEN \\(.+\\) EXECUTE FUNCTION ',
        ' FOR EACH ROW EXECUTE FUNCTION '
      );

      EXECUTE trigger_def;
    END $$;
  `);
}
