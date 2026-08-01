alter table public.portfolio_history_points
  add column msci_world_value numeric;

notify pgrst, 'reload schema';
