import{initializeApp}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import{getAuth,signInWithPopup,GoogleAuthProvider,signOut,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import{getFirestore,doc,getDoc,setDoc,updateDoc,collection,query,where,limit as lim,getDocs,addDoc,deleteDoc,onSnapshot,serverTimestamp}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const CFG={apiKey:"AIzaSyCu2Rha5D4S3Nu7A7W1s9BTd236Bm6vZg8",authDomain:"artifight.firebaseapp.com",projectId:"artifight",storageBucket:"artifight.firebasestorage.app",messagingSenderId:"29733165895",appId:"1:29733165895:web:5e16ad71eeb97cb6498a62"};
const app=initializeApp(CFG),auth=getAuth(app),db=getFirestore(app),prov=new GoogleAuthProvider();

const EL={fire:{n:"Огонь",e:["🕯️","🔥","🌋"]},water:{n:"Вода",e:["💧","🌊","🐋"]},earth:{n:"Земля",e:["🪨","⛰️","💎"]},air:{n:"Воздух",e:["💨","🌬️","🌪️"]},nature:{n:"Природа",e:["🌱","🌿","🌳"]},metal:{n:"Металл",e:["🔩","⚙️","🛡️"]}};
const HEX=["fire","metal","nature","air","water","earth"];
const FL_SIZE=11,HAND5=5,HAND6=6,HAND8=8,POOL_BONUS=3,MAX_ROUNDS=20;

let USER=null,PROFILE=null,MATCH=null,TIMER_INT=null,IS_HOST=false,MY_SIDE="p";

function uid(){return crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).substr(2,9)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function $(id){return document.getElementById(id)}
function showScr(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active')}
function showBanner(t,d=2000){const b=$('banner');b.textContent=t;b.classList.add('show');if(d>0)setTimeout(()=>b.classList.remove('show'),d)}

function rel(a,d){if(a===d)return 0;const ai=HEX.indexOf(a),di=HEX.indexOf(d),dist=(di-ai+6)%6;return dist===1?1:dist===2?2:dist===4?-2:dist===5?-1:0}
function pwr(a){return a.level+(a.vet?1:0)}
function battle(a,b){const ra=rel(a.el,b.el),rb=rel(b.el,a.el),ba=ra>0?ra:0,bb=rb>0?rb:0,pa=pwr(a)+ba,pb=pwr(b)+bb;return{res:pa>pb?'a':pb>pa?'b':'draw',pa,pb,ba,bb,rel:ra}}
function rollLvl(){const r=Math.random()*100;return r<60?1:r<90?2:3}
function genArt(){const k=HEX[Math.floor(Math.random()*6)],l=rollLvl();return{id:uid(),el:k,name:EL[k].n,emoji:EL[k].e[l-1],level:l,vet:false,upg:false}}
function genHand(n){return Array.from({length:n},()=>genArt())}
function genPool(n){return genHand(n)}

function artCard(a,fd=false){const c=document.createElement('div');c.className='ac';c.dataset.id=a.id;c.dataset.el=a.el;
if(fd){c.classList.add('fd')}else{let s='';for(let i=0;i<a.level;i++)s+='★';if(a.vet)s+='⭐';
c.innerHTML=`<div class="ae">${a.emoji}</div><div class="an">${a.name}</div><div class="as">${s}</div>`;
if(a.upg)c.classList.add('upg')}return c}

// ============ FIREBASE ============
async function saveProfile(u){try{const r=doc(db,"users",u.uid),s=await getDoc(r);
if(!s.exists()){const p={uid:u.uid,name:u.displayName||"Игрок",email:u.email||"",photo:u.photoURL||"",ratings:{PYRAMID:1000},stats:{PYRAMID:{w:0,l:0}},created:Date.now()};await setDoc(r,p);return p}
return s.data()}catch(e){return{uid:u.uid,name:u.displayName||"Игрок",ratings:{PYRAMID:1000},stats:{PYRAMID:{w:0,l:0}}}}}

async function updateRating(delta){if(!USER)return;const nr=Math.max(0,(PROFILE.ratings?.PYRAMID||1000)+delta);
await updateDoc(doc(db,"users",USER.uid),{"ratings.PYRAMID":nr});PROFILE.ratings.PYRAMID=nr;return nr}

async function updateStats(win){if(!USER)return;const f=win?"stats.PYRAMID.w":"stats.PYRAMID.l";
const cur=(PROFILE.stats?.PYRAMID?.[win?'w':'l'])||0;await updateDoc(doc(db,"users",USER.uid),{[f]:cur+1})}

async function saveMatchRecord(opponent,result,delta){if(!USER)return;
await addDoc(collection(db,"users",USER.uid,"history"),{opponent,result,delta,mode:"PYRAMID",date:Date.now()})}

async function loadHistory(){if(!USER)return[];const q=query(collection(db,"users",USER.uid,"history"),where("mode","==","PYRAMID"));
const snap=await getDocs(q);return snap.docs.map(d=>d.data()).sort((a,b)=>b.date-a.date).slice(0,20)}

// ============ МАТЧМЕЙКИНГ ============
async function findMatch(){
const myRating=PROFILE.ratings?.PYRAMID||1000;
const mq=query(collection(db,"matchmaking"),where("status","==","waiting"),where("mode","==","PYRAMID"),lim(10));
const snap=await getDocs(mq);
let best=null,bestDiff=Infinity;
for(const d of snap.docs){const data=d.data();
if(data.uid===USER.uid)continue;
const diff=Math.abs(data.rating-myRating);
if(diff<bestDiff&&diff<=500){bestDiff=diff;best={id:d.id,...data}}}
if(best){
await deleteDoc(doc(db,"matchmaking",best.id));
const matchRef=doc(db,"matches",best.matchId);
await updateDoc(matchRef,{["players."+USER.uid]:{name:USER.displayName||"Игрок",rating:myRating,ready:false,side:"p2"},status:"active"});
MY_SIDE="p2";IS_HOST=false;return best.matchId;
}else{
const matchRef=await addDoc(collection(db,"matches"),{status:"waiting",mode:"PYRAMID",created:Date.now(),players:{[USER.uid]:{name:USER.displayName||"Игрок",rating:myRating,ready:false,side:"p1"}}});
await addDoc(collection(db,"matchmaking"),{uid:USER.uid,matchId:matchRef.id,rating:myRating,mode:"PYRAMID",status:"waiting",created:Date.now()});
MY_SIDE="p1";IS_HOST=true;return matchRef.id}}

function listenMatch(matchId){
const unsub=onSnapshot(doc(db,"matches",matchId),snap=>{
if(!snap.exists())return;
const data=snap.data();
if(data.status==="waiting"){showBanner("Ожидание соперника...",0)}
else if(data.status==="active"&&!MATCH){startOnlineMatch(matchId,data)}
else if(MATCH&&data.gameState){handleRemoteUpdate(data)}
});return unsub}

async function startOnlineMatch(matchId,data){
MATCH={id:matchId,online:true,players:data.players,phase:'mulligan',round:1,frontline:5,
matchball:{p1:false,p2:false},gameState:null};
const myData=Object.values(data.players).find(p=>p.side===MY_SIDE);
showScr('screen-match');
$('enemy-name').textContent=Object.values(data.players).find(p=>p.side!==(IS_HOST?"p1":"p2"))?.name||"ПРОТИВНИК";
initLocalGame();
showBanner("Соперник найден! Матч начинается!",3000)}

function handleRemoteUpdate(data){
if(!MATCH)return;
if(data.gameState&&data.gameState.sender!==USER.uid){
const gs=data.gameState;
if(gs.type==='slots'){renderEnemySlots(gs.slots)}
if(gs.type==='ready'){showBanner("Соперник готов!",1500)}
}}

async function sendGameState(type,payload){
if(!MATCH||!MATCH.online)return;
await updateDoc(doc(db,"matches",MATCH.id),{gameState:{type,sender:USER.uid,data:payload,ts:Date.now()}})}

// ============ ЛОКАЛЬНАЯ ИГРА (общая логика) ============
let G=null;
function initLocalGame(){
G={phase:'mulligan',round:1,frontline:5,matchball:{me:false,en:false},suddenDeath:false,
me:{hand:[],pool:[],slots:{1:null,2:null,3:null,4:null,5:null,6:null},handLimit:HAND5,poolSize:HAND5+POOL_BONUS,unlocked:{4:false,5:false,6:false}},
en:{hand:[],pool:[],slots:{1:null,2:null,3:null,4:null,5:null,6:null},handLimit:HAND5,poolSize:HAND5+POOL_BONUS,unlocked:{4:false,5:false,6:false}}};
const startHand=genHand(HAND5);
G.me.hand=JSON.parse(JSON.stringify(startHand));
G.en.hand=JSON.parse(JSON.stringify(startHand));
renderFrontline();renderField();startMulligan()}

function renderFrontline(){const fl=$('frontline');fl.innerHTML='';
for(let i=0;i<FL_SIZE;i++){const c=document.createElement('div');c.className='fc';
if(i<5)c.classList.add('p1');else if(i>5)c.classList.add('p2');else c.classList.add('mid');
if(i===G.frontline)c.classList.add('marker');fl.appendChild(c)}
$('round-num').textContent=G.round;
const mb=$('matchball-info');
if(G.suddenDeath)mb.textContent="⚡ ВНЕЗАПНАЯ СМЕРТЬ!";
else if(G.matchball.me)mb.textContent="🔥 У тебя матчбол!";
else if(G.matchball.en)mb.textContent="🔥 У соперника матчбол!";
else mb.textContent=""}

function renderField(){
for(let s=1;s<=6;s++){
const pSlot=document.querySelector(`#player-front .slot[data-s="${s}"], #player-res .slot[data-s="${s}"]`);
const eSlot=document.querySelector(`#enemy-front .slot[data-s="${s}"], #enemy-res .slot[data-s="${s}"]`);
if(pSlot){pSlot.querySelector('.sc').innerHTML='';pSlot.classList.remove('occupied');
if(G.me.slots[s]){pSlot.appendChild(artCard(G.me.slots[s]));pSlot.classList.add('occupied')}}
if(eSlot){eSlot.querySelector('.sc').innerHTML='';
if(G.en.slots[s]){eSlot.appendChild(artCard(G.en.slots[s],true))}}
// Скрываем заблокированные слоты
if(pSlot)pSlot.style.display=(s>=4&&!G.me.unlocked[s])?'none':'flex';
if(eSlot)eSlot.style.display=(s>=4&&!G.en.unlocked[s])?'none':'flex'}}

function renderHand(){const h=$('hand');h.innerHTML='';
G.me.hand.forEach(a=>{const c=artCard(a);c.onclick=()=>placeArt(a);h.appendChild(c)});
$('hand-count').textContent=G.me.hand.length;$('hand-limit').textContent=G.me.handLimit}

function placeArt(a){if(G.phase!=='deploy')return;
let target=null;for(let s=1;s<=3;s++){if(!G.me.slots[s]){target=s;break}}
if(!target){for(let s=4;s<=6;s++){if(G.me.unlocked[s]&&!G.me.slots[s]){target=s;break}}}
if(!target){showBanner("Нет свободных слотов!");return}
G.me.slots[target]=a;G.me.hand=G.me.hand.filter(x=>x.id!==a.id);
renderField();renderHand();updateReadyBtn()}

function updateReadyBtn(){const btn=$('btn-ready');
const frontFilled=G.me.slots[1]&&G.me.slots[2]&&G.me.slots[3];
btn.classList.toggle('disabled',!frontFilled)}

// ============ МУЛЛИГАН ============
function startMulligan(){G.phase='mulligan';showScr('screen-mulligan');
const c=$('m-hand');c.innerHTML='';let sel=new Set();
G.me.hand.forEach(a=>{const card=artCard(a);card.onclick=()=>{
if(sel.has(a.id)){sel.delete(a.id);card.classList.remove('sel')}
else{if(sel.size>=2){showBanner("Максимум 2!");return}sel.add(a.id);card.classList.add('sel')}
$('m-count').textContent=sel.size};c.appendChild(card)});
$('m-count').textContent=0;
$('btn-mull-ok').onclick=()=>{
G.me.hand=G.me.hand.filter(a=>!sel.has(a.id));
G.me.hand.push(...genHand(sel.size));
const enDiscard=Math.floor(Math.random()*3);
G.en.hand.splice(0,enDiscard);G.en.hand.push(...genHand(enDiscard));
startDeploy()}}

// ============ РАССТАНОВКА ============
function startDeploy(){G.phase='deploy';showScr('screen-match');
startTimer(getDeployTime(),()=>autoDeploy());
aiDeploy();renderHand();renderField();
$('btn-ready').onclick=()=>{if(!$('btn-ready').classList.contains('disabled')){stopTimer();startBattle()}}}

function getDeployTime(){const r=G.round;return Math.min(90+(r-1)*5,120)}

function aiDeploy(){const sh=[...G.en.hand].sort(()=>Math.random()-.5);
for(let s=1;s<=3;s++){if(G.en.slots[s])G.en.hand.push(G.en.slots[s])}
G.en.slots[1]=sh[0];G.en.slots[2]=sh[1];G.en.slots[3]=sh[2];
G.en.hand=G.en.hand.filter(a=>a.id!==sh[0].id&&a.id!==sh[1].id&&a.id!==sh[2].id);
// AI резервы
if(G.en.unlocked[4]&&G.en.hand.length>0)G.en.slots[4]=G.en.hand.shift();
if(G.en.unlocked[5]&&G.en.hand.length>0)G.en.slots[5]=G.en.hand.shift();
if(G.en.unlocked[6]&&G.en.hand.length>0&&(G.en.slots[4]||G.en.slots[5]))G.en.slots[6]=G.en.hand.shift()}

function autoDeploy(){const avail=[...G.me.hand].sort((a,b)=>pwr(b)-pwr(a));
for(let s=1;s<=3;s++){if(!G.me.slots[s]&&avail.length>0)G.me.slots[s]=avail.shift()}
if(G.me.unlocked[4]&&!G.me.slots[4]&&avail.length>0)G.me.slots[4]=avail.shift();
if(G.me.unlocked[5]&&!G.me.slots[5]&&avail.length>0)G.me.slots[5]=avail.shift();
if(G.me.unlocked[6]&&!G.me.slots[6]&&avail.length>0&&(G.me.slots[4]||G.me.slots[5]))G.me.slots[6]=avail.shift();
renderField();startBattle()}

// ============ БОЙ ============
async function startBattle(){G.phase='battle';$('btn-ready').classList.add('disabled');
// Открываем слоты противника
for(let s=1;s<=6;s++){const eSlot=document.querySelector(`[data-s="${s}"][data-side="e"] .sc`);
if(eSlot&&G.en.slots[s]){eSlot.innerHTML='';eSlot.appendChild(artCard(G.en.slots[s]))}}
await sleep(800);

let myWins=0,enWins=0,draws=0;
const results=[];

// Бой фронтов 1-3
for(let s=1;s<=3;s++){
const pa=G.me.slots[s],ea=G.en.slots[s];
if(!pa||!ea)continue;
const r=battle(pa,ea);
await animateSlot(s,r);
if(r.res==='a'){myWins++;results.push({slot:s,winner:'me',pa,ea})}
else if(r.res==='b'){enWins++;results.push({slot:s,winner:'en',pa,ea})}
else{draws++;results.push({slot:s,winner:'draw',pa,ea})}}

// Бой резервов (упрощённо для этого прототипа)
for(let s=4;s<=6;s++){
if(G.me.slots[s]&&G.en.slots[s]){
const r=battle(G.me.slots[s],G.en.slots[s]);
await animateSlot(s,r);
if(r.res==='a')myWins++;else if(r.res==='b')enWins++;else draws++}}

await sleep(1000);

// Итог раунда
let winner=null,move=0;
if(myWins>enWins){winner='me';move=myWins-enWins>=3?2:1}
else if(enWins>myWins){winner='en';move=enWins-myWins>=3?2:1}

if(winner){await moveFrontline(winner,move)}
else{showBanner("Раунд ничейный!",2000);await sleep(2000)}

// Прокачка
applyUpgrades(results,winner);

if(await checkEnd())return;
startDraft()}

async function animateSlot(s,r){
const pEl=document.querySelector(`[data-s="${s}"][data-side="p"] .sc .ac`);
const eEl=document.querySelector(`[data-s="${s}"][data-side="e"] .sc .ac`);
if(pEl)pEl.classList.add('atk-r');
if(eEl)eEl.classList.add('atk-l');
await sleep(400);
if(r.res==='a'){if(eEl)eEl.classList.add('dmg');showBanner(`Слот ${s}: Твой ${r.pa?pwr(r.pa):''} vs ${r.pb} — ПОБЕДА!`,1200)}
else if(r.res==='b'){if(pEl)pEl.classList.add('dmg');showBanner(`Слот ${s}: ${r.pa?pwr(r.pa):''} vs ${r.pb} — ПОРАЖЕНИЕ`,1200)}
else{showBanner(`Слот ${s}: Ничья! (${r.pa} vs ${r.pb})`,1200)}
await sleep(600)}

function applyUpgrades(results,winner){
if(winner!=='me')return;
results.forEach(r=>{
if(r.winner==='me'&&r.pa&&!r.pa.vet){
const enemyPwr=r.ea?pwr(r.ea):0;
if(enemyPwr>=pwr(r.pa)){
if(r.pa.level<3){r.pa.level++;r.pa.emoji=EL[r.pa.el].e[r.pa.level-1];r.pa.upg=true}
else{r.pa.vet=true;r.pa.upg=true}}}})}

async function moveFrontline(winner,amount){
const dir=winner==='me'?1:-1;
for(let i=0;i<amount;i++){
const np=G.frontline+dir;
if(np>=FL_SIZE){if(!G.matchball.en){G.matchball.en=true;G.frontline=FL_SIZE-1;renderFrontline();showBanner("🔥 МАТЧБОЛ у соперника!",3000);await sleep(3000)}else{await endMatch('me');return}}
else if(np<0){if(!G.matchball.me){G.matchball.me=true;G.frontline=0;renderFrontline();showBanner("🔥 МАТЧБОЛ у тебя!",3000);await sleep(3000)}else{await endMatch('en');return}}
else{G.frontline=np;renderFrontline();await sleep(300)}}
showBanner(winner==='me'?`Ты продвинул фронт на ${amount}!`:`Соперник продвинул фронт на ${amount}!`,2000);
await sleep(2000)}

async function checkEnd(){
if(G.frontline>=FL_SIZE){await endMatch('me');return true}
if(G.frontline<0){await endMatch('en');return true}
if(G.matchball.en&&G.frontline>=FL_SIZE-1){await endMatch('me');return true}
if(G.matchball.me&&G.frontline<=0){await endMatch('en');return true}
if(G.round>=MAX_ROUNDS&&!G.suddenDeath){G.suddenDeath=true;renderFrontline();showBanner("⚡ ВНЕЗАПНАЯ СМЕРТЬ!",3000);await sleep(3000)}
if(G.suddenDeath&&G.round>MAX_ROUNDS){const w=G.frontline>=5?'me':'en';await endMatch(w);return true}
return false}

async function endMatch(winner){
const isWin=winner==='me';
stopTimer();
let delta=isWin?20:-20;
const newRating=await updateRating(delta);
await updateStats(isWin);
if(MATCH&&MATCH.online){const opponent=Object.values(MATCH.players||{}).find(p=>p.side!==MY_SIDE);
await saveMatchRecord(opponent?.name||"Соперник",isWin?"win":"lose",delta)}
showScr('screen-result');
$('res-title').textContent=isWin?'🏆 ПОБЕДА!':'💀 ПОРАЖЕНИЕ';
$('res-title').style.color=isWin?'#2ecc71':'#e94560';
$('res-rating').textContent=`${delta>0?'+':''}${delta} рейтинга (новый: ${newRating})`;
$('btn-to-lobby').onclick=()=>{showScr('screen-lobby');$('lobby-rating').textContent=newRating}}

// ============ ДОБОР ============
function startDraft(){G.phase='draft';showScr('screen-draft');
// Возвращаем из слотов в руку
for(let s=1;s<=6;s++){if(G.me.slots[s]){G.me.hand.push(G.me.slots[s]);G.me.slots[s]=null}
if(G.en.slots[s]){G.en.hand.push(G.en.slots[s]);G.en.slots[s]=null}}
const pool=genPool(G.me.poolSize);
G.me.pool=JSON.parse(JSON.stringify(pool));G.en.pool=JSON.parse(JSON.stringify(pool));
renderDraft();startTimer(60,()=>autoDraft())}

function renderDraft(){const dh=$('d-hand'),dp=$('d-pool');dh.innerHTML='';dp.innerHTML='';
let disc=new Set(),pick=new Set();
const upd=()=>{const need=G.me.handLimit-G.me.hand.length+disc.size;
$('d-disc').textContent=disc.size;$('d-pick').textContent=pick.size;$('d-need').textContent=Math.max(0,need);
$('btn-draft-ok').classList.toggle('disabled',pick.size!==need)};
G.me.hand.forEach(a=>{const c=artCard(a);if(disc.has(a.id))c.classList.add('disc');
c.onclick=()=>{if(disc.has(a.id)){disc.delete(a.id);c.classList.remove('disc')}else{disc.add(a.id);c.classList.add('disc')}upd()};
dh.appendChild(c)});
G.me.pool.forEach(a=>{const c=artCard(a);if(pick.has(a.id))c.classList.add('sel');
c.onclick=()=>{const need=G.me.handLimit-G.me.hand.length+disc.size;
if(pick.has(a.id)){pick.delete(a.id);c.classList.remove('sel')}
else{if(pick.size>=need){showBanner("Уже взял максимум!");return}pick.add(a.id);c.classList.add('sel')}upd()};
dp.appendChild(c)});
upd();
$('btn-draft-ok').onclick=()=>{if($('btn-draft-ok').classList.contains('disabled'))return;
stopTimer();
G.me.hand=G.me.hand.filter(a=>!disc.has(a.id));
G.me.pool.forEach(a=>{if(pick.has(a.id))G.me.hand.push(a)});
aiDraft();
G.round++;
checkUnlocks();
startDeploy()}}

function aiDraft(){const dc=Math.floor(Math.random()*3);
for(let i=0;i<dc&&G.en.hand.length>1;i++)G.en.hand.splice(Math.floor(Math.random()*G.en.hand.length),1);
const need=G.en.handLimit-G.en.hand.length;
const av=[...G.en.pool].sort(()=>Math.random()-.5);
for(let i=0;i<need&&i<av.length;i++)G.en.hand.push(av[i])}

function autoDraft(){const need=G.me.handLimit-G.me.hand.length;
const sorted=[...G.me.pool].sort((a,b)=>pwr(b)-pwr(a));
for(let i=0;i<need&&i<sorted.length;i++)G.me.hand.push(sorted[i]);
aiDraft();G.round++;checkUnlocks();startDeploy()}

function checkUnlocks(){
if(G.frontline>=8&&!G.me.unlocked[4]){G.me.unlocked[4]=true;G.me.unlocked[5]=true;G.me.handLimit=HAND6;G.me.poolSize=HAND6+POOL_BONUS;showBanner("🔓 Открыты резервы 4 и 5! Рука: 6",3000)}
if(G.frontline>=9&&!G.me.unlocked[6]){G.me.unlocked[6]=true;G.me.handLimit=HAND8;G.me.poolSize=HAND8+POOL_BONUS;showBanner("🔓 Открыт слот 6! Рука: 8",3000)}
if(G.frontline<=2&&!G.en.unlocked[4]){G.en.unlocked[4]=true;G.en.unlocked[5]=true;G.en.handLimit=HAND6;G.en.poolSize=HAND6+POOL_BONUS}
if(G.frontline<=1&&!G.en.unlocked[6]){G.en.unlocked[6]=true;G.en.handLimit=HAND8;G.en.poolSize=HAND8+POOL_BONUS}}

// ============ ТАЙМЕРЫ ============
function startTimer(seconds,onExpire){stopTimer();let remaining=seconds;
$('timer-text').textContent=remaining;$('timer-fill').style.width='100%';
TIMER_INT=setInterval(()=>{remaining--;$('timer-text').textContent=remaining;
$('timer-fill').style.width=(remaining/seconds*100)+'%';
if(remaining<=0){stopTimer();if(onExpire)onExpire()}},1000)}
function stopTimer(){if(TIMER_INT){clearInterval(TIMER_INT);TIMER_INT=null}}

// ============ ЭЛЕМЕНТЫ (МОДАЛКА) ============
function showElements(){$('modal-elements').classList.add('show');
const g=$('hex-grid');g.innerHTML='';
HEX.forEach(k=>{const d=document.createElement('div');d.className='hx';
d.innerHTML=`<span class="he">${EL[k].e[1]}</span>${EL[k].n}`;
d.onclick=()=>showElInfo(k);g.appendChild(d)});showElInfo('fire')}

function showElInfo(k){let h=`<b>${EL[k].n.toUpperCase()}</b><br><br>`;
HEX.forEach(o=>{if(o===k)return;const r=rel(k,o);
let s=r===2?'➤➤':r===1?'➤':r===-1?'◁':r===-2?'◁◁':'=';
h+=`${s} ${EL[o].n}<br>`});
$('el-info').innerHTML=h}

// ============ ИСТОРИЯ ============
async function showHistory(){showScr('screen-history');
const list=$('history-list');list.innerHTML='<p>Загрузка...</p>';
const hist=await loadHistory();
if(hist.length===0){list.innerHTML='<p>Пока нет матчей</p>';return}
list.innerHTML=hist.map(h=>`<div class="hist-item">
<span class="${h.result==='win'?'win':'lose'}">${h.result==='win'?'🏆 ПОБЕДА':'💀 ПОРАЖЕНИЕ'}</span>
vs ${h.opponent} | ${h.delta>0?'+':''}${h.delta}⭐ | ${new Date(h.date).toLocaleDateString()}
</div>`).join('')}

// ============ АВТОРИЗАЦИЯ И ИНИЦИАЛИЗАЦИЯ ============
$('btn-login').onclick=async()=>{try{await signInWithPopup(auth,prov)}catch(e){alert("Ошибка: "+e.message)}};
$('btn-logout').onclick=async()=>{await signOut(auth)};
let SEARCH_UNSUB=null;
let IS_SEARCHING=false;

$('btn-battle').onclick=async()=>{
if(IS_SEARCHING)return;
IS_SEARCHING=true;
$('btn-battle').style.display='none';
$('btn-searching').style.display='block';
showScr('screen-match');
showBanner("🔍 Поиск соперника... Жди или нажми кнопку отмены.",0);
try{
const matchId=await findMatch();
SEARCH_UNSUB=listenMatch(matchId);
}catch(e){
showBanner("Ошибка поиска: "+e.message);
IS_SEARCHING=false;
$('btn-battle').style.display='block';
$('btn-searching').style.display='none';
showScr('screen-lobby');
}};

// Отмена поиска
$('btn-searching').onclick=()=>{
if(!IS_SEARCHING)return;
IS_SEARCHING=false;
if(SEARCH_UNSUB){SEARCH_UNSUB();SEARCH_UNSUB=null}
$('btn-battle').style.display='block';
$('btn-searching').style.display='none';
showScr('screen-lobby');
showBanner("Поиск отменён",2000);
};

// Игра с AI — отдельный режим без рейтинга
$('btn-ai').onclick=()=>{
showScr('screen-match');
initLocalGame(true); // true = режим AI без рейтинга
};
$('btn-elements').onclick=showElements;
$('btn-el-close').onclick=()=>$('modal-elements').classList.remove('show');
$('btn-history').onclick=showHistory;
$('btn-hist-back').onclick=()=>showScr('screen-lobby');

onAuthStateChanged(auth,async user=>{
if(user){USER=user;PROFILE=await saveProfile(user);
$('lobby-name').textContent=PROFILE.name;
$('lobby-rating').textContent=PROFILE.ratings?.PYRAMID||1000;
if(PROFILE.photo)$('lobby-avatar').textContent='🎮';
showScr('screen-lobby')}
else{USER=null;PROFILE=null;showScr('screen-login')}});
