-- Sunshine V4 — corrige o resumo financeiro no detalhe de trabalhos.
-- Mantém a fonte única no schema sunshine_v4 e devolve os campos já esperados pela UI.

create or replace function public.v4_work_detail(p_work_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sunshine_v4', 'auth', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('work.read');

  select jsonb_build_object(
    'work', jsonb_build_object(
      'id', w.id,
      'title', w.title,
      'status', w.status,
      'workType', w.work_type,
      'scheduledAt', w.scheduled_at,
      'unitPriceCents', w.unit_price_cents
    ),
    'summary', coalesce((
      select jsonb_build_object(
        'contractedCents', coalesce(sum(coalesce(ci.amount_cents,0)),0)::bigint,
        'receivedCents', coalesce(sum(coalesce(rec.received_cents,0)),0)::bigint,
        'paidAboveCents', coalesce(sum(
          case
            when coalesce(w.unit_price_cents,0) > 0
              then greatest(coalesce(rec.received_cents,0) - w.unit_price_cents, 0)
            else 0
          end
        ),0)::bigint
      )
      from sunshine_v4.work_registrations wr
      left join sunshine_v4.contract_items ci on ci.id=wr.contract_item_id
      left join sunshine_v4.obligations o on o.contract_item_id=ci.id
      left join sunshine_v4.obligation_reconciliation rec on rec.obligation_id=o.id
      where wr.work_id=w.id
        and upper(coalesce(wr.status,'ACTIVE')) not in ('CANCELLED','CANCELED')
    ), jsonb_build_object(
      'contractedCents',0,
      'receivedCents',0,
      'paidAboveCents',0
    )),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'registrationId',wr.id,
        'personId',wr.beneficiary_person_id,
        'personName',coalesce(p.full_name,p.preferred_name,wr.participant_name,'Pessoa não identificada'),
        'birthDate',coalesce(p.birth_date,wr.participant_birth_date),
        'rivalName',wr.rival_name,
        'lovedPersonName',wr.loved_person_name,
        'registeredAt',wr.created_at,
        'registrationStatus',wr.status,
        'amountCents',coalesce(ci.amount_cents,0),
        'paidCents',coalesce(rec.received_cents,0),
        'pendingCents',greatest(coalesce(rec.signed_balance_cents,0),0),
        'paidAboveCents',case
          when coalesce(w.unit_price_cents,0) > 0
            then greatest(coalesce(rec.received_cents,0) - w.unit_price_cents,0)
          else 0
        end,
        'financialStatus',case
          when upper(coalesce(o.explicit_status,''))='CANCELLED' then 'CANCELLED'
          when upper(coalesce(o.explicit_status,''))='SETTLED'
            or coalesce(rec.signed_balance_cents,0)<=0 then 'SETTLED'
          else 'PENDING'
        end
      ) order by coalesce(p.full_name,p.preferred_name,wr.participant_name))
      from sunshine_v4.work_registrations wr
      left join sunshine_v4.people p on p.id=wr.beneficiary_person_id
      left join sunshine_v4.contract_items ci on ci.id=wr.contract_item_id
      left join sunshine_v4.obligations o on o.contract_item_id=ci.id
      left join sunshine_v4.obligation_reconciliation rec on rec.obligation_id=o.id
      where wr.work_id=w.id
    ),'[]'::jsonb)
  )
  into v_result
  from sunshine_v4.works w
  where w.id=p_work_id;

  if v_result is null then
    raise exception 'Trabalho não encontrado.';
  end if;

  return v_result;
end
$function$;
