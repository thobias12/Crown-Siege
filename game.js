import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const canvas = $('#scene');

const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17130f);
scene.fog = new THREE.FogExp2(0x18130f, .025);

const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clock = new THREE.Clock();

const COLORS = {
  wood:0x5a3924, woodDark:0x2d1a11, green:0x677f3f, green2:0x3e542a,
  blue:0x315d78, red:0x8c3f3f, gold:0xcaa05b, paper:0xd7c7a4, stone:0x77736a,
  steel:0x747f86, leather:0x6b4b32, black:0x151719
};

const UNIT_DEFS = {
  swords:{name:'Swordsmen',type:'Melee Infantry',attack:18,armor:16,hp:120,speed:2.1,range:.72,rate:.85,cost:45,color:0x6b7780,trait:'Reliable line infantry. Strong when holding a formation.',count:12},
  spears:{name:'Spearmen',type:'Melee Infantry',attack:14,armor:18,hp:132,speed:1.9,range:.9,rate:1.0,cost:50,color:0x596a55,trait:'Long reach and strong defensive staying power.',count:12},
  archers:{name:'Longbowmen',type:'Ranged Infantry',attack:15,armor:7,hp:82,speed:2.2,range:5.2,rate:1.25,cost:55,color:0x6f7751,trait:'Long range. Vulnerable if caught in melee.',count:12,ranged:true},
  greats:{name:'Greatswords',type:'Heavy Infantry',attack:26,armor:13,hp:130,speed:1.8,range:.78,rate:1.15,cost:75,color:0x7e6e66,trait:'Slow, heavy-hitting shock infantry.',count:10},
  halberd:{name:'Halberdiers',type:'Polearm Infantry',attack:21,armor:17,hp:125,speed:1.8,range:1.05,rate:1.1,cost:70,color:0x5f6b72,trait:'Excellent reach and a sturdy front line.',count:12},
  crossbow:{name:'Crossbowmen',type:'Ranged Infantry',attack:22,armor:10,hp:90,speed:1.8,range:4.5,rate:1.6,cost:80,color:0x6c5d48,trait:'Powerful bolts with a slower reload.',count:10,ranged:true},
  cavalry:{name:'Lancers',type:'Cavalry',attack:27,armor:15,hp:145,speed:3.5,range:.9,rate:1.05,cost:95,color:0x715d48,trait:'Fast flanking regiment with strong charge damage.',count:8,cavalry:true}
};

const ENEMY_POOL = ['swords','spears','archers','greats','halberd','crossbow','cavalry'];

const mapNodes = [
  {id:'s',stage:0,x:-6.3,z:3.7,type:'start',links:['a','b']},
  {id:'a',stage:1,x:-4.5,z:2.0,type:'battle',links:['c','d']},
  {id:'b',stage:1,x:-4.6,z:5.2,type:'recruit',links:['d','e']},
  {id:'c',stage:2,x:-2.3,z:1.2,type:'treasure',links:['f','g']},
  {id:'d',stage:2,x:-2.1,z:3.6,type:'battle',links:['f','g']},
  {id:'e',stage:2,x:-2.3,z:6.0,type:'battle',links:['g','h']},
  {id:'f',stage:3,x:.2,z:1.8,type:'recruit',links:['i','j']},
  {id:'g',stage:3,x:.1,z:4.0,type:'elite',links:['i','j']},
  {id:'h',stage:3,x:.0,z:6.1,type:'inn',links:['j']},
  {id:'i',stage:4,x:2.6,z:2.6,type:'battle',links:['k','l']},
  {id:'j',stage:4,x:2.6,z:5.1,type:'treasure',links:['k','l']},
  {id:'k',stage:5,x:4.7,z:2.8,type:'recruit',links:['m']},
  {id:'l',stage:5,x:4.8,z:5.0,type:'battle',links:['m']},
  {id:'m',stage:6,x:6.6,z:3.9,type:'boss',links:[]}
];

const state = {
  mode:'hero', hero:null, gold:120, renown:0, stage:0, currentNode:'s',
  visited:new Set(['s']), available:new Set(['a','b']), roster:[],
  selectedId:null, battlePhase:'none', battleKind:'battle', speed:1,
  hold:false, tight:false, runMods:{attack:1,hp:1,speed:1}, battleReward:0
};

const world = new THREE.Group();
const boardRoot = new THREE.Group();
const decorRoot = new THREE.Group();
const effectsRoot = new THREE.Group();
scene.add(world, boardRoot, decorRoot, effectsRoot);

const nodeMeshes = [];
const regiments = [];
const projectiles = [];
const clickable = [];
let boardPlane = null;
let hoverNode = null;

const cam = {yaw:0.05,pitch:.82,dist:17,target:new THREE.Vector3(0,.3,3.6),drag:false,moved:false,lastX:0,lastY:0};
const pointer = {downX:0,downY:0,button:0};

initLights();
buildTavern();
resize();
updateCamera();
window.addEventListener('resize', resize);

function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}

function mat(color, rough=.8, metal=.05){
  return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
}
function mesh(geo, material, parent=world, shadows=true){
  const m=new THREE.Mesh(geo,material);
  if(shadows){m.castShadow=true;m.receiveShadow=true}
  parent.add(m);
  return m;
}
function box(w,h,d,color,parent=world){
  return mesh(new THREE.BoxGeometry(w,h,d),mat(color),parent);
}
function cyl(r1,r2,h,color,parent=world,segments=12){
  return mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat(color),parent);
}
function rand(a,b){return a+Math.random()*(b-a)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}

function initLights(){
  scene.add(new THREE.HemisphereLight(0xd5c2a4,0x1b1f17,1.25));
  const key=new THREE.DirectionalLight(0xffdfb0,2.1);
  key.position.set(-6,12,5);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.left=-12;key.shadow.camera.right=12;key.shadow.camera.top=12;key.shadow.camera.bottom=-12;
  scene.add(key);
  const warm=new THREE.PointLight(0xffa347,3.2,12,2);
  warm.position.set(-6,5,-4);scene.add(warm);
  const warm2=new THREE.PointLight(0xffc26b,2.4,10,2);
  warm2.position.set(6,4,-5);scene.add(warm2);
}

function buildTavern(){
  world.clear();
  const floor=box(22,.35,18,0x352216,world);
  floor.position.set(0,-1.25,2.2);
  for(let i=-10;i<=10;i+=1.1){
    const plank=box(1,.02,17.5,i%2?0x3e2819:0x472c1a,world);
    plank.position.set(i,-1.06,2.2);
  }
  const back=box(22,9,.35,0x33261e,world);back.position.set(0,3,-6.2);
  const side=box(.35,9,18,0x2a201a,world);side.position.set(-10.8,3,2.1);

  const table=box(18,.72,11.3,COLORS.wood,world);
  table.position.set(0,-.1,3.5);
  table.material.roughness=.92;
  const rimMat=mat(0x2f1b10);
  const rim1=mesh(new THREE.BoxGeometry(18.6,.35,.35),rimMat,world);rim1.position.set(0,.18,-2.15);
  const rim2=rim1.clone();rim2.position.z=9.15;world.add(rim2);
  const rim3=mesh(new THREE.BoxGeometry(.35,.35,11.3),rimMat,world);rim3.position.set(-9.15,.18,3.5);
  const rim4=rim3.clone();rim4.position.x=9.15;world.add(rim4);

  for(const p of [[-8,-.8,0],[8,-.8,0],[-8,-.8,7],[8,-.8,7]]){
    const leg=box(.65,2.2,.65,0x2b190f,world);leg.position.set(p[0],-1.7,p[2]);
  }

  buildShelf(-5.8,1.8,-5.75);
  buildShelf(4.8,1.4,-5.75);
  candle(-7.5,.72,-1.1);
  candle(7.1,.72,-.7);
  candle(8.1,.72,7.6);
  mug(-7.2,.55,7.8);
  mug(7.5,.55,8.1);

  const chairMat=mat(0x3a2417);
  for(const x of [-5,-1,3,7]){
    const seat=mesh(new THREE.BoxGeometry(1.3,.25,1.3),chairMat,world);seat.position.set(x,-.2,10.5);
    const backC=mesh(new THREE.BoxGeometry(1.3,2.1,.25),chairMat,world);backC.position.set(x,.8,11);
  }
}

function buildShelf(x,y,z){
  const p=new THREE.Group();p.position.set(x,y,z);world.add(p);
  const backing=box(5,3.2,.35,0x241710,p);backing.position.z=0;
  for(let row=-1;row<=1;row++){
    const s=box(5.2,.16,.55,0x4c2e1b,p);s.position.set(0,row*1.1,.25);
    for(let i=-2;i<=2;i++){
      const bottle=cyl(.13,.1,.55,[0x3e5b43,0x573a28,0x314c55][(i+row+8)%3],p,8);
      bottle.position.set(i*.8+rand(-.12,.12),row*1.1+.38,.35);
    }
  }
}

function candle(x,y,z){
  const g=new THREE.Group();g.position.set(x,y,z);world.add(g);
  const wax=cyl(.12,.14,.65,0xe6d1a1,g,10);wax.position.y=.32;
  const flame=mesh(new THREE.SphereGeometry(.08,8,6),new THREE.MeshBasicMaterial({color:0xffb44f}),g,false);flame.scale.y=1.7;flame.position.y=.78;
  const light=new THREE.PointLight(0xff9a3d,2.3,4,2);light.position.y=.8;g.add(light);
}
function mug(x,y,z){
  const g=new THREE.Group();g.position.set(x,y,z);world.add(g);
  const cup=cyl(.25,.22,.45,0x6a4930,g,12);cup.position.y=.23;
  const handle=mesh(new THREE.TorusGeometry(.23,.055,6,12,Math.PI*1.45),mat(0x6a4930),g);handle.rotation.y=Math.PI/2;handle.position.set(.23,.28,0);
}

function clearBoard(){
  while(boardRoot.children.length)boardRoot.remove(boardRoot.children[0]);
  while(effectsRoot.children.length)effectsRoot.remove(effectsRoot.children[0]);
  nodeMeshes.length=0;regiments.length=0;projectiles.length=0;clickable.length=0;
  boardPlane=null;state.selectedId=null;
  $('#unitPanel').classList.add('hidden');
}

function createBoard(baseColor=COLORS.green){
  const board=box(16.6,.28,8.5,baseColor,boardRoot);
  board.position.set(0,.52,3.55);
  board.receiveShadow=true;
  boardPlane=board;
  const edge=mat(0x4b3524);
  const e1=mesh(new THREE.BoxGeometry(17,.42,.22),edge,boardRoot);e1.position.set(0,.54,-.82);
  const e2=e1.clone();e2.position.z=7.92;boardRoot.add(e2);
  const e3=mesh(new THREE.BoxGeometry(.22,.42,8.6),edge,boardRoot);e3.position.set(-8.4,.54,3.55);
  const e4=e3.clone();e4.position.x=8.4;boardRoot.add(e4);
  return board;
}

function tree(x,z,s=1){
  const g=new THREE.Group();g.position.set(x,.72,z);boardRoot.add(g);
  const trunk=cyl(.08,.12,.45,0x5a3d25,g,7);trunk.position.y=.2;
  const c1=mesh(new THREE.ConeGeometry(.42*s,1.05*s,7),mat(0x29422a),g);c1.position.y=.78*s;
  const c2=mesh(new THREE.ConeGeometry(.32*s,.85*s,7),mat(0x355837),g);c2.position.y=1.22*s;
}
function rock(x,z,s=1){
  const r=mesh(new THREE.DodecahedronGeometry(.28*s,0),mat(0x68665e),boardRoot);r.scale.y=.65;r.position.set(x,.82,z);r.rotation.set(rand(-.2,.2),rand(0,6),rand(-.2,.2));
}

function lineBetween(a,b,color=0xe9dbc0){
  const va=new THREE.Vector3(a.x,.76,a.z),vb=new THREE.Vector3(b.x,.76,b.z);
  const dir=new THREE.Vector3().subVectors(vb,va),len=dir.length(),mid=va.clone().add(vb).multiplyScalar(.5);
  const m=mesh(new THREE.CylinderGeometry(.027,.027,len,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.68}),boardRoot,false);
  m.position.copy(mid);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  return m;
}

function buildCampaign(){
  clearBoard();
  state.mode='campaign';state.battlePhase='none';
  $('#startBattle').classList.add('hidden');
  $('#battleInfo').classList.add('hidden');
  $('#campaignHint').classList.remove('hidden');
  $('#modeLabel').textContent='Tavern campaign map';
  $('#rosterSub').textContent='Choose a road on the campaign map';
  cam.target.set(0,.4,3.6);cam.dist=17;cam.pitch=.9;cam.yaw=.03;
  createBoard(0x667c43);

  for(let i=0;i<34;i++){
    const x=rand(-7.8,7.8),z=rand(-.2,7.3);
    if(Math.random()<.72)tree(x,z,rand(.6,1.0)); else rock(x,z,rand(.6,1.1));
  }

  mapNodes.forEach(n=>{
    n.links.forEach(id=>{
      const b=mapNodes.find(q=>q.id===id);
      lineBetween(n,b,state.visited.has(n.id)&&state.visited.has(b.id)?0xd5a450:0xded3b8);
    });
  });

  for(const n of mapNodes){
    const g=new THREE.Group();g.position.set(n.x,.83,n.z);g.userData.node=n;boardRoot.add(g);
    const active=state.available.has(n.id),visited=state.visited.has(n.id);
    const color=visited?0x9b7738:active?0xd4a84e:0x866f55;
    const disc=cyl(.28,.34,.13,color,g,18);disc.rotation.x=0;disc.position.y=.02;disc.userData.node=n;
    const ring=mesh(new THREE.TorusGeometry(.39,.035,6,22),new THREE.MeshBasicMaterial({color:active?0xffd477:0x46392e}),g,false);ring.rotation.x=Math.PI/2;ring.position.y=.09;
    const marker=makeNodeMarker(n.type,g);marker.position.y=.38;
    if(active){
      const glow=mesh(new THREE.RingGeometry(.42,.52,24),new THREE.MeshBasicMaterial({color:0xffd46a,transparent:true,opacity:.42,side:THREE.DoubleSide}),g,false);
      glow.rotation.x=-Math.PI/2;glow.position.y=.03;glow.userData.pulse=Math.random()*6.2;
    }
    nodeMeshes.push(g);clickable.push(disc,marker);
  }
  updatePips();renderRoster();updateResources();
}

function makeNodeMarker(type,parent){
  const colors={battle:0xa64842,elite:0x7f3656,recruit:0x476b7a,treasure:0xa77a32,inn:0x5e7e55,boss:0x401e26,start:0x63726d};
  const g=new THREE.Group();parent.add(g);
  const post=cyl(.045,.055,.4,0x6a4b2f,g,8);post.position.y=.05;
  const plaque=box(.42,.34,.08,colors[type]||0x666666,g);plaque.position.y=.28;plaque.rotation.y=.12;
  const top=type==='boss'?mesh(new THREE.ConeGeometry(.18,.25,4),mat(0xd0a14b),g):null;
  if(top){top.position.y=.58;top.rotation.y=Math.PI/4}
  g.userData.node=parent.userData.node;
  return g;
}

function updatePips(){
  const p=$('#runPips');p.innerHTML='';
  for(let i=1;i<=6;i++){
    const e=document.createElement('i');e.className='pip'+(i<state.stage?' done':i===state.stage?' current':'');p.appendChild(e);
  }
}

function chooseNode(node){
  if(state.mode!=='campaign'||!state.available.has(node.id))return;
  state.currentNode=node.id;state.stage=node.stage;state.visited.add(node.id);state.available.clear();
  updatePips();
  if(node.type==='battle'||node.type==='elite'||node.type==='boss')enterBattle(node.type);
  else if(node.type==='recruit')showRecruit();
  else if(node.type==='treasure')showTreasure();
  else if(node.type==='inn'){healRoster(.42);state.gold+=25;showBanner('RESTED AT THE WAYFARER INN');setTimeout(()=>advanceFromNode(node),850)}
}

function advanceFromNode(node){
  state.available=new Set(node.links);
  if(node.links.length===0){
    showRunComplete();
    return;
  }
  buildCampaign();
}

function enterBattle(kind){
  clearBoard();
  state.mode='battle';state.battlePhase='deploy';state.battleKind=kind;
  $('#campaignHint').classList.add('hidden');
  $('#battleInfo').classList.remove('hidden');
  $('#startBattle').classList.remove('hidden');
  $('#modeLabel').textContent='Battle deployment';
  $('#rosterSub').textContent='Deploy regiments, then start battle';
  cam.target.set(0,.4,3.4);cam.dist=15.6;cam.pitch=.92;cam.yaw=.02;
  createBoard(0x6b8246);

  for(let i=0;i<18;i++){
    const side=Math.random()<.5?-1:1;
    const x=side*rand(5.7,7.5),z=rand(-.1,7.2);
    if(Math.random()<.7)tree(x,z,rand(.7,1.15));else rock(x,z,rand(.7,1.2));
  }
  for(let i=0;i<10;i++){
    const tuft=mesh(new THREE.ConeGeometry(.07,.18,5),mat(0x8ca35a),boardRoot);
    tuft.position.set(rand(-5.2,5.2),.78,rand(.1,7.0));
  }

  const zs=spreadPositions(state.roster.length,1.0,6.2);
  state.roster.forEach((u,i)=>{
    const r=createRegiment(u,false,-4.7,zs[i]);
    r.source=u;
  });

  const difficulty=1+state.stage*.14+(kind==='elite'?.28:0)+(kind==='boss'?.65:0);
  const enemyN=kind==='boss'?Math.max(4,state.roster.length+1):Math.max(3,Math.min(6,state.roster.length+(kind==='elite'?1:0)));
  const ez=spreadPositions(enemyN,.9,6.4);
  for(let i=0;i<enemyN;i++){
    let key=ENEMY_POOL[(state.stage+i*2)%ENEMY_POOL.length];
    if(kind==='boss'&&i===0)key='greats';
    const def=cloneUnit(key);
    def.name=(kind==='boss'&&i===0)?'Black Banner Guard':'Enemy '+UNIT_DEFS[key].name;
    def.hp=Math.round(def.hp*difficulty);def.maxHp=def.hp;def.attack=Math.round(def.attack*difficulty*.9);
    if(kind==='boss'&&i===0){def.hp*=2.3;def.maxHp=def.hp;def.attack=Math.round(def.attack*1.4);def.count=16}
    createRegiment(def,true,4.8,ez[i]);
  }
  renderRoster();updateBattleCounts();showBanner(kind==='boss'?'THE BLACK BANNER AWAITS':'DEPLOY YOUR WAR BAND');
}

function spreadPositions(n,min,max){
  if(n<=1)return[(min+max)/2];
  const arr=[];for(let i=0;i<n;i++)arr.push(lerp(min,max,i/(n-1)));return arr;
}

function cloneUnit(key){
  const d=UNIT_DEFS[key];
  const hp=Math.round(d.hp*state.runMods.hp*(state.hero==='thane'?1.2:1));
  return {id:'u'+Math.random().toString(36).slice(2,8),key,name:d.name,type:d.type,attack:Math.round(d.attack*state.runMods.attack),armor:d.armor,hp,maxHp:hp,speed:d.speed*state.runMods.speed,range:d.range,rate:d.rate,cost:d.cost,color:d.color,trait:d.trait,count:d.count,ranged:!!d.ranged,cavalry:!!d.cavalry};
}

function createRegiment(unit,enemy,x,z){
  const group=new THREE.Group();group.position.set(x,.76,z);boardRoot.add(group);
  const r={id:'r'+Math.random().toString(36).slice(2,9),unit,enemy,group,x,z,targetX:x,targetZ:z,command:false,attackCd:rand(0,.4),dead:false,engaged:false,charge:0,ring:null,soldiers:[],source:null};
  group.userData.regiment=r;

  const cols=unit.cavalry?4:4;
  const rows=Math.ceil(unit.count/cols);
  for(let i=0;i<unit.count;i++){
    const c=i%cols,row=Math.floor(i/cols);
    const sx=(c-(cols-1)/2)*.28;
    const sz=(row-(rows-1)/2)*.31;
    const s=makeSoldier(unit,enemy);
    s.position.set(sx,0,sz);s.userData.regiment=r;group.add(s);r.soldiers.push(s);clickable.push(s);
  }

  const banner=new THREE.Group();banner.position.set(0,.08,-.58);group.add(banner);
  const pole=cyl(.025,.025,1.35,0x503a28,banner,6);pole.position.y=.58;
  const flag=box(.52,.55,.035,enemy?COLORS.red:COLORS.blue,banner);flag.position.set(.27,.93,0);
  const sig=mesh(new THREE.RingGeometry(.10,.145,4),new THREE.MeshBasicMaterial({color:0xe8d6ae,side:THREE.DoubleSide}),banner,false);sig.rotation.y=Math.PI/2;sig.position.set(.29,.94,.025);
  flag.userData.regiment=r;clickable.push(flag);

  const ring=mesh(new THREE.RingGeometry(.64,.72,32),new THREE.MeshBasicMaterial({color:0xf1d47a,transparent:true,opacity:0,side:THREE.DoubleSide}),group,false);
  ring.rotation.x=-Math.PI/2;ring.position.y=.015;r.ring=ring;
  regiments.push(r);
  return r;
}

function makeSoldier(unit,enemy){
  const g=new THREE.Group();
  const faction=enemy?0x7c3c38:unit.color;
  const body=mesh(new THREE.CylinderGeometry(.105,.14,.36,7),mat(faction),g);body.position.y=.25;
  const head=mesh(new THREE.SphereGeometry(.085,7,6),mat(0xc2a07a),g);head.position.y=.49;
  const helmet=mesh(new THREE.ConeGeometry(.105,.13,7),mat(unit.armor>14?0x7d8587:0x4d554d,.6,.25),g);helmet.position.y=.59;
  const weaponMat=mat(0x8d8e86,.45,.45);
  if(unit.ranged){
    const bow=mesh(new THREE.TorusGeometry(.13,.012,5,12,Math.PI),mat(0x6f4b2b),g);bow.rotation.y=Math.PI/2;bow.position.set(.11,.32,0);
  }else{
    const shaft=mesh(new THREE.CylinderGeometry(.012,.012,(unit.key==='spears'||unit.key==='halberd' ? .75 : .5),5),weaponMat,g);
    shaft.rotation.z=-.25;shaft.position.set(.12,.3,0);
  }
  if(unit.cavalry){
    const horse=mesh(new THREE.BoxGeometry(.24,.18,.46),mat(enemy?0x49362f:0x5b4a3c),g);horse.position.set(0,.12,0);body.position.y=.37;head.position.y=.61;helmet.position.y=.71;
  }
  g.scale.setScalar(unit.cavalry?1.15:1);
  return g;
}

function updateRegimentVisual(r){
  const ratio=clamp(r.unit.hp/r.unit.maxHp,0,1);
  const alive=Math.max(0,Math.ceil(r.unit.count*ratio));
  r.soldiers.forEach((s,i)=>s.visible=i<alive);
  r.ring.material.opacity=state.selectedId===r.id&&!r.enemy?.72:0;
}

function selectRegiment(r){
  if(!r||r.enemy)return;
  state.selectedId=r.id;
  regiments.forEach(updateRegimentVisual);
  showUnitPanel(r.unit);
  renderRoster();
}

function showUnitPanel(u){
  $('#unitPanel').classList.remove('hidden');
  $('#unitName').textContent=u.name;
  $('#unitType').textContent=u.type;
  $('#unitHp').style.width=clamp(u.hp/u.maxHp*100,0,100)+'%';
  $('#statAttack').textContent=u.attack;
  $('#statArmor').textContent=u.armor;
  $('#statSpeed').textContent=u.speed.toFixed(1);
  $('#statRange').textContent=u.range.toFixed(1);
  $('#unitTrait').textContent=u.trait;
}

function startBattle(){
  if(state.mode!=='battle'||state.battlePhase!=='deploy')return;
  state.battlePhase='fight';
  $('#startBattle').classList.add('hidden');
  $('#modeLabel').textContent='Battle in progress';
  showBanner(state.battleKind==='boss'?'BREAK THE BLACK BANNER':'BATTLE COMMENCED');
}

function updateBattle(dt){
  if(state.mode!=='battle')return;
  const allies=regiments.filter(r=>!r.enemy&&!r.dead),foes=regiments.filter(r=>r.enemy&&!r.dead);
  for(const r of regiments){
    if(r.dead)continue;
    updateRegimentVisual(r);
    if(state.battlePhase==='deploy')continue;
    r.attackCd-=dt*state.speed;
    const opponents=r.enemy?allies:foes;
    if(!opponents.length)continue;

    let target=nearestRegiment(r,opponents);
    let dx=target.x-r.x,dz=target.z-r.z,dist=Math.hypot(dx,dz);
    const desired=r.unit.ranged?r.unit.range:Math.max(.58,r.unit.range);

    if(!r.enemy&&r.command){
      const cx=r.targetX-r.x,cz=r.targetZ-r.z,cd=Math.hypot(cx,cz);
      if(cd>.16){
        moveRegiment(r,cx,cz,cd,dt);
        if(r.unit.cavalry)r.charge=Math.min(1,r.charge+dt*.7);
        continue;
      }else r.command=false;
    }

    if(dist>desired){
      moveRegiment(r,dx,dz,dist,dt);
      if(r.unit.cavalry)r.charge=Math.min(1,r.charge+dt*.65);
    }else if(r.attackCd<=0){
      r.attackCd=r.unit.rate;
      attack(r,target);
    }
  }

  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];p.life-=dt*state.speed;
    if(p.life<=0||!p.target||p.target.dead){effectsRoot.remove(p.mesh);projectiles.splice(i,1);continue}
    const a=p.mesh.position,b=p.target.group.position.clone().add(new THREE.Vector3(0,.45,0));
    const d=b.clone().sub(a),len=d.length();
    if(len<.28){
      damageRegiment(p.target,p.damage,p.attacker);
      effectsRoot.remove(p.mesh);projectiles.splice(i,1);
    }else a.add(d.normalize().multiplyScalar(Math.min(len,p.speed*dt*state.speed)));
  }

  cleanupDead();
  updateBattleCounts();

  const liveAllies=regiments.filter(r=>!r.enemy&&!r.dead);
  const liveFoes=regiments.filter(r=>r.enemy&&!r.dead);
  if(state.battlePhase==='fight'&&liveFoes.length===0)finishBattle(true);
  else if(state.battlePhase==='fight'&&liveAllies.length===0)finishBattle(false);
}

function nearestRegiment(r,list){
  let best=list[0],bd=Infinity;
  for(const q of list){const d=(q.x-r.x)*(q.x-r.x)+(q.z-r.z)*(q.z-r.z);if(d<bd){bd=d;best=q}}
  return best;
}

function moveRegiment(r,dx,dz,dist,dt){
  if(dist<.001)return;
  const sp=r.unit.speed*(state.hero==='warden'&&r.unit.ranged?1.18:1)*(state.tight?.84:1);
  const step=Math.min(dist,sp*dt*state.speed);
  r.x+=dx/dist*step;r.z+=dz/dist*step;
  r.group.position.x=r.x;r.group.position.z=r.z;
  r.group.rotation.y=Math.atan2(dx,dz);
}

function attack(attacker,target){
  const raw=attacker.unit.attack*(1-target.unit.armor*.018);
  let dmg=Math.max(3,raw*rand(.88,1.12));
  if(attacker.unit.cavalry&&attacker.charge>.35)dmg*=1+attacker.charge*.7;
  attacker.charge=0;

  if(attacker.unit.ranged){
    const orb=mesh(new THREE.SphereGeometry(.045,6,5),new THREE.MeshBasicMaterial({color:attacker.enemy?0xdc705e:0xf4dda0}),effectsRoot,false);
    orb.position.copy(attacker.group.position).add(new THREE.Vector3(0,.55,0));
    projectiles.push({mesh:orb,target,damage:dmg,attacker,speed:7.5,life:2});
  }else damageRegiment(target,dmg,attacker);
}

function damageRegiment(target,damage,attacker){
  if(target.dead)return;
  if(state.hero==='marshal'&&!target.enemy&&state.hold)damage*=.82;
  target.unit.hp-=damage;
  spawnHit(target.group.position,attacker&&attacker.unit.ranged?0xe9d89d:0xc66b59);
  if(target.unit.hp<=0){target.unit.hp=0;target.dead=true;target.ring.material.opacity=0}
  if(!target.enemy&&target.source){target.source.hp=target.unit.hp}
  if(state.selectedId===target.id)showUnitPanel(target.unit);
}

function spawnHit(pos,color){
  for(let i=0;i<5;i++){
    const m=mesh(new THREE.SphereGeometry(.025,5,4),new THREE.MeshBasicMaterial({color}),effectsRoot,false);
    m.position.copy(pos).add(new THREE.Vector3(rand(-.25,.25),rand(.2,.7),rand(-.25,.25)));
    m.userData.life=.35;m.userData.v=new THREE.Vector3(rand(-.3,.3),rand(.2,.7),rand(-.3,.3));
  }
}

function cleanupDead(){
  for(const r of regiments){
    if(r.dead&&!r.group.userData.fallen){
      r.group.userData.fallen=true;
      r.group.rotation.z=r.enemy?-.9:.9;
      r.group.position.y=.64;
      if(state.selectedId===r.id){state.selectedId=null;$('#unitPanel').classList.add('hidden')}
    }
  }
}

function finishBattle(win){
  if(state.battlePhase!=='fight')return;
  state.battlePhase='done';
  if(win){
    const base=state.battleKind==='boss'?140:state.battleKind==='elite'?85:50;
    state.battleReward=base+state.stage*8;
    $('#victoryReward').textContent='+'+state.battleReward+' coin';
    $('#victory').classList.add('on');
    state.renown+=state.battleKind==='boss'?5:state.battleKind==='elite'?2:1;
  }else{
    showBanner('YOUR WAR BAND IS BROKEN');
    setTimeout(()=>{
      resetRun();
      $('#modal').classList.add('on');
    },1200);
  }
}

function completeVictory(){
  $('#victory').classList.remove('on');
  state.gold+=state.battleReward;
  healRoster(.18);
  const node=mapNodes.find(n=>n.id===state.currentNode);
  if(state.battleKind==='boss'){
    showRunComplete();
    return;
  }
  if(state.battleKind==='elite')showTreasure(()=>advanceFromNode(node));
  else advanceFromNode(node);
}

function healRoster(frac){
  state.roster.forEach(u=>u.hp=Math.min(u.maxHp,u.hp+u.maxHp*frac));
}

function showRecruit(done){
  const choices=shuffle(Object.keys(UNIT_DEFS)).slice(0,3);
  showChoice('RECRUIT UNITS','Choose one','Add a regiment to your war band.',choices.map(key=>({kind:'unit',key})), picked=>{
    if(picked){const u=cloneUnit(picked.key);state.roster.push(u)}
    renderRoster();const node=mapNodes.find(n=>n.id===state.currentNode);(done||(()=>advanceFromNode(node)))();
  });
}

function showTreasure(done){
  const loot=[
    {kind:'mod',key:'attack',name:'Tempered Blades',sub:'Weapon Gear',desc:'+15% attack to all current and future regiments.',value:1.15,symbol:'⚔'},
    {kind:'mod',key:'hp',name:'Reinforced Mail',sub:'Armor Gear',desc:'+18% maximum health to all current and future regiments.',value:1.18,symbol:'◆'},
    {kind:'mod',key:'speed',name:'Marching Boots',sub:'Campaign Gear',desc:'+14% movement speed for all regiments.',value:1.14,symbol:'➟'}
  ];
  showChoice('CHOOSE GEAR','Take one','Equip the whole war band with a permanent run upgrade.',shuffle(loot),picked=>{
    if(picked)applyMod(picked);
    const node=mapNodes.find(n=>n.id===state.currentNode);(done||(()=>advanceFromNode(node)))();
  });
}

function applyMod(item){
  const old=state.runMods[item.key];state.runMods[item.key]*=item.value;
  if(item.key==='attack')state.roster.forEach(u=>u.attack=Math.round(u.attack*item.value));
  if(item.key==='hp')state.roster.forEach(u=>{const ratio=u.hp/u.maxHp;u.maxHp=Math.round(u.maxHp*item.value);u.hp=u.maxHp*ratio});
  if(item.key==='speed')state.roster.forEach(u=>u.speed*=item.value);
  showBanner(item.name.toUpperCase()+' EQUIPPED');
}

function showChoice(kicker,title,text,items,onDone){
  $('#choiceKicker').textContent=kicker;
  $('#choiceTitle').textContent=title;
  $('#choiceText').textContent=text;
  const root=$('#choiceCards');root.innerHTML='';
  items.forEach(item=>{
    const b=document.createElement('button');b.className='choice-card';
    if(item.kind==='unit'){
      const d=UNIT_DEFS[item.key];
      b.innerHTML='<div class="choice-portrait" style="--u:#'+d.color.toString(16).padStart(6,'0')+'"></div><h3>'+d.name+'</h3><small>'+d.type+'</small><div class="choice-stats"><span>ATTACK<b>'+d.attack+'</b></span><span>ARMOR<b>'+d.armor+'</b></span><span>HEALTH<b>'+d.hp+'</b></span><span>RANGE<b>'+d.range.toFixed(1)+'</b></span></div><p>'+d.trait+'</p>';
    }else{
      b.innerHTML='<div class="choice-portrait" style="font-size:76px;display:grid;place-items:center;color:#d5ae67">'+item.symbol+'</div><h3>'+item.name+'</h3><small>'+item.sub+'</small><div class="choice-stats"><span>RARITY<b>RARE</b></span><span>RUN<b>PERMANENT</b></span></div><p>'+item.desc+'</p>';
    }
    b.onclick=()=>{$('#choiceModal').classList.remove('on');onDone(item)};
    root.appendChild(b);
  });
  $('#skipChoice').onclick=()=>{$('#choiceModal').classList.remove('on');onDone(null)};
  $('#choiceModal').classList.add('on');
}

function showRunComplete(){
  $('#victory').classList.remove('on');
  $('#choiceModal').classList.remove('on');
  $('#modalCard').innerHTML='<div class="eyebrow">CAMPAIGN COMPLETE</div><h1>THE TABLE <span>IS YOURS</span></h1><p class="lead">You broke the final host and finished this prototype campaign. Renown earned: '+state.renown+'.</p><button id="newRun" class="primary">BEGIN ANOTHER RUN</button>';
  $('#modal').classList.add('on');
  setTimeout(()=>{$('#newRun').onclick=()=>location.reload()},0);
}

function resetRun(){
  state.mode='hero';state.hero=null;state.gold=120;state.renown=0;state.stage=0;state.currentNode='s';state.visited=new Set(['s']);state.available=new Set(['a','b']);state.roster=[];state.selectedId=null;state.runMods={attack:1,hp:1,speed:1};
}

function renderRoster(){
  const root=$('#cards');root.innerHTML='';
  state.roster.forEach((u,i)=>{
    const card=document.createElement('button');card.className='unit-card';
    let selected=false;
    if(state.mode==='battle'){
      const r=regiments.find(q=>!q.enemy&&q.source===u);selected=r&&state.selectedId===r.id;
    }
    if(selected)card.classList.add('selected');
    card.style.setProperty('--u','#'+u.color.toString(16).padStart(6,'0'));
    card.innerHTML='<span class="badge">'+Math.max(0,Math.ceil(u.hp/u.maxHp*u.count))+'</span><div class="portrait"></div><strong>'+u.name+'</strong><div class="mini-hp"><i style="width:'+clamp(u.hp/u.maxHp*100,0,100)+'%"></i></div>';
    card.onclick=()=>{
      if(state.mode==='battle'){
        const r=regiments.find(q=>!q.enemy&&q.source===u&&!q.dead);if(r)selectRegiment(r);
      }
    };
    root.appendChild(card);
  });
  $('#formationBtn').disabled=state.mode!=='battle';
  $('#holdBtn').disabled=state.mode!=='battle';
  $('#speedBtn').disabled=state.mode!=='battle'||state.battlePhase==='deploy';
}

function updateResources(){
  $('#gold').textContent=Math.floor(state.gold);
  $('#renown').textContent=state.renown;
}

function updateBattleCounts(){
  const a=regiments.filter(r=>!r.enemy&&!r.dead).reduce((n,r)=>n+Math.ceil(r.unit.count*clamp(r.unit.hp/r.unit.maxHp,0,1)),0);
  const e=regiments.filter(r=>r.enemy&&!r.dead).reduce((n,r)=>n+Math.ceil(r.unit.count*clamp(r.unit.hp/r.unit.maxHp,0,1)),0);
  $('#allyCount').textContent=a;$('#enemyCount').textContent=e;
  renderRoster();
}

function showBanner(text){
  const b=$('#banner');b.textContent=text;b.classList.add('show');clearTimeout(showBanner.t);showBanner.t=setTimeout(()=>b.classList.remove('show'),1300);
}

function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

function updateCamera(){
  const cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch);
  camera.position.set(
    cam.target.x+Math.sin(cam.yaw)*cp*cam.dist,
    cam.target.y+sp*cam.dist,
    cam.target.z+Math.cos(cam.yaw)*cp*cam.dist
  );
  camera.lookAt(cam.target);
}

function pointerNdc(e){
  const r=canvas.getBoundingClientRect();
  mouse.x=((e.clientX-r.left)/r.width)*2-1;
  mouse.y=-((e.clientY-r.top)/r.height)*2+1;
}
function raycast(e,objects=clickable){
  pointerNdc(e);raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects(objects,true);
}
function rayBoard(e){
  if(!boardPlane)return null;
  pointerNdc(e);raycaster.setFromCamera(mouse,camera);
  const hit=raycaster.intersectObject(boardPlane,false)[0];
  return hit?hit.point:null;
}

canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  pointer.button=e.button;pointer.downX=e.clientX;pointer.downY=e.clientY;
  cam.drag=e.button===0;cam.moved=false;cam.lastX=e.clientX;cam.lastY=e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(cam.drag&&e.buttons===1){
    const dx=e.clientX-cam.lastX,dy=e.clientY-cam.lastY;
    if(Math.hypot(e.clientX-pointer.downX,e.clientY-pointer.downY)>5)cam.moved=true;
    if(cam.moved){cam.yaw-=dx*.005;cam.pitch=clamp(cam.pitch-dy*.003,.55,1.15);updateCamera()}
    cam.lastX=e.clientX;cam.lastY=e.clientY;
  }
  if(state.mode==='campaign'){
    const hit=raycast(e,nodeMeshes.map(n=>n.children).flat())[0];
    const node=hit&&findNodeData(hit.object);
    hoverNode=node&&state.available.has(node.id)?node:null;
    canvas.style.cursor=hoverNode?'pointer':'grab';
  }
});
canvas.addEventListener('pointerup',e=>{
  cam.drag=false;
  if(e.button===2){
    if(state.mode==='battle'){
      const r=regiments.find(q=>q.id===state.selectedId&&!q.dead&&!q.enemy);
      const p=rayBoard(e);
      if(r&&p){
        r.targetX=clamp(p.x,-7.5,7.5);r.targetZ=clamp(p.z,-.1,7.2);r.command=true;
        if(state.battlePhase==='deploy'){
          r.x=clamp(r.targetX,-7.2,-.4);r.z=r.targetZ;r.group.position.set(r.x,.76,r.z);r.command=false;
        }
      }
    }
    return;
  }
  if(cam.moved)return;
  const hits=raycast(e);
  if(!hits.length)return;
  const data=findNodeData(hits[0].object);
  if(data&&state.mode==='campaign'){chooseNode(data);return}
  const rr=findRegiment(hits[0].object);
  if(rr&&state.mode==='battle')selectRegiment(rr);
});
canvas.addEventListener('wheel',e=>{e.preventDefault();cam.dist=clamp(cam.dist+e.deltaY*.008,9.5,23);updateCamera()},{passive:false});

function findNodeData(o){while(o){if(o.userData&&o.userData.node)return o.userData.node;o=o.parent}return null}
function findRegiment(o){while(o){if(o.userData&&o.userData.regiment)return o.userData.regiment;o=o.parent}return null}

$('#startBattle').onclick=startBattle;
$('#formationBtn').onclick=()=>{state.tight=!state.tight;$('#formationBtn').classList.toggle('active',state.tight)};
$('#holdBtn').onclick=()=>{state.hold=!state.hold;$('#holdBtn').classList.toggle('active',state.hold)};
$('#speedBtn').onclick=()=>{state.speed=state.speed===1?2:state.speed===2?3:1;$('#speedBtn').textContent=state.speed+'×'};
$('#continueBtn').onclick=completeVictory;

let heroChoice=null;
$$('.hero-card').forEach(b=>b.onclick=()=>{
  heroChoice=b.dataset.hero;
  $$('.hero-card').forEach(x=>x.classList.toggle('selected',x===b));
  $('#beginRun').disabled=false;$('#beginRun').textContent='BEGIN RUN AS '+b.querySelector('b').textContent;
});
$('#beginRun').onclick=()=>{
  if(!heroChoice)return;
  state.hero=heroChoice;
  state.roster=[cloneUnit('swords'),cloneUnit('spears'),cloneUnit('archers')];
  if(state.hero==='warden'){state.roster.forEach(u=>{if(u.ranged){u.range*=1.18;u.speed*=1.12}})}
  $('#modal').classList.remove('on');
  buildCampaign();
  showBanner('THE CAMPAIGN BEGINS');
};

function animate(dt,time){
  nodeMeshes.forEach(g=>{
    g.children.forEach(ch=>{
      if(ch.userData&&ch.userData.pulse){
        const s=1+Math.sin(time*2.4+ch.userData.pulse)*.08;ch.scale.setScalar(s);
      }
    });
  });
  for(let i=effectsRoot.children.length-1;i>=0;i--){
    const e=effectsRoot.children[i];
    if(e.userData.life!==undefined){
      e.userData.life-=dt;e.position.addScaledVector(e.userData.v,dt);e.userData.v.y-=1.6*dt;e.material.opacity=clamp(e.userData.life/.35,0,1);e.material.transparent=true;
      if(e.userData.life<=0)effectsRoot.remove(e);
    }
  }
  if(state.mode==='battle')updateBattle(dt);
}

function loop(){
  const dt=Math.min(.04,clock.getDelta()),t=clock.elapsedTime;
  animate(dt,t);
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}
updateResources();
updatePips();
requestAnimationFrame(loop);
