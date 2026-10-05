import {onlineSession,rpc,requestId} from './poker-api.js';
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('ru-RU');
const rid=new URLSearchParams(location.search).get('onlineRoom');
let state=null,pollTimer,busy=false,loading=false,stopped=false,clockOffset=0,lastTurn='',lastSettlement='',errorText='';
let retryRequest=null;
let actionNotice='',noticeUntil=0,audio=null;
document.addEventListener('pointerdown',()=>{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});},{once:true});
function sound(frequency){if(!audio||localStorage.getItem('smolenskSound')==='off')return;const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.frequency.value=frequency;g.gain.setValueAtTime(.025*Number(localStorage.getItem('smolenskVolume')||.55),t);g.gain.exponentialRampToValueAtTime(.001,t+.12);o.connect(g).connect(audio.destination);o.start();o.stop(t+.13);}
const ready=document.createElement('button');ready.className='ready-button';ready.textContent='Я ГОТОВ';ready.hidden=true;ready.disabled=true;
const leave=document.createElement('button');leave.className='leave-button';leave.textContent='ВЫЙТИ ИЗ КОМНАТЫ';leave.hidden=true;
document.querySelector('.table-page').append(ready,leave);
$('newHand').style.display='none';
document.querySelectorAll('.seat,.hero').forEach(el=>el.style.display='none');
$('hole').replaceChildren();$('community').replaceChildren();$('pot').textContent='0';
['fold','check','call','raise','allInBtn'].forEach(id=>$(id).disabled=true);
function displaySeat(real){const mine=state?.players.find(p=>p.id===state.me);return ((real-(mine?.seat||4)+9)%6)+1;}
function seatEl(real){const s=displaySeat(real);return s===4?document.querySelector('.hero'):document.querySelector(`.seat-${s}`);}
function setText(el,text){if(el.textContent!==text)el.textContent=text;}
function cards(root,values,backs=false,small=false){
 const key=JSON.stringify([values,backs,small]);if(root.dataset.cards===key)return;
 root.dataset.cards=key;root.replaceChildren();
 for(const value of values){const el=document.createElement('div');el.className=(small?'mini-card':'card')+(backs?' back':small?' face':'')+(/[♥♦]/.test(value)?' red':'');el.textContent=backs?'◆':value;root.append(el);}
}
function controls(){
 const me=state?.players.find(p=>p.id===state.me),active=state&&['preflop','flop','turn','river'].includes(state.street);
 const myTurn=active&&state.acting===me?.seat&&!busy&&!errorText;
 const due=Math.max(0,(state?.bet||0)-(me?.bet||0)),opponent=state?.players.some(p=>p.id!==state.me&&p.inHand&&!p.folded&&p.chips>0);
 $('fold').disabled=!myTurn;$('check').disabled=!myTurn||due>0;$('call').disabled=!myTurn||due===0;
 setText($('call'),`КОЛЛ ${money(Math.min(due,me?.chips||0))}`);
 const max=(me?.bet||0)+(me?.chips||0),canRaise=myTurn&&max>state.bet&&me.canRaise&&opponent;
 const min=Math.min(max,(state?.bet||0)+(state?.minRaise||100));
 const slider=$('betSlider'),key=state?`${state.version}:${state.acting}:${min}:${max}`:'';
 if(lastTurn!==key){
  lastTurn=key;slider.min=String(Math.min(max,Math.ceil(min/50)*50));slider.max=String(max);slider.step='50';slider.value=slider.min;
 }
 $('raise').disabled=!canRaise;$('allInBtn').disabled=!myTurn||(max>state.bet&&!canRaise);
 $('betControl').classList.toggle('show',!!myTurn);slider.disabled=!canRaise;
 document.querySelectorAll('[data-bet-fraction]').forEach(b=>b.disabled=!canRaise);
 setText($('betAmount'),money(slider.value));setText($('raise'),`${state?.bet?'РЕЙЗ ДО':'СТАВКА'} ${money(slider.value)}`);
 const waiting=state&&['waiting','finished'].includes(state.street);
 document.querySelector('.table-page').classList.toggle('waiting-room',!!waiting);
 ready.hidden=!waiting;ready.disabled=busy||!me||me.chips===0||!!errorText;ready.textContent=me?.ready?'ГОТОВ ✓ · ОТМЕНИТЬ':'Я ГОТОВ';
 leave.hidden=!waiting;leave.disabled=busy;
}
function chipNodes(root,amount,pile=false){
 if(root.dataset.amount===String(amount))return;root.dataset.amount=String(amount);root.replaceChildren();
 let left=amount,index=0;for(const value of [1000,500,100,50,25,1]){while(left>=value){left-=value;const chip=document.createElement('span');chip.className=`poker-chip chip-${value}`;chip.textContent=String(value);if(pile){chip.style.left=`${(index%5)*12}px`;chip.style.top=`${Math.floor(index/5)*-1.2}px`;chip.style.transform=`rotate(${index%2?9:-6}deg)`;}root.append(chip);index++;}}
 root.setAttribute('aria-label',`${money(amount)} фишек`);
}
function draw(previous=null){
 const s=state,me=s.players.find(p=>p.id===s.me),active=['preflop','flop','turn','river','showdown'].includes(s.street);
 const titles={waiting:'ОЖИДАНИЕ',preflop:'ПРЕФЛОП',flop:'ФЛОП',turn:'ТЁРН',river:'РИВЕР',showdown:'ВСКРЫТИЕ',finished:'ЗАВЕРШЕНО'};
 setText(document.querySelector('.table-info'),`${s.room.name} · ${s.room.blinds} · ${s.room.code}`);
 setText($('stage'),titles[s.street]||s.street);setText($('pot'),money(s.pot));setText($('stack'),money(me?.chips));
 for(let i=1;i<=6;i++){const el=i===4?document.querySelector('.hero'):document.querySelector(`.seat-${i}`);el.style.display=s.players.some(p=>displaySeat(p.seat)===i)?'block':'none';}
 for(const p of s.players){
  const el=seatEl(p.seat),hero=displaySeat(p.seat)===4;
  setText(hero?$('heroName'):el.querySelector('.seat-label b'),p.name);
  setText(hero?$('heroStack'):el.querySelector('.seat-label span'),money(p.chips));
  const img=el.querySelector('img'),src=/^images\/avatars\/[\w-]+\.png$/.test(p.avatar)?p.avatar:'images/avatars/10-river-cathedral.png';
  if(img.getAttribute('src')!==src)img.src=src;
  el.classList.toggle('active',active&&s.acting===p.seat);el.classList.toggle('folded',active&&p.folded);
  let box=el.querySelector('.mini-hole');
  if(!hero){if(!box){box=document.createElement('div');box.className='mini-hole online-backs';el.append(box);}cards(box,p.inHand&&active?(p.cards.length?p.cards:['?','?']):[],!p.cards.length,true);}
  let dealer=el.querySelector('.dealer-button');if(p.seat===s.button){if(!dealer){dealer=document.createElement('div');dealer.className='dealer-button';dealer.textContent='D';el.append(dealer);}}else dealer?.remove();
  let bet=el.querySelector('.seat-bet');if(!bet){bet=document.createElement('div');bet.className='seat-bet';el.append(bet);}
  const amount=active?p.bet:0;
  if(bet.dataset.bet!==String(amount)){bet.dataset.bet=String(amount);bet.replaceChildren();if(amount){const stack=document.createElement('div');stack.className='chip-stack';chipNodes(stack,amount);const text=document.createElement('span');text.textContent=money(amount);bet.append(stack,text);}}
  const old=previous?.players.find(x=>x.id===p.id);if(old&&p.bet>old.bet&&previous.room.hand_number===s.room.hand_number){sound(850);bet.animate([{transform:'translate(-50%,-12px)',opacity:.4},{transform:'translate(-50%,0)',opacity:1}],{duration:350});}
 }
 cards($('hole'),active?me?.cards||[]:[]);$('hole').classList.toggle('folded',!!me?.folded);
 cards($('community'),active?s.board:[]);
 if(previous&&s.board.length>previous.board.length)sound(350);
 chipNodes($('potChipPile'),active?Math.max(0,s.pot-s.players.reduce((n,p)=>n+p.bet,0)):0,true);
 const actor=s.players.find(p=>p.seat===s.acting);
 let text=active?(s.street==='showdown'?'Вскрытие — определяем победителя…':actor?`${actor.id===s.me?'Ваш ход':`Ходит ${actor.name}`} · 10 секунд`:'Открываем следующую улицу…'):
 `${s.players.filter(p=>p.ready).length}/${s.players.filter(p=>p.chips>0).length} готовы · ${me?.chips===0?'Стек закончился — выберите новый стол':'Нажмите «Я готов»'}`;
 if(s.players.length<2)text='Ждём второго игрока. Отправьте ему код комнаты: '+s.room.code;
 setText($('status'),errorText||(Date.now()<noticeUntil?actionNotice:text));$('status').classList.add('show');
 if(s.street==='finished'){
  const totals=new Map();for(const p of s.payouts)totals.set(p.seat,(totals.get(p.seat)||0)+p.amount);
  const key=`${s.room.hand_number}:${s.version}`;
  if(lastSettlement!==key){
   const reconnect=lastSettlement===''&&!document.querySelector('.table-page').dataset.liveHand;
   lastSettlement=key;$('handResult').replaceChildren();
   const title=document.createElement('div');title.textContent='ИТОГ РАЗДАЧИ';$('handResult').append(title);
   for(const [seat,amount]of totals){
    const winner=s.players.find(p=>p.seat===seat),score=s.showdown.find(p=>p.seat===seat),row=document.createElement('section');
    const name=document.createElement('div');name.textContent=`${winner?.name||'Игрок'} · выплата +${money(amount)}`;row.append(name);
    if(score){const hand=document.createElement('div');hand.className='winning-cards';for(const c of score.cards){const card=document.createElement('span');card.className='winning-card'+(/[♥♦]/.test(c)?' red':'');card.textContent=c;hand.append(card);}const combo=document.createElement('small');combo.textContent=score.combination;row.append(hand,combo);}
    $('handResult').append(row);
    if(!reconnect&&winner){animatePayout(seat,amount);sound(660);}
   }
  }
  $('handResult').classList.add('show');
 }else{$('handResult').classList.remove('show');if(active)document.querySelector('.table-page').dataset.liveHand='1';}
 controls();
}
function animatePayout(seat,amount){
 const target=seatEl(seat),page=document.querySelector('.table-page'),r=page.getBoundingClientRect(),to=target.getBoundingClientRect(),from=$('pot').getBoundingClientRect();
 const chip=document.createElement('div');chip.className='payout-token';chip.textContent='●';chip.style.left=`${from.left+from.width/2-r.left}px`;chip.style.top=`${from.top-r.top}px`;page.append(chip);
 const animation=chip.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top-from.top}px)`,opacity:0}],{duration:900,easing:'ease-in-out'});
 animation.finished.then(()=>{chip.remove();const badge=document.createElement('div');badge.className='win-badge';badge.textContent='+'+money(amount);target.append(badge);setTimeout(()=>badge.remove(),2400);});
}
async function poll(){
 if(stopped||loading)return;loading=true;clearTimeout(pollTimer);
 try{const next=await rpc('poker_snapshot',{p_room:rid});clockOffset=Date.parse(next.serverNow)-Date.now();const previous=state;state=next;errorText='';draw(previous);}
 catch(e){errorText='Связь потеряна. Восстанавливаем стол… '+e.message;setText($('status'),errorText);controls();}
 finally{loading=false;if(!stopped)pollTimer=setTimeout(poll,1200);}
}
async function act(action,amount=0){
 if(busy||!state)return;busy=true;controls();
 const pending=retryRequest||{p_room:rid,p_action:action,p_amount:amount,p_version:state.version,p_request:requestId()};
 try{await rpc('poker_action',pending);retryRequest=null;}
 catch(e){actionNotice=e.message;noticeUntil=Date.now()+5000;retryRequest=/fetch|network|timeout/i.test(e.message)?pending:null;}
 finally{busy=false;await poll();}
}
ready.onclick=async()=>{if(busy)return;busy=true;controls();try{await rpc('poker_ready',{p_room:rid,p_ready:!state.players.find(p=>p.id===state.me)?.ready});}catch(e){errorText=e.message;alert(e.message);}finally{busy=false;await poll();}};
leave.onclick=async()=>{if(busy)return;busy=true;controls();try{await rpc('poker_leave',{p_room:rid});location.href='rooms-online.html';}catch(e){errorText=e.message;busy=false;draw();}};
$('backBtn').onclick=()=>location.href='rooms-online.html';
$('fold').onclick=()=>act('fold');$('check').onclick=()=>act('check');$('call').onclick=()=>act('call');$('raise').onclick=()=>act('raise',Number($('betSlider').value));$('allInBtn').onclick=()=>act('all_in');
$('betSlider').oninput=()=>controls();
document.querySelectorAll('[data-bet-fraction]').forEach(b=>b.onclick=()=>{const slider=$('betSlider'),me=state.players.find(p=>p.id===state.me),due=Math.max(0,state.bet-me.bet);slider.value=String(Math.max(Number(slider.min),Math.min(Number(slider.max),Math.ceil((state.bet+(state.pot+due)*Number(b.dataset.betFraction))/50)*50)));controls();});
$('settingsToggle').onclick=()=>$('gameSettings').classList.toggle('show');
$('volumeSlider').oninput=e=>localStorage.setItem('smolenskVolume',Number(e.target.value)/100);
$('speedSlider').oninput=e=>localStorage.setItem('smolenskMotionSpeed',Number(e.target.value)/100);
$('soundToggle').onclick=()=>{const off=localStorage.getItem('smolenskSound')!=='off';localStorage.setItem('smolenskSound',off?'off':'on');$('soundToggle').textContent=off?'🔇':'🔊';};
const clock=setInterval(()=>{const timer=$('turnTimer');if(!state?.acting||!state.deadline){timer.style.display='none';return;}const left=Math.max(0,Math.ceil((Date.parse(state.deadline)-Date.now()-clockOffset)/1000));timer.style.display='grid';setText(timer,String(left));timer.classList.toggle('danger',left<=3);},200);
window.addEventListener('online',poll);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(pollTimer);clearInterval(clock);});
try{if(!await onlineSession())location.replace('login.html');else await poll();}catch(e){setText($('status'),e.message);}
