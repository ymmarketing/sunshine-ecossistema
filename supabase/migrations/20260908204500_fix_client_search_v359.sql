-- Sunshine v3.59 — correção definitiva da busca de cliente usada na associação de pagamentos.
-- Causa raiz: consultas textuais como "Elsa" viravam string numérica vazia no ramo de telefone,
-- fazendo LIKE '%%' e retornando qualquer cliente com telefone antes do nome pesquisado.

create or replace function public.search_clients_v349(
  p_query text default null,p_status text default null,p_limit integer default 15,p_offset integer default 0
)
returns table(id uuid,full_name text,preferred_name text,phone text,email text,status text,birth_date date,total_count bigint)
language plpgsql
security invoker
set search_path=public,private,extensions,pg_temp
as $$
declare
  v_q text:=trim(coalesce(p_query,''));
  v_digits text:=regexp_replace(trim(coalesce(p_query,'')),'[^0-9]','','g');
  v_limit int:=least(greatest(coalesce(p_limit,15),1),50);
  v_offset int:=greatest(coalesce(p_offset,0),0);
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  if v_q<>'' and length(v_q)<2 then return; end if;

  return query
  select c.id,c.full_name,c.preferred_name,c.phone,c.email,c.status,c.birth_date,count(*) over()
  from public.clients c
  where (p_status is null or p_status='' or c.status=p_status)
    and (
      v_q=''
      or unaccent(lower(coalesce(c.full_name,''))) like '%'||unaccent(lower(v_q))||'%'
      or unaccent(lower(coalesce(c.preferred_name,''))) like '%'||unaccent(lower(v_q))||'%'
      or lower(coalesce(c.email,'')) like '%'||lower(v_q)||'%'
      or (v_digits<>'' and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') like '%'||v_digits||'%')
    )
  order by c.full_name,c.created_at
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.search_clients_v349(text,text,integer,integer) from public,anon;
grant execute on function public.search_clients_v349(text,text,integer,integer) to authenticated;
