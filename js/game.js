const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 1. FIREBASE (PON TUS CLAVES REALES AQUÍ) ---
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

function saveHighscore(name, score) { db.ref('scores').push({ name, score, date: Date.now() }); }

// --- FUNCIÓN DE TABLA CORREGIDA (TOP 5) ---
function loadLeaderboard() {
    // IDs reales de tu HTML
    const ids = ['leaderboardListStart', 'leaderboardListOver'];
    
    // Poner "Cargando..."
    ids.forEach(id => {
        let el = document.getElementById(id);
        if(el) el.innerHTML = '<li>Cargando...</li>';
    });

    db.ref('scores').orderByChild('score').limitToLast(5).once('value', s => {
        let d=[]; s.forEach(c=>d.push(c.val()));
        d.sort((a,b)=>b.score-a.score); // Ordenar mayor a menor
        
        ids.forEach(id => {
            let el = document.getElementById(id);
            if(el) {
                el.innerHTML = '';
                if(d.length===0) el.innerHTML='<li>Sé el primero</li>';
                d.forEach((x,i)=>{
                    // Colores para el podio
                    let c=i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'white';
                    el.innerHTML+=`<li style="display:flex;justify-content:space-between;color:${c};padding:3px;border-bottom:1px solid #333"><span>#${i+1} ${x.name}</span><span>${x.score}</span></li>`;
                });
            }
        });
    });
}

// --- 2. AUDIO ---
const bgMusic = document.getElementById('bgMusic');
const volSlider = document.getElementById('volSlider');
const genreSelect = document.getElementById('musicGenre');
const getT = () => Array.from({length:10}, (_,i)=>`track${i+1}.mp3`);
const musicLib = { rock: getT(), techno: getT(), cumbia: getT(), reggaeton: getT(), salsa: getT(), chicha: getT() };

function playMusic() {
    let g = genreSelect ? genreSelect.value : 'rock';
    let folder = g === 'random' ? Object.keys(musicLib)[Math.floor(Math.random()*6)] : g;
    let tracks = musicLib[folder] || musicLib['rock'];
    let track = tracks[Math.floor(Math.random()*tracks.length)];
    bgMusic.src = `assets/sounds/${folder}/${track}`;
    bgMusic.volume = volSlider ? volSlider.value : 0.5;
    bgMusic.play().catch(()=>{});
}
if(volSlider) volSlider.addEventListener('input', e => bgMusic.volume=e.target.value);

// --- 3. IMÁGENES ---
const img = (s) => { let i=new Image(); i.src=`assets/images/${s}`; return i; };
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

// --- 4. VARIABLES ---
let gameRunning=false, isPaused=false, mode=1, score=0, frames=0;
let players=[], enemies=[], projectiles=[], enemyProjectiles=[], powerups=[], helpers=[];
let keys={}, touchX=null, touchY=null, isTouching=false, scaleFactor=1;
let currentPlayerName="Jugador", bossActive=false;
let nextBossThreshold = 2000; 
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

// --- 5. LOGICA ---
function resize() { 
    canvas.width=window.innerWidth; canvas.height=window.innerHeight; 
    scaleFactor=Math.min(canvas.width/500,1.5); if(scaleFactor<0.6)scaleFactor=0.6; 
}
window.addEventListener('resize', resize); resize();
window.addEventListener('keydown', e=>{keys[e.code]=true;if(e.code==='Escape')togglePause();});
window.addEventListener('keyup', e=>keys[e.code]=false);
window.addEventListener('touchstart',e=>{isTouching=true;touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;},{passive:false});
window.addEventListener('touchmove',e=>{if(gameRunning){e.preventDefault();isTouching=true;touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;}},{passive:false});
window.addEventListener('touchend',()=>isTouching=false);

window.openGuide=()=>document.getElementById('guideScreen').classList.remove('hidden');
window.closeGuide=()=>document.getElementById('guideScreen').classList.add('hidden');
window.setMode=(n)=>{mode=n;document.getElementById('btn1P').className=n===1?'active':'';document.getElementById('btn2P').className=n===2?'active':'';document.getElementById('p2Setup').classList.toggle('hidden',n===1);};
window.togglePause=()=>{isPaused=!isPaused;document.getElementById('pauseScreen').classList.toggle('hidden',!isPaused);isPaused?bgMusic.pause():bgMusic.play();if(!isPaused)loop();};
window.goHome=()=>{location.reload();}

class Player {
    constructor(id,x,img,ctrl) {
        this.id=id; this.x=x; this.w=60*scaleFactor; this.h=60*scaleFactor; 
        this.y=canvas.height-this.h*2; this.img=img; this.hp=100; this.ctrl=ctrl;
        this.weapon='normal'; this.cadence=300; this.lastShot=0;
        this.hitCD=0; 
    }
    update() {
        if(this.hp<=0) return;
        if(this.hitCD > 0) this.hitCD--; 

        let s=7;
        if(keys[this.ctrl.left]&&this.x>0)this.x-=s; if(keys[this.ctrl.right]&&this.x<canvas.width-this.w)this.x+=s;
        if(keys[this.ctrl.up]&&this.y>0)this.y-=s; if(keys[this.ctrl.down]&&this.y<canvas.height-this.h)this.y+=s;
        
        if(this.id===1 && isTouching && touchX) {
            this.x = touchX - this.w/2; this.y = touchY - this.h/2;
            if(Date.now()-this.lastShot > this.cadence) { this.shoot(); this.lastShot=Date.now(); }
        }
        if(keys[this.ctrl.shoot] && Date.now()-this.lastShot > this.cadence) { this.shoot(); this.lastShot=Date.now(); }
        
        if(this.x<0)this.x=0; if(this.x>canvas.width-this.w)this.x=canvas.width-this.w;
        if(this.y<0)this.y=0; if(this.y>canvas.height-this.h)this.y=canvas.height-this.h;
    }
    shoot() {
        let v = isMobile ? 5 : 7; 
        let bS = 20*scaleFactor;
        let dmg = 5; 
        
        if(this.weapon==='normal') {
            projectiles.push({x:this.x+this.w/2-bS/2, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
        }
        else if(this.weapon==='doble') { 
            projectiles.push({x:this.x, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
            projectiles.push({x:this.x+this.w-bS, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
        }
        else if(this.weapon==='metra') {
            for(let i=0;i<4;i++) projectiles.push({x:this.x+(i*15), y:this.y, vx:0, vy:-v, w:10, h:10, img:images.bulletP, dmg:dmg});
        }
        else if(this.weapon==='spread') {
            projectiles.push({x:this.x+this.w/2, y:this.y, vx:0, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
            projectiles.push({x:this.x+this.w/2, y:this.y, vx:-2, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
            projectiles.push({x:this.x+this.w/2, y:this.y, vx:2, vy:-v, w:bS, h:bS, img:images.bulletP, dmg:dmg});
        }
        else if(this.weapon==='canon') {
            projectiles.push({x:this.x+this.w/2-25, y:this.y, vx:0, vy:-3, w:60, h:60, img:images.bulletC, isCannon:true, dmg:2});
        }
    }
    draw(){ 
        if(this.hp<=0) return;
        ctx.globalAlpha = 1; 
        ctx.drawImage(this.img,this.x,this.y,this.w,this.h);
        ctx.fillStyle='red';ctx.fillRect(this.x,this.y+this.h+5,this.w,5);
        ctx.fillStyle='#0f0';ctx.fillRect(this.x,this.y+this.h+5,this.w*(this.hp/100),5);
    }
}

class Helper {
    constructor(p,s){this.p=p;this.s=s;this.w=30*scaleFactor;this.h=30*scaleFactor;this.life=600;}
    update(){this.life--;if(this.p.hp>0){this.x=this.p.x+(this.s*45)+15;this.y=this.p.y+20;if(frames%40===0)projectiles.push({x:this.x,y:this.y,vx:0,vy:-7,w:10,h:10,img:images.bulletP, dmg:5});}}
    draw(){ctx.globalAlpha=1; ctx.drawImage(images.helper,this.x,this.y,this.w,this.h);}
}

class Entity {
    constructor(type) {
        this.type=type; this.marked=false;
        let spd = isMobile ? 1.5 : 2.5; 
        
        if(type==='boss') {
            this.w=200*scaleFactor; this.h=200*scaleFactor;
            if(score <= 10000) { this.bossType=1; this.maxHp=1500; this.img=images.boss1; }
            else if(score <= 20000) { this.bossType=2; this.maxHp=3000; this.img=images.boss2; }
            else if(score <= 30000) { this.bossType=3; this.maxHp=4500; this.img=images.boss3; }
            else { this.bossType=4; this.maxHp=6000; this.img=images.bossF; }
            this.hp = this.maxHp;
            this.x=canvas.width/2-this.w/2; this.y=-this.h; this.vx=3; this.vy=2;
            this.minionsSpawned = [false, false, false]; 
        } else if(type.startsWith('p')) { 
            this.w=40; this.h=40; this.y=-40; this.x=Math.random()*(canvas.width-40); this.vy=3;
            if(type === 'pVidaSmall') this.img = images.pVidaSmall; 
            else if(type === 'pVidaFull') this.img = images.pVida;
            else if(type === 'pDoble') this.img = images.pDoble; 
            else this.img = images[type]; 
        } else {
            this.w=50*scaleFactor; this.h=50*scaleFactor; this.x=Math.random()*(canvas.width-this.w); this.y=-this.h;
            this.hp=1; this.vy=spd; 
            if(type==='tri'){this.img=images.tri; this.hp=3;} 
            else if(type==='laser'){this.img=images.laser; this.hp=3;} 
            else if(type==='shooter'){this.img=images.shooter; this.hp=2;} 
            else {this.img=images.enemy; this.hp=1;} 
        }
    }
    update() {
        this.y+=this.vy;
        if(this.type==='boss') {
            this.x+=this.vx;
            if(this.x<=0||this.x+this.w>=canvas.width)this.vx*=-1;
            if(this.y >= canvas.height/2 - this.h) { this.y=canvas.height/2-this.h; this.vy=-Math.abs(this.vy); }
            if(this.y <= 0 && this.vy < 0) this.vy = Math.abs(this.vy);
            
            let hpPerc = this.hp / this.maxHp;
            let fireRate = 60; 
            if(frames%fireRate===0) {
                let cx=this.x+this.w/2, cy=this.y+this.h, bS=15*scaleFactor;
                if(hpPerc > 0.7) { enemyProjectiles.push({x:cx,y:cy,vx:0,vy:6,w:bS,h:bS}); } 
                else if(hpPerc > 0.4) {
                    enemyProjectiles.push({x:cx,y:cy,vx:0,vy:6,w:bS,h:bS});
                    enemyProjectiles.push({x:cx,y:cy,vx:-3,vy:5,w:bS,h:bS});
                    enemyProjectiles.push({x:cx,y:cy,vx:3,vy:5,w:bS,h:bS});
                } else {
                    if(this.bossType >= 3) {
                        for(let i=0;i<8;i++){let a=(Math.PI*2/8)*i; enemyProjectiles.push({x:cx,y:cy+20,vx:Math.cos(a)*5,vy:Math.sin(a)*5,w:bS,h:bS});}
                    } else {
                        enemyProjectiles.push({x:cx,y:cy,vx:0,vy:8,w:bS,h:bS});
                    }
                }
            }
        } else if(!this.type.startsWith('p')) {
            if(frames%120===0) {
                let cx=this.x+this.w/2, cy=this.y+this.h;
                if(this.type==='shooter') enemyProjectiles.push({x:cx,y:cy,vx:0,vy:5,w:15,h:15});
                if(this.type==='tri') { enemyProjectiles.push({x:cx,y:cy,vx:0,vy:5,w:15,h:15}); enemyProjectiles.push({x:cx,y:cy,vx:-2,vy:5,w:15,h:15}); enemyProjectiles.push({x:cx,y:cy,vx:2,vy:5,w:15,h:15}); }
                if(this.type==='laser') enemyProjectiles.push({x:cx,y:cy,vx:0,vy:9,w:8,h:30,isLaser:true});
            }
        }
        
        if(this.y > canvas.height) {
            this.marked=true; 
            if(!this.type.startsWith('p') && this.type!=='boss') score = Math.max(0, score-50);
        }
    }
    draw(){ 
        ctx.globalAlpha = 1; 
        ctx.drawImage(this.img,this.x,this.y,this.w,this.h); 
        if(this.type==='boss'){ctx.fillStyle='red';ctx.fillRect(this.x,this.y-10,this.w,5);ctx.fillStyle='#0f0';ctx.fillRect(this.x,this.y-10,this.w*(this.hp/this.maxHp),5);}
    }
}

window.iniciarJuego=()=>{
    let n=document.getElementById('p1Name').value; currentPlayerName=n.trim()?n:"Piloto";
    playMusic();
    document.getElementById('startScreen').classList.add('hidden'); document.getElementById('uiLayer').classList.remove('hidden');
    gameRunning=true; isPaused=false; score=0; frames=0; bossActive=false; 
    nextBossThreshold = 2000; 
    players=[]; enemies=[]; projectiles=[]; enemyProjectiles=[]; powerups=[]; helpers=[];
    players.push(new Player(1,canvas.width/2-30,images.p1,{left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',shoot:'Space'}));
    if(mode===2)players.push(new Player(2,canvas.width/2+30,images.p2,{left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',shoot:'KeyG'}));
    
    loop();
}

function loop() {
    if(!gameRunning||isPaused)return; requestAnimationFrame(loop); frames++; ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.globalAlpha = 1;

    if(!bossActive && score >= nextBossThreshold) { bossActive=true; enemies.push(new Entity('boss')); }
    
    let rate = Math.max(20, 60 - Math.floor(score/500)); 
    if(!bossActive && frames%rate===0) {
        let r=Math.random(), t='base';
        if(score > 2000 && r < 0.4) t='shooter';
        if(score > 5000 && r < 0.2) t='tri';
        if(score > 8000 && r < 0.1) t='laser';
        enemies.push(new Entity(t));
    }
    
    if(frames%500===0) {
        let available = ['pVidaSmall', 'pAyuda']; 
        if(score >= 500) available.push('pDoble');
        if(score >= 1500) available.push('pMetra', 'pSpread');
        if(score >= 4000) available.push('pCanon', 'pVidaFull');
        let type = available[Math.floor(Math.random() * available.length)];
        powerups.push(new Entity(type));
    }
    
    let alive=0;
    players.forEach(p=>{ p.update(); p.draw(); if(p.hp>0)alive++; document.getElementById(`p${p.id}Stats`).innerText=`P${p.id}: ${Math.floor(p.hp)}%`;});
    if(alive===0)gameOver();

    helpers.forEach((h,i)=>{ h.update(); h.draw(); if(h.life<=0)helpers.splice(i,1); });

    projectiles.forEach((p,i)=>{
        p.y+=p.vy; p.x+=p.vx; ctx.drawImage(p.img,p.x,p.y,p.w,p.h); if(p.y<0)projectiles.splice(i,1);
    });
    enemyProjectiles.forEach((p,i)=>{
        p.y+=p.vy; p.x+=p.vx; ctx.drawImage(images.bulletE,p.x,p.y,p.w,p.h);
        players.forEach(ply=>{ 
            if(ply.hp>0 && ply.hitCD===0 && rect(p,ply)){ 
                ply.hp-=10; 
                ply.hitCD = 30; 
                enemyProjectiles.splice(i,1); 
            } 
        });
        if(p.y>canvas.height)enemyProjectiles.splice(i,1);
    });
    
    [...enemies, ...powerups].forEach(e=>{
        e.update(); e.draw();
        players.forEach(ply=>{
            if(ply.hp>0 && rect(e,ply)) {
                if(e.type.startsWith('p')) {
                    if(e.type==='pVidaSmall') ply.hp = Math.min(100, ply.hp + 10);
                    else if(e.type==='pVidaFull') ply.hp = 100;
                    else if(e.type==='pAyuda') { if(helpers.length<2)helpers.push(new Helper(ply, helpers.length===0?-1:1)); }
                    else if(e.type==='pDoble') { ply.weapon='doble'; ply.cadence=300; }
                    else if(e.type==='pMetra') { ply.weapon='metra'; ply.cadence=250; } 
                    else if(e.type==='pCanon') { ply.weapon='canon'; ply.cadence=800; }
                    else if(e.type==='pSpread') { ply.weapon='spread'; ply.cadence=300; }
                    e.marked=true;
                } else {
                    // --- FIX FINAL: BOT MUERE AL TOCARTE ---
                    if(ply.hitCD === 0) {
                        ply.hp -= 15; 
                        ply.hitCD = 30; 
                        
                        // SI NO ES BOSS, SE VA AL INFIERNO
                        if(e.type!=='boss') {
                            e.marked = true;
                            e.y = 10000;
                        }
                    }
                }
            }
        });
        if(!e.type.startsWith('p')) {
            projectiles.forEach((p,pi)=>{
                if(rect(p,e)) {
                    let dmg = p.dmg || 1; 
                    e.hp-=dmg; 
                    if(!p.isCannon)projectiles.splice(pi,1);
                    if(e.hp<=0) {
                        if(e.type==='boss'){
                            score+=1000; bossActive=false; 
                            nextBossThreshold += 3000;
                        } else score+=50;
                        e.marked=true;
                    }
                }
            });
        }
    });
    
    enemies=enemies.filter(e=>!e.marked); powerups=powerups.filter(e=>!e.marked);
    document.getElementById('scoreBoard').innerText=`Puntos: ${score}`;
}

function rect(r1,r2){return !(r2.x>r1.x+r1.w||r2.x+r2.w<r1.x||r2.y>r1.y+r1.h||r2.y+r2.h<r1.y);}
function gameOver(){gameRunning=false; bgMusic.pause(); document.getElementById('gameOverScreen').classList.remove('hidden'); document.getElementById('finalScore').innerText=`Puntos: ${score}`; saveHighscore(currentPlayerName,score); loadLeaderboard();}

// CARGAR TABLA AL INICIO (¡FALTABA ESTO!)
window.onload = () => loadLeaderboard();