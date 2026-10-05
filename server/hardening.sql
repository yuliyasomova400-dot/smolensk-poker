create or replace function private.ensure_profile() returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Нужно войти в аккаунт';end if;
 insert into public.poker_profiles(id,nickname,avatar)
 select u.id,left(coalesce(nullif(u.raw_user_meta_data->>'nickname',''),f.nickname,'Игрок'),24),
 case when u.raw_user_meta_data->>'nickname'='Сергей' then 'images/avatars/01-fortress-tower.png'
 else coalesce(f.avatar,'images/avatars/10-river-cathedral.png') end
 from auth.users u left join public.profiles f on f.id=u.id where u.id=auth.uid()
 on conflict(id) do update set nickname=excluded.nickname;
end $$;
create or replace function public.poker_action(p_room uuid,p_action text,p_amount integer,p_version integer,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Нужно войти';end if;
 if p_room is null or p_request is null or p_version is null or p_action is null or p_action not in('fold','check','call','raise','all_in') then raise exception 'Некорректный запрос';end if;
 perform 1 from public.poker_rooms where id=p_room for update;
 if exists(select 1 from private.requests where room_id=p_room and request_id=p_request and user_id=auth.uid()) then return;end if;
 if (select deadline<=clock_timestamp() from private.games where room_id=p_room) then raise exception 'Время хода истекло';end if;
 if (select version from private.games where room_id=p_room)<>p_version then raise exception 'Ход уже изменился. Обновляем стол';end if;
 perform private.apply_action(p_room,auth.uid(),p_action,p_amount);
 insert into private.requests values(p_room,p_request,auth.uid());
end $$;
revoke all on function private.ensure_profile() from public,anon,authenticated;
revoke all on function public.poker_action(uuid,text,integer,integer,uuid) from public,anon;
grant execute on function public.poker_action(uuid,text,integer,integer,uuid) to authenticated;
