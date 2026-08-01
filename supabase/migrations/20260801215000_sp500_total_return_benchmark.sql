alter table public.portfolio_history_points
  add column benchmark_value numeric;

notify pgrst, 'reload schema';
