begin;
do $$
declare u uuid[];rid uuid;cd text;s jsonb;g private.games;h record;i integer;total integer;first_button integer;
begin
 select array_agg(id) into u from (select id from auth.users order by id limit 3)t;
 if cardinality(u)<3 then raise exception 'Need three test identities';end if;
 perform set_config('request.jwt.claim.sub',u[1]::text,true);
 rid:=public.poker_create('Rollback verification','50/100',10000);
 select code into cd from public.poker_rooms where id=rid;
 perform set_config('request.jwt.claim.sub',u[2]::text,true);perform public.poker_join(cd);
 perform public.poker_ready(rid,true);
 if (select street from private.games where room_id=rid)<>'waiting' then raise exception 'Started without ready';end if;
 perform set_config('request.jwt.claim.sub',u[1]::text,true);perform public.poker_ready(rid,true);
 s:=public.poker_snapshot(rid);
 if s->>'street'<>'preflop' then raise exception 'No preflop';end if;
 if (select count(*) from jsonb_array_elements(s->'players')p where jsonb_array_length(p->'cards')=2)<>1 then raise exception 'Private cards leaked';end if;
 select button_seat into first_button from private.games where room_id=rid;
 if (select acting_seat<>button_seat from private.games where room_id=rid) then raise exception 'Heads-up order';end if;
 -- Play ten complete check/call hands, advancing deadlines only inside this rollback test.
 for i in 1..10 loop
  loop
   select * into g from private.games where room_id=rid;
   exit when g.street='finished';
   if g.acting_seat is null then
    update private.games set deadline=clock_timestamp()-interval '1 second' where room_id=rid;perform private.tick_room(rid);
   else
    select * into h from private.hands where room_id=rid and seat=g.acting_seat;
    perform set_config('request.jwt.claim.sub',h.user_id::text,true);
    perform public.poker_action(rid,case when h.bet<g.current_bet then 'call' else 'check' end,0,g.version,gen_random_uuid());
   end if;
  end loop;
  select sum(chips) into total from public.poker_players where room_id=rid;
  if total<>20000 then raise exception 'Chip conservation: %',total;end if;
  if cardinality(g.board)<>5 then raise exception 'Missing river';end if;
  if i<10 then
   perform set_config('request.jwt.claim.sub',u[1]::text,true);perform public.poker_ready(rid,true);
   perform set_config('request.jwt.claim.sub',u[2]::text,true);perform public.poker_ready(rid,true);
  end if;
 end loop;
 -- Timer works without a browser submitting an action.
 perform set_config('request.jwt.claim.sub',u[1]::text,true);perform public.poker_ready(rid,true);
 perform set_config('request.jwt.claim.sub',u[2]::text,true);perform public.poker_ready(rid,true);
 update private.games set deadline=clock_timestamp()-interval '1 second' where room_id=rid;
 perform private.tick_all();
 if (select street from private.games where room_id=rid)<>'finished' then raise exception 'Server timeout failed';end if;
 -- Deterministic three-way side pots: stacks 100/200/300; AA beats KK beats QQ.
 perform set_config('request.jwt.claim.sub',u[3]::text,true);perform public.poker_join(cd);
 delete from private.hands where room_id=rid;
 update public.poker_players set chips=0 where room_id=rid;
 insert into private.hands(room_id,user_id,seat,cards,committed) select rid,u[1],seat,array[12,25],100 from public.poker_players where room_id=rid and user_id=u[1];
 insert into private.hands(room_id,user_id,seat,cards,committed) select rid,u[2],seat,array[11,24],200 from public.poker_players where room_id=rid and user_id=u[2];
 insert into private.hands(room_id,user_id,seat,cards,committed) select rid,u[3],seat,array[10,23],300 from public.poker_players where room_id=rid and user_id=u[3];
 update private.games set board=array[0,16,33,48,8],street='showdown' where room_id=rid;
 perform private.settle(rid);
 if (select chips from public.poker_players where room_id=rid and user_id=u[1])<>300 or
 (select chips from public.poker_players where room_id=rid and user_id=u[2])<>200 or
 (select chips from public.poker_players where room_id=rid and user_id=u[3])<>100 then raise exception 'Side pot failure';end if;
 -- Rank evaluator: wheel, full house, royal flush.
 if private.score5(array[12,0,1,2,3])<>array[8,5] then raise exception 'Wheel rank';end if;
 if private.score5(array[12,25,38,11,24])<>array[6,14,13] then raise exception 'Full house rank';end if;
 if private.score5(array[8,9,10,11,12])<>array[8,14] then raise exception 'Royal rank';end if;
end $$;
select 'PASS: 10 complete hands, privacy, readiness, timeout, conservation, side pots, evaluator' as result;
rollback;
