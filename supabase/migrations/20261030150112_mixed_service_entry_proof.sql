-- Distinguish services and questions for each item of a mixed receipt.
-- Authorization remains in the existing public v4_entry_receipt RPC.
create or replace function private.sunshine_entry_receipt(p_contract uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('contractId',c.id,'items',coalesce((select jsonb_agg(jsonb_build_object(
 'itemId',i.id,'obligationId',o.id,'beneficiaryPersonId',i.beneficiary_person_id,'amountCents',i.amount_cents,
 'allocatedCents',coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.obligation_id=o.id),0),
 'serviceId',i.service_id,'serviceCategory',i.service_category,'responsibleMemberId',i.responsible_member_id,
 'questionText',i.question_text,'questionId',(select q.id from sunshine_v4.appointments q where q.source_contract_item_id=i.id limit 1),
 'referenceMonth',i.reference_month,'workId',i.work_id,
 'registrationId',(select r.id from sunshine_v4.work_registrations r where r.contract_item_id=i.id limit 1)
) order by i.entry_position nulls last,i.created_at,i.id) from sunshine_v4.contract_items i
join sunshine_v4.obligations o on o.contract_item_id=i.id where i.contract_id=c.id),'[]'))
from sunshine_v4.contracts c where c.id=p_contract;
$$;
revoke all on function private.sunshine_entry_receipt(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
