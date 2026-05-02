
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_last_seen_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.last_seen_at = now();
  return new;
end;
$$;
