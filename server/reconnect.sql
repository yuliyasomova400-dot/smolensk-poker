create or replace function private.start_hand(rid uuid) returns void language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare g private.games;r public.poker_rooms;deck integer[];s integer;sb integer;bb integer;btn integer;n integer;h record;cost integer;offset_n integer:=1;
begin
 select * into r from public.poker_rooms where id=rid;
 select * into g from private.games where room_id=rid;
if g.street not in('waiting','finished') then return;end if;
 select count(*) into n from public.poker_players where room_id=rid and chips>0;
 if n<2 or exists(select 1 from public.poker_players where room_id=rid and chips>0 and (not ready or last_seen<now()-interval '30 seconds')) then return;end if;
 select seat into btn from public.poker_players where room_id=rid and chips>0 order by (seat-g.button_seat+5)%6 limit 1;
 select seat into sb from public.poker_players where room_id=rid and chips>0 order by (seat-btn+5)%6 limit 1;
 if n=2 then sb:=btn;end if;
 select seat into bb from public.poker_players where room_id=rid and chips>0 order by (seat-sb+5)%6 limit 1;
 select array_agg(c order by extensions.gen_random_bytes(16)) into deck from generate_series(0,51)c;
 delete from private.hands where room_id=rid;
 for h in select * from public.poker_players where room_id=rid and chips>0 order by (seat-btn+5)%6 loop
  insert into private.hands(room_id,user_id,seat,cards) values(rid,h.user_id,h.seat,array[deck[offset_n],deck[offset_n+n]]);
  offset_n:=offset_n+1;
 end loop;
 update private.games set street='preflop',button_seat=btn,board='{}',deck=deck[2*n+1:52],version=version+1,
 current_bet=split_part(r.blinds,'/',2)::int,min_raise=split_part(r.blinds,'/',2)::int,
 payouts='[]',showdown='[]',paid_pot=0 where room_id=rid;
 for h in select * from public.poker_players where room_id=rid and seat in(sb,bb) loop
  cost:=least(h.chips,case when h.seat=sb then split_part(r.blinds,'/',1)::int else split_part(r.blinds,'/',2)::int end);
  update public.poker_players set chips=chips-cost where room_id=rid and user_id=h.user_id;
  update private.hands set bet=cost,committed=cost where room_id=rid and user_id=h.user_id;
 end loop;
 update public.poker_rooms set status='playing',hand_number=hand_number+1 where id=rid;
 perform private.progress(rid,bb);
end $$;

create or replace function public.poker_snapshot(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.games;r public.poker_rooms;players jsonb;pot integer;
begin
 perform 1 from public.poker_rooms where id=p_room for update;
 if not exists(select 1 from public.poker_players where room_id=p_room and user_id=auth.uid()) then raise exception 'Вы не за столом. Войдите через комнаты';end if;
 update public.poker_players set last_seen=clock_timestamp() where room_id=p_room and user_id=auth.uid();
 perform private.start_hand(p_room);
 perform private.tick_room(p_room);
 select * into r from public.poker_rooms where id=p_room;
 select * into g from private.games where room_id=p_room;
 select coalesce(sum(committed),0) into pot from private.hands where room_id=p_room;
 select jsonb_agg(jsonb_build_object('id',p.user_id,'seat',p.seat,'chips',p.chips,'ready',p.ready,'connected',p.last_seen>now()-interval '15 seconds',
 'name',f.nickname,'avatar',f.avatar,'folded',coalesce(h.folded,false),'bet',coalesce(h.bet,0),'inHand',h.user_id is not null,
 'canRaise',not coalesce(h.acted,false) or g.current_bet-coalesce(h.acted_bet,0)>=g.min_raise or (h.acted_bet=0 and g.current_bet>0),
 'cards',case when p.user_id=auth.uid() or (g.street='finished' and cardinality(g.board)=5 and not h.folded) then private.card_labels(h.cards) else '[]'::jsonb end) order by p.seat)
 into players from public.poker_players p join public.poker_profiles f on f.id=p.user_id left join private.hands h using(room_id,user_id) where p.room_id=p_room;
 return jsonb_build_object('room',to_jsonb(r),'me',auth.uid(),'players',players,'version',g.version,'street',g.street,'button',g.button_seat,
 'acting',g.acting_seat,'bet',g.current_bet,'minRaise',g.min_raise,'board',private.card_labels(g.board),'deadline',g.deadline,'serverNow',clock_timestamp(),
 'pot',case when g.street='finished' then 0 else pot end,'paidPot',g.paid_pot,'payouts',g.payouts,'showdown',g.showdown);
end $$;
