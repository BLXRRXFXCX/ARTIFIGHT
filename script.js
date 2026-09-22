import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============ FIREBASE CONFIG ============
const firebaseConfig = {
  apiKey: "AIzaSyCu2Rha5D4S3Nu7A7W1s9BTd236Bm6vZg8",
  authDomain: "artifight.firebaseapp.com",
  projectId: "artifight",
  storageBucket: "artifight.firebasestorage.app",
  messagingSenderId: "29733165895",
  appId: "1:29733165895:web:5e16ad71eeb97cb6498a62"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ============ КОНСТАНТЫ ИГРЫ ============
const ELEMENTS = {
  fire:   { name: "Огонь",   emojis: ["🕯️", "🔥", "🌋"] },
  water:  { name: "Вода",    emojis: ["💧", "🌊", "🐋"] },
  earth:  { name: "Земля",   emojis: ["🪨", "⛰️", "💎"] },
  air:    { name: "Воздух",  emojis: ["💨", "🌬️", "🌪️"] },
  nature: { name: "Природа", emojis: ["🌱", "🌿", "🌳"] },
  metal:  { name: "Металл",  emojis: ["🔩", "⚙️", "🛡️"] }
};

// Порядок в шестиугольнике для контр-системы
const HEX_ORDER = ["fire", "metal", "nature", "air", "water", "earth"];

const FRONTLINE_SIZE = 11; // 11 клеток линии рубежей
const START_HAND_SIZE = 5;
const START_POOL_SIZE = 8;
const MATCH_ROUNDS_TO_DRAW = 20; // После 20 раундов — внезапная смерть

// ============ СОСТОЯНИЕ ИГРЫ ============
let currentUser = null;
let userProfile = null;
let matchState = null;

// ============ УТИЛИТЫ ============
function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ ЛОГИКА СТИХИЙ И БОЯ ============

// Возвращает отношение attacker к defender: +2, +1, 0, -1, -2
function getRelation(attacker, defender) {
    if (attacker === defender) return 0;
    const aIdx = HEX_ORDER.indexOf(attacker);
    const dIdx = HEX_ORDER.indexOf(defender);
    const dist = (dIdx - aIdx + HEX_ORDER.length) % HEX_ORDER.length;
    
    switch(dist) {
        case 0: return 0;
        case 1: return 1;
        case 2: return 2;
        case 3: return 0;
        case 4: return -2;
        case 5: return -1;
        default: return 0;
    }
}

// Вычисляет силу артефакта
function getPower(artifact) {
    return artifact.level + (artifact.veteran ? 1 : 0);
}

// Бой двух артефактов
function battle(a, b) {
    const relA = getRelation(a.elementKey, b.elementKey);
    const relB = getRelation(b.elementKey, a.elementKey);
    
    const bonusA = relA > 0 ? relA : 0;
    const bonusB = relB > 0 ? relB : 0;
    
    const powerA = getPower(a) + bonusA;
    const powerB = getPower(b) + bonusB;
    
    let result;
    if (powerA > powerB) result = 'a';
    else if (powerB > powerA) result = 'b';
    else result = 'draw';
    
    return {
        result,
        powerA,
        powerB,
        bonusA,
        bonusB,
        relation: relA
    };
}

// ============ ГЕНЕРАЦИЯ АРТЕФАКТОВ ============

function rollLevel() {
    const r = Math.random() * 100;
    if (r < 60) return 1;
    if (r < 90) return 2;
    return 3;
}

function generateArtifact() {
    const keys = Object.keys(ELEMENTS);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const level = rollLevel();
    return {
        id: uid(),
        elementKey: key,
        name: ELEMENTS[key].name,
        emoji: ELEMENTS[key].emojis[level - 1],
        level: level,
        veteran: false,
        upgraded: false
    };
}

function generateHand(count) {
    const hand = [];
    for (let i = 0; i < count; i++) hand.push(generateArtifact());
    return hand;
}

function generatePool(count) {
    return generateHand(count);
}

// ============ РЕНДЕР АРТЕФАКТОВ ============

function renderArtifactCard(artifact, options = {}) {
    const card = document.createElement('div');
    card.className = 'artifact-card';
    card.dataset.id = artifact.id;
    card.dataset.element = artifact.elementKey;
    
    if (options.facedown) {
        card.classList.add('facedown');
    } else {
        let stars = '';
        for (let i = 0; i < artifact.level; i++) stars += '★';
        if (artifact.veteran) stars += '⭐';
        
        card.innerHTML = `
            <div class="art-emoji">${artifact.emoji}</div>
            <div class="art-name">${artifact.name}</div>
            <div class="art-stars">${stars}</div>
        `;
        
        if (artifact.upgraded) {
            card.classList.add('upgraded');
        }
    }
    
    return card;
}

// ============ УПРАВЛЕНИЕ ЭКРАНАМИ ============

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function showInfo(text, duration = 2000) {
    const banner = document.getElementById('info-banner');
    banner.textContent = text;
    banner.classList.add('show');
    if (duration > 0) {
        setTimeout(() => banner.classList.remove('show'), duration);
    }
}

// ============ FIREBASE ЛОГИКА ============

async function saveUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName || "Игрок",
            email: user.email,
            photoURL: user.photoURL,
            ratings: { CLASSIC: 1000 },
            stats: { CLASSIC: { wins: 0, losses: 0 } },
            createdAt: Date.now()
        });
    }
    const freshSnap = await getDoc(userRef);
    return freshSnap.data();
}

async function updateRating(delta) {
    if (!currentUser) return;
    const newRating = Math.max(0, (userProfile.ratings.CLASSIC || 1000) + delta);
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, { "ratings.CLASSIC": newRating });
    userProfile.ratings.CLASSIC = newRating;
    return newRating;
}

async function updateStats(win) {
    if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    const field = win ? "stats.CLASSIC.wins" : "stats.CLASSIC.losses";
    const current = (userProfile.stats?.CLASSIC?.[win ? 'wins' : 'losses']) || 0;
    await updateDoc(userRef, { [field]: current + 1 });
}

// ============ ЛОГИКА МАТЧА ============

function initMatch() {
    matchState = {
        round: 1,
        phase: 'mulligan', // mulligan, deployment, battle, draft, suddenDeath
        frontline: 5, // 0-10, центр = 5
        matchball: { player: false, ai: false },
        player: {
            hand: [],
            pool: [],
            slots: { 1: null, 2: null, 3: null },
            handLimit: START_HAND_SIZE,
            poolSize: START_POOL_SIZE
        },
        ai: {
            hand: [],
            pool: [],
            slots: { 1: null, 2: null, 3: null },
            handLimit: START_HAND_SIZE,
            poolSize: START_POOL_SIZE
        }
    };
    
    // Генерируем общий пул для стартовой руки (одинаковая у обоих)
    const startingHand = generateHand(START_HAND_SIZE);
    matchState.player.hand = JSON.parse(JSON.stringify(startingHand));
    matchState.ai.hand = JSON.parse(JSON.stringify(startingHand));
    
    renderFrontline();
    renderBattlefield();
    startMulliganPhase();
}

function renderFrontline() {
    const fl = document.getElementById('frontline');
    fl.innerHTML = '';
    
    for (let i = 0; i < FRONTLINE_SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'front-cell';
        
        if (i < 5) cell.classList.add('p1-side');
        else if (i > 5) cell.classList.add('p2-side');
        else cell.classList.add('center');
        
        if (i === matchState.frontline) {
            cell.classList.add('marker');
        }
        
        fl.appendChild(cell);
    }
    
    document.getElementById('p1-score').textContent = `Ты`;
    document.getElementById('p2-score').textContent = `AI`;
}

function renderBattlefield() {
    // Очищаем слоты
    document.querySelectorAll('.slot-content').forEach(sc => sc.innerHTML = '');
    
    // Рендерим слоты игрока
    for (let s = 1; s <= 3; s++) {
        const slot = document.querySelector(`.player-slot[data-slot="${s}"] .slot-content`);
        if (matchState.player.slots[s]) {
            const card = renderArtifactCard(matchState.player.slots[s]);
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                // Возврат артефакта в руку
                matchState.player.hand.push(matchState.player.slots[s]);
                matchState.player.slots[s] = null;
                renderBattlefield();
                renderPlayerHand();
                updateConfirmButton();
            });
            slot.appendChild(card);
            document.querySelector(`.player-slot[data-slot="${s}"]`).classList.add('occupied');
        } else {
            document.querySelector(`.player-slot[data-slot="${s}"]`).classList.remove('occupied');
        }
    }
    
    // Слоты AI (скрыты)
    for (let s = 1; s <= 3; s++) {
        const slot = document.querySelector(`.enemy-slots .slot[data-slot="${s}"] .slot-content`);
        if (matchState.ai.slots[s]) {
            const card = renderArtifactCard(matchState.ai.slots[s], { facedown: true });
            slot.appendChild(card);
        }
    }
}

function renderPlayerHand() {
    const container = document.getElementById('hand-cards');
    container.innerHTML = '';
    
    matchState.player.hand.forEach(art => {
        const card = renderArtifactCard(art);
        card.addEventListener('click', () => placeArtifact(art));
        container.appendChild(card);
    });
}

function placeArtifact(artifact) {
    if (matchState.phase !== 'deployment') return;
    
    // Ищем первый пустой слот
    let targetSlot = null;
    for (let s = 1; s <= 3; s++) {
        if (!matchState.player.slots[s]) {
            targetSlot = s;
            break;
        }
    }
    
    if (!targetSlot) {
        showInfo('Все слоты заняты! Нажми на артефакт в слоте, чтобы вернуть его в руку.');
        return;
    }
    
    matchState.player.slots[targetSlot] = artifact;
    matchState.player.hand = matchState.player.hand.filter(a => a.id !== artifact.id);
    
    renderBattlefield();
    renderPlayerHand();
    updateConfirmButton();
}

function updateConfirmButton() {
    const btn = document.getElementById('confirm-btn');
    const allFilled = matchState.player.slots[1] && matchState.player.slots[2] && matchState.player.slots[3];
    btn.disabled = !allFilled;
}

// ============ ФАЗА МУЛЛИГАНА ============

function startMulliganPhase() {
    showScreen('mulligan-screen');
    matchState.phase = 'mulligan';
    
    const container = document.getElementById('mulligan-hand');
    container.innerHTML = '';
    let selectedForMulligan = new Set();
    
    matchState.player.hand.forEach(art => {
        const card = renderArtifactCard(art);
        card.addEventListener('click', () => {
            if (selectedForMulligan.has(art.id)) {
                selectedForMulligan.delete(art.id);
                card.classList.remove('selected');
            } else {
                if (selectedForMulligan.size >= 2) {
                    showInfo('Максимум 2 замены!');
                    return;
                }
                selectedForMulligan.add(art.id);
                card.classList.add('selected');
            }
            document.getElementById('mulligan-count').textContent = selectedForMulligan.size;
        });
        container.appendChild(card);
    });
    
    document.getElementById('mulligan-count').textContent = 0;
    
    document.getElementById('mulligan-confirm').onclick = () => {
        // Заменяем выбранные на новые случайные
        const newHand = matchState.player.hand.filter(a => !selectedForMulligan.has(a.id));
        const replacements = generateHand(selectedForMulligan.size);
        matchState.player.hand = [...newHand, ...replacements];
        
        // AI тоже делает мulligan случайным образом (0-2 карты)
        const aiMulliganCount = Math.floor(Math.random() * 3);
        const aiDiscarded = matchState.ai.hand.splice(0, aiMulliganCount);
        const aiReplacements = generateHand(aiMulliganCount);
        matchState.ai.hand = [...matchState.ai.hand, ...aiReplacements];
        
        startDeploymentPhase();
    };
}

// ============ ФАЗА РАССТАНОВКИ ============

function startDeploymentPhase() {
    showScreen('match-screen');
    matchState.phase = 'deployment';
    
    // AI расставляет свои артефакты случайно
    aiDeployRandomly();
    
    renderPlayerHand();
    renderBattlefield();
    
    document.getElementById('confirm-btn').onclick = () => {
        if (!matchState.player.slots[1] || !matchState.player.slots[2] || !matchState.player.slots[3]) {
            showInfo('Заполни все 3 слота!');
            return;
        }
        startBattlePhase();
    };
    
    updateConfirmButton();
    showInfo(`Раунд ${matchState.round}. Расставь 3 артефакта по слотам.`, 3000);
}

function aiDeployRandomly() {
    // AI перемешивает руку и ставит первые 3
    const shuffled = [...matchState.ai.hand].sort(() => Math.random() - 0.5);
    matchState.ai.slots[1] = shuffled[0];
    matchState.ai.slots[2] = shuffled[1];
    matchState.ai.slots[3] = shuffled[2];
    
    // Удаляем из руки
    matchState.ai.hand = matchState.ai.hand.filter(a => 
        a.id !== shuffled[0].id && a.id !== shuffled[1].id && a.id !== shuffled[2].id
    );
}

// ============ ФАЗА БОЯ ============

async function startBattlePhase() {
    matchState.phase = 'battle';
    document.getElementById('confirm-btn').disabled = true;
    
    // Открываем слоты AI
    for (let s = 1; s <= 3; s++) {
        const slot = document.querySelector(`.enemy-slots .slot[data-slot="${s}"] .slot-content`);
        slot.innerHTML = '';
        if (matchState.ai.slots[s]) {
            const card = renderArtifactCard(matchState.ai.slots[s]);
            card.classList.add('fade-in');
            slot.appendChild(card);
        }
    }
    
    await sleep(1000);
    
    let playerWins = 0;
    let aiWins = 0;
    let draws = 0;
    
    // Бой по каждому слоту
    for (let s = 1; s <= 3; s++) {
        const playerArt = matchState.player.slots[s];
        const aiArt = matchState.ai.slots[s];
        
        if (!playerArt || !aiArt) continue;
        
        const result = battle(playerArt, aiArt);
        
        // Анимация
        const playerSlot = document.querySelector(`.player-slot[data-slot="${s}"] .slot-content`);
        const aiSlot = document.querySelector(`.enemy-slots .slot[data-slot="${s}"] .slot-content`);
        
        playerSlot.firstChild.classList.add('attacking-right');
        aiSlot.firstChild.classList.add('attacking-left');
        await sleep(500);
        
        if (result.result === 'a') {
            aiSlot.firstChild.classList.add('damaged');
            playerWins++;
            showInfo(`Слот ${s}: Твой ${playerArt.name} побеждает! (${result.powerA} vs ${result.powerB})`, 1500);
            await sleep(800);
            aiSlot.innerHTML = '<div style="color:#e94560;font-size:24px">💥</div>';
            // Проверка прокачки (не в CLASSIC, но для будущего)
        } else if (result.result === 'b') {
            playerSlot.firstChild.classList.add('damaged');
            aiWins++;
            showInfo(`Слот ${s}: AI ${aiArt.name} побеждает! (${result.powerB} vs ${result.powerA})`, 1500);
            await sleep(800);
            playerSlot.innerHTML = '<div style="color:#e94560;font-size:24px">💥</div>';
        } else {
            draws++;
            showInfo(`Слот ${s}: Ничья! (${result.powerA} vs ${result.powerB})`, 1500);
            await sleep(800);
            playerSlot.innerHTML = '<div style="color:#888;font-size:24px">⚖️</div>';
            aiSlot.innerHTML = '<div style="color:#888;font-size:24px">⚖️</div>';
        }
        
        await sleep(500);
    }
    
    // Результат раунда
    await sleep(1000);
    
    let roundWinner = null;
    let frontlineMove = 0;
    
    if (playerWins > aiWins) {
        roundWinner = 'player';
        frontlineMove = playerWins === 3 ? 2 : 1; // Прорыв при 3:0
    } else if (aiWins > playerWins) {
        roundWinner = 'ai';
        frontlineMove = aiWins === 3 ? 2 : 1;
    }
    
    if (roundWinner) {
        await moveFrontline(roundWinner, frontlineMove);
    } else {
        showInfo('Раунд ничейный!', 2000);
        await sleep(2000);
    }
    
    // Проверка конца матча
    if (await checkMatchEnd()) return;
    
    // Фаза добора
    startDraftPhase();
}

async function moveFrontline(winner, amount) {
    const direction = winner === 'player' ? 1 : -1; // player двигается вправо (к AI)
    
    for (let i = 0; i < amount; i++) {
        const newPos = matchState.frontline + direction;
        
        // Проверка финального рубежа
        if (newPos >= FRONTLINE_SIZE) {
            // Проверка матчбола AI
            if (!matchState.matchball.ai) {
                matchState.matchball.ai = true;
                showInfo('🔥 МАТЧБОЛ! AI получает последний шанс!', 3000);
                matchState.frontline = FRONTLINE_SIZE - 1;
                renderFrontline();
                await sleep(3000);
            } else {
                matchState.frontline = FRONTLINE_SIZE - 1;
                renderFrontline();
                return;
            }
        } else if (newPos < 0) {
            // Проверка матчбола игрока
            if (!matchState.matchball.player) {
                matchState.matchball.player = true;
                showInfo('🔥 МАТЧБОЛ! Ты получаешь последний шанс!', 3000);
                matchState.frontline = 0;
                renderFrontline();
                await sleep(3000);
            } else {
                matchState.frontline = 0;
                renderFrontline();
                return;
            }
        } else {
            matchState.frontline = newPos;
            renderFrontline();
            await sleep(400);
        }
    }
    
    const msg = winner === 'player' 
        ? `Ты продвинул фронт на ${amount}!${amount===2?' ПРОРЫВ!':''}`
        : `AI продвинул фронт на ${amount}!${amount===2?' ПРОРЫВ!':''}`;
    showInfo(msg, 2000);
    await sleep(2000);
}

async function checkMatchEnd() {
    // Победа на финальном рубеже
    if (matchState.frontline >= FRONTLINE_SIZE - 1 && matchState.matchball.ai) {
        await endMatch('player');
        return true;
    }
    if (matchState.frontline <= 0 && matchState.matchball.player) {
        await endMatch('ai');
        return true;
    }
    
    // Проверка выхода за пределы после матчбола
    if (matchState.frontline >= FRONTLINE_SIZE) {
        await endMatch('player');
        return true;
    }
    if (matchState.frontline < 0) {
        await endMatch('ai');
        return true;
    }
    
    // Внезапная смерть
    if (matchState.round >= MATCH_ROUNDS_TO_DRAW) {
        showInfo('⚡ ВНЕЗАПНАЯ СМЕРТЬ! Следующий победитель раунда выигрывает!', 3000);
        await sleep(3000);
    }
    
    return false;
}

async function endMatch(winner) {
    showScreen('result-screen');
    const isWin = winner === 'player';
    
    let delta = isWin ? 20 : -20; // Упрощенно
    const newRating = await updateRating(delta);
    await updateStats(isWin);
    
    document.getElementById('result-title').textContent = isWin ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
    document.getElementById('result-title').style.color = isWin ? '#2ecc71' : '#e94560';
    document.getElementById('result-rating').textContent = 
        `${delta > 0 ? '+' : ''}${delta} рейтинга (новый: ${newRating})`;
    
    document.getElementById('back-to-lobby').onclick = () => {
        showScreen('lobby-screen');
        document.getElementById('player-rating').textContent = newRating;
    };
}

// ============ ФАЗА ДОБОРА ============

function startDraftPhase() {
    matchState.phase = 'draft';
    showScreen('draft-screen');
    
    // Возвращаем выжившие артефакты в руку (все, что в слотах)
    for (let s = 1; s <= 3; s++) {
        if (matchState.player.slots[s]) {
            matchState.player.hand.push(matchState.player.slots[s]);
            matchState.player.slots[s] = null;
        }
        if (matchState.ai.slots[s]) {
            matchState.ai.hand.push(matchState.ai.slots[s]);
            matchState.ai.slots[s] = null;
        }
    }
    
    // Генерируем пул (одинаковый для обоих, с возможностью дублей)
    const sharedPool = generatePool(matchState.player.poolSize);
    matchState.player.pool = JSON.parse(JSON.stringify(sharedPool));
    matchState.ai.pool = JSON.parse(JSON.stringify(sharedPool));
    
    renderDraftPhase();
}

function renderDraftPhase() {
    const handContainer = document.getElementById('draft-hand');
    const poolContainer = document.getElementById('draft-pool');
    handContainer.innerHTML = '';
    poolContainer.innerHTML = '';
    
    let selectedDiscards = new Set();
    let selectedPicks = new Set();
    
    const updateStatus = () => {
        const needed = matchState.player.handLimit - matchState.player.hand.length + selectedDiscards.size;
        document.getElementById('discard-count').textContent = selectedDiscards.size;
        document.getElementById('pick-count').textContent = selectedPicks.size;
        document.getElementById('pick-needed').textContent = Math.max(0, needed);
        
        const confirmBtn = document.getElementById('draft-confirm');
        confirmBtn.disabled = selectedPicks.size !== needed;
    };
    
    // Рендерим руку
    matchState.player.hand.forEach(art => {
        const card = renderArtifactCard(art);
        if (selectedDiscards.has(art.id)) card.classList.add('discard');
        card.addEventListener('click', () => {
            if (selectedDiscards.has(art.id)) {
                selectedDiscards.delete(art.id);
                card.classList.remove('discard');
            } else {
                selectedDiscards.add(art.id);
                card.classList.add('discard');
            }
            updateStatus();
        });
        handContainer.appendChild(card);
    });
    
    // Рендерим пул
    matchState.player.pool.forEach(art => {
        const card = renderArtifactCard(art);
        if (selectedPicks.has(art.id)) card.classList.add('selected');
        card.addEventListener('click', () => {
            if (selectedPicks.has(art.id)) {
                selectedPicks.delete(art.id);
                card.classList.remove('selected');
            } else {
                const needed = matchState.player.handLimit - matchState.player.hand.length + selectedDiscards.size;
                if (selectedPicks.size >= needed) {
                    showInfo(`Ты уже взял максимум!`);
                    return;
                }
                selectedPicks.add(art.id);
                card.classList.add('selected');
            }
            updateStatus();
        });
        poolContainer.appendChild(card);
    });
    
    updateStatus();
    
    document.getElementById('draft-confirm').onclick = () => {
        // Удаляем сброшенные
        matchState.player.hand = matchState.player.hand.filter(a => !selectedDiscards.has(a.id));
        // Добавляем взятые
        matchState.player.pool.forEach(art => {
            if (selectedPicks.has(art.id)) {
                matchState.player.hand.push(art);
            }
        });
        
        // AI делает добор
        aiDraftRandomly();
        
        matchState.round++;
        startDeploymentPhase();
    };
}

function aiDraftRandomly() {
    // AI случайно сбрасывает 0-2 артефакта и добирает до лимита
    const discardCount = Math.floor(Math.random() * 3);
    for (let i = 0; i < discardCount && matchState.ai.hand.length > 1; i++) {
        const idx = Math.floor(Math.random() * matchState.ai.hand.length);
        matchState.ai.hand.splice(idx, 1);
    }
    
    const needed = matchState.ai.handLimit - matchState.ai.hand.length;
    const available = [...matchState.ai.pool].sort(() => Math.random() - 0.5);
    for (let i = 0; i < needed && i < available.length; i++) {
        matchState.ai.hand.push(available[i]);
    }
}

// ============ ШЕСТИУГОЛЬНИК СТИХИЙ ============

function showElementsModal() {
    const modal = document.getElementById('elements-modal');
    modal.classList.add('show');
    
    const display = document.getElementById('hexagon-display');
    display.innerHTML = '';
    
    HEX_ORDER.forEach(key => {
        const el = ELEMENTS[key];
        const div = document.createElement('div');
        div.className = 'hex-element';
        div.innerHTML = `
            <span class="hex-element-emoji">${el.emojis[1]}</span>
            ${el.name}
        `;
        div.addEventListener('click', () => showElementInfo(key));
        display.appendChild(div);
    });
    
    showElementInfo('fire');
    
    document.getElementById('close-elements').onclick = () => {
        modal.classList.remove('show');
    };
}

function showElementInfo(key) {
    const info = document.getElementById('element-info');
    let html = `<b>${ELEMENTS[key].name.toUpperCase()}</b><br><br>`;
    
    HEX_ORDER.forEach(otherKey => {
        if (otherKey === key) return;
        const rel = getRelation(key, otherKey);
        let symbol = '';
        if (rel === 2) symbol = '➤➤';
        else if (rel === 1) symbol = '➤';
        else if (rel === -1) symbol = '◁';
        else if (rel === -2) symbol = '◁◁';
        else symbol = '=';
        
        html += `${symbol} ${ELEMENTS[otherKey].name}<br>`;
    });
    
    info.innerHTML = html;
}

// ============ АВТОРИЗАЦИЯ ============

document.getElementById('login-btn').addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        await saveUserProfile(result.user);
    } catch (error) {
        alert("Ошибка входа: " + error.message);
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut(auth);
});

document.getElementById('play-btn').addEventListener('click', () => {
    showScreen('match-screen');
    initMatch();
});

document.getElementById('elements-btn').addEventListener('click', showElementsModal);

// ============ ИНИЦИАЛИЗАЦИЯ ============

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            userProfile = await saveUserProfile(user);
            document.getElementById('player-name').textContent = userProfile.name;
            document.getElementById('player-rating').textContent = userProfile.ratings?.CLASSIC || 1000;
            showScreen('lobby-screen');
        } catch (error) {
            console.error("Ошибка загрузки профиля:", error);
            // Если не удалось загрузить профиль, показываем лобби с базовыми данными
            document.getElementById('player-name').textContent = user.displayName || 'Игрок';
            document.getElementById('player-rating').textContent = '1000';
            showScreen('lobby-screen');
        }
    } else {
        currentUser = null;
        userProfile = null;
        showScreen('login-screen');
    }
});
