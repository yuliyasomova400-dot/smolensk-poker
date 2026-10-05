begin;
do $$
declare u uuid[];rid uuid;cd text;g private.games;h private.hands;denied boolean;req uuid;v integer;total integer;
begin
 select array_agg(id) into u from (select id from auth.users order by id limit 3)t;
 perform set_config('request.jwt.claim.sub',u[1]::text,true);rid:=public.poker_create('Rules rollback','50/100',10000);
 select code into cd from public.poker_rooms where id=rid;
 perform set_config('request.jwt.claim.sub',u[2]::text,true);perform public.poker_join(cd);perform public.poker_ready(rid,true);
 perform set_config('request.jwt.claim.sub',u[1]::text,true);perform public.poker_ready(rid,true);
 select * into g from private.games where room_id=rid;
 select * into h from private.hands where room_id=rid and seat=g.acting_seat;
 perform set_config('request.jwt.claim.sub',u[3]::text,true);
 denied:=false;begin perform public.poker_snapshot(rid);exception when others then denied:=true;end;
 if not denied then raise exception 'Outsider read';end if;
 denied:=false;begin perform public.poker_action(rid,'fold',0,g.version,gen_random_uuid());exception when others then denied:=true;end;
 if not denied then raise exception 'Outsider action';end if;
 perform set_config('request.jwt.claim.sub',h.user_id::text,true);
 denied:=false;begin perform public.poker_action(rid,'raise',150,g.version,gen_random_uuid());exception when others then denied:=true;end;
 if not denied then raise exception 'Under minimum raise';end if;
 req:=gen_random_uuid();v:=g.version;
 perform public.poker_action(rid,'all_in',0,v,req);
 select * into g from private.games where room_id=rid;
 if g.street<>'preflop' or g.acting_seat is null then raise exception 'All-in skipped opponent response';end if;
 perform public.poker_action(rid,'all_in',0,v,req);
 if (select version from private.games where room_id=rid)<>g.version then raise exception 'Duplicate changed state';end if;
 select * into h from private.hands where room_id=rid and seat=g.acting_seat;
 perform set_config('request.jwt.claim.sub',h.user_id::text,true);
 denied:=false;begin perform public.poker_action(rid,'call',0,v,gen_random_uuid());exception when others then denied:=true;end;
 if not denied then raise exception 'Stale action accepted';end if;
 perform public.poker_action(rid,'call',0,g.version,gen_random_uuid());
 for v in 1..10 loop
  exit when (select street from private.games where room_id=rid)='finished';
  update private.games set deadline=clock_timestamp()-interval '1 second' where room_id=rid;perform private.tick_room(rid);
 end loop;
 select sum(chips) into total from public.poker_players where room_id=rid;
 if total<>20000 then raise exception 'All-in conservation';end if;
 if (select cardinality(board) from private.games where room_id=rid)<>5 then raise exception 'All-in board';end if;
 -- Short all-in does not reopen the raise for players who already called the full bet.
 perform set_config('request.jwt.claim.sub',u[3]::text,true);perform public.poker_join(cd);
 delete from private.hands where room_id=rid;
 insert into private.hands(room_id,user_id,seat,cards,bet,committed,acted,acted_bet)
 select rid,user_id,seat,array[seat,seat+13],100,100,user_id<>u[3],100 from public.poker_players where room_id=rid;
 update public.poker_players set chips=case when user_id=u[3] then 50 else 1000 end where room_id=rid;
 update private.games set street='preflop',acting_seat=(select seat from public.poker_players where room_id=rid and user_id=u[3]),current_bet=100,min_raise=100,board='{}',deadline=clock_timestamp()+interval '10 seconds' where room_id=rid;
 perform private.apply_action(rid,u[3],'all_in',0);
 select * into g from private.games where room_id=rid;
 select * into h from private.hands where room_id=rid and seat=g.acting_seat;
 denied:=false;begin perform private.apply_action(rid,h.user_id,'raise',250);exception when others then denied:=true;end;
 if not denied then raise exception 'Short raise reopened betting';end if;
 perform private.apply_action(rid,h.user_id,'call',0);
 if (select street from private.games where room_id=rid)<>'preflop' then raise exception 'Second caller skipped';end if;
end $$;
select 'PASS: min raise, all-in response, short raise, duplicate/stale actions, outsider access' as result;
rollback;
