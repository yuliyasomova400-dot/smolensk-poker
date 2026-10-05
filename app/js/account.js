import {supabase, onlineSession} from './poker-api.js';
import {signInTestPlayerOnline} from './supabase-online.js';
const $ = id => document.getElementById(id);
const signup = location.pathname.endsWith('/register.html');
let busy = false;
function message(text) { $('accountStatus').textContent = text; }
async function run(task) {
    if (busy) return;
    busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true);
    try { await task(); } catch (e) { message(e.message); }
    finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
const session = await onlineSession();
if (session) {
    $('continue').hidden = false;
    $('continue').textContent = `ПРОДОЛЖИТЬ: ${session.user.user_metadata?.nickname || 'мой аккаунт'}`;
    $('continue').onclick = () => location.href = 'rooms-online.html';
    const guests=document.querySelector('.guests');if(guests)guests.style.display='none';
    const logout=document.createElement('button');logout.type='button';logout.textContent='ВЫЙТИ ИЗ ЭТОГО АККАУНТА';logout.style.marginTop='12px';
    logout.onclick=()=>run(async()=>{if(session.user.is_anonymous&&!confirm('Гостевой профиль без привязанного email нельзя восстановить после выхода. Выйти?'))return;const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;location.reload();});
    $('continue').after(logout);
    message(session.user.is_anonymous ? 'Гостевой профиль сохранён в этом браузере. Для входа с другого устройства привяжите email и пароль через регистрацию.' : 'Ваш аккаунт уже подключён.');
}
$('accountForm').onsubmit = e => { e.preventDefault(); run(async () => {
    const email = $('email').value.trim(), password = $('password').value;
    let response;
    if (signup) {
        const nickname = $('nickname').value.trim();
        if (session?.user.is_anonymous) {
            response = await supabase.auth.updateUser({email,password,data:{nickname}}, {emailRedirectTo:new URL('login.html',location.href).href});
        } else {
            response = await supabase.auth.signUp({email,password,options:{data:{nickname},emailRedirectTo:new URL('login.html',location.href).href}});
        }
        if (response.error) throw response.error;
        message('Данные отправлены. Если включено подтверждение email, откройте письмо, подтвердите адрес и войдите с паролем.');
    } else {
        response = await supabase.auth.signInWithPassword(email.includes('@') ? {email,password} : {phone:'+'+email.replace(/\D/g,''),password});
        if (response.error) throw response.error;
        location.href = 'rooms-online.html';
    }
}); };
document.querySelectorAll('[data-guest]').forEach(b => b.onclick = () => run(async () => {
    message('Подключаем сохранённый гостевой профиль…');
    await signInTestPlayerOnline(b.dataset.guest);
    location.href = 'rooms-online.html';
}));
