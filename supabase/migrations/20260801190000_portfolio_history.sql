alter table public.portfolio_imports
  add column deposited_capital numeric,
  add column withdrawn_capital numeric,
  add column net_invested_capital numeric,
  add column total_profit numeric,
  add column simple_return numeric;

grant update on public.portfolio_imports to authenticated;

notify pgrst, 'reload schema';
