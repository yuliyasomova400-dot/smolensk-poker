import {supabase, onlineSession} from './supabase-online.js';
export {supabase, onlineSession};
export async function rpc(name, args) {
    const {data, error} = await supabase.rpc(name, args);
    if (error) throw new Error(error.message || 'Сервер не ответил');
    return data;
}
export async function listRooms() {
    const {data, error} = await supabase.from('poker_rooms')
        .select('*,poker_players(user_id,seat,ready,chips)').order('created_at', {ascending:false}).limit(100);
    if (error) throw error;
    return data;
}
export function requestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const s = [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
    return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
