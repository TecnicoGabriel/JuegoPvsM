const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --------------------------------------------------------
// 1. CONFIGURACIÓN DE FIREBASE
// --------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCfwpnyqtXnnVwx1Mm2k9MTm-laCdQ13Xo",
  authDomain: "juego-padrastro.firebaseapp.com",
  databaseURL: "https://juego-padrastro-default-rtdb.firebaseio.com",
  projectId: "juego-padrastro",
  storageBucket: "juego-padrastro.firebasestorage.app",
  messagingSenderId: "805890459882",
  appId: "1:805890459882:web:8104f3e63b274cdb8a6f93"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Guardar Puntos
function saveHighscore(name, score) {
    // Guardar en la base de datos
    db.ref('scores').push({
        name: name,
        score: score,
        date: Date.now()
    });
}

// Cargar Tabla
function loadLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if(!list) return; // Si no existe la lista, no hacer nada
    list.innerHTML = '<li>Cargando...</li>';

    db.ref('scores').orderByChild('score').limitToLast(10).once('value', (snapshot) => {
        list.innerHTML = ''; 
        let scores = [];
        
        snapshot.forEach((child) => {
            scores.push(child.val());
        });

        // Ordenar de mayor a menor
        scores.sort((a, b) => b.score - a.score);

        if (scores.length === 0) {
            list.innerHTML = '<li>Sé el primero en jugar</li>';
            return;
        }

        scores.forEach((s, index) => {
            const li = document.createElement('li');
            // Estilo directo para asegurar que se vea bien
            li.style.borderBottom = "1px solid #333";
            li.style.padding = "5px";
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.color = index === 0 ? "#ffd700" : "white"; // Dorado al primero

            let rank = index + 1;
            if (rank === 1) rank = "🥇";
            else if (rank === 2) rank = "🥈";
            else if (rank === 3) rank = "🥉";
            else rank = `#${rank}`;

            li.innerHTML = `<span>${rank} ${s.name}</span> <span>${s.score}</span>`;
            list.appendChild(li);
        });
    });
}

// --------------------------------------------------------
// 2. AUDIO Y RECURSOS
// --------------------------------------------------------
const bgMusic = document.getElementById('bgMusic');
const volSliderStart = document.getElementById('volSlider');
const volSliderPause = document.getElementById('pauseVolSlider');

const playlist = [
    'assets/sounds/track1.mp3', 'assets/sounds/track2.mp3', 'assets/sounds/track3.mp3',
    'assets/sounds/track4.mp3', 'assets/sounds/track5.mp3', 'assets/sounds/track6.mp3',
    'assets/sounds/track7.mp3', 'assets/sounds/track8.mp3', 'assets/sounds/track9.mp3',
    'assets/sounds/track10.mp3'
];

function playRandomMusic() {
    const randomIndex = Math.floor(Math.random() * playlist.length);
    bgMusic.src = playlist[randomIndex];
    bgMusic.play().catch(e => console.log("Click para audio..."));
}

function updateVolume(val) {
    bgMusic.volume = val;
    if(volSliderStart) volSliderStart.value = val;
    if(volSliderPause) volSliderPause.value = val;
}
if(volSliderStart) volSliderStart.addEventListener('input', e => updateVolume(e.target.value));
if(volSliderPause) volSliderPause.addEventListener('input', e => updateVolume(e.target.value));
updateVolume(0.5);

const images = {
    p1: new Image(), p2: new Image(),
    enemy: new Image(), shooter: new Image(), boss: new Image(),
    bulletP: new Image(), bulletE: new Image(),
    powerDouble: new Image(), powerSpread: new Image(), powerHealth: new Image()
};

images.p1.src = 'assets/images/jugador.png';
images.p2.src = 'assets/images/jugador2.png';
images.enemy.src = 'assets/images/enemigo_base.png';
images.shooter.src = 'assets/images/enemigo_shooter.png';
images.boss.src = 'assets/images/jefe.png';
images.bulletP.src = 'assets/images/corazon.png';
images.bulletE.src = 'assets/images/bala_enemiga.png';
images.powerDouble.src = 'assets/images/poder_arma.png';
images.powerSpread.src = 'assets/images/poder_spread.png';
images.powerHealth.src = 'assets/images/poder_vida.png';

// --------------------------------------------------------
// 3. VARIABLES DE ESTADO
// --------------------------------------------------------
let gameRunning = false;
let isPaused = false;
let mode = 1; 
let score = 0;
let frames = 0;
let bossActive = false;
let nextBossThreshold = 1000;

let players = [];
let enemies = [];
let projectiles = [];
let enemyProjectiles = [];
let powerups = [];
const keys = {}; 

let touchX = null;
let touchY = null;
let isTouching = false;
let scaleFactor = 1; 

// 🔥 CORRECCIÓN: Variable GLOBAL para el nombre 🔥
let currentPlayerName = "Jugador"; 

// --- 4. CONFIGURACIÓN ---
function resize() { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight;
    scaleFactor = Math.min(canvas.width / 500, 1.5);
    if (scaleFactor < 0.6) scaleFactor = 0.6; 
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Escape' && gameRunning) togglePause();
});
window.addEventListener('keyup', e => keys[e.code] = false);

window.addEventListener('touchstart', e => {
    if(gameRunning && !isPaused) { isTouching = true; touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }
}, {passive: false});
window.addEventListener('touchmove', e => {
    if(gameRunning && !isPaused) { e.preventDefault(); isTouching = true; touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }
}, {passive: false});
window.addEventListener('touchend', () => { isTouching = false; touchX = null; touchY = null; });

const p1Upload = document.getElementById('p1Upload');
const p2Upload = document.getElementById('p2Upload');
if(p1Upload) p1Upload.onchange = e => loadUserImg(e, images.p1);
if(p2Upload) p2Upload.onchange = e => loadUserImg(e, images.p2);

function loadUserImg(e, targetImg) {
    const reader = new FileReader();
    reader.onload = event => targetImg.src = event.target.result;
    reader.readAsDataURL(e.target.files[0]);
}

window.setMode = function(n) {
    mode = n;
    document.getElementById('btn1P').className = n === 1 ? 'active' : '';
    document.getElementById('btn2P').className = n === 2 ? 'active' : '';
    document.getElementById('p2Setup').classList.toggle('hidden', n === 1);
}

window.togglePause = function() {
    isPaused = !isPaused;
    const pauseScreen = document.getElementById('pauseScreen');
    if (isPaused) {
        pauseScreen.classList.remove('hidden'); bgMusic.pause(); 
    } else {
        pauseScreen.classList.add('hidden'); bgMusic.play(); loop();
    }
}

// --- 5. CLASES ---
class Player {
    constructor(id, x, img, controls) {
        this.id = id;
        this.w = 60 * scaleFactor; 
        this.h = 60 * scaleFactor;
        this.x = x; 
        this.y = canvas.height - (this.h * 2);
        this.img = img;
        this.hp = 100;
        this.controls = controls; 
        this.weaponLevel = 1; 
        this.cadence = 300; 
        this.lastShot = 0;
    }

    update() {
        if (this.hp <= 0) return;
        if (keys[this.controls.left] && this.x > 0) this.x -= 7;
        if (keys[this.controls.right] && this.x < canvas.width - this.w) this.x += 7;
        if (keys[this.controls.up] && this.y > 0) this.y -= 7;
        if (keys[this.controls.down] && this.y < canvas.height - this.h) this.y += 7;
        
        if (this.id === 1 && isTouching && touchX !== null && touchY !== null) {
            this.x = touchX - (this.w / 2); 
            this.y = touchY - (this.h / 2);
            const now = Date.now();
            if (now - this.lastShot > this.cadence) { this.shoot(); this.lastShot = now; }
        }

        if (this.x < 0) this.x = 0;
        if (this.x > canvas.width - this.w) this.x = canvas.width - this.w;
        if (this.y < 0) this.y = 0;
        if (this.y > canvas.height - this.h) this.y = canvas.height - this.h;

        if (keys[this.controls.shoot]) {
            const now = Date.now();
            if (now - this.lastShot > this.cadence) { this.shoot(); this.lastShot = now; }
        }
    }

    shoot() {
        const bSize = 20 * scaleFactor;
        if (this.weaponLevel === 1) {
            projectiles.push({x: this.x + this.w/2 - bSize/2, y: this.y, vx: 0, vy: -10, w: bSize, h: bSize, img: images.bulletP});
        } else if (this.weaponLevel === 2) { 
            projectiles.push({x: this.x, y: this.y, vx: 0, vy: -10, w: bSize, h: bSize, img: images.bulletP});
            projectiles.push({x: this.x + this.w, y: this.y, vx: 0, vy: -10, w: bSize, h: bSize, img: images.bulletP});
        } else if (this.weaponLevel >= 3) { 
            projectiles.push({x: this.x + this.w/2, y: this.y, vx: 0, vy: -10, w: bSize, h: bSize, img: images.bulletP});
            projectiles.push({x: this.x + this.w/2, y: this.y, vx: -3, vy: -9, w: bSize, h: bSize, img: images.bulletP});
            projectiles.push({x: this.x + this.w/2, y: this.y, vx: 3, vy: -9, w: bSize, h: bSize, img: images.bulletP});
        }
    }
    
    upgradeWeapon(type) {
        if (type === 'powerDouble') this.weaponLevel = 2; 
        else if (type === 'powerSpread') this.weaponLevel = 3; 
    }

    draw() {
        if (this.hp <= 0) return;
        ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
        ctx.fillStyle = 'red'; ctx.fillRect(this.x, this.y + this.h + 5, this.w, 5);
        ctx.fillStyle = '#0f0'; ctx.fillRect(this.x, this.y + this.h + 5, this.w * (this.hp/100), 5);
    }
}

class Entity { 
    constructor(type) {
        this.type = type;
        this.markedForDeletion = false;
        
        const speedMultiplier = 1 + (Math.floor(score / 200) * 0.3);
        
        if (type === 'boss') {
            this.w = 200 * scaleFactor; 
            this.h = 200 * scaleFactor;
            this.maxHp = 50 + (score * 0.05); // BOSS 50 HP
            this.hp = this.maxHp;
            this.img = images.boss;
            this.x = canvas.width/2 - (this.w/2); 
            this.y = -this.h; 
            this.vx = 3 * (Math.random() < 0.5 ? 1 : -1); 
            this.vy = 2; 
        } else if (type.startsWith('power')) {
            this.w = 40 * scaleFactor; this.h = 40 * scaleFactor;
            this.y = -this.h; this.x = Math.random() * (canvas.width - this.w);
            this.vy = 3;
            if(type === 'powerHealth') this.img = images.powerHealth;
            if(type === 'powerDouble') this.img = images.powerDouble;
            if(type === 'powerSpread') this.img = images.powerSpread;
        } else {
            this.w = 50 * scaleFactor; 
            this.h = 50 * scaleFactor;
            this.x = Math.random() * (canvas.width - this.w);
            this.y = -this.h;
            this.hp = type === 'shooter' ? 3 : 1;
            this.img = type === 'shooter' ? images.shooter : images.enemy;
            let baseSpeed = (Math.random() * 1.5 + 1.5);
            this.vy = baseSpeed * speedMultiplier; 
        }
    }

    update() {
        if (this.type === 'boss') {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x <= 0 || this.x + this.w >= canvas.width) this.vx *= -1;
            if (this.y >= canvas.height / 2) this.vy = -Math.abs(this.vy); 
            if (this.y <= 0 && this.vy < 0) this.vy = Math.abs(this.vy); 
            
            let damageTaken = this.maxHp - this.hp;
            let fireRate = 60; 
            
            if (frames % fireRate === 0) { 
                 const cx = this.x + this.w/2;
                 const cy = this.y + this.h;
                 const bSize = 15 * scaleFactor;
                 if (damageTaken < (this.maxHp * 0.3)) { 
                     enemyProjectiles.push({x: cx, y: cy, vx: 0, vy: 6, w: bSize, h: bSize});
                     enemyProjectiles.push({x: cx, y: cy, vx: -3, vy: 5, w: bSize, h: bSize});
                     enemyProjectiles.push({x: cx, y: cy, vx: 3, vy: 5, w: bSize, h: bSize});
                 } else if (damageTaken >= (this.maxHp * 0.3) && damageTaken < (this.maxHp * 0.6)) {
                     for(let i=0; i<8; i++) {
                         let angle = (Math.PI * 2 / 8) * i;
                         enemyProjectiles.push({x: cx, y: cy + 20, vx: Math.cos(angle) * 6, vy: Math.sin(angle) * 6, w: bSize, h: bSize});
                     }
                 } else {
                     let p1 = players[0];
                     if(p1) {
                        let angle = Math.atan2(p1.y - cy, p1.x - cx);
                        enemyProjectiles.push({x: cx, y: cy + 20, vx: Math.cos(angle) * 9, vy: Math.sin(angle) * 9, w: bSize, h: bSize});
                        enemyProjectiles.push({x: cx, y: cy, vx: -5, vy: 4, w: bSize, h: bSize});
                        enemyProjectiles.push({x: cx, y: cy, vx: 5, vy: 4, w: bSize, h: bSize});
                     }
                 }
            }
        } else if (this.type.startsWith('power')) {
            this.y += this.vy;
        } else {
            this.y += this.vy;
            if (this.type === 'shooter' && frames % 100 === 0) {
                const bSize = 15 * scaleFactor;
                enemyProjectiles.push({x: this.x + this.w/2, y: this.y + this.h, vx: 0, vy: 6, w: bSize, h: bSize});
            }
        }
        if (this.y > canvas.height) this.markedForDeletion = true;
    }

    draw() {
        ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
        if(this.type === 'boss') {
            ctx.fillStyle = 'red'; ctx.fillRect(this.x, this.y - 10, this.w, 5);
            ctx.fillStyle = '#0f0'; ctx.fillRect(this.x, this.y - 10, this.w * (this.hp / this.maxHp), 5);
        }
    }
}

window.iniciarJuego = function() {
    const p1Input = document.getElementById('p1Name');
    // 🔥 ASIGNAR EL NOMBRE 🔥
    if(p1Input && p1Input.value.trim() !== "") currentPlayerName = p1Input.value;
    else currentPlayerName = "Piloto";

    resize();
    playRandomMusic();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('uiLayer').classList.remove('hidden');
    
    gameRunning = true;
    isPaused = false;
    score = 0;
    frames = 0;
    bossActive = false;
    nextBossThreshold = 1000; 

    players = [];
    enemies = [];
    projectiles = [];
    enemyProjectiles = [];
    powerups = [];

    players.push(new Player(1, canvas.width/2 - (30*scaleFactor), images.p1, {
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Space'
    }));
    
    if (mode === 2) {
        document.getElementById('p2Stats').style.display = 'block';
        players.push(new Player(2, canvas.width/2 + (50*scaleFactor), images.p2, {
            up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', shoot: 'KeyG'
        }));
    } else {
        document.getElementById('p2Stats').style.display = 'none';
    }
    loop();
}

function loop() {
    if (!gameRunning || isPaused) return; 
    requestAnimationFrame(loop);
    frames++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!bossActive && score >= nextBossThreshold) {
        bossActive = true;
        enemies.push(new Entity('boss')); 
    }

    let spawnRate = Math.max(20, 80 - Math.floor(score/200)); 
    if (!bossActive && frames % spawnRate === 0) {
        const type = Math.random() < 0.3 ? 'shooter' : 'base';
        enemies.push(new Entity(type));
    }

    if (frames % 400 === 0) {
        const rand = Math.random();
        let type = 'powerHealth';
        if (rand < 0.33) type = 'powerDouble';
        else if (rand < 0.66) type = 'powerSpread';
        powerups.push(new Entity(type));
    }

    let aliveCount = 0;
    players.forEach(p => {
        p.update();
        p.draw();
        if (p.hp > 0) aliveCount++;
        const statEl = document.getElementById(p.id === 1 ? 'p1Stats' : 'p2Stats');
        if(statEl) statEl.innerText = `P${p.id}: ${Math.max(0, Math.floor(p.hp))}%`;
    });

    if (aliveCount === 0) gameOver();

    projectiles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
        if (p.y < 0) projectiles.splice(i, 1);
    });

    enemyProjectiles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        ctx.drawImage(images.bulletE, p.x, p.y, p.w || 15, p.h || 15);
        players.forEach(player => {
            if (player.hp > 0 && rectIntersect({x:p.x, y:p.y, w:p.w||15, h:p.h||15}, player)) {
                player.hp -= 10;
                enemyProjectiles.splice(i, 1);
            }
        });
        if (p.y > canvas.height) enemyProjectiles.splice(i, 1);
    });

    [...enemies, ...powerups].forEach((ent, i) => {
        ent.update();
        ent.draw();

        players.forEach(player => {
            if (player.hp <= 0) return;
            if (rectIntersect(ent, player)) {
                if (ent.type.startsWith('power')) {
                    if (ent.type === 'powerHealth') player.hp = Math.min(100, player.hp + 30);
                    else player.upgradeWeapon(ent.type);
                    ent.markedForDeletion = true;
                } else {
                    player.hp -= 10;
                    if (ent.type !== 'boss') ent.markedForDeletion = true;
                }
            }
        });

        if (!ent.type.startsWith('power')) {
            projectiles.forEach((p, pIndex) => {
                if (rectIntersect({x:p.x, y:p.y, w:p.w, h:p.h}, ent)) {
                    ent.hp--;
                    projectiles.splice(pIndex, 1);
                    if (ent.hp <= 0) {
                        if (ent.type === 'boss') {
                            score += 500; 
                            bossActive = false; 
                            nextBossThreshold = score + 2000; 
                        } else {
                            score += 50;
                        }
                        ent.markedForDeletion = true;
                    }
                }
            });
        }
    });

    enemies = enemies.filter(e => !e.markedForDeletion);
    powerups = powerups.filter(e => !e.markedForDeletion);
    
    const sb = document.getElementById('scoreBoard');
    if(sb) sb.innerText = `Puntos: ${score} | Nivel: ${Math.floor(score/1000) + 1}`;
}

function rectIntersect(r1, r2) {
    return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y);
}

function gameOver() {
    gameRunning = false;
    document.getElementById('bgMusic').pause();
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('finalScore').innerText = `Puntos: ${score}`;
    
    // 🔥 AHORA SÍ FUNCIONARÁ 🔥
    saveHighscore(currentPlayerName, score);
    loadLeaderboard();
}