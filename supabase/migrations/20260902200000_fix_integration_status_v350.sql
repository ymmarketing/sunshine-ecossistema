-- Sunshine v3.50 — elimina ambiguidade entre a coluna provider e a coluna de retorno do RPC.
create or replace function public.get_integration_status_v349()
returns table(provider text,state text,last_confirmation timestamptz,message text)
language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare a public.asaas_integration_settings%rowtype; r public.performance_data_sources%rowtype;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  select ais.* into a from public.asaas_integration_settings ais order by ais.updated_at desc limit 1;
  provider:='ASAAS';
  if a.id is null then state:='NOT_CONFIGURED';last_confirmation:=null;message:='Configure a integração do Asaas.';
  elsif nullif(a.last_error,'') is not null then state:='ERROR';last_confirmation:=a.last_event_at;message:=a.last_error;
  elsif a.status='CONNECTED' and a.webhook_id is not null then state:='CONNECTED';last_confirmation:=coalesce(a.last_event_at,a.connected_at);message:='Webhook ativo.';
  else state:='DELAYED';last_confirmation:=coalesce(a.last_event_at,a.updated_at);message:='Revise a configuração do webhook.'; end if;
  return next;

  select pds.* into r from public.performance_data_sources pds where pds.provider='REPORTEI' order by pds.updated_at desc limit 1;
  provider:='REPORTEI';
  if r.id is null then state:='NOT_CONFIGURED';last_confirmation:=null;message:='Configure a fonte do Reportei.';
  elsif nullif(r.last_error,'') is not null then state:='ERROR';last_confirmation:=r.last_synced_at;message:=r.last_error;
  elsif r.status='CONNECTED' and r.last_synced_at is not null and r.last_synced_at < now()-interval '7 days' then state:='DELAYED';last_confirmation:=r.last_synced_at;message:='A sincronização está atrasada.';
  elsif r.status='CONNECTED' then state:='CONNECTED';last_confirmation:=r.last_synced_at;message:='Fonte conectada.';
  else state:='NOT_CONFIGURED';last_confirmation:=r.last_synced_at;message:='Conexão não confirmada.'; end if;
  return next;
end; $$;
revoke all on function public.get_integration_status_v349() from public,anon;
grant execute on function public.get_integration_status_v349() to authenticated;
