/*
  كمية الهدية اختيارية: إذا كانت NULL فالكمية غير محدودة.
  عند الشراء تُخصم وحدة داخل قاعدة البيانات، وعند نفاد الكمية يتوقف المخزون.
  هذه النسخة لا تنشئ جداول أو وظائف خاصة بالشات.
*/
alter table public.rewards add column if not exists quantity integer;

do $$ begin
  alter table public.rewards add constraint rewards_quantity_nonneg
    check (quantity is null or quantity >= 0);
exception when duplicate_object then null;
end $$;

create or replace function public.consume_reward_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q integer;
begin
  select quantity into q
  from public.rewards
  where id = new.reward_id
  for update;

  if q is not null then
    if q <= 0 then
      raise exception 'الهدية خلصت (الكمية المتاحة 0)';
    end if;

    update public.rewards
    set quantity = quantity - 1,
        in_stock = case when quantity - 1 <= 0 then false else in_stock end
    where id = new.reward_id;
  end if;

  return new;
end $$;

drop trigger if exists b_consume_reward_quantity on public.reward_redemptions;
create trigger b_consume_reward_quantity
before insert on public.reward_redemptions
for each row execute function public.consume_reward_quantity();
