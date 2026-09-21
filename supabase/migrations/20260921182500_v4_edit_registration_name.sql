create or replace function public.v4_api_update_registration_name(
  p_registration_id uuid,
  p_full_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sunshine_v4','auth','pg_temp'
as $function$
declare
  v_name text := btrim(coalesce(p_full_name,''));
  v_person_id uuid;
  v_old_registration_name text;
  v_old_person_name text;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('record.update');

  if p_registration_id is null then
    raise exception 'Inscrição não informada.';
  end if;
  if v_name = '' then
    raise exception 'Informe o nome correto do inscrito.';
  end if;
  if char_length(v_name) > 180 then
    raise exception 'O nome informado é muito longo.';
  end if;

  select wr.beneficiary_person_id, wr.participant_name, p.full_name
    into v_person_id, v_old_registration_name, v_old_person_name
  from sunshine_v4.work_registrations wr
  left join sunshine_v4.people p on p.id = wr.beneficiary_person_id
  where wr.id = p_registration_id
  for update of wr;

  if not found then
    raise exception 'Inscrição não encontrada.';
  end if;

  update sunshine_v4.work_registrations
     set participant_name = v_name,
         updated_at = now()
   where id = p_registration_id;

  if v_person_id is not null then
    update sunshine_v4.people
       set full_name = v_name
     where id = v_person_id;
  end if;

  perform sunshine_v4.v4_write_audit(
    'REGISTRATION_NAME_UPDATED',
    'work_registration',
    p_registration_id,
    jsonb_build_object(
      'personId', v_person_id,
      'oldRegistrationName', v_old_registration_name,
      'oldPersonName', v_old_person_name,
      'newName', v_name
    )
  );

  return jsonb_build_object(
    'registrationId', p_registration_id,
    'personId', v_person_id,
    'fullName', v_name
  );
end
$function$;

revoke all on function public.v4_api_update_registration_name(uuid,text) from public, anon;
grant execute on function public.v4_api_update_registration_name(uuid,text) to authenticated;
