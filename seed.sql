insert into "AccountState"(id,equity) values (1,10000) on conflict (id) do nothing;
