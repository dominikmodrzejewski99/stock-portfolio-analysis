grant select, insert on public.portfolio_imports to authenticated;
grant select, insert on public.portfolio_accounts to authenticated;
grant select, insert on public.portfolio_cash_operations to authenticated;
grant select, insert on public.portfolio_snapshots to authenticated;

notify pgrst, 'reload schema';
