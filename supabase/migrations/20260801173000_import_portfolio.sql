create table public.portfolio_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  base_currency text not null check (base_currency in ('PLN', 'EUR', 'USD')),
  valuation_date date not null,
  securities_value numeric not null,
  cash_value numeric not null,
  total_value numeric not null,
  xirr numeric,
  diagnostics jsonb not null default '[]'::jsonb,
  fx_quotes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, fingerprint, base_currency)
);

create table public.portfolio_accounts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.portfolio_imports(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_fingerprint text not null,
  currency text not null check (currency in ('PLN', 'EUR', 'USD')),
  report_from timestamptz not null,
  report_to timestamptz not null,
  unique (import_id, account_fingerprint)
);

create table public.portfolio_cash_operations (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.portfolio_imports(id) on delete cascade,
  account_id uuid not null references public.portfolio_accounts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_key text not null,
  operation_type text not null,
  occurred_at timestamptz not null,
  amount numeric not null,
  currency text not null check (currency in ('PLN', 'EUR', 'USD')),
  product text not null,
  classification text not null check (classification in ('external', 'internal', 'transfer', 'unknown')),
  unique (import_id, account_id, operation_key)
);

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.portfolio_imports(id) on delete cascade,
  account_id uuid not null references public.portfolio_accounts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  product text not null,
  currency text not null check (currency in ('PLN', 'EUR', 'USD')),
  valuation_at timestamptz not null,
  securities_value numeric not null,
  cash_value numeric not null,
  unique (import_id, account_id, product, valuation_at)
);

alter table public.portfolio_imports enable row level security;
alter table public.portfolio_accounts enable row level security;
alter table public.portfolio_cash_operations enable row level security;
alter table public.portfolio_snapshots enable row level security;

create policy "owner manages portfolio imports" on public.portfolio_imports
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages portfolio accounts" on public.portfolio_accounts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages cash operations" on public.portfolio_cash_operations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages portfolio snapshots" on public.portfolio_snapshots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create or replace function public.save_portfolio_import(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_owner uuid := auth.uid();
  import_uuid uuid;
  account_record jsonb;
  account_uuid uuid;
  operation_record jsonb;
  snapshot_record jsonb;
begin
  if current_owner is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into import_uuid
  from public.portfolio_imports
  where owner_id = current_owner
    and fingerprint = payload->>'fingerprint'
    and base_currency = payload->>'baseCurrency';

  if import_uuid is not null then
    return import_uuid;
  end if;

  insert into public.portfolio_imports (
    owner_id, fingerprint, base_currency, valuation_date,
    securities_value, cash_value, total_value, xirr, diagnostics, fx_quotes
  ) values (
    current_owner,
    payload->>'fingerprint',
    payload->>'baseCurrency',
    (payload->>'valuationDate')::date,
    (payload->>'securitiesValue')::numeric,
    (payload->>'cashValue')::numeric,
    (payload->>'totalValue')::numeric,
    nullif(payload->>'xirr', '')::numeric,
    coalesce(payload->'diagnostics', '[]'::jsonb),
    coalesce(payload->'fxQuotes', '[]'::jsonb)
  ) returning id into import_uuid;

  for account_record in select value from jsonb_array_elements(payload->'accounts') loop
    insert into public.portfolio_accounts (
      import_id, owner_id, account_fingerprint, currency, report_from, report_to
    ) values (
      import_uuid,
      current_owner,
      account_record->>'fingerprint',
      account_record->>'currency',
      (account_record->>'reportFrom')::timestamptz,
      (account_record->>'reportTo')::timestamptz
    ) returning id into account_uuid;

    for operation_record in select value from jsonb_array_elements(account_record->'operations') loop
      insert into public.portfolio_cash_operations (
        import_id, account_id, owner_id, operation_key, operation_type,
        occurred_at, amount, currency, product, classification
      ) values (
        import_uuid,
        account_uuid,
        current_owner,
        operation_record->>'key',
        operation_record->>'type',
        (operation_record->>'occurredAt')::timestamptz,
        (operation_record->>'amount')::numeric,
        account_record->>'currency',
        operation_record->>'product',
        operation_record->>'classification'
      );
    end loop;

    for snapshot_record in select value from jsonb_array_elements(account_record->'snapshots') loop
      insert into public.portfolio_snapshots (
        import_id, account_id, owner_id, product, currency,
        valuation_at, securities_value, cash_value
      ) values (
        import_uuid,
        account_uuid,
        current_owner,
        snapshot_record->>'product',
        snapshot_record->>'currency',
        (snapshot_record->>'valuationAt')::timestamptz,
        (snapshot_record->>'securitiesValue')::numeric,
        (snapshot_record->>'cashValue')::numeric
      );
    end loop;
  end loop;

  return import_uuid;
end;
$$;

revoke all on function public.save_portfolio_import(jsonb) from public;
grant execute on function public.save_portfolio_import(jsonb) to authenticated;
