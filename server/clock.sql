-- Applied as poker_v2_server_clock. Runs without any browser being open.
create extension if not exists pg_cron;
select cron.schedule('poker-v2-clock','1 second','select private.tick_all()');
