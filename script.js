/* =====================================================
   БЛОК 1: FIREBASE
   ===================================================== */
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import{getAuth,signInWithPopup,signInWithRedirect,getRedirectResult,GoogleAuthProvider,signOut,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import{getFirestore,doc,getDoc,setDoc,updateDoc,collection,query,where,limit as lim,getDocs,addDoc,deleteDoc,onSnapshot}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const CFG={apiKey:"AIzaSyCu2Rha5D4S3Nu7A7W1s9BTd236Bm6vZg8",authDomain:"artifight.firebaseapp.com",projectId:"artifight",storageBucket:"artifight.firebasestorage.app",messagingSenderId:"29733165895",appId:"1:29733165895:web:5e16ad71eeb97cb6498a62"};
const app=initializeApp(CFG),auth=getAuth(app),db=getFirestore(app),prov=new GoogleAuthProvider();

/* =====================================================
   БЛОК 2: КОНСТАНТЫ
   ===================================================== */
const EL={fire:{n:"Огонь",e:["🕯️","🔥","🌋"]},water:{n:"Вода",e:["💧","🌊",""]},earth:{n:"Земля",e:["🪨","️","💎"]},air:{n:"Воздух",e:["💨","🌬️","🌪️"]},nature:{n:"Природа",e:["🌱","","🌳"]},metal:{n:"Металл",e:["🔩","⚙️","🛡️"]}};
const HEX=["fire","metal","nature","air","water","earth"];
const FL_SIZE=11,HAND5=5,HAND6=6,HAND8=8,POOL_BONUS=3,MAX_POOL=11,MAX_ROUNDS=20;

/* =====================================================
   БЛОК 3: СОСТОЯНИЕ
   ===================================================== */
let USER=null,PROFILE=null;
let MATCH_ID=null,MY_SIDE=null,UNSUB=null;
let DOC=null;
let IS_SEARCHING=false;
let AI_MODE=false,AI_G=null;
let mySlotsDraft={},myHandDraft=[];
let lastAnimatedRound=0,ratedDone=false;
let animating=false,needResync=false;

/* =====================================================
   БЛОК 4: УТИЛИТЫ
   ===================================================== */
function uid(){return crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).substr(2,9)}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function $(id){return document.getElementById(id)}
function showScr(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active')}
function showBanner(t,d=2000){const b=$('banner');b.textContent=t;b.classList.add('show');if(d>0)setTimeout(()=>b.classList.remove('show'),d)}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function seededHand(seed,n){const rng=mulberry32(seed);const out=[];for(let i=0;i<n;i++){const k=HEX[Math.floor(rng()*6)];const r=rng()*100;const l=r<60?1:r<90?2:3;out.push({id:"s"+seed+"_"+i,el:k,name:EL[k].n,emoji:EL[k].e[l-1],level:l,vet:false,upg:false})}return out}
function randArt(){const k=HEX[Math.floor(Math.random()*6)];const r=Math.random()*100;const l=r<60?1:r<90?2:3;return{id:uid(),el:k,name:EL[k].n,emoji:EL[k].e[l-1],level:l,vet:false,upg:false}}
function effectIcon(t){const d=document.createElement('div');d.className='boom';d.style.fontSize='24px';d.textContent=t;return d}

/* =====================================================
   БЛОК 5: ЛОГИКА БОЯ И ПРОКАЧКА
   ===================================================== */
function rel(a,d){if(a===d)return 0;const ai=HEX.indexOf(a),di=HEX.indexOf(d);const dist=(di-ai+6)%6;return dist===1?1:dist===2?2:dist===4?-2:dist===5?-1:0}
function pwr(a){return a.level+(a.vet?1:0)}
function battle(a,b){const ra=rel(a.el,b.el),rb=rel(b.el,a.el);const ba=ra>0?ra:0,bb=rb>0?rb:0;const pa=pwr(a)+ba,pb=pwr(b)+bb;let res='draw';if(pa>pb)res='a';else if(pb>pa)res='b';return{res,pa,pb}}
/* [ИСПРАВЛЕНИЕ 2] прокачка победителя */
function maybeUpgrade(w,l){
  if(w.vet)return null;
  if(pwr(l)>=pwr(w)){
    const c={...w};
    if(c.level<3){c.level++;c.emoji=EL[c.el].e[c.level-1];c.upg=true}
    else{c.vet=true;c.upg=true}
    return c;
  }
  return null;
}

/* =====================================================
   БЛОК 6: КАРТОЧКИ
   ===================================================== */
function artCard(a,fd=false,mini=false){const c=document.createElement('div');c.className='ac';c.dataset.id=a.id;c.dataset.el=a.el;if(mini)c.classList.add('mini');
if(fd){c.classList.add('fd')}else{let s='';for(let i=0;i<a.level;i++)s+='★';if(a.vet)s+='⭐';c.innerHTML=`<div class="ae">${a.emoji}</div><div class="an">${a.name}</div><div class="as">${s}</div>`;if(a.upg)c.classList.add('upg')}return c}

/* =====================================================
   БЛОК 7: FIREBASE ПРОФИЛЬ / РЕЙТИНГ / ИСТОРИЯ
   ===================================================== */
async function saveProfile(u){try{const r=doc(db,"users",u.uid),s=await getDoc(r);if(!s.exists()){const p={uid:u.uid,name:u.displayName||"Игрок",email:u.email||"",ratings:{PYRAMID:1000},stats:{PYRAMID:{w:0,l:0}},created:Date.now()};await setDoc(r,p);return p}return s.data()}catch(e){return{uid:u.uid,name:u.displayName||"Игрок",ratings:{PYRAMID:1000},stats:{PYRAMID:{w:0,l:0}}}}}
async function updateRating(d){if(!USER)return PROFILE?.ratings?.PYRAMID||1000;const nr=Math.max(0,(PROFILE.ratings?.PYRAMID||1000)+d);try{await updateDoc(doc(db,"users",USER.uid),{"ratings.PYRAMID":nr})}catch(e){}PROFILE.ratings.PYRAMID=nr;return nr}
async function updateStats(w){if(!USER)return;try{const f=w?"stats.PYRAMID.w":"stats.PYRAMID.l";const c=(PROFILE.stats?.PYRAMID?.[w?'w':'l'])||0;await updateDoc(doc(db,"users",USER.uid),{[f]:c+1})}catch(e){}}
async function saveRecord(op,res,d){if(!USER)return;try{await addDoc(collection(db,"users",USER.uid,"history"),{opponent:op,result:res,delta:d,mode:"PYRAMID",date:Date.now()})}catch(e){}}
async function loadHistory(){if(!USER)return[];try{const s=await getDocs(collection(db,"users",USER.uid,"history"));return s.docs.map(d=>d.data()).sort((a,b)=>b.date-a.date).slice(0,20)}catch(e){return[]}}

/* =====================================================
   БЛОК 8: МАТЧМЕЙКИНГ
   ===================================================== */
async function findMatch(){
  const myRating=PROFILE.ratings?.PYRAMID||1000;
  try{
    const mq=query(collection(db,"matchmaking"),where("status","==","waiting"),lim(10));
    const snap=await getDocs(mq);
    let best=null,bestDiff=Infinity;
    for(const d of snap.docs){const data=d.data();if(data.uid===USER.uid)continue;const diff=Math.abs(data.rating-myRating);if(diff<bestDiff&&diff<=500){bestDiff=diff;best={id:d.id,...data}}}
    if(best){
      await deleteDoc(doc(db,"matchmaking",best.id));
      await updateDoc(doc(db,"matches",best.matchId),{["players.p2"]:{uid:USER.uid,name:USER.displayName||"Игрок",rating:myRating,hand:[],slots:null,ready:false,mullDone:false,draftDone:false,handLimit:HAND5,poolSize:HAND5+POOL_BONUS,unlocked:{4:false,5:false,6:false}},status:"active"});
      MY_SIDE="p2";return best.matchId;
    }else{
      const seed=Math.floor(Math.random()*1e9);
      const ref=await addDoc(collection(db,"matches"),{seed,status:"waiting",mode:"PYRAMID",phase:"mulligan",round:1,frontline:5,matchball:{p1:false,p2:false},suddenDeath:false,battleLog:null,battleDone:false,created:Date.now(),players:{p1:{uid:USER.uid,name:USER.displayName||"Игрок",rating:myRating,hand:[],slots:null,ready:false,mullDone:false,draftDone:false,handLimit:HAND5,poolSize:HAND5+POOL_BONUS,unlocked:{4:false,5:false,6:false}}}});
      await addDoc(collection(db,"matchmaking"),{uid:USER.uid,matchId:ref.id,rating:myRating,status:"waiting",created:Date.now()});
      MY_SIDE="p1";return ref.id;
    }
  }catch(e){console.error(e);return null}
}

/* =====================================================
   БЛОК 9: СЛУШАТЕЛЬ И СИНХРОНИЗАЦИЯ
   ===================================================== */
function listenMatch(id){return onSnapshot(doc(db,"matches",id),snap=>{if(!snap.exists())return;DOC=snap.data();if(animating){needResync=true;return}syncFromDoc()})}
function otherSide(){return MY_SIDE==="p1"?"p2":"p1"}
function me(){return DOC.players[MY_SIDE]}
function other(){return DOC.players[otherSide()]}

async function syncFromDoc(){
  if(!DOC)return;
  if(DOC.status==="waiting"){showScr('screen-wait');$('wait-text').textContent="Ждём соперника...";return}
  $('enemy-name').textContent=other()?.name||"ПРОТИВНИК";
  const ph=DOC.phase;

  if(ph==="mulligan"){
    if(!me().mullDone){showMulligan()}
    else{showScr('screen-wait');$('wait-text').textContent="Ждём замены соперника..."}
  }
  else if(ph==="deploy"){
    /* [ИСПРАВЛЕНИЕ 1,3,4] если я уже готов — заблокированный экран,
       таймер НЕ перезапускается, слоты/рука НЕ сбрасываются */
    if(me().ready){showDeployLocked()}
    else{showDeploy()}
  }
  else if(ph==="battle"){stopTimer();showScr('screen-wait');$('wait-text').textContent="⚔️ Бой..."}
  else if(ph==="draft"){
    if(DOC.battleLog&&DOC.battleLog.round!==lastAnimatedRound){
      animating=true;await animateBattle(DOC.battleLog);animating=false;
      if(needResync){needResync=false;return syncFromDoc()}
    }
    if(!me().draftDone){showDraft()}
    else{showScr('screen-wait');$('wait-text').textContent="Ждём добора соперника..."}
  }
  else if(ph==="end"){finishMatch()}
  advancePhase();
}

async function advancePhase(){
  if(!DOC)return;
  const p1=DOC.players.p1,p2=DOC.players.p2;
  try{
    if(DOC.phase==="mulligan"&&p1.mullDone&&p2.mullDone){await updateDoc(doc(db,"matches",MATCH_ID),{phase:"deploy"})}
    else if(DOC.phase==="deploy"&&p1.ready&&p2.ready){await updateDoc(doc(db,"matches",MATCH_ID),{phase:"battle"})}
    else if(DOC.phase==="battle"&&!DOC.battleDone){await computeBattle()}
    else if(DOC.phase==="draft"&&p1.draftDone&&p2.draftDone){
      await updateDoc(doc(db,"matches",MATCH_ID),{round:DOC.round+1,phase:"deploy",battleDone:false,"players.p1.ready":false,"players.p2.ready":false,"players.p1.draftDone":false,"players.p2.draftDone":false,"players.p1.slots":null,"players.p2.slots":null});
    }
  }catch(e){}
}

/* =====================================================
   БЛОК 10: ВЫЧИСЛЕНИЕ БОЯ (хост-логика, считает любой)
   [ИСПРАВЛЕНИЕ 2] добавлена прокачка и эффекты в log
   ===================================================== */
async function computeBattle(){
  const s1=DOC.players.p1.slots||{},s2=DOC.players.p2.slots||{};
  const log=[];let w1=0,w2=0;
  for(let s=1;s<=6;s++){
    const a=s1[s],b=s2[s];
    if(!a||!b)continue;
    const r=battle(a,b);
    let aOut=a,bOut=b,aUp=false,bUp=false;
    if(r.res==='a'){const up=maybeUpgrade(a,b);if(up){aOut=up;aUp=true}}
    else if(r.res==='b'){const up=maybeUpgrade(b,a);if(up){bOut=up;bUp=true}}
    log.push({slot:s,res:r.res,pa:r.pa,pb:r.pb,a:aOut,b:bOut,aUp,bUp});
    if(r.res==='a')w1++;else if(r.res==='b')w2++;
  }
  const logMap={};log.forEach(e=>logMap[e.slot]=e);

  function newHand(sideKey){
    const P=DOC.players[sideKey];
    const S=sideKey==='p1'?s1:s2,O=sideKey==='p1'?s2:s1;
    const placedIds=new Set(Object.values(S).filter(Boolean).map(a=>a.id));
    const notPlaced=(P.hand||[]).filter(a=>!placedIds.has(a.id));
    const surv=[];
    for(let s=1;s<=6;s++){
      const a=S[s];if(!a)continue;
      if(!O[s]){surv.push(a);continue}
      const e=logMap[s];if(!e){surv.push(a);continue}
      if(sideKey==='p1'&&e.res==='a')surv.push(e.a);
      else if(sideKey==='p2'&&e.res==='b')surv.push(e.b);
    }
    return[...notPlaced,...surv];
  }
  const hand1=newHand('p1'),hand2=newHand('p2');

  let roundWinner=null,move=0;
  if(w1>w2){roundWinner='p1';move=(w1-w2>=3)?2:1}
  else if(w2>w1){roundWinner='p2';move=(w2-w1>=3)?2:1}

  let frontline=DOC.frontline;
  const matchball={...DOC.matchball};
  let suddenDeath=DOC.suddenDeath,endWinner=null;
  if(roundWinner){
    const dir=roundWinner==='p1'?1:-1;
    for(let i=0;i<move;i++){
      const np=frontline+dir;
      if(np>=FL_SIZE){if(!matchball.p2){matchball.p2=true;frontline=FL_SIZE-1}else{endWinner='p1';break}}
      else if(np<0){if(!matchball.p1){matchball.p1=true;frontline=0}else{endWinner='p2';break}}
      else frontline=np;
    }
  }
  if(!endWinner&&frontline>=FL_SIZE)endWinner='p1';
  if(!endWinner&&frontline<0)endWinner='p2';
  if(!endWinner&&DOC.round>=MAX_ROUNDS)suddenDeath=true;

  const un1={...DOC.players.p1.unlocked},un2={...DOC.players.p2.unlocked};
  let hl1=DOC.players.p1.handLimit,hl2=DOC.players.p2.handLimit;
  if(frontline>=8&&!un2[4]){un2[4]=un2[5]=true;hl2=HAND6}
  if(frontline>=9&&!un2[6]){un2[6]=true;hl2=HAND8}
  if(frontline<=2&&!un1[4]){un1[4]=un1[5]=true;hl1=HAND6}
  if(frontline<=1&&!un1[6]){un1[6]=true;hl1=HAND8}

  const updates={battleLog:{round:DOC.round,log,w1,w2,roundWinner,move},battleDone:true,frontline,matchball,suddenDeath,
    "players.p1.hand":hand1,"players.p2.hand":hand2,
    "players.p1.unlocked":un1,"players.p2.unlocked":un2,
    "players.p1.handLimit":hl1,"players.p1.poolSize":hl1+POOL_BONUS,
    "players.p2.handLimit":hl2,"players.p2.poolSize":hl2+POOL_BONUS};
  if(endWinner){updates.phase="end";updates.winner=endWinner}
  else{updates.phase="draft"}
  await updateDoc(doc(db,"matches",MATCH_ID),updates);
}

/* =====================================================
   БЛОК 11: АНИМАЦИЯ БОЯ
   [ИСПРАВЛЕНИЕ 2] эффекты 💥 / ⚖️ и показ прокачки
   ===================================================== */
async function animateBattle(bl){
  lastAnimatedRound=bl.round;
  showScr('screen-match');
  renderFrontline();
  for(let s=1;s<=6;s++){
    setSlotCard('p',s,DOC.players.p1.slots?.[s],false);
    setSlotCard('e',s,DOC.players.p2.slots?.[s],false);
  }
  await sleep(700);
  for(const item of bl.log){
    const pSc=getSlotEl('p',item.slot)?.querySelector('.sc');
    const eSc=getSlotEl('e',item.slot)?.querySelector('.sc');
    const pEl=pSc?.querySelector('.ac'),eEl=eSc?.querySelector('.ac');
    if(pEl)pEl.classList.add('atk-r');
    if(eEl)eEl.classList.add('atk-l');
    await sleep(450);
    if(item.res==='a'){
      if(eEl)eEl.classList.add('dmg');
      await sleep(300);
      if(eSc){eSc.innerHTML='';eSc.appendChild(effectIcon('💥'))}
      if(pSc){pSc.innerHTML='';pSc.appendChild(artCard(item.a))}
      showBanner(item.aUp?`Слот ${item.slot}: ПОБЕДА! Артефакт повышен ▲ (${item.pa} vs ${item.pb})`:`Слот ${item.slot}: ПОБЕДА (${item.pa} vs ${item.pb})`,1100);
    }else if(item.res==='b'){
      if(pEl)pEl.classList.add('dmg');
      await sleep(300);
      if(pSc){pSc.innerHTML='';pSc.appendChild(effectIcon('💥'))}
      if(eSc){eSc.innerHTML='';eSc.appendChild(artCard(item.b))}
      showBanner(item.bUp?`Слот ${item.slot}: поражение. Артефакт соперника повышен ▲ (${item.pa} vs ${item.pb})`:`Слот ${item.slot}: поражение (${item.pa} vs ${item.pb})`,1100);
    }else{
      await sleep(300);
      if(pSc){pSc.innerHTML='';pSc.appendChild(effectIcon('⚖️'))}
      if(eSc){eSc.innerHTML='';eSc.appendChild(effectIcon('⚖️'))}
      showBanner(`Слот ${item.slot}: ничья, оба уничтожены (${item.pa} vs ${item.pb})`,1100);
    }
    await sleep(700);
  }
  if(bl.roundWinner)showBanner(bl.roundWinner===MY_SIDE?`Ты продвинул фронт на ${bl.move}!`:`Соперник продвинул фронт на ${bl.move}!`,2000);
  await sleep(1600);
}

/* =====================================================
   БЛОК 12: РЕНДЕРИНГ ПОЛЯ И РУК
   ===================================================== */
function getSlotEl(side,s){return side==='p'?document.querySelector(`.slot.ps[data-s="${s}"]`):document.querySelector(`.slot[data-side="e"][data-s="${s}"]`)}
function setSlotCard(side,s,art,facedown){
  const el=getSlotEl(side,s);if(!el)return;
  const sc=el.querySelector('.sc');sc.innerHTML='';el.classList.remove('occupied');
  if(art){sc.appendChild(artCard(art,facedown));if(side==='p')el.classList.add('occupied')}
  const owner=side==='p'?me():other();
  el.style.display=(s>=4&&!owner?.unlocked[s])?'none':'flex';
}
function renderFrontline(){
  const fl=$('frontline');fl.innerHTML='';
  for(let i=0;i<FL_SIZE;i++){const c=document.createElement('div');c.className='fc';if(i<5)c.classList.add('p1');else if(i>5)c.classList.add('p2');else c.classList.add('mid');if(i===DOC.frontline)c.classList.add('marker');fl.appendChild(c)}
  $('round-num').textContent=DOC.round;
  const mb=$('matchball-info');
  if(DOC.suddenDeath)mb.textContent="⚡ ВНЕЗАПНАЯ СМЕРТЬ!";
  else if((DOC.matchball.p1&&MY_SIDE==='p1')||(DOC.matchball.p2&&MY_SIDE==='p2'))mb.textContent="🔥 У тебя матчбол!";
  else if(DOC.matchball.p1||DOC.matchball.p2)mb.textContent="🔥 У соперника матчбол!";
  else mb.textContent="";
}
function renderMyHand(){
  const h=$('hand');h.innerHTML='';
  myHandDraft.forEach(a=>{const c=artCard(a);c.onclick=()=>placeArt(a);h.appendChild(c)});
  $('hand-count').textContent=myHandDraft.length;
  $('hand-limit').textContent=me().handLimit;
}
/* [ИСПРАВЛЕНИЕ 4] рука без кликов в заблокированном состоянии */
function renderMyHandLocked(){
  const h=$('hand');h.innerHTML='';
  const slotIds=new Set(Object.values(me().slots||{}).filter(Boolean).map(a=>a.id));
  const rest=(me().hand||[]).filter(a=>!slotIds.has(a.id));
  rest.forEach(a=>{h.appendChild(artCard(a))});
  $('hand-count').textContent=rest.length;
  $('hand-limit').textContent=me().handLimit;
}
function renderEnemyHand(){
  const h=$('ehand');h.innerHTML='';
  (other().hand||[]).forEach(a=>{h.appendChild(artCard(a,false,true))});
  $('ehand-count').textContent=(other().hand||[]).length;
}
function placeArt(a){
  let target=null;
  for(let s=1;s<=3;s++){if(!mySlotsDraft[s]){target=s;break}}
  if(!target){for(let s=4;s<=6;s++){if(me().unlocked[s]&&!mySlotsDraft[s]){target=s;break}}}
  if(!target){showBanner("Нет свободных слотов!");return}
  mySlotsDraft[target]=a;
  myHandDraft=myHandDraft.filter(x=>x.id!==a.id);
  renderDeploySlots();renderMyHand();updateReady();
}
function returnFromSlot(s){
  const a=mySlotsDraft[s];if(!a)return;
  delete mySlotsDraft[s];
  myHandDraft.push(a);
  renderDeploySlots();renderMyHand();updateReady();
}
function renderDeploySlots(){
  for(let s=1;s<=6;s++){
    const pEl=getSlotEl('p',s);
    if(pEl){
      const sc=pEl.querySelector('.sc');sc.innerHTML='';pEl.classList.remove('occupied');
      if(mySlotsDraft[s]){
        const card=artCard(mySlotsDraft[s]);
        card.onclick=()=>returnFromSlot(s);
        sc.appendChild(card);pEl.classList.add('occupied');
      }
      pEl.style.display=(s>=4&&!me().unlocked[s])?'none':'flex';
    }
    setSlotCard('e',s,other().slots?.[s],true);
  }
}
function updateReady(){
  const ok=mySlotsDraft[1]&&mySlotsDraft[2]&&mySlotsDraft[3];
  $('btn-ready').classList.toggle('disabled',!ok);
}

/* =====================================================
   БЛОК 13: ФАЗА МУЛЛИГАНА
   ===================================================== */
function showMulligan(){
  showScr('screen-mulligan');
  const startHand=seededHand(DOC.seed,5);
  const c=$('m-hand');c.innerHTML='';let sel=new Set();
  startHand.forEach(a=>{const card=artCard(a);
    card.onclick=()=>{if(sel.has(a.id)){sel.delete(a.id);card.classList.remove('sel')}else{if(sel.size>=2){showBanner("Максимум 2!");return}sel.add(a.id);card.classList.add('sel')}$('m-count').textContent=sel.size};
    c.appendChild(card)});
  $('m-count').textContent=0;
  $('btn-mull-ok').onclick=async()=>{
    const kept=startHand.filter(a=>!sel.has(a.id));
    const num=MY_SIDE==='p1'?1:2;
    const repl=seededHand(DOC.seed+777+num*13,sel.size);
    await updateDoc(doc(db,"matches",MATCH_ID),{["players."+MY_SIDE+".hand"]:[...kept,...repl],["players."+MY_SIDE+".mullDone"]:true});
  };
}

/* =====================================================
   БЛОК 14: ФАЗА РАССТАНОВКИ
   [ИСПРАВЛЕНИЕ 1,3,4] showDeployLocked для готового игрока
   ===================================================== */
function showDeploy(){
  showScr('screen-match');
  mySlotsDraft={};
  myHandDraft=[...(me().hand||[])];
  $('btn-ready').textContent='ГОТОВ';
  renderFrontline();renderMyHand();renderEnemyHand();renderDeploySlots();updateReady();
  startTimer(getDeployTime(),()=>autoReady());
  $('btn-ready').onclick=async()=>{
    if($('btn-ready').classList.contains('disabled'))return;
    stopTimer();
    await updateDoc(doc(db,"matches",MATCH_ID),{["players."+MY_SIDE+".slots"]:mySlotsDraft,["players."+MY_SIDE+".ready"]:true});
  };
}
/* Заблокированное состояние: я готов, жду соперника.
   Таймер НЕ перезапускается, клики отключены. */
function showDeployLocked(){
  showScr('screen-match');
  renderFrontline();renderEnemyHand();
  for(let s=1;s<=6;s++){
    setSlotCard('p',s,me().slots?.[s],false);
    setSlotCard('e',s,other().slots?.[s],true);
  }
  renderMyHandLocked();
  const btn=$('btn-ready');
  btn.classList.add('disabled');
  btn.textContent='ТЫ ГОТОВ, ЖДЁМ СОПЕРНИКА...';
  showBanner('Твоя расстановка зафиксирована. Ждём готовности соперника...',0);
}
function getDeployTime(){return Math.min(90+(DOC.round-1)*5,120)}
async function autoReady(){
  const hand=[...myHandDraft].sort((a,b)=>pwr(b)-pwr(a));
  const d={};
  for(let s=1;s<=3;s++){if(hand.length)d[s]=hand.shift()}
  if(me().unlocked[4]&&hand.length)d[4]=hand.shift();
  if(me().unlocked[5]&&hand.length)d[5]=hand.shift();
  if(me().unlocked[6]&&hand.length&&(d[4]||d[5]))d[6]=hand.shift();
  await updateDoc(doc(db,"matches",MATCH_ID),{["players."+MY_SIDE+".slots"]:d,["players."+MY_SIDE+".ready"]:true});
}

/* =====================================================
   БЛОК 15: ФАЗА ДОБОРА
   ===================================================== */
function showDraft(){
  showScr('screen-draft');
  stopTimer();
  const pool=seededHand(DOC.seed+DOC.round*9999,MAX_POOL).slice(0,me().poolSize);
  const dh=$('d-hand'),dp=$('d-pool');dh.innerHTML='';dp.innerHTML='';
  let disc=new Set(),pick=new Set();
  const upd=()=>{const need=me().handLimit-(me().hand||[]).length+disc.size;
    $('d-disc').textContent=disc.size;$('d-pick').textContent=pick.size;$('d-need').textContent=Math.max(0,need);
    $('btn-draft-ok').classList.toggle('disabled',pick.size!==need)};
  (me().hand||[]).forEach(a=>{const c=artCard(a);if(disc.has(a.id))c.classList.add('disc');
    c.onclick=()=>{if(disc.has(a.id)){disc.delete(a.id);c.classList.remove('disc')}else{disc.add(a.id);c.classList.add('disc')}upd()};
    dh.appendChild(c)});
  pool.forEach(a=>{const c=artCard(a);if(pick.has(a.id))c.classList.add('sel');
    c.onclick=()=>{const need=me().handLimit-(me().hand||[]).length+disc.size;
      if(pick.has(a.id)){pick.delete(a.id);c.classList.remove('sel')}else{if(pick.size>=need){showBanner("Максимум!");return}pick.add(a.id);c.classList.add('sel')}upd()};
    dp.appendChild(c)});
  upd();
  $('btn-draft-ok').onclick=async()=>{
    if($('btn-draft-ok').classList.contains('disabled'))return;
    stopTimer();
    let hand=(me().hand||[]).filter(a=>!disc.has(a.id));
    pool.forEach(a=>{if(pick.has(a.id))hand.push(a)});
    await updateDoc(doc(db,"matches",MATCH_ID),{["players."+MY_SIDE+".hand"]:hand,["players."+MY_SIDE+".draftDone"]:true});
  };
  startTimer(60,()=>autoDraft(pool));
}
async function autoDraft(pool){
  let hand=[...(me().hand||[])];
  const need=me().handLimit-hand.length;
  const sorted=[...pool].sort((a,b)=>pwr(b)-pwr(a));
  for(let i=0;i<need&&i<sorted.length;i++)hand.push(sorted[i]);
  await updateDoc(doc(db,"matches",MATCH_ID),{["players."+MY_SIDE+".hand"]:hand,["players."+MY_SIDE+".draftDone"]:true});
}

/* =====================================================
   БЛОК 16: ЗАВЕРШЕНИЕ МАТЧА
   ===================================================== */
async function finishMatch(){
  stopTimer();
  const win=DOC.winner===MY_SIDE;
  let delta=0,newRating=PROFILE?.ratings?.PYRAMID||1000;
  if(!ratedDone){
    ratedDone=true;
    delta=win?20:-20;
    newRating=await updateRating(delta);
    await updateStats(win);
    await saveRecord(other()?.name||"Соперник",win?"win":"lose",delta);
  }
  showScr('screen-result');
  $('res-title').textContent=win?'🏆 ПОБЕДА!':'💀 ПОРАЖЕНИЕ';
  $('res-title').style.color=win?'#2ecc71':'#e94560';
  $('res-rating').textContent=`${delta>0?'+':''}${delta} рейтинга (новый: ${newRating})`;
  $('btn-to-lobby').onclick=()=>{cleanup();showScr('screen-lobby');$('lobby-rating').textContent=newRating};
}
function cleanup(){if(UNSUB){UNSUB();UNSUB=null}MATCH_ID=null;DOC=null;MY_SIDE=null;lastAnimatedRound=0;ratedDone=false;animating=false;needResync=false}

/* =====================================================
   БЛОК 17: ТАЙМЕРЫ
   ===================================================== */
let TIMER_INT=null;
function startTimer(sec,onExp){stopTimer();let r=sec;$('timer-text').textContent=r;$('timer-fill').style.width='100%';TIMER_INT=setInterval(()=>{r--;$('timer-text').textContent=r;$('timer-fill').style.width=(r/sec*100)+'%';if(r<=0){stopTimer();if(onExp)onExp()}},1000)}
function stopTimer(){if(TIMER_INT){clearInterval(TIMER_INT);TIMER_INT=null}}

/* =====================================================
   БЛОК 18: РЕЖИМ AI
   ===================================================== */
function startAI(){
  AI_MODE=true;
  AI_G={round:1,frontline:5,sudden:false,
    me:{hand:seededHand(Date.now()%1e9,5),draftHand:[],slots:{},hl:HAND5,pl:HAND5+POOL_BONUS,un:{4:false,5:false,6:false}},
    en:{hand:seededHand((Date.now()+1)%1e9,5),slots:{},hl:HAND5,pl:HAND5+POOL_BONUS,un:{4:false,5:false,6:false}}};
  showScr('screen-mulligan');aiMulligan();
}
function aiMulligan(){
  const c=$('m-hand');c.innerHTML='';let sel=new Set();
  AI_G.me.hand.forEach(a=>{const card=artCard(a);card.onclick=()=>{if(sel.has(a.id)){sel.delete(a.id);card.classList.remove('sel')}else{if(sel.size>=2)return;sel.add(a.id);card.classList.add('sel')}$('m-count').textContent=sel.size};c.appendChild(card)});
  $('m-count').textContent=0;
  $('btn-mull-ok').onclick=()=>{AI_G.me.hand=AI_G.me.hand.filter(a=>!sel.has(a.id));for(let i=0;i<sel.size;i++)AI_G.me.hand.push(randArt());aiDeploy()};
}
function aiDeploy(){
  showScr('screen-match');
  mySlotsDraft={};
  AI_G.me.draftHand=[...AI_G.me.hand];
  $('enemy-name').textContent='🤖 AI (без рейтинга)';
  const sh=[...AI_G.en.hand].sort(()=>Math.random()-.5);
  AI_G.en.slots={1:sh[0],2:sh[1],3:sh[2]};
  AI_G.en.hand=AI_G.en.hand.filter(a=>a.id!==sh[0].id&&a.id!==sh[1].id&&a.id!==sh[2].id);
  renderFrontlineAI();renderMyHandAI();renderDeployAI();updateReady();
  $('btn-ready').textContent='ГОТОВ';
  startTimer(90,()=>autoReadyAI());
  $('btn-ready').onclick=()=>{if($('btn-ready').classList.contains('disabled'))return;stopTimer();aiBattle()};
}
function renderFrontlineAI(){const fl=$('frontline');fl.innerHTML='';for(let i=0;i<FL_SIZE;i++){const c=document.createElement('div');c.className='fc';if(i<5)c.classList.add('p1');else if(i>5)c.classList.add('p2');else c.classList.add('mid');if(i===AI_G.frontline)c.classList.add('marker');fl.appendChild(c)}$('round-num').textContent=AI_G.round}
function renderMyHandAI(){
  const h=$('hand');h.innerHTML='';
  AI_G.me.draftHand.forEach(a=>{const c=artCard(a);c.onclick=()=>{let t=null;for(let s=1;s<=3;s++){if(!mySlotsDraft[s]){t=s;break}}if(!t)for(let s=4;s<=6;s++){if(AI_G.me.un[s]&&!mySlotsDraft[s]){t=s;break}}if(!t)return;mySlotsDraft[t]=a;AI_G.me.draftHand=AI_G.me.draftHand.filter(x=>x.id!==a.id);renderDeployAI();renderMyHandAI();updateReady()};h.appendChild(c)});
  $('hand-count').textContent=AI_G.me.draftHand.length;$('hand-limit').textContent=AI_G.me.hl;
}
function renderDeployAI(){
  for(let s=1;s<=6;s++){
    const p=getSlotEl('p',s),e=getSlotEl('e',s);
    if(p){const sc=p.querySelector('.sc');sc.innerHTML='';p.classList.remove('occupied');
      if(mySlotsDraft[s]){const a=mySlotsDraft[s];const card=artCard(a);card.onclick=()=>{delete mySlotsDraft[s];AI_G.me.draftHand.push(a);renderDeployAI();renderMyHandAI();updateReady()};sc.appendChild(card);p.classList.add('occupied')}
      p.style.display=(s>=4&&!AI_G.me.un[s])?'none':'flex'}
    if(e){const sc=e.querySelector('.sc');sc.innerHTML='';if(AI_G.en.slots[s])sc.appendChild(artCard(AI_G.en.slots[s],true));e.style.display=(s>=4&&!AI_G.en.un[s])?'none':'flex'}
  }
}
function autoReadyAI(){const h=[...AI_G.me.draftHand].sort((a,b)=>pwr(b)-pwr(a));const d={};for(let s=1;s<=3;s++){if(h.length)d[s]=h.shift()}mySlotsDraft=d;aiBattle()}
async function aiBattle(){
  showScr('screen-match');
  for(let s=1;s<=6;s++){const e=getSlotEl('e',s);if(e&&AI_G.en.slots[s]){e.querySelector('.sc').innerHTML='';e.querySelector('.sc').appendChild(artCard(AI_G.en.slots[s]))}}
  await sleep(600);
  let mw=0,ew=0;const logMap={};
  for(let s=1;s<=6;s++){
    const a=mySlotsDraft[s],b=AI_G.en.slots[s];if(!a||!b)continue;
    const r=battle(a,b);logMap[s]=r;
    const pSc=getSlotEl('p',s)?.querySelector('.sc'),eSc=getSlotEl('e',s)?.querySelector('.sc');
    if(r.res==='a'){mw++;if(eSc){eSc.innerHTML='';eSc.appendChild(effectIcon('💥'))}}
    else if(r.res==='b'){ew++;if(pSc){pSc.innerHTML='';pSc.appendChild(effectIcon('💥'))}}
    else{if(pSc){pSc.innerHTML='';pSc.appendChild(effectIcon('⚖️'))}if(eSc){eSc.innerHTML='';eSc.appendChild(effectIcon('⚖️'))}}
    showBanner(`Слот ${s}: ${r.res==='a'?'ПОБЕДА':r.res==='b'?'поражение':'ничья'} (${r.pa} vs ${r.pb})`,900);
    await sleep(900);
  }
  const mySurv=[],enSurv=[];
  for(let s=1;s<=6;s++){
    const a=mySlotsDraft[s],b=AI_G.en.slots[s];
    if(a&&!b)mySurv.push(a);
    if(b&&!a)enSurv.push(b);
    if(a&&b){const r=logMap[s];
      if(r.res==='a'){const up=maybeUpgrade(a,b);mySurv.push(up||a)}
      else if(r.res==='b'){const up=maybeUpgrade(b,a);enSurv.push(up||b)}}
  }
  const myNotPlaced=AI_G.me.hand.filter(x=>!Object.values(mySlotsDraft).some(y=>y&&y.id===x.id));
  const enNotPlaced=AI_G.en.hand.filter(x=>!Object.values(AI_G.en.slots).some(y=>y&&y.id===x.id));
  AI_G.me.hand=[...myNotPlaced,...mySurv];
  AI_G.en.hand=[...enNotPlaced,...enSurv];
  let win=null,mv=0;
  if(mw>ew){win='me';mv=mw-ew>=3?2:1}else if(ew>mw){win='en';mv=ew-mw>=3?2:1}
    if(win){const dir=win==='me'?1:-1;AI_G.frontline=Math.max(0,Math.min(FL_SIZE-1,AI_G.frontline+dir*mv))}
  while(AI_G.en.hand.length<AI_G.en.hl)AI_G.en.hand.push(randArt());
  if(AI_G.frontline>=8&&!AI_G.en.un[4]){AI_G.en.un[4]=AI_G.en.un[5]=true;AI_G.en.hl=HAND6;AI_G.en.pl=HAND6+POOL_BONUS}
  if(AI_G.frontline>=9&&!AI_G.en.un[6]){AI_G.en.un[6]=true;AI_G.en.hl=HAND8;AI_G.en.pl=HAND8+POOL_BONUS}
  if(AI_G.frontline<=2&&!AI_G.me.un[4]){AI_G.me.un[4]=AI_G.me.un[5]=true;AI_G.me.hl=HAND6;AI_G.me.pl=HAND6+POOL_BONUS}
  if(AI_G.frontline<=1&&!AI_G.me.un[6]){AI_G.me.un[6]=true;AI_G.me.hl=HAND8;AI_G.me.pl=HAND8+POOL_BONUS}
  renderFrontlineAI();
  renderFrontlineAI();
  await sleep(1200);
  if(AI_G.frontline>=FL_SIZE-1||AI_G.frontline<=0||AI_G.round>MAX_ROUNDS){aiEnd();return}
  aiDraftPhase();
}
function aiDraftPhase(){
  showScr('screen-draft');
  const pool=Array.from({length:AI_G.me.pl},()=>randArt());
  const dh=$('d-hand'),dp=$('d-pool');dh.innerHTML='';dp.innerHTML='';
  let disc=new Set(),pick=new Set();
  const upd=()=>{const need=AI_G.me.hl-AI_G.me.hand.length+disc.size;
    $('d-disc').textContent=disc.size;$('d-pick').textContent=pick.size;$('d-need').textContent=Math.max(0,need);
    $('btn-draft-ok').classList.toggle('disabled',pick.size!==need)};
  AI_G.me.hand.forEach(a=>{const c=artCard(a);if(disc.has(a.id))c.classList.add('disc');
    c.onclick=()=>{if(disc.has(a.id)){disc.delete(a.id);c.classList.remove('disc')}else{disc.add(a.id);c.classList.add('disc')}upd()};dh.appendChild(c)});
  pool.forEach(a=>{const c=artCard(a);if(pick.has(a.id))c.classList.add('sel');
    c.onclick=()=>{const need=AI_G.me.hl-AI_G.me.hand.length+disc.size;
      if(pick.has(a.id)){pick.delete(a.id);c.classList.remove('sel')}else{if(pick.size>=need)return;pick.add(a.id);c.classList.add('sel')}upd()};dp.appendChild(c)});
  upd();
  $('btn-draft-ok').onclick=()=>{
    if($('btn-draft-ok').classList.contains('disabled'))return;
    stopTimer();
    AI_G.me.hand=AI_G.me.hand.filter(a=>!disc.has(a.id));
    pool.forEach(a=>{if(pick.has(a.id))AI_G.me.hand.push(a)});
    AI_G.round++;mySlotsDraft={};aiDeploy();
  };
  startTimer(60,()=>{
    let need=AI_G.me.hl-AI_G.me.hand.length;
    const sorted=[...pool].sort((a,b)=>pwr(b)-pwr(a));
    for(let i=0;i<need&&i<sorted.length;i++)AI_G.me.hand.push(sorted[i]);
    AI_G.round++;mySlotsDraft={};aiDeploy();
  });
}
function aiEnd(){const win=AI_G.frontline>5;showScr('screen-result');$('res-title').textContent=win?'🏆 ПОБЕДА!':'💀 ПОРАЖЕНИЕ';$('res-title').style.color=win?'#2ecc71':'#e94560';$('res-rating').textContent='Режим AI — рейтинг не изменяется';$('btn-to-lobby').onclick=()=>{AI_MODE=false;showScr('screen-lobby')}}

/* =====================================================
   БЛОК 19: МОДАЛКА СТИХИЙ И ИСТОРИЯ
   ===================================================== */
function showElements(){$('modal-elements').classList.add('show');const g=$('hex-grid');g.innerHTML='';HEX.forEach(k=>{const d=document.createElement('div');d.className='hx';d.innerHTML=`<span class="he">${EL[k].e[1]}</span>${EL[k].n}`;d.onclick=()=>{let h=`<b>${EL[k].n.toUpperCase()}</b><br><br>`;HEX.forEach(o=>{if(o===k)return;const r=rel(k,o);let s=r===2?'➤➤':r===1?'➤':r===-1?'◁':r===-2?'◁◁':'=';h+=`${s} ${EL[o].n}<br>`});$('el-info').innerHTML=h};g.appendChild(d)})}
async function showHistory(){showScr('screen-history');const l=$('history-list');l.innerHTML='<p>Загрузка...</p>';const h=await loadHistory();l.innerHTML=h.length?h.map(x=>`<div class="hist-item"><span class="${x.result==='win'?'win':'lose'}">${x.result==='win'?'🏆':'💀'}</span> vs ${x.opponent} | ${x.delta>0?'+':''}${x.delta}⭐ | ${new Date(x.date).toLocaleDateString()}</div>`).join(''):'<p>Пока нет матчей</p>'}

/* =====================================================
   БЛОК 20: КНОПКИ И АВТОРИЗАЦИЯ
   ===================================================== */
$('btn-login').onclick=async()=>{
  try{
    await signInWithPopup(auth,prov);
  }catch(e){
    try{await signInWithRedirect(auth,prov)}catch(e2){alert(e2.message)}
  }
};
getRedirectResult(auth).catch(e=>console.error("redirect error:",e));
$('btn-logout').onclick=async()=>{await signOut(auth)};
$('btn-battle').onclick=async()=>{
  if(IS_SEARCHING)return;IS_SEARCHING=true;
  $('btn-battle').style.display='none';$('btn-searching').style.display='block';
  showScr('screen-wait');$('wait-text').textContent="🔍 Поиск соперника...";
  const id=await findMatch();
  if(id){MATCH_ID=id;UNSUB=listenMatch(id)}
  else{IS_SEARCHING=false;$('btn-battle').style.display='block';$('btn-searching').style.display='none';showScr('screen-lobby')}
};
$('btn-searching').onclick=()=>{IS_SEARCHING=false;cleanup();$('btn-battle').style.display='block';$('btn-searching').style.display='none';showScr('screen-lobby')};
$('btn-ai').onclick=startAI;
$('btn-elements').onclick=showElements;
$('btn-el-close').onclick=()=>$('modal-elements').classList.remove('show');
$('btn-history').onclick=showHistory;
$('btn-hist-back').onclick=()=>showScr('screen-lobby');

onAuthStateChanged(auth,async user=>{
  if(user){USER=user;PROFILE=await saveProfile(user);$('lobby-name').textContent=PROFILE.name;$('lobby-rating').textContent=PROFILE.ratings?.PYRAMID||1000;showScr('screen-lobby')}
  else{USER=null;PROFILE=null;showScr('screen-login')}
});
