ALTER TABLE "sessions" ADD COLUMN "action_bindings" jsonb;
--> statement-breakpoint
CREATE FUNCTION prevent_session_action_binding_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action_bindings IS DISTINCT FROM OLD.action_bindings THEN
    RAISE EXCEPTION 'Session account bindings are immutable; launch a new Session';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sessions_action_bindings_immutable BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION prevent_session_action_binding_update();
