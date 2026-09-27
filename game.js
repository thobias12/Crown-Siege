(() => {
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const el=id=>document.getElementById(id);
const ui={gold:el('gold'),mana:el('mana'),crowns:el('crowns'),wave:el('wave'),keepHpText:el('keepHpText'),keepHpBar:el('keepHpBar'),wardText:el('wardText'),waveBar:el('waveBar'),phaseLabel:el('phaseLabel'),announcement:el('announcement'),keepCost:el('keepCost'),incomeCost:el('incomeCost')};

const state={gold:120,mana:100,maxMana:100,crowns:0,wave:1,keepHp:1000,maxKeepHp:1000,keepLevel:1,incomeLevel:1,paused:false,over:false,selectedSpell:'bolt',spawnTimer:0,spawned:0,waveQuota:9,intermission:2.5,shake:0,flash:0};
const units=[],enemies=[],projectiles=[],particles=[],floaters=[];
const UNIT={
 guard:{cost:35,hp:165,damage:17,speed:34,range:35,cooldown:.72,color:'#9da2a8'},
 ranger:{cost:55,hp:92,damage:24,speed:30,range:250,cooldown:1.15,color:'#6e8e65'},
 mage:{cost:85,hp:78,damage:37,speed:27,range:210,cooldown:1.5,color:'#7962bd'}
};
const SPELL={bolt:{cost:20,cd:1.2,radius:58,damage:125},frost:{cost:35,cd:4,radius:105,damage:70},nova:{cost:60,cd:8,radius:165,damage:180}};
const cooldown={bolt:0,frost:0,nova:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a);
const W=()=>canvas.getBoundingClientRect().width,H=()=>canvas.getBoundingClientRect().height,ground=()=>H()*.73;

function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(900,Math.floor(r.width*d));canvas.height=Math.max(500,Math.floor(r.height*d));ctx.setTransform(d,0,0,d,0,0)}
new ResizeObserver(resize).observe(canvas);resize();

function recruit(type){
 const d=UNIT[type]; if(state.gold<d.cost||state.over)return;
 state.gold-=d.cost; units.push({type,x:125+rand(-10,10),y:ground()+rand(-8,7),hp:d.hp,maxHp:d.hp,atk:rand(0,.4),bob:rand(0,6.28)});
 burst(130,ground()-24,d.color,10); updateUI();
}

function spawnEnemy(){
 const boss=state.wave%5===0&&state.spawned===state.waveQuota-1;
 const scale=1+(state.wave-1)*.13,roll=Math.random();
 let type=boss?'dreadlord':roll<.56?'thrall':roll<.84?'raider':'wraith';
 const d={
  thrall:{hp:105,damage:12,speed:27,range:28,cooldown:1,gold:14,color:'#687354',size:17},
  raider:{hp:175,damage:19,speed:22,range:31,cooldown:1.25,gold:23,color:'#875747',size:20},
  wraith:{hp:120,damage:25,speed:34,range:95,cooldown:1.55,gold:29,color:'#655b83',size:18},
  dreadlord:{hp:1050,damage:44,speed:17,range:40,cooldown:1,gold:180,color:'#8d3038',size:34}
 }[type];
 enemies.push({type,x:W()-65,y:ground()+rand(-6,8),hp:d.hp*scale,maxHp:d.hp*scale,damage:d.damage*scale*.8,speed:d.speed,range:d.range,cooldown:d.cooldown,gold:Math.round(d.gold*scale),color:d.color,size:d.size,atk:rand(0,.5),slow:0,bob:rand(0,6.28)});
 state.spawned++;
}

function damageEnemy(e,damage,color='#d6b86c'){
 e.hp-=damage; floater(e.x,e.y-38,Math.round(damage),color); burst(e.x,e.y-10,color,5);
 if(e.hp<=0){state.gold+=e.gold*state.incomeLevel;if(e.type==='dreadlord'){state.crowns++;announce('CROWN CLAIMED');state.mana=Math.min(state.maxMana,state.mana+60)}}
}

function update(dt){
 if(state.paused||state.over)return;
 Object.keys(cooldown).forEach(k=>cooldown[k]=Math.max(0,cooldown[k]-dt));
 state.mana=Math.min(state.maxMana,state.mana+7*dt);

 if(state.intermission>0){
  state.intermission-=dt;
  if(state.intermission<=0){announce(state.wave%5===0?'DREAD LORD APPROACHES':'WAVE '+state.wave);ui.phaseLabel.textContent='THE SIEGE IS UPON YOU'}
 } else {
  state.spawnTimer-=dt;
  if(state.spawned<state.waveQuota&&state.spawnTimer<=0){spawnEnemy();state.spawnTimer=Math.max(.42,1.15-state.wave*.025)}
  if(state.spawned>=state.waveQuota&&enemies.length===0){
   state.wave++;state.spawned=0;state.waveQuota=8+Math.floor(state.wave*1.7);state.intermission=3.4;state.gold+=25+state.wave*3;ui.phaseLabel.textContent='MUSTER THE DEFENDERS';
  }
 }

 for(const u of units)updateUnit(u,dt);
 for(const e of enemies)updateEnemy(e,dt);
 for(const p of projectiles)updateProjectile(p,dt);
 updateFx(dt);

 for(let i=units.length-1;i>=0;i--)if(units[i].hp<=0){burst(units[i].x,units[i].y,'#6b2028',13);units.splice(i,1)}
 for(let i=enemies.length-1;i>=0;i--)if(enemies[i].hp<=0)enemies.splice(i,1);
 for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].dead)projectiles.splice(i,1);

 state.shake=Math.max(0,state.shake-dt*16);state.flash=Math.max(0,state.flash-dt*2.2);updateUI();
}

function updateUnit(u,dt){
 const d=UNIT[u.type];u.atk-=dt;u.bob+=dt*4;
 let target=null,best=1e9;for(const e of enemies){const dist=e.x-u.x;if(dist>=-10&&dist<best){best=dist;target=e}}
 if(target&&best<=d.range){
  if(u.atk<=0){
   u.atk=d.cooldown;
   if(u.type==='guard'){damageEnemy(target,d.damage,'#d5d0c5');state.shake=2}
   else projectiles.push({kind:u.type==='mage'?'arcane':'arrow',x:u.x+12,y:u.y-35,target,damage:d.damage,speed:u.type==='mage'?360:500,dead:false});
  }
 } else if(!target||u.x<W()*.78)u.x+=d.speed*dt;
}

function updateEnemy(e,dt){
 e.atk-=dt;e.slow=Math.max(0,e.slow-dt);e.bob+=dt*3.4;
 let target=null,best=1e9;for(const u of units){const dist=e.x-u.x;if(dist>=-10&&dist<best){best=dist;target=u}}
 const speed=e.speed*(e.slow>0?.43:1);
 if(target&&best<=e.range+8){
  if(e.atk<=0){e.atk=e.cooldown;target.hp-=e.damage;floater(target.x,target.y-42,Math.round(e.damage),'#b44c52');burst(target.x,target.y-12,'#8b3038',4)}
 } else if(e.x<=103){
  if(e.atk<=0){
   e.atk=e.cooldown;state.keepHp-=e.damage;state.shake=7;state.flash=.35;floater(90,ground()-130,Math.round(e.damage),'#d45b60');
   if(state.keepHp<=0){state.keepHp=0;state.over=true;announce('BLACKKEEP HAS FALLEN',999)}
  }
 } else e.x-=speed*dt;
}

function updateProjectile(p,dt){
 if(!p.target||p.target.hp<=0){p.dead=true;return}
 const tx=p.target.x,ty=p.target.y-24,dx=tx-p.x,dy=ty-p.y,dist=Math.hypot(dx,dy);
 if(dist<16){
  if(p.kind==='arcane'){for(const e of enemies)if(Math.abs(e.x-tx)<70)damageEnemy(e,p.damage,'#9d7eea')}
  else damageEnemy(p.target,p.damage,'#c6b57b');
  p.dead=true;return;
 }
 p.x+=dx/dist*p.speed*dt;p.y+=dy/dist*p.speed*dt;
}

function cast(spell,x){
 const s=SPELL[spell];if(state.mana<s.cost||cooldown[spell]>0||state.over)return;
 state.mana-=s.cost;cooldown[spell]=s.cd;const y=ground()-12;
 if(spell==='bolt'){for(const e of enemies)if(Math.abs(e.x-x)<s.radius)damageEnemy(e,s.damage,'#a887f5');beam(x,y)}
 if(spell==='frost'){for(const e of enemies)if(Math.abs(e.x-x)<s.radius){damageEnemy(e,s.damage,'#9eb8d6');e.slow=3.6}ring(x,y,s.radius,'#9eb8d6')}
 if(spell==='nova'){for(const e of enemies)if(Math.abs(e.x-x)<s.radius)damageEnemy(e,s.damage,'#e06c43');ring(x,y,s.radius,'#c84932');burst(x,y,'#e47743',36);state.shake=11}
 updateUI();
}

function draw(){
 const w=W(),h=H();ctx.clearRect(0,0,w,h);ctx.save();
 if(state.shake)ctx.translate(rand(-state.shake,state.shake),rand(-state.shake,state.shake));
 const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#08080e');g.addColorStop(.56,'#181417');g.addColorStop(1,'#171512');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 drawSky(w,h);drawTerrain(w,h);drawKeep();drawRuins(w);for(const u of units)drawUnit(u);for(const e of enemies)drawEnemy(e);for(const p of projectiles)drawProjectile(p);drawFx();
 if(state.flash){ctx.fillStyle='rgba(120,20,25,'+(state.flash*.22)+')';ctx.fillRect(0,0,w,h)}
 if(state.over){ctx.fillStyle='#050608cc';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle='#c9b9a5';ctx.font='bold 44px Georgia';ctx.fillText('THE KEEP IS LOST',w/2,h*.42);ctx.fillStyle='#777';ctx.font='16px Georgia';ctx.fillText('Refresh to begin another siege',w/2,h*.47)}
 ctx.restore();
}

function drawSky(w,h){
 ctx.fillStyle='#201317';ctx.beginPath();ctx.arc(w*.78,h*.18,55,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6e292e';ctx.beginPath();ctx.arc(w*.78,h*.18,44,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#0a0b0e';for(let i=0;i<9;i++){const x=i*w/8-80,y=ground()-180-((i*73)%150);ctx.beginPath();ctx.moveTo(x-90,ground());ctx.lineTo(x,y);ctx.lineTo(x+90,ground());ctx.fill()}
 ctx.strokeStyle='#242027';for(let i=0;i<35;i++){const x=(i*97)%w,y=(i*53)%Math.max(150,h*.48);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+((i%3)-1)*12,y+12+(i%4)*4);ctx.stroke()}
}

function drawTerrain(w,h){
 const gy=ground();ctx.fillStyle='#24211c';ctx.fillRect(0,gy,w,h-gy);ctx.fillStyle='#30271f';for(let i=0;i<90;i++){const x=(i*137)%w,y=gy+10+(i*47)%Math.max(20,h-gy);ctx.fillRect(x,y,4+(i%13),2)}
 ctx.fillStyle='#17191a';ctx.beginPath();ctx.moveTo(0,gy+25);ctx.quadraticCurveTo(w*.5,gy-10,w,gy+18);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
}

function drawKeep(){
 const gy=ground();ctx.fillStyle='#24262a';ctx.fillRect(24,gy-210,115,220);ctx.fillStyle='#303238';ctx.fillRect(12,gy-232,139,25);for(let x=16;x<145;x+=32)ctx.fillRect(x,gy-252,18,26);
 ctx.fillStyle='#14161a';ctx.fillRect(55,gy-160,38,160);ctx.beginPath();ctx.arc(74,gy-160,19,Math.PI,0);ctx.fill();
 ctx.fillStyle='#6e5a36';ctx.fillRect(130,gy-175,28,58);ctx.fillStyle='#a64b38';ctx.beginPath();ctx.moveTo(130,gy-175);ctx.lineTo(185,gy-158);ctx.lineTo(130,gy-142);ctx.fill();
 ctx.strokeStyle='#404247';for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(24,gy-210+i*27);ctx.lineTo(139,gy-210+i*27);ctx.stroke()}
}

function drawRuins(w){const gy=ground();for(let i=0;i<9;i++){const x=220+i*(w-300)/8;ctx.fillStyle='#1d1e1e';ctx.fillRect(x,gy-25-(i%3)*8,6,25+(i%3)*8);ctx.fillRect(x-9,gy-24-(i%3)*8,24,4)}}

function drawUnit(u){
 const d=UNIT[u.type],x=u.x,y=u.y+Math.sin(u.bob)*1.5;ctx.save();ctx.translate(x,y);
 ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(0,2,18,5,0,0,6.28);ctx.fill();ctx.strokeStyle='#202227';ctx.fillStyle=d.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-30,10,0,6.28);ctx.fill();ctx.stroke();ctx.fillStyle=u.type==='mage'?'#2c2147':'#2b3034';ctx.fillRect(-9,-20,18,24);
 if(u.type==='guard'){ctx.fillStyle='#90959b';ctx.fillRect(7,-21,9,25);ctx.strokeStyle='#bbb';ctx.beginPath();ctx.moveTo(-11,-12);ctx.lineTo(18,-48);ctx.stroke()}
 if(u.type==='ranger'){ctx.strokeStyle='#8b7450';ctx.beginPath();ctx.arc(6,-18,13,-1.2,1.2);ctx.stroke();ctx.beginPath();ctx.moveTo(12,-30);ctx.lineTo(12,-6);ctx.stroke()}
 if(u.type==='mage'){ctx.fillStyle='#987be0';ctx.beginPath();ctx.arc(13,-32,5,0,6.28);ctx.fill();ctx.strokeStyle='#6f5aaa';ctx.beginPath();ctx.moveTo(10,-28);ctx.lineTo(18,-5);ctx.stroke()}
 hpBar(-17,-58,u.hp/u.maxHp,'#6e8964');ctx.restore();
}

function drawEnemy(e){
 const x=e.x,y=e.y+Math.sin(e.bob)*1.8,s=e.size;ctx.save();ctx.translate(x,y);ctx.fillStyle='#0009';ctx.beginPath();ctx.ellipse(0,3,s,5,0,0,6.28);ctx.fill();
 if(e.type==='dreadlord'){ctx.fillStyle='#201417';ctx.beginPath();ctx.moveTo(-28,-8);ctx.lineTo(0,-72);ctx.lineTo(31,-8);ctx.fill()}
 ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,-30,s*.58,0,6.28);ctx.fill();ctx.fillRect(-s*.45,-25,s*.9,26);ctx.fillStyle='#e14745';ctx.fillRect(-7,-34,4,3);ctx.fillRect(4,-34,4,3);
 if(e.type==='wraith'){ctx.strokeStyle='#8b77bd';ctx.beginPath();ctx.moveTo(-10,-15);ctx.quadraticCurveTo(-22,2,-5,5);ctx.moveTo(8,-15);ctx.quadraticCurveTo(20,0,5,6);ctx.stroke()}
 hpBar(-17,-58-(e.type==='dreadlord'?22:0),e.hp/e.maxHp,e.type==='dreadlord'?'#9a3138':'#8c6658');ctx.restore();
}

function hpBar(x,y,pct,color){ctx.fillStyle='#050607';ctx.fillRect(x,y,34,4);ctx.fillStyle=color;ctx.fillRect(x+1,y+1,32*clamp(pct,0,1),2)}
function drawProjectile(p){ctx.fillStyle=p.kind==='arcane'?'#9e83ef':'#c4b27e';ctx.beginPath();ctx.arc(p.x,p.y,p.kind==='arcane'?5:2,0,6.28);ctx.fill();if(p.kind==='arcane'){ctx.strokeStyle='#6f56bd88';ctx.beginPath();ctx.moveTo(p.x-12,p.y+3);ctx.lineTo(p.x,p.y);ctx.stroke()}}

function burst(x,y,color,n){for(let i=0;i<n;i++)particles.push({x,y,vx:rand(-75,75),vy:rand(-100,25),life:rand(.25,.7),max:.7,color,size:rand(1,4)})}
function ring(x,y,r,color){particles.push({ring:true,x,y,life:.5,max:.5,r,color})}
function beam(x,y){particles.push({beam:true,x,y,life:.18,max:.18,color:'#b393ff'})}
function floater(x,y,text,color){floaters.push({x,y,text,color,life:.75})}

function updateFx(dt){
 for(const p of particles){p.life-=dt;if(!p.ring&&!p.beam){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=150*dt}}
 for(const f of floaters){f.life-=dt;f.y-=24*dt}
 for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);
 for(let i=floaters.length-1;i>=0;i--)if(floaters[i].life<=0)floaters.splice(i,1);
}
function drawFx(){
 for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);if(p.ring){ctx.strokeStyle=p.color;ctx.lineWidth=5*p.life/p.max;ctx.beginPath();ctx.ellipse(p.x,p.y,p.r*(1-p.life/p.max*.6),28,0,0,6.28);ctx.stroke()}else if(p.beam){ctx.strokeStyle=p.color;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(p.x,20);ctx.lineTo(p.x,p.y);ctx.stroke()}else{ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}}
 for(const f of floaters){ctx.globalAlpha=f.life/.75;ctx.fillStyle=f.color;ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y)}ctx.globalAlpha=1;
}

function announce(text,duration=1400){ui.announcement.textContent=text;ui.announcement.classList.add('show');clearTimeout(announce.t);announce.t=setTimeout(()=>ui.announcement.classList.remove('show'),duration)}
function updateUI(){
 ui.gold.textContent=Math.floor(state.gold);ui.mana.textContent=Math.floor(state.mana)+'/'+state.maxMana;ui.crowns.textContent=state.crowns;ui.wave.textContent=state.wave;
 ui.keepHpText.textContent=Math.ceil(state.keepHp)+' / '+state.maxKeepHp;ui.keepHpBar.style.width=(100*state.keepHp/state.maxKeepHp)+'%';ui.wardText.textContent=((state.keepLevel-1)*5)+'%';
 ui.waveBar.style.width=clamp(100*(state.spawned-enemies.length*.55)/state.waveQuota,0,100)+'%';
 const kc=120*state.keepLevel,ic=140*state.incomeLevel;ui.keepCost.textContent=kc+'g';ui.incomeCost.textContent=ic+'g';
 document.querySelectorAll('.card').forEach(b=>b.disabled=state.gold<UNIT[b.dataset.unit].cost||state.over);
 document.querySelectorAll('.spell').forEach(b=>{const k=b.dataset.spell,s=SPELL[k];b.disabled=state.mana<s.cost||cooldown[k]>0||state.over;b.querySelector('em').textContent=cooldown[k]>0?cooldown[k].toFixed(1)+'s':s.cost+'m'});
}

document.querySelectorAll('.card').forEach(b=>b.onclick=()=>recruit(b.dataset.unit));
document.querySelectorAll('.spell').forEach(b=>b.onclick=()=>selectSpell(b.dataset.spell));
el('upgradeKeep').onclick=()=>{const c=120*state.keepLevel;if(state.gold>=c){state.gold-=c;state.keepLevel++;state.maxKeepHp+=300;state.keepHp=Math.min(state.maxKeepHp,state.keepHp+300);updateUI()}};
el('upgradeIncome').onclick=()=>{const c=140*state.incomeLevel;if(state.gold>=c){state.gold-=c;state.incomeLevel++;updateUI()}};
el('pauseBtn').onclick=()=>{state.paused=!state.paused;el('pauseBtn').textContent=state.paused?'▶':'Ⅱ'};
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();cast(state.selectedSpell,e.clientX-r.left)});

function selectSpell(k){state.selectedSpell=k;document.querySelectorAll('.spell').forEach(x=>x.classList.toggle('selected',x.dataset.spell===k))}
window.addEventListener('keydown',e=>{
 if(e.repeat)return;
 if(e.key==='1')recruit('guard');if(e.key==='2')recruit('ranger');if(e.key==='3')recruit('mage');
 if(e.key.toLowerCase()==='q')selectSpell('bolt');if(e.key.toLowerCase()==='w')selectSpell('frost');if(e.key.toLowerCase()==='e')selectSpell('nova');
 if(e.code==='Space'){e.preventDefault();el('pauseBtn').click()}
});

let last=performance.now();
function loop(t){const dt=Math.min(.033,(t-last)/1000);last=t;update(dt);draw();requestAnimationFrame(loop)}
announce('MUSTER THE BLACKKEEP');updateUI();requestAnimationFrame(loop);
})();