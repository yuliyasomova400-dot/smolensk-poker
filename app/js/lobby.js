import {onlineSession,listRooms,rpc} from './poker-api.js';
const $=id=>document.getElementById(id);
let session,loading=false,timer,busy=false;
const enter=id=>location.href=`table.html?onlineRoom=${encodeURIComponent(id)}`;
function message(text){$('message').textContent=text;}
async function load(){
 if(loading)return;loading=true;clearTimeout(timer);
 try{
  const rooms=await listRooms();$('connection').textContent='● СЕРВЕР ПОДКЛЮЧЁН';
  const root=$('rooms'),key=JSON.stringify(rooms);
  if(root.dataset.state!==key){
   root.replaceChildren();root.dataset.state=key;
   if(!rooms.length)root.textContent='Столов пока нет. Создайте первый.';
   for(const room of rooms){
    const card=document.createElement('article');card.className='room';
    const info=document.createElement('div'),title=document.createElement('h3'),meta=document.createElement('p'),button=document.createElement('button');
    title.textContent=room.name;meta.className='meta';meta.textContent=`${room.code} · ${room.blinds} · ${room.poker_players.length}/6 игроков`;
    info.append(title,meta);button.className='join';
    const mine=room.poker_players.some(p=>p.user_id===session.user.id);
    button.textContent=mine?'ВЕРНУТЬСЯ ЗА СТОЛ':room.status==='playing'?'ИДЁТ РАЗДАЧА':'СЕСТЬ ЗА СТОЛ';
    button.disabled=!mine&&(room.status==='playing'||room.poker_players.length>=6);
    button.onclick=()=>act(async()=>enter(await rpc('poker_join',{p_code:room.code})));
    card.append(info,button);root.append(card);
   }
  }
 }catch(e){$('connection').textContent='● НЕТ СВЯЗИ — ПОВТОРЯЕМ';message(e.message);}
 finally{loading=false;timer=setTimeout(load,5000);}
}
async function act(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){message(e.message);}finally{busy=false;$('createBtn').disabled=false;$('back').disabled=false;$('rooms').dataset.state='';await load();}}
$('createForm').onsubmit=e=>{e.preventDefault();act(async()=>enter(await rpc('poker_create',{p_name:$('roomName').value.trim(),p_blinds:$('blinds').value,p_stack:Number($('stack').value)})));};
$('back').onclick=()=>location.href='play.html';
try{session=await onlineSession();if(!session)location.replace('login.html');else await load();}catch(e){message(e.message);}
window.addEventListener('pagehide',()=>clearTimeout(timer));
