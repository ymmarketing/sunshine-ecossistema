-- Sunshine V4: Home e fila leem as mesmas perguntas pendentes.
-- Resposta por vídeo: situação sem exigência de texto.
CREATE OR REPLACE FUNCTION public.v4_home(p_start date DEFAULT (CURRENT_DATE - 30), p_end date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_user uuid; v_result jsonb;
begin
  v_user := public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('dashboard.read');
  select jsonb_build_object(
    'people',(select count(*) from sunshine_v4.people),
    'openWorks',(
      select count(*)
      from sunshine_v4.works w
      where upper(coalesce(w.status, 'OPEN')) not in (
        'DONE', 'COMPLETED', 'CANCELLED', 'CANCELED'
      )
    ),
    'activeHouseMembers',(select count(*) from sunshine_v4.operational_records o where o.entity_type='HOUSE_MEMBER' and upper(coalesce(o.status,''))='ACTIVE'),
    'pendingQuestions',(select count(*) from sunshine_v4.appointments a where a.question_text is not null and upper(coalesce(a.question_status,'')) in ('PENDING','WAITING','AWAITING_RESPONSE','AGUARDANDO','AGUARDANDO_RESPOSTA')),
    'receivedCents',(select coalesce(sum(p.amount_cents),0) from sunshine_v4.payments p where p.paid_at::date between p_start and p_end),
    'unallocatedCents',(select coalesce(sum(r.signed_unallocated_cents),0) from sunshine_v4.payment_reconciliation r where r.signed_unallocated_cents>0),
    'openReceivablesCents',(select coalesce(sum(r.signed_balance_cents),0) from sunshine_v4.receivables r where r.signed_balance_cents>0),
    'inconsistentObligations',(select count(*) from sunshine_v4.obligation_reconciliation r where r.is_overallocated),
    'migrationWarnings',(select count(*) from sunshine_v4.migration_issues m where not m.resolved and m.severity in ('WARN','ERROR'))
  ) into v_result;
  return v_result;
end
$function$
;

CREATE OR REPLACE FUNCTION sunshine_v4.v4_set_question_status(
  p_appointment_id uuid,
  p_responded boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'sunshine_v4', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_appointment_id uuid;
BEGIN
  PERFORM sunshine_v4.v4_assert_permission('question.answer');
  IF p_responded IS NULL THEN
    RAISE EXCEPTION 'Informe a situação da pergunta.';
  END IF;
  v_actor := sunshine_v4.v4_current_user_id();
  UPDATE sunshine_v4.appointments
  SET question_status = CASE WHEN p_responded THEN 'ANSWERED' ELSE 'AWAITING_RESPONSE' END,
      answered_at = CASE WHEN p_responded THEN now() ELSE NULL END,
      answered_by = CASE WHEN p_responded THEN v_actor ELSE NULL END,
      updated_at = now()
  WHERE id = p_appointment_id
    AND question_text IS NOT NULL
  RETURNING id INTO v_appointment_id;
  IF v_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Pergunta não encontrada.';
  END IF;
  PERFORM sunshine_v4.v4_write_audit(
    CASE WHEN p_responded THEN 'QUESTION_ANSWERED' ELSE 'QUESTION_REOPENED' END,
    'appointment',
    p_appointment_id,
    jsonb_build_object('responded',p_responded)
  );
  RETURN p_appointment_id;
END;
$function$;

REVOKE ALL ON FUNCTION sunshine_v4.v4_set_question_status(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sunshine_v4.v4_set_question_status(uuid, boolean) TO v4_app;

CREATE OR REPLACE FUNCTION public.v4_api_set_question_status(
  p_appointment_id uuid,
  p_responded boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.v4_bind_authenticated_user();
  RETURN sunshine_v4.v4_set_question_status(p_appointment_id, p_responded);
END;
$function$;

REVOKE ALL ON FUNCTION public.v4_api_set_question_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v4_api_set_question_status(uuid, boolean) TO authenticated, service_role;
