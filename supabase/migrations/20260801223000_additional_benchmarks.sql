alter table public.portfolio_history_points
  add column nasdaq_100_value numeric,
  add column emerging_markets_value numeric,
  add column semiconductor_value numeric;

notify pgrst, 'reload schema';
