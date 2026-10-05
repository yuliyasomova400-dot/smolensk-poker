-- Authoritative play-money poker. All writes go through checked RPCs.
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create table public.poker_profiles (
 id uuid primary key references auth.users(id), nickname text not null,
 avatar text not null default 'images/avatars/10-river-cathedral.png'
);
create table public.poker_rooms (
 id uuid primary key default gen_random_uuid(), code text unique not null,
 name text not null check(length(name) between 1 and 40),
 blinds text not null check(blinds in ('25/50','50/100','100/200')),
 starting_stack integer not null check(starting_stack in (5000,10000,20000,50000)),
 owner_id uuid not null references auth.users(id), status text not null default 'waiting',
 hand_number integer not null default 0, created_at timestamptz not null default now()
);
create table public.poker_players (
 room_id uuid references public.poker_rooms(id), user_id uuid references public.poker_profiles(id),
 seat integer not null check(seat between 1 and 6), chips integer not null check(chips>=0),
 ready boolean not null default false, last_seen timestamptz not null default now(),
 primary key(room_id,user_id), unique(room_id,seat)
);
create index room_players_user on public.poker_players(user_id);
create index rooms_owner on public.poker_rooms(owner_id);
create table private.games (
 room_id uuid primary key references public.poker_rooms(id), version integer not null default 0,
 street text not null default 'waiting', button_seat integer not null default 0,
 acting_seat integer, current_bet integer not null default 0, min_raise integer not null default 100,
 board integer[] not null default '{}', deck integer[] not null default '{}',
 deadline timestamptz, payouts jsonb not null default '[]', showdown jsonb not null default '[]',
 paid_pot integer not null default 0
);
create index games_deadline on private.games(deadline) where deadline is not null;
create table private.hands (
 room_id uuid references public.poker_rooms(id), user_id uuid references public.poker_profiles(id),
 seat integer not null, cards integer[] not null, folded boolean not null default false,
 bet integer not null default 0, committed integer not null default 0,
 acted boolean not null default false, acted_bet integer not null default 0,
 primary key(room_id,user_id)
);
create index hands_user on private.hands(user_id);
create table private.requests (
 room_id uuid references public.poker_rooms(id), request_id uuid, user_id uuid not null,
 primary key(room_id,request_id)
);
alter table public.poker_profiles enable row level security;
alter table public.poker_rooms enable row level security;
alter table public.poker_players enable row level security;
alter table private.games enable row level security;
alter table private.hands enable row level security;
alter table private.requests enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;
revoke all on public.poker_profiles,public.poker_rooms,public.poker_players from anon,authenticated;
grant select on public.poker_rooms,public.poker_players to authenticated;
create policy room_list on public.poker_rooms for select to authenticated using(true);
create policy seat_list on public.poker_players for select to authenticated using(true);

create function private.card_label(c integer) returns text language sql immutable set search_path='' as $$
 select (array['2','3','4','5','6','7','8','9','10','J','Q','K','A'])[c%13+1] || (array['♠','♥','♦','♣'])[c/13+1]
$$;
create function private.card_labels(cards integer[]) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(private.card_label(c) order by ord),'[]') from unnest(cards) with ordinality t(c,ord)
$$;
-- Lexicographic integer-array ranks: category, then every relevant kicker.
create function private.score5(cards integer[]) returns integer[] language plpgsql immutable set search_path='' as $$
declare ranks integer[]; counts integer[]; ordered integer[]; straight integer:=0; flush boolean; cat integer;
begin
 select array_agg(r order by r desc) into ranks from (select distinct c%13+2 r from unnest(cards)c)t;
 select count(distinct c/13)=1 into flush from unnest(cards)c;
 if cardinality(ranks)=5 then
  if ranks[1]-ranks[5]=4 then straight:=ranks[1]; elsif ranks=array[14,5,4,3,2] then straight:=5; end if;
 end if;
 select array_agg(n order by n desc,r desc),array_agg(r order by n desc,r desc) into counts,ordered
 from (select c%13+2 r,count(*)::int n from unnest(cards)c group by 1)t;
 if flush and straight>0 then return array[8,straight]; end if;
 if counts[1]=4 then return array[7]||ordered; end if;
 if counts[1]=3 and counts[2]=2 then return array[6]||ordered; end if;
 if flush then return array[5]||ranks; end if;
 if straight>0 then return array[4,straight]; end if;
 cat:=case when counts[1]=3 then 3 when counts[1]=2 and counts[2]=2 then 2 when counts[1]=2 then 1 else 0 end;
 return array[cat]||ordered;
end $$;
create function private.best7(cards integer[]) returns jsonb language plpgsql immutable set search_path='' as $$
declare a integer;b integer;c integer;d integer;e integer;chosen integer[];score integer[];best integer[]:='{}';bestcards integer[];
begin
 for a in 1..cardinality(cards)-4 loop for b in a+1..cardinality(cards)-3 loop for c in b+1..cardinality(cards)-2 loop
 for d in c+1..cardinality(cards)-1 loop for e in d+1..cardinality(cards) loop
 chosen:=array[cards[a],cards[b],cards[c],cards[d],cards[e]];score:=private.score5(chosen);
 if score>best then best:=score;bestcards:=chosen;end if;
 end loop;end loop;end loop;end loop;end loop;
 return jsonb_build_object('score',to_jsonb(best),'cards',private.card_labels(bestcards),'combination',
 (array['Старшая карта','Пара','Две пары','Тройка','Стрит','Флеш','Фулл-хаус','Каре','Стрит-флеш'])[best[1]+1]);
end $$;

create function private.ensure_profile() returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Нужно войти в аккаунт';end if;
 insert into public.poker_profiles(id,nickname)
 select id,left(coalesce(nullif(raw_user_meta_data->>'nickname',''),'Игрок'),24) from auth.users where id=auth.uid()
 on conflict(id) do nothing;
end $$;
create function public.poker_create(p_name text,p_blinds text,p_stack integer) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;cd text;
begin
 perform private.ensure_profile();
 if (select count(*) from public.poker_rooms where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Лимит: 10 столов в час';end if;
 cd:=upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,8));
 insert into public.poker_rooms(code,name,blinds,starting_stack,owner_id) values(cd,trim(p_name),p_blinds,p_stack,auth.uid()) returning id into rid;
 insert into public.poker_players(room_id,user_id,seat,chips) values(rid,auth.uid(),4,p_stack);
 insert into private.games(room_id,min_raise) values(rid,split_part(p_blinds,'/',2)::int);
 return rid;
end $$;
create function public.poker_join(p_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.poker_rooms; s integer;
begin
 perform private.ensure_profile();
 select * into r from public.poker_rooms where code=upper(trim(p_code)) for update;
 if not found then raise exception 'Комната не найдена';end if;
 if exists(select 1 from public.poker_players where room_id=r.id and user_id=auth.uid()) then return r.id;end if;
 if r.status<>'waiting' then raise exception 'Дождитесь завершения раздачи';end if;
 select n into s from generate_series(1,6)n where not exists(select 1 from public.poker_players where room_id=r.id and seat=n) order by n limit 1;
 if s is null then raise exception 'Все места заняты';end if;
 insert into public.poker_players(room_id,user_id,seat,chips) values(r.id,auth.uid(),s,r.starting_stack);
 return r.id;
end $$;

create function private.settle(rid uuid) returns void language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare g private.games; h record; level integer; previous integer:=0; amount integer; winners integer[]; best integer[]; score integer[];
 evals jsonb:='[]'; payouts jsonb:='[]';w integer; share integer; remainder integer; total integer;
begin
 select * into g from private.games where room_id=rid;
 select coalesce(sum(committed),0) into total from private.hands where room_id=rid;
 for h in select * from private.hands where room_id=rid and not folded loop
  evals:=evals||jsonb_build_array(jsonb_build_object('seat',h.seat)||case when cardinality(g.board)=5 then private.best7(h.cards||g.board) else jsonb_build_object('score',jsonb_build_array(0),'cards','[]'::jsonb,'combination','Без вскрытия') end);
 end loop;
 for level in select distinct committed from private.hands where room_id=rid and committed>0 order by committed loop
  select (level-previous)*count(*) into amount from private.hands where room_id=rid and committed>=level;
  best:='{}';winners:='{}';
  for h in select * from private.hands where room_id=rid and not folded and committed>=level loop
   select array(select jsonb_array_elements_text(x->'score')::int) into score from jsonb_array_elements(evals)x where (x->>'seat')::int=h.seat;
   if score>best then best:=score;winners:=array[h.seat];elsif score=best then winners:=array_append(winners,h.seat);end if;
  end loop;
  -- An unmatched upper layer is returned to contributors, never awarded to an ineligible player.
  if cardinality(winners)=0 then select array_agg(seat) into winners from private.hands where room_id=rid and committed>=level;end if;
  share:=amount/cardinality(winners);remainder:=amount%cardinality(winners);
  for w in select n from unnest(winners)n order by (n-g.button_seat+5)%6 loop
   update public.poker_players set chips=chips+share+case when remainder>0 then 1 else 0 end where room_id=rid and seat=w;
   payouts:=payouts||jsonb_build_array(jsonb_build_object('seat',w,'amount',share+case when remainder>0 then 1 else 0 end));
   remainder:=greatest(0,remainder-1);
  end loop;
  previous:=level;
 end loop;
 update private.games set street='finished',acting_seat=null,deadline=null,paid_pot=total,payouts=payouts,showdown=evals,version=version+1 where room_id=rid;
 update public.poker_rooms set status='waiting' where id=rid;
 update public.poker_players set ready=false where room_id=rid;
end $$;

create function private.progress(rid uuid,after_seat integer) returns void language plpgsql set search_path='' as $$
declare g private.games;n integer;actor integer;need integer;drawable integer;newstreet text;
begin
 select * into g from private.games where room_id=rid;
 select count(*) into n from private.hands where room_id=rid and not folded;
 if n<=1 then perform private.settle(rid);return;end if;
 select count(*) into drawable from private.hands h join public.poker_players p using(room_id,user_id) where h.room_id=rid and not h.folded and p.chips>0;
 select h.seat into actor from private.hands h join public.poker_players p using(room_id,user_id)
 where h.room_id=rid and not h.folded and p.chips>0 and
 (h.bet<g.current_bet or (not h.acted and drawable>1)) order by (h.seat-after_seat+5)%6 limit 1;
 if actor is not null then
  update private.games set acting_seat=actor,deadline=clock_timestamp()+interval '10 seconds' where room_id=rid;return;
 end if;
 if g.street='river' then
  update private.games set street='showdown',acting_seat=null,deadline=clock_timestamp()+interval '4 seconds' where room_id=rid;return;
 end if;
 newstreet:=case g.street when 'preflop' then 'flop' when 'flop' then 'turn' else 'river' end;
 need:=case when newstreet='flop' then 3 else 1 end;
 -- Burn one card, then deal the next street. Never send the remaining deck to clients.
 update private.games set street=newstreet,board=board||deck[2:need+1],deck=deck[need+2:cardinality(deck)],current_bet=0,
 min_raise=(select split_part(blinds,'/',2)::int from public.poker_rooms where id=rid),acting_seat=null,
 deadline=clock_timestamp()+interval '2 seconds',version=version+1 where room_id=rid;
 update private.hands set bet=0,acted=false,acted_bet=0 where room_id=rid;
 -- A brief street display also handles all-in runouts without skipping directly to the result.
end $$;

create function private.start_hand(rid uuid) returns void language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare g private.games;r public.poker_rooms;deck integer[];s integer;sb integer;bb integer;btn integer;n integer;h record;cost integer;offset_n integer:=1;
begin
 select * into r from public.poker_rooms where id=rid;
 select * into g from private.games where room_id=rid;
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

create function private.apply_action(rid uuid,who uuid,act text,target integer) returns void language plpgsql set search_path='' as $$
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
   can_raise:=not h.acted or g.current_bet-h.acted_bet>=g.min_raise or (h.acted_bet=0 and g.current_bet>0);
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

create function private.tick_room(rid uuid) returns void language plpgsql set search_path='' as $$
declare g private.games;who uuid;
begin
 select * into g from private.games where room_id=rid;
 if g.deadline is null or g.deadline>clock_timestamp() then return;end if;
 if g.street='showdown' then perform private.settle(rid);
 elsif g.acting_seat is null then perform private.progress(rid,g.button_seat);
 else
  select user_id into who from private.hands where room_id=rid and seat=g.acting_seat;
  perform private.apply_action(rid,who,'fold',0);
 end if;
end $$;
create function private.tick_all() returns void language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 for rid in select room_id from private.games where deadline<=clock_timestamp() limit 100 loop
  perform 1 from public.poker_rooms where id=rid for update skip locked;
  if found then perform private.tick_room(rid);end if;
 end loop;
end $$;

create function public.poker_ready(p_room uuid,p_ready boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.poker_rooms where id=p_room for update;
 if not exists(select 1 from public.poker_players where room_id=p_room and user_id=auth.uid()) then raise exception 'Вы не за столом';end if;
 if (select street from private.games where room_id=p_room) not in('waiting','finished') then raise exception 'Раздача уже идёт';end if;
 update public.poker_players set ready=p_ready,last_seen=now() where room_id=p_room and user_id=auth.uid();
 perform private.start_hand(p_room);
end $$;
create function public.poker_action(p_room uuid,p_action text,p_amount integer,p_version integer,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Нужно войти';end if;
 perform 1 from public.poker_rooms where id=p_room for update;
 if exists(select 1 from private.requests where room_id=p_room and request_id=p_request and user_id=auth.uid()) then return;end if;
 perform private.tick_room(p_room);
 if (select version from private.games where room_id=p_room)<>p_version then raise exception 'Ход уже изменился. Обновляем стол';end if;
 perform private.apply_action(p_room,auth.uid(),p_action,p_amount);
 insert into private.requests values(p_room,p_request,auth.uid());
end $$;
create function public.poker_snapshot(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.games;r public.poker_rooms;players jsonb;pot integer;
begin
 perform 1 from public.poker_rooms where id=p_room for update;
 if not exists(select 1 from public.poker_players where room_id=p_room and user_id=auth.uid()) then raise exception 'Вы не за столом. Войдите через комнаты';end if;
 update public.poker_players set last_seen=clock_timestamp() where room_id=p_room and user_id=auth.uid();
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
create function public.poker_leave(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.poker_rooms where id=p_room for update;
 if (select street from private.games where room_id=p_room) not in('waiting','finished') then raise exception 'Можно выйти после раздачи';end if;
 delete from public.poker_players where room_id=p_room and user_id=auth.uid();
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.poker_create(text,text,integer),public.poker_join(text),public.poker_ready(uuid,boolean),public.poker_action(uuid,text,integer,integer,uuid),public.poker_snapshot(uuid),public.poker_leave(uuid) from public,anon;
grant execute on function public.poker_create(text,text,integer),public.poker_join(text),public.poker_ready(uuid,boolean),public.poker_action(uuid,text,integer,integer,uuid),public.poker_snapshot(uuid),public.poker_leave(uuid) to authenticated;
