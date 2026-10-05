if (!globalThis.supabase?.createClient) {
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './js/vendor-supabase-2.112.4.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Не удалось загрузить модуль онлайн-игры.'));
        document.head.append(script);
    });
}
const { createClient } = globalThis.supabase;

const SUPABASE_URL = 'https://wymlgsraovjeqazzxosp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ubyjLtVs3EIWrjptLgICZQ_8bXzO1B7';

export const supabase = globalThis.smolenskSupabaseClient ||= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: async (url, options = {}) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        options.signal?.addEventListener('abort', abort, {once:true});
        const timer = setTimeout(abort, 12000);
        try { return await fetch(url, {...options, signal:controller.signal}); }
        finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
    } }
});
const joinedRooms = new Map();

export async function onlineSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
}

export async function signUpOnline(phone, password, nickname = '') {
    const digits = String(phone || '').replace(/\D/g, '').replace(/^8/, '7');
    const normalized = digits.length === 10 ? `7${digits}` : digits;
    const { data, error } = await supabase.auth.signUp({
        phone: `+${normalized}`,
        password,
        options: { data: { nickname: nickname || `Игрок${normalized.slice(-4)}` } }
    });
    if (error) throw error;
    return data;
}

export async function signInOnline(phone, password) {
    const digits = String(phone || '').replace(/\D/g, '').replace(/^8/, '7');
    const normalized = digits.length === 10 ? `7${digits}` : digits;
    const { data, error } = await supabase.auth.signInWithPassword({ phone: `+${normalized}`, password });
    if (error) throw error;
    return data;
}

export async function verifyPhoneOnline(phone, token) {
    const digits = String(phone || '').replace(/\D/g, '').replace(/^8/, '7');
    const normalized = digits.length === 10 ? `7${digits}` : digits;
    const { data, error } = await supabase.auth.verifyOtp({ phone: `+${normalized}`, token: String(token || '').trim(), type: 'sms' });
    if (error) throw error;
    return data;
}

export async function signOutOnline() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function signInTestPlayerOnline(nickname) {
    const clean = nickname === 'Сергей' ? 'Сергей' : 'Михалыч';
    const session = await onlineSession();
    if (session) {
        if (session.user.user_metadata?.nickname !== clean) {
            throw new Error('На этом устройстве уже выполнен вход. Продолжите текущим игроком; для второго игрока используйте другой браузер или телефон.');
        }
        return { session, user: session.user };
    }
    const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { nickname: clean, test_player: true } } });
    if (error) throw error;
    return data;
}

function roomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export async function listOnlineRooms() {
    const { data, error } = await supabase
        .from('rooms')
        .select('id,code,name,blinds,starting_stack,status,owner_id,hand_number,created_at,room_players(user_id,seat,ready,chips)')
        .order('created_at', { ascending: false });
    if (error) throw error;
    const session = await onlineSession();
    if (session) for (const room of data) {
        const mine = room.room_players?.find(player => player.user_id === session.user.id);
        if (mine) {
            joinedRooms.set(room.code, mine.seat);
            room.mySeat = mine.seat;
        }
    }
    return data;
}

export async function createOnlineRoom({ name, blinds, startingStack }) {
    const session = await onlineSession();
    if (!session) throw new Error('Для создания онлайн-комнаты нужно войти в сетевой аккаунт.');
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = roomCode();
        const { data: room, error } = await supabase
            .from('rooms')
            .insert({ code, name, blinds, starting_stack: startingStack, owner_id: session.user.id })
            .select()
            .single();
        if (error?.code === '23505') continue;
        if (error) throw error;
        const { error: seatError } = await supabase.from('room_players').insert({
            room_id: room.id, user_id: session.user.id, seat: 4, chips: startingStack
        });
        if (seatError) throw seatError;
        joinedRooms.set(room.code, 4);
        return room;
    }
    throw new Error('Не удалось подобрать код комнаты. Попробуйте ещё раз.');
}

export async function joinOnlineRoom(code) {
    const session = await onlineSession();
    if (!session) throw new Error('Для входа в онлайн-комнату нужно войти в сетевой аккаунт.');
    const { data: room, error } = await supabase.from('rooms').select('id,starting_stack,status,room_players(user_id,seat)').eq('code', code.toUpperCase()).single();
    if (error) throw error;
    const current = room.room_players.find(player => player.user_id === session.user.id);
    if (current) {
        joinedRooms.set(code.toUpperCase(), current.seat);
        return { ...room, seat: current.seat };
    }
    if (room.status !== 'waiting') throw new Error('В этой комнате игра уже началась.');
    const used = new Set(room.room_players.map(player => player.seat));
    const seat = [1, 2, 3, 4, 5, 6].find(value => !used.has(value));
    if (!seat) throw new Error('Все места заняты.');
    const { error: joinError } = await supabase.from('room_players').upsert({
        room_id: room.id, user_id: session.user.id, seat, chips: room.starting_stack
    }, { onConflict: 'room_id,user_id' });
    if (joinError) throw joinError;
    joinedRooms.set(code.toUpperCase(), seat);
    return { ...room, seat };
}

export async function getOnlineRoom(roomId) {
    const session = await onlineSession();
    if (!session) throw new Error('Сетевая сессия не найдена.');
    const { data: room, error } = await supabase
        .from('rooms')
        .select('id,code,name,blinds,starting_stack,status,owner_id,hand_number,room_players(user_id,seat,ready,chips)')
        .eq('id', roomId)
        .single();
    if (error) throw error;
    const ids = room.room_players.map(player => player.user_id);
    let profiles = [];
    if (ids.length) {
        const { data, error: profilesError } = await supabase
            .from('profiles')
            .select('id,nickname,avatar')
            .in('id', ids);
        if (profilesError) throw profilesError;
        profiles = data || [];
    }
    const byId = new Map(profiles.map(profile => [profile.id, profile]));
    room.room_players = room.room_players.map(player => ({ ...player, profile: byId.get(player.user_id) || null }));
    room.currentUserId = session.user.id;
    return room;
}

function shuffledOnlineDeck() {
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const suits = ['♠','♥','♦','♣'];
    const deck = ranks.flatMap(rank => suits.map(suit => `${rank}${suit}`));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

export async function startOnlineHand(room) {
    const session = await onlineSession();
    if (!session || room.room_players.length < 2) return false;
    const { data, error } = await supabase.rpc('start_room_hand', { p_room_id: room.id });
    if (error) throw error;
    return data === true;
}

export async function getOnlineGame(roomId) {
    const session = await onlineSession();
    if (!session) throw new Error('Сетевая сессия не найдена.');
    const [{ data: state, error: stateError }, { data: hand, error: handError }] = await Promise.all([
        supabase.from('game_states').select('*').eq('room_id', roomId).maybeSingle(),
        supabase.from('player_hands').select('cards,folded,bet,committed').eq('room_id', roomId).eq('user_id', session.user.id).maybeSingle()
    ]);
    if (stateError) throw stateError;
    if (handError) throw handError;
    return { state, hand };
}

export async function submitOnlineAction(roomId, action, amount = 0) {
    const { data, error } = await supabase.rpc('play_room_action', { p_room_id: roomId, p_action: action, p_amount: amount });
    if (error) throw error;
    return data === true;
}

export async function setOnlineReady(roomId, ready) {
    const session = await onlineSession();
    if (!session) throw new Error('Сетевая сессия не найдена.');
    const { error } = await supabase.from('room_players').update({ ready }).eq('room_id', roomId).eq('user_id', session.user.id);
    if (error) throw error;
}

export function subscribeToLobby(onChange) {
    const channel = supabase.channel('smolensk-poker-lobby')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players' }, onChange)
        .subscribe();
    return () => supabase.removeChannel(channel);
}
