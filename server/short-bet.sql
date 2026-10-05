create or replace function private.apply_action(rid uuid,who uuid,act text,target integer) returns void language plpgsql set search_path='' as $$
declare g private.games;h private.hands;stack integer;cost integer;raise_by integer;can_raise boolean;
begin
 select * into g from private.games where room_id=rid;
 select * into h from private.hands where room_id=rid and user_id=who;
 if h.seat is null or h.seat<>g.acting_seat or g.street not in('preflop','flop','turn','river') then raise exception 'Сейчас не ваш ход';end if;
 select chips into stack from public.poker_players where room_id=rid and user_id=who;
 if act='fold' then update private.hands set folded=true,acted=true where room_id=rid and user_id=who;
 elsif act='check' then
  if h.bet<g.current_bet then raise exception 'Нельзя чекать: нужно ответить на ставку';end if;
  update private.hands set acted=true,acted_bet=g.current_bet where room_id=rid and user_id=who;
 else
  if act='call' then target:=least(h.bet+stack,g.current_bet);
  elsif act='all_in' then target:=h.bet+stack;
  elsif act<>'raise' then raise exception 'Неизвестное действие';end if;
  if target is null or target<=h.bet or target>h.bet+stack then raise exception 'Недопустимая сумма';end if;
  if act='raise' and target<=g.current_bet then raise exception 'Рейз должен повышать ставку';end if;
  if target>g.current_bet then
   can_raise:=not h.acted or g.current_bet-h.acted_bet>=g.min_raise;
   if not can_raise then raise exception 'Короткий олл-ин не открывает повторный рейз';end if;
   if not exists(select 1 from private.hands x join public.poker_players p using(room_id,user_id) where x.room_id=rid and not x.folded and x.user_id<>who and p.chips>0) then raise exception 'Нет соперника для повышения';end if;
   raise_by:=target-g.current_bet;
   if raise_by<g.min_raise and target<>h.bet+stack then raise exception 'Минимальный рейз до %',g.current_bet+g.min_raise;end if;
   update private.games set current_bet=target,min_raise=case when raise_by>=g.min_raise then raise_by else min_raise end where room_id=rid;
  elsif target<g.current_bet and target<>h.bet+stack then raise exception 'Недостаточная ставка';end if;
  cost:=target-h.bet;
  update public.poker_players set chips=chips-cost where room_id=rid and user_id=who;
  update private.hands set bet=target,committed=committed+cost,acted=true,acted_bet=greatest(target,g.current_bet) where room_id=rid and user_id=who;
 end if;
 update private.games set version=version+1 where room_id=rid;
 perform private.progress(rid,h.seat);
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
 'canRaise',not coalesce(h.acted,false) or g.current_bet-coalesce(h.acted_bet,0)>=g.min_raise,
 'cards',case when p.user_id=auth.uid() or (g.street='finished' and cardinality(g.board)=5 and not h.folded) then private.card_labels(h.cards) else '[]'::jsonb end) order by p.seat)
 into players from public.poker_players p join public.poker_profiles f on f.id=p.user_id left join private.hands h using(room_id,user_id) where p.room_id=p_room;
 return jsonb_build_object('room',to_jsonb(r),'me',auth.uid(),'players',players,'version',g.version,'street',g.street,'button',g.button_seat,
 'acting',g.acting_seat,'bet',g.current_bet,'minRaise',g.min_raise,'board',private.card_labels(g.board),'deadline',g.deadline,'serverNow',clock_timestamp(),
 'pot',case when g.street='finished' then 0 else pot end,'paidPot',g.paid_pot,'payouts',g.payouts,'showdown',g.showdown);
end $$;
