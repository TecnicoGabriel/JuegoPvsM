const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 1. CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCfwpnyqtXnnVwx1Mm2k9MTm-laCdQ13Xo", 
    authDomain: "juego-padrastro.firebaseapp.com",
    databaseURL: "https://juego-padrastro-default-rtdb.firebaseio.com",
    projectId: "juego-padrastro",
    storageBucket: "juego-padrastro.firebasestorage.app",
    messagingSenderId: "805890459882",
    appId: "1:805890459882:web:8104f3e63b274cdb8a6f93"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

function saveHighscore(name, score) { 
    db.ref('scores').push({ name: name, score: Number(score), date: Date.now() }); 
}let scoreListener = null; 

function loadLeaderboard() {
    const el = document.getElementById('leaderboardListOver');
    if (!el) return;

    // 1. Si ya estamos escuchando cambios, apagamos la escucha anterior 
    // para que no se vuelvan locos los datos al reiniciar el juego.
    if (scoreListener) {
        db.ref('scores').off(); 
    }

    el.innerHTML = '<li style="text-align:center; color:#888;">Actualizando...</li>';

    // 2. Creamos la referencia a la base de datos
    const query = db.ref('scores').orderByChild('score').limitToLast(5);

    // 3. ACTIVAMOS EL MODO EN VIVO (.on)
    // Esto se ejecutará automáticamente apenas tu saveHighscore termine de subir el dato.
    scoreListener = query.on('value', (snapshot) => {
        const data = [];

        snapshot.forEach((childSnapshot) => {
            const val = childSnapshot.val();
            // Truco Importante: Aseguramos que el score sea Numero para ordenar bien
            // (Evita que "9" le gane a "100" si se guardó como texto)
            val.score = Number(val.score); 
            data.push(val);
        });

        // Ordenamos de Mayor a Menor
        data.sort((a, b) => b.score - a.score);

        // Limpiamos la lista
        el.innerHTML = '';

        if (data.length === 0) {
            el.innerHTML = '<li style="text-align:center;">Sin récords</li>';
        } else {
            data.forEach((player, index) => {
                let color = 'white';
                let icon = `#${index + 1}`;
                
                // Colores para 1º, 2º y 3º
                if (index === 0) { color = '#ffd700'; icon = '👑'; }
                else if (index === 1) { color = '#c0c0c0'; }
                else if (index === 2) { color = '#cd7f32'; }

                el.innerHTML += `
                    <li style="color: ${color}; display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #333;">
                        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:65%;">${icon} ${player.name}</span>
                        <span>${player.score}</span>
                    </li>`;
            });
        }
    }, (error) => {
        console.error("Error leyendo DB:", error);
    });
}
// --- 2. AUDIO ---
const bgMusic = document.getElementById('bgMusic');
const volSlider = document.getElementById('volSlider');
const genreSelect = document.getElementById('musicGenre');
const getTracks = () => Array.from({length:10}, (_,i)=>`track${i+1}.mp3`);
const musicLib = { 
    rock: getTracks(), techno: getTracks(), cumbia: getTracks(), 
    reggaeton: getTracks(), salsa: getTracks(), chicha: getTracks() 
};

function playMusic() {
    let genre = genreSelect ? genreSelect.value : 'rock';
    let folder = genre === 'random' ? Object.keys(musicLib)[Math.floor(Math.random()*6)] : genre;
    let tracks = musicLib[folder] || musicLib['rock'];
    let track = tracks[Math.floor(Math.random()*tracks.length)];
    bgMusic.src = `assets/sounds/${folder}/${track}`;
    bgMusic.volume = volSlider ? volSlider.value : 0.5;
    bgMusic.play().catch(e => console.log("Audio play error:", e));
}
if(volSlider) volSlider.addEventListener('input', e => bgMusic.volume=e.target.value);

// --- 3. IMÁGENES ---
const img = (src) => { let i = new Image(); i.src = `assets/images/${src}`; return i; };
const images = {
    p1: img('jugador.png'), p2: img('jugador2.png'),
    enemy: img('enemigo_base.png'), shooter: img('enemigo_shooter.png'),
    tri: img('enemigo_tri.png'), laser: img('enemigo_laser.png'),
    boss1: img('boss1.png'), boss2: img('boss2.png'), boss3: img('boss3.png'), bossF: img('boss4.png'),
    bulletP: img('corazon.png'), bulletE: img('bala_enemiga.png'), bulletC: img('bala_canon.png'),
    helper: img('ayudante.png'),
    pMetra: img('poder_metralleta.png'), pCanon: img('poder_canon.png'),
    pAyuda: img('poder_ayudante.png'), pVida: img('poder_vida_full.png'), pVidaSmall: img('poder_vida.png'),
    pSpread: img('poder_spread.png'), pDoble: img('poder_arma.png')
};

// --- 4. VARIABLES GLOBALES ---
let gameRunning = false, isPaused = false, mode = 1, score = 0, frames = 0;
let currentPlayerName = "Jugador", bossActive = false, nextBossThreshold = 2000;
let scaleFactor = 1;
let players = [], enemies = [], projectiles = [], enemyProjectiles = [], powerups = [], helpers = [];
let keys = {}, touchX = null, touchY = null, isTouching = false;
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

// --- 5. LÓGICA GENERAL ---
function resize() { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; 
    scaleFactor = Math.min(canvas.width / 500, 1.5); 
    if(scaleFactor < 0.6) scaleFactor = 0.6; 
}
window.addEventListener('resize', resize); resize();

window.addEventListener('keydown', e => { keys[e.code] = true; if(e.code === 'Escape') togglePause(); });
window.addEventListener('keyup', e => keys[e.code] = false);

window.addEventListener('touchstart', e => { isTouching = true; touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, {passive: false});
window.addEventListener('touchmove', e => { if(gameRunning) { e.preventDefault(); isTouching = true; touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; } }, {passive: false});
window.addEventListener('touchend', () => isTouching = false);

window.openGuide = () => document.getElementById('guideScreen').classList.remove('hidden');
window.closeGuide = () => document.getElementById('guideScreen').classList.add('hidden');
window.setMode = (n) => { 
    mode = n; 
    document.getElementById('btn1P').className = n === 1 ? 'active' : ''; 
    document.getElementById('btn2P').className = n === 2 ? 'active' : ''; 
    document.getElementById('p2Setup').classList.toggle('hidden', n === 1); 
};
window.togglePause = () => { 
    isPaused = !isPaused; 
    document.getElementById('pauseScreen').classList.toggle('hidden', !isPaused); 
    isPaused ? bgMusic.pause() : bgMusic.play(); 
    if(!isPaused) loop(); 
};
window.goHome = () => location.reload();

// --- 6. CLASES DEL JUEGO ---

class Player {
    constructor(id, x, imgSource, ctrl) {
        this.id = id; 
        this.x = x; 
        this.w = 60 * scaleFactor; 
        this.h = 60 * scaleFactor; 
        // CORRECCIÓN: Margen inferior para que no salga cortado en celular
        let paddingBottom = isMobile ? 80 : 20; 
        this.y = canvas.height - this.h - paddingBottom; 
        
        this.img = imgSource; 
        this.hp = 100; 
        this.ctrl = ctrl;
        this.weapon = 'normal'; 
        this.cadence = 300; 
        this.lastShot = 0;
        this.hitCD = 0; 
    }
    update() {
        if(this.hp <= 0) return;
        if(this.hitCD > 0) this.hitCD--; 

        let s = 7;
        if(keys[this.ctrl.left] && this.x > 0) this.x -= s; 
        if(keys[this.ctrl.right] && this.x < canvas.width - this.w) this.x += s;
        if(keys[this.ctrl.up] && this.y > 0) this.y -= s; 
        if(keys[this.ctrl.down] && this.y < canvas.height - this.h) this.y += s;
        
        if(this.id === 1 && isTouching && touchX) {
            this.x = touchX - this.w / 2; 
            this.y = touchY - this.h / 2;
            if(Date.now() - this.lastShot > this.cadence) { this.shoot(); this.lastShot = Date.now(); }
        }
        if(keys[this.ctrl.shoot] && Date.now() - this.lastShot > this.cadence) { this.shoot(); this.lastShot = Date.now(); }
        
        this.x = Math.max(0, Math.min(canvas.width - this.w, this.x));
        this.y = Math.max(0, Math.min(canvas.height - this.h, this.y));
    }
    shoot() {
        let v = isMobile ? 5 : 7; 
        let bS = 20 * scaleFactor;
        let dmg = 5; // Daño base del jugador
        
        if(this.weapon === 'normal') {
            projectiles.push({x:this.x+this.w/2-bS/2, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
        } else if(this.weapon === 'doble') { 
            projectiles.push({x:this.x, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
            projectiles.push({x:this.x+this.w-bS, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
        } else if(this.weapon === 'metra') {
            for(let i=0; i<4; i++) projectiles.push({x:this.x+(i*15), y:this.y, vx:0, vy:-v, w:10, h:10, img:images.bulletP, dmg:dmg});
        } else if(this.weapon === 'spread') {
            projectiles.push({x:this.x+this.w/2, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
            projectiles.push({x:this.x+this.w/2, y:this.y, vx:-2, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
            projectiles.push({x:this.x+this.w/2, y:this.y, vx:2, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
        } else if(this.weapon === 'canon') {
            projectiles.push({x:this.x+this.w/2-25, y:this.y, vx:0, vy:-3, w:60, h:60, img:images.bulletC, isCannon:true, dmg:2}); // El cañón atraviesa pero hace menos daño por frame
        }
    }
    draw(){ 
        if(this.hp <= 0) return;
        ctx.globalAlpha = 1; 
        ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
    }
}

class Helper {
    constructor(p, s){ this.p=p; this.s=s; this.w=30*scaleFactor; this.h=30*scaleFactor; this.life=600; }
    update(){
        this.life--;
        if(this.p.hp > 0){
            this.x = this.p.x + (this.s * 45) + 15;
            this.y = this.p.y + 20;
            if(frames % 40 === 0) projectiles.push({x:this.x, y:this.y, vx:0, vy:-7, w:10, h:10, img:images.bulletP, dmg:5});
        }
    }
    draw(){ ctx.globalAlpha = 1; ctx.drawImage(images.helper, this.x, this.y, this.w, this.h); }
}

class Entity {
    constructor(type) {
        this.type = type; 
        this.marked = false;
        let spd = isMobile ? 1.5 : 2.5; 
        
        // --- LÓGICA DEL BOSS MEJORADA ---
        if(type === 'boss') {
            // Calcular dificultad (Stage)
            // 0-10k: Stage 0 | 10k-20k: Stage 1 | 20k+: Stage 2...
            this.stage = Math.floor(score / 10000); 

            // AUMENTO DE TAMAÑO: Base 200 + 20px por cada 10,000 puntos
            let sizeBase = 200 + (this.stage * 30);
            this.w = sizeBase * scaleFactor; 
            this.h = sizeBase * scaleFactor;
            
            // Imagen según puntaje
            if(score <= 10000) { this.maxHp=1500; this.img=images.boss1; }
            else if(score <= 20000) { this.maxHp=3000; this.img=images.boss2; }
            else if(score <= 30000) { this.maxHp=4500; this.img=images.boss3; }
            else { this.maxHp=6000; this.img=images.bossF; }
            
            this.hp = this.maxHp;
            this.x = canvas.width/2 - this.w/2; 
            this.y = -this.h; 
            this.vx = 3; 
            this.vy = 2;
            this.angle = 0; // Para disparos rotatorios
        } 
        else if(type.startsWith('p')) { 
            // Powerups
            this.w = 40; this.h = 40; this.y = -40; this.x = Math.random() * (canvas.width - 40); this.vy = 3;
            if(type === 'pVidaSmall') this.img = images.pVidaSmall; 
            else if(type === 'pVidaFull') this.img = images.pVida;
            else if(type === 'pDoble') this.img = images.pDoble; 
            else this.img = images[type]; 
        } 
        else {
            // Enemigos Comunes
            this.w = 50 * scaleFactor; 
            this.h = 50 * scaleFactor; 
            this.x = Math.random() * (canvas.width - this.w); 
            this.y = -this.h;
            this.vy = spd; 
            
            // --- RESISTENCIA (HP) ---
            // Jugador hace 5 dmg. 
            // 10 HP = 2 golpes. 1 HP = 1 golpe.
            if(type === 'tri'){ this.img = images.tri; this.hp = 10; } 
            else if(type === 'laser'){ this.img = images.laser; this.hp = 10; } 
            else if(type === 'shooter'){ this.img = images.shooter; this.hp = 10; } 
            else { this.img = images.enemy; this.hp = 1; } // Enemigo base muere de una
        }
    }
    
    update() {
        this.y += this.vy;
        
        if(this.type === 'boss') {
            this.x += this.vx;
            if(this.x <= 0 || this.x + this.w >= canvas.width) this.vx *= -1;
            
            if(this.y >= canvas.height / 2 - this.h) { 
                this.y = canvas.height / 2 - this.h; 
                this.vy = -Math.abs(this.vy); 
            }
            if(this.y <= 0 && this.vy < 0) this.vy = Math.abs(this.vy);
            
            // DISPARO DEL BOSS
            this.angle += 0.1; // Rotación constante
            let fireRate = 50; 
            
            if(frames % fireRate === 0) {
                let cx = this.x + this.w/2;
                let cy = this.y + this.h - 20;
                let bS = 15 * scaleFactor;
                let bossDmg = 15; // Daño del Boss solicitado

                // Cantidad de disparos según dificultad (Stage)
                // Stage 0 (0-10k) -> 2 a 3 disparos
                // Stage 1 (10k-20k) -> 3 a 4 disparos
                // Stage 2 (20k+) -> 4 a 5 disparos
                let minShots = 2 + this.stage;
                let shotCount = minShots + (Math.random() > 0.5 ? 1 : 0);
                
                // Patrón rotatorio (estrella/espiral)
                for(let i=0; i<shotCount; i++) {
                    // Calculamos ángulo: distribuido en círculo + la rotación del boss
                    let angleStep = (Math.PI * 2) / shotCount;
                    let finalAngle = this.angle + (angleStep * i);
                    
                    // Si está muy arriba, forzamos que dispare hacia abajo para no desperdiciar balas
                    let vy = Math.abs(Math.sin(finalAngle) * 5) + 2; 
                    let vx = Math.cos(finalAngle) * 4;
                    
                    enemyProjectiles.push({
                        x: cx, y: cy, 
                        vx: vx, vy: vy, 
                        w: bS, h: bS, 
                        dmg: bossDmg 
                    });
                }
            }
        } 
        else if(!this.type.startsWith('p')) {
            // Enemigos normales disparando
            if(frames % 120 === 0) {
                let cx = this.x + this.w/2, cy = this.y + this.h;
                
                // Daños solicitados:
                // Normal/Shooter: 5 dmg
                // Tri: 10 dmg
                // Laser: 15 dmg
                
                if(this.type === 'shooter') {
                    enemyProjectiles.push({x:cx, y:cy, vx:0, vy:5, w:15, h:15, dmg: 5});
                }
                if(this.type === 'tri') { 
                    let dmgTri = 10;
                    enemyProjectiles.push({x:cx,y:cy, vx:0, vy:5, w:15, h:15, dmg: dmgTri}); 
                    enemyProjectiles.push({x:cx,y:cy, vx:-2, vy:5, w:15, h:15, dmg: dmgTri}); 
                    enemyProjectiles.push({x:cx,y:cy, vx:2, vy:5, w:15, h:15, dmg: dmgTri}); 
                }
                if(this.type === 'laser') {
                    enemyProjectiles.push({x:cx, y:cy, vx:0, vy:9, w:8, h:30, isLaser:true, dmg: 15});
                }
            }
        }
        
        if(this.y > canvas.height) {
            this.marked = true; 
            if(!this.type.startsWith('p') && this.type !== 'boss') score = Math.max(0, score - 50);
        }
    }
    
    draw(){ 
        ctx.globalAlpha = 1; 
        ctx.drawImage(this.img, this.x, this.y, this.w, this.h); 
        if(this.type === 'boss'){
            ctx.fillStyle = 'red'; ctx.fillRect(this.x, this.y - 10, this.w, 5);
            ctx.fillStyle = '#0f0'; ctx.fillRect(this.x, this.y - 10, this.w * (this.hp / this.maxHp), 5);
        }
    }
}

// --- FUNCIONES DE INICIO Y REINICIO ---

window.iniciarJuego = () => {
    let n = document.getElementById('p1Name').value; 
    currentPlayerName = n.trim() ? n : "Piloto";
    playMusic();
    document.getElementById('startScreen').classList.add('hidden'); 
    document.getElementById('uiLayer').classList.remove('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    
    // Configuración Inicial
    gameRunning = true; isPaused = false; score = 0; frames = 0; bossActive = false; nextBossThreshold = 2000;
    players = []; enemies = []; projectiles = []; enemyProjectiles = []; powerups = []; helpers = [];
    
    players.push(new Player(1, canvas.width/2-30, images.p1, {left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', shoot:'Space'}));
    if(mode === 2) {
        players.push(new Player(2, canvas.width/2+30, images.p2, {left:'KeyA', right:'KeyD', up:'KeyW', down:'KeyS', shoot:'KeyG'}));
        document.getElementById('p2Hud').classList.remove('hidden');
    } else {
        document.getElementById('p2Hud').classList.add('hidden');
    }
    
    loop();
}

// NUEVA FUNCIÓN: REINTENTAR SIN RECARGAR
window.reiniciarPartida = () => {
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('uiLayer').classList.remove('hidden');
    
    bgMusic.currentTime = 0;
    bgMusic.play().catch(()=>{});

    gameRunning = true; isPaused = false; score = 0; frames = 0; bossActive = false; nextBossThreshold = 2000;
    players = []; enemies = []; projectiles = []; enemyProjectiles = []; powerups = []; helpers = [];
    
    players.push(new Player(1, canvas.width/2-30, images.p1, {left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', shoot:'Space'}));
    if(mode === 2) {
        players.push(new Player(2, canvas.width/2+30, images.p2, {left:'KeyA', right:'KeyD', up:'KeyW', down:'KeyS', shoot:'KeyG'}));
        document.getElementById('p2Hud').classList.remove('hidden');
    } else {
        document.getElementById('p2Hud').classList.add('hidden');
    }
    
    loop();
}

// --- SPAWN DE OLEADA TRAS EL BOSS ---
function spawnWave(count) {
    for(let i=0; i<count; i++) {
        // Genera enemigos peligrosos (Shooter, Tri o Laser)
        let types = ['shooter', 'tri', 'laser'];
        let type = types[Math.floor(Math.random() * types.length)];
        enemies.push(new Entity(type));
    }
}

function loop() {
    if(!gameRunning || isPaused) return; 
    requestAnimationFrame(loop); 
    frames++; 
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- SPAWN BOSS Y ENEMIGOS ---
    if(!bossActive && score >= nextBossThreshold) { 
        bossActive = true; 
        enemies.push(new Entity('boss')); 
    }
    
    let rate = Math.max(20, 60 - Math.floor(score / 500)); 
    if(!bossActive && frames % rate === 0) {
        let r = Math.random(), t = 'base';
        if(score > 2000 && r < 0.4) t = 'shooter';
        if(score > 5000 && r < 0.2) t = 'tri';
        if(score > 8000 && r < 0.1) t = 'laser';
        enemies.push(new Entity(t));
    }
    
    // --- POWERUPS ---
    if(frames % 500 === 0) {
        let available = ['pVidaSmall', 'pAyuda']; 
        if(score >= 500) available.push('pDoble');
        if(score >= 1500) available.push('pMetra', 'pSpread');
        if(score >= 4000) available.push('pCanon', 'pVidaFull');
        let type = available[Math.floor(Math.random() * available.length)];
        powerups.push(new Entity(type));
    }
    
    let alive = 0;
    players.forEach(p => { 
        p.update(); 
        p.draw(); 
        if(p.hp > 0) alive++; 
        
        // ACTUALIZAR BARRAS DE VIDA (HTML)
        let bar = document.getElementById(`p${p.id}HealthBar`);
        if(bar) bar.style.width = `${Math.max(0, p.hp)}%`;
    });
    
    if(alive === 0) gameOver();

    helpers.forEach((h, i) => { h.update(); h.draw(); if(h.life <= 0) helpers.splice(i, 1); });

    // --- COLISIONES PROYECTILES JUGADOR ---
    projectiles.forEach((p, i) => {
        p.y += p.vy; p.x += p.vx; 
        ctx.drawImage(p.img, p.x, p.y, p.w, p.h); 
        if(p.y < 0) projectiles.splice(i, 1);
    });
    
    // --- COLISIONES PROYECTILES ENEMIGOS ---
    enemyProjectiles.forEach((p, i) => {
        p.y += p.vy; p.x += p.vx; 
        ctx.drawImage(images.bulletE, p.x, p.y, p.w, p.h);
        
        players.forEach(ply => { 
            if(ply.hp > 0 && ply.hitCD === 0 && rect(p, ply)){ 
                // DAÑO RECIBIDO SEGÚN TIPO DE BALA (Definido en Entity.update)
                let damageReceived = p.dmg || 10; 
                ply.hp -= damageReceived; 
                ply.hitCD = 30; 
                enemyProjectiles.splice(i, 1); 
            } 
        });
        if(p.y > canvas.height || p.x < 0 || p.x > canvas.width) enemyProjectiles.splice(i, 1);
    });
    
    // --- COLISIONES ENTIDADES (ENEMIGOS/POWERUPS) ---
    [...enemies, ...powerups].forEach(e => {
        e.update(); 
        e.draw();
        
        // Choque Cuerpo a Cuerpo
        players.forEach(ply => {
            if(ply.hp > 0 && rect(e, ply)) {
                if(e.type.startsWith('p')) {
                    // Lógica Powerups...
                    if(e.type === 'pVidaSmall') ply.hp = Math.min(100, ply.hp + 10);
                    else if(e.type === 'pVidaFull') ply.hp = 100;
                    else if(e.type === 'pAyuda') { if(helpers.length < 2) helpers.push(new Helper(ply, helpers.length === 0 ? -1 : 1)); }
                    else if(e.type === 'pDoble') { ply.weapon = 'doble'; ply.cadence = 300; }
                    else if(e.type === 'pMetra') { ply.weapon = 'metra'; ply.cadence = 250; } 
                    else if(e.type === 'pCanon') { ply.weapon = 'canon'; ply.cadence = 800; }
                    else if(e.type === 'pSpread') { ply.weapon = 'spread'; ply.cadence = 300; }
                    e.marked = true;
                } else {
                    // Choque con enemigo
                    if(ply.hitCD === 0) {
                        ply.hp -= 15; // Chocar duele
                        ply.hitCD = 30; 
                        if(e.type !== 'boss') {
                            e.marked = true;
                            e.y = 10000;
                        }
                    }
                }
            }
        });
        
        // Disparos Jugador vs Enemigo
        if(!e.type.startsWith('p')) {
            projectiles.forEach((p, pi) => {
                if(rect(p, e)) {
                    let dmg = p.dmg || 1; 
                    e.hp -= dmg; 
                    if(!p.isCannon) projectiles.splice(pi, 1);
                    
                    if(e.hp <= 0) {
                        if(e.type === 'boss'){
                            score += 1000; 
                            bossActive = false; 
                            nextBossThreshold += 3000;
                            // SPAWN OLEADA AL MATAR BOSS
                            spawnWave(3 + Math.floor(score/10000));
                        } else score += 50;
                        e.marked = true;
                    }
                }
            });
        }
    });
    
    enemies = enemies.filter(e => !e.marked); 
    powerups = powerups.filter(e => !e.marked);
    document.getElementById('scoreBoard').innerText = `SCORE: ${score}`;
}

function rect(r1, r2){ return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y); }

function gameOver() {
    gameRunning = false; 
    bgMusic.pause(); 
    document.getElementById('gameOverScreen').classList.remove('hidden'); 
    document.getElementById('uiLayer').classList.add('hidden'); // Ocultar HUD en Game Over
    document.getElementById('finalScore').innerText = `Puntos: ${score}`; 
    saveHighscore(currentPlayerName, score); 
    loadLeaderboard(); 
}