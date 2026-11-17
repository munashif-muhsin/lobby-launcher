/* Lobby — launcher UI. Talks to the phone through window.Lobby (see Bridge.kt). */
'use strict';
const L = window.Lobby;
const MOCK = !!window.LOBBY_MOCK;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ================= CONSTANTS ================= */
const S={minp:[0,3,5,7,10],majp:[0,2,4,7,9],dor:[0,2,3,5,7,9,10],lyd:[0,2,4,6,7,9,11],nat:[0,2,3,5,7,8,10]};
const TRACKS=[
 {name:'Aurora',mood:'Ambient',bpm:70,root:60,scale:S.lyd,wave:'sine',lv:.26,pat:[0,4,7,4,9,7,4,2, 0,4,7,11,9,7,4,-1],prog:[0,3,5,4],pad:.06},
 {name:'Lounge',mood:'Lo-fi jazz',bpm:82,root:57,scale:S.dor,wave:'triangle',lv:.2,pat:[4,-1,2,-1,6,4,-1,2, 0,-1,2,4,-1,-1,1,-1],prog:[0,3,6,4],pad:.05,swing:.22},
 {name:'Arcade',mood:'Chiptune',bpm:128,root:64,scale:S.majp,wave:'square',lv:.09,pat:[0,2,4,7,4,2,0,-1, 5,4,2,4,7,9,7,-1],prog:[0,3,4,3],pad:0},
 {name:'Nightdrive',mood:'Synthwave',bpm:100,root:52,scale:S.nat,wave:'sawtooth',lv:.1,pat:[0,-1,4,-1,7,-1,4,2, 0,-1,4,-1,9,7,4,-1],prog:[0,5,3,6],pad:.05},
 {name:'Zen',mood:'Minimal',bpm:58,root:62,scale:S.majp,wave:'sine',lv:.28,pat:[0,-1,-1,4,-1,-1,7,-1, -1,5,-1,-1,4,-1,-1,-1],prog:[0,3,4,0],pad:.07},
];
const BGS=[['black','Black','#000'],['art','Game art','linear-gradient(135deg,#FF2D6F,#3A0B4A)'],['midnight','Midnight','linear-gradient(160deg,#1B2A66,#03040C)'],['graphite','Graphite','linear-gradient(#2a2a2f,#0b0b0d)'],['aurora','Aurora','linear-gradient(135deg,#FF2D6F 0%,#000 50%,#3DFFB5 100%)']];
const LAYOUTS=['Console Hero','Handheld Carousel','Minimal List'];
const LAYDESC=['Big artwork, row of tiles','3D cover-flow, built for handhelds','Fastest, text-first'];
const GENRES=['Action','Adventure','Arcade','Board','Card','Casual','Educational','Emulator','Music','Platformer','Puzzle','Racing','RPG','Shooter','Simulation','Sports','Strategy','Trivia','Word'];
const COVEROPTS=[{k:'play',l:'Play Store'},{k:'igdb',l:'IGDB artwork'},{k:'igdb2',l:'IGDB cover'},{k:'gen',l:'Generated'},{k:'gal',l:'From gallery'}];
const SRCNAME={play:'Play Store',igdb:'IGDB',igdb2:'IGDB',gen:'Generated',fallback:'Generated',gal:'Your gallery'};
const STREAM_PKGS=['com.microsoft.xboxone.smartglass','com.gamepass','com.microsoft.xcloud','com.playstation.remoteplay','com.metallic.chiaki','io.github.streetpea.chiaki4deck','com.limelight','com.valvesoftware.steamlink','com.nvidia.geforcenow','com.parsec.app','com.amazon.luna','com.boosteroid.streaming','com.shadow.android'];
const STREAM_RX=/(remote ?play|chiaki|moonlight|steam ?link|geforce ?now|xbox|game ?pass|xcloud|parsec|luna|boosteroid|shadow pc)/i;
const EMU_RX=/(emu|retroarch|ppsspp|dolphin|yuzu|citra|aethersx2|nethersx2|duckstation|drastic|mupen|snes|melonds|lemuroid|winlator|gamehub|skyline|sudachi|vita3k|redream|flycast|mame)/i;
const TABS=['Streaming','Games','Apps','Preferences'];

/* ================= STATE ================= */
const st={tab:1,game:0,app:0,stream:0,pref:0,variant:0,music:true,track:0,vol:6,bg:0,reduced:false,onboarded:false,mode:'home'};
let cats={}, edits={}, meta={}, usage={}, raw=[];
let GAMES=[], STREAMS=[], APPS=[];
let usageOK=false, homeOK=false;
try{Object.assign(st,JSON.parse(localStorage.getItem('lobby')||'{}'));st.tab=1;st.mode='home'}catch(e){}
try{cats=JSON.parse(localStorage.getItem('lobby-cats')||'{}')}catch(e){}
try{edits=JSON.parse(localStorage.getItem('lobby-edits')||'{}')}catch(e){}
const save=()=>{try{
  localStorage.setItem('lobby',JSON.stringify({variant:st.variant,music:st.music,track:st.track,vol:st.vol,bg:st.bg,reduced:st.reduced,onboarded:st.onboarded,game:st.game}));
  localStorage.setItem('lobby-cats',JSON.stringify(cats)); localStorage.setItem('lobby-edits',JSON.stringify(edits));
}catch(e){}};

/* ================= HELPERS ================= */
const iconURL=p=>MOCK?MOCK_ICON(p):`https://lobby.app/icon/${encodeURIComponent(p)}`;
const artURL=(p,v)=>MOCK?MOCK_ART(p,v):`https://lobby.app/art/${encodeURIComponent(p)}/${v}?t=${(meta[p]&&meta[p].t)||0}`;
function fmtDur(ms){ if(!ms) return '0m'; const m=Math.round(ms/60000); if(m<60) return m+'m'; const h=Math.floor(m/60); return h>=10?h+'h':(m%60?`${h}h ${m%60}m`:h+'h') }
function fmtLast(t){ if(!t) return 'Never'; const d0=new Date();d0.setHours(0,0,0,0); const diff=Math.floor((d0-t)/86400000)+1;
  if(t>=d0.getTime()) return 'Today'; if(diff<=1) return 'Yesterday'; if(diff<7) return diff+' days ago';
  return new Date(t).toLocaleDateString([], {day:'numeric',month:'short'}) }
function defaultCat(a){ if(STREAM_PKGS.includes(a.pkg)||STREAM_RX.test(a.name)) return 'stream'; return a.game?'game':'app' }
const catOf=a=>cats[a.pkg]||defaultCat(a);
function coverKey(g){ const m=meta[g.pkg]||{}, v=m.variants||{}, e=edits[g.pkg]||{};
  if(e.cover&&(e.cover==='gen'||v[e.cover])) return e.cover;
  if(v.play) return 'play'; if(v.igdb) return 'igdb'; if(v.igdb2) return 'igdb2'; return 'gen' }
function avail(g,k){ const v=(meta[g.pkg]||{}).variants||{}; return k==='gen'||k==='gal'?true:!!v[k] }
function coverInner(g,k=coverKey(g)){
  if(k!=='gen'&&avail(g,k)&&(k!=='gal'||((meta[g.pkg]||{}).variants||{}).gal)) return `<img class="cimg" src="${artURL(g.pkg,k)}" alt="" decoding="async">`;
  const ic=iconURL(g.pkg); return `<div class="gen"><img class="gbg" src="${ic}" alt=""><img class="gic" src="${ic}" alt=""></div>` }
const cover=g=>`<div class="cover">${coverInner(g)}<div class="ct">${esc(g.name)}</div></div>`;
function replay(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),1800)}
function press(id){const e=$('#'+id);e.classList.add('press');setTimeout(()=>e.classList.remove('press'),160)}
const G=l=>`<span class="btnglyph">${l}</span>`;
function setHints(list){ $('#hints').innerHTML='<span class="brand">LOBBY</span>'+list.map(([g,l])=>`<span class="h">${G(g)}<span>${l}</span></span>`).join('') }

/* ================= DATA ================= */
function loadAll(){
  try{ raw=JSON.parse(L.getApps()) }catch(e){ raw=[] }
  try{ meta=JSON.parse(L.getMeta()) }catch(e){ meta={} }
  refreshUsage(false);
  buildLists();
}
function refreshUsage(render=true){
  usageOK=!!L.hasUsageAccess();
  try{ usage=usageOK?JSON.parse(L.getUsage()):{} }catch(e){ usage={} }
  if(render){ buildLists(); }
}
function decorate(a){ const e=edits[a.pkg]||{}, m=meta[a.pkg]||{}, u=usage[a.pkg]||{};
  return {pkg:a.pkg,label:a.name,name:e.name||a.name,genre:e.genre||m.genre||(EMU_RX.test(a.name)?'Emulator':'Game'),ver:a.ver,installed:a.installed,
    total:u.total||0,last:u.last||0,week:u.week||0,days:u.days||[0,0,0,0,0,0,0],src:m.src||'fallback',maybe:!a.game&&EMU_RX.test(a.name+' '+a.pkg)} }
function buildLists(){
  const all=raw.map(decorate);
  const byName=(x,y)=>x.name.localeCompare(y.name);
  const prevGame=GAMES[st.game]&&GAMES[st.game].pkg, prevStream=STREAMS[st.stream]&&STREAMS[st.stream].pkg;
  GAMES=all.filter(a=>catOf(raw.find(r=>r.pkg===a.pkg))==='game');
  // Games: most recently played first, then A–Z
  GAMES.sort((x,y)=>(y.last-x.last)||byName(x,y));
  STREAMS=all.filter(a=>catOf(raw.find(r=>r.pkg===a.pkg))==='stream').sort((x,y)=>(y.last-x.last)||byName(x,y));
  APPS=all.filter(a=>catOf(raw.find(r=>r.pkg===a.pkg))==='app').sort(byName);
  st.game=Math.max(0,GAMES.findIndex(g=>g.pkg===prevGame)); if(st.game>=GAMES.length) st.game=0;
  st.stream=Math.max(0,STREAMS.findIndex(g=>g.pkg===prevStream)); if(st.stream>STREAMS.length) st.stream=0;
  if(st.app>=APPS.length) st.app=Math.max(0,APPS.length-1);
  buildLibrary(); buildStreams(); buildApps(); renderGames(); renderStreams(); renderApps();
}

/* ================= MUSIC (Web Audio synth) ================= */
const M={ctx:null,cur:null,step:0,next:0,
  init(){ if(this.ctx) return; const C=window.AudioContext||window.webkitAudioContext; if(!C) return;
    const ctx=this.ctx=new C(); this.master=ctx.createGain(); this.master.gain.value=0;
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2200; lp.Q.value=.5;
    this.bus=ctx.createGain(); const d=ctx.createDelay(); d.delayTime.value=.36; const fb=ctx.createGain(); fb.gain.value=.3; const wet=ctx.createGain(); wet.gain.value=.32;
    this.bus.connect(lp); this.bus.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(lp); lp.connect(this.master); this.master.connect(ctx.destination);
    setInterval(()=>this.tick(),25); },
  level(){return st.music?(st.vol/10)*.55:0},
  play(i){ if(!this.ctx) return; if(this.ctx.state==='suspended') this.ctx.resume().catch(()=>{});
    const t=this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(0,t,.08);
    clearTimeout(this._sw); this._sw=setTimeout(()=>{ this.cur=TRACKS[i]; this.step=0; this.next=this.ctx.currentTime+.06; const t2=this.ctx.currentTime; this.master.gain.cancelScheduledValues(t2); this.master.gain.setTargetAtTime(this.level(),t2,.5); },300); },
  applyLevel(){ if(!this.ctx) return; const t=this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(this.level(),t,.15); },
  pause(){ if(!this.ctx) return; const t=this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(0,t,.06); clearTimeout(this._ps); this._ps=setTimeout(()=>this.ctx.suspend().catch(()=>{}),300) },
  resume(){ if(!this.ctx) return; clearTimeout(this._ps); this.ctx.resume().then(()=>{this.next=Math.max(this.next,this.ctx.currentTime+.05);this.applyLevel()}).catch(()=>{}) },
  deg(m,i){const L=m.scale.length;return m.scale[((i%L)+L)%L]+12*Math.floor(i/L)},
  note(midi,t,type,dur,v,att=.012){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=440*Math.pow(2,(midi-69)/12);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+att);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(this.bus);o.start(t);o.stop(t+dur+.05)},
  tick(){ if(!this.cur||!st.music||!this.ctx||this.ctx.state!=='running') return; const m=this.cur,sd=60/m.bpm/2;
    if(this.next<this.ctx.currentTime-.5) this.next=this.ctx.currentTime+.05;
    while(this.next<this.ctx.currentTime+.12){ const s=this.step,i=m.pat[s%m.pat.length],t=this.next+(m.swing&&s%2?sd*m.swing:0);
      const ch=m.prog[(s>>3)%m.prog.length];
      if(i>=0) this.note(m.root+this.deg(m,i),t,m.wave,sd*1.8,m.lv);
      if(s%4===0) this.note(m.root-12+this.deg(m,ch),this.next,'triangle',sd*3.6,.3);
      if(m.pad&&s%8===0) [0,2,4].forEach(k=>this.note(m.root-12+this.deg(m,ch+k)+12,this.next,'sine',sd*8.6,m.pad,.35));
      this.next+=sd; this.step++; } }
};

/* ================= LAYOUT ================= */
const stage=$('#stage');
function fit(){const k=Math.min(innerWidth/1280,innerHeight/720);stage.style.transform=`scale(${k})`}
addEventListener('resize',fit);fit();

/* ================= GAMES ================= */
const row=$('#vA .row'), ring=$('#vB .ring3d');
let heroFlip=0,bgFlip=0,lastBg='';
function buildLibrary(){
  row.innerHTML=GAMES.map((g,i)=>`<div class="tile" data-i="${i}">${cover(g)}</div>`).join('');
  row.querySelectorAll('.cover').forEach(c=>{c.style.width='100%';c.style.height='100%'});
  ring.innerHTML=GAMES.map((g,i)=>`<div class="card" data-i="${i}">${cover(g)}</div>`).join('');
  $('#vC .inner').innerHTML=GAMES.map((g,i)=>`<div class="li" data-i="${i}"><span class="n">${String(i+1).padStart(2,'0')}</span><span class="nm">${esc(g.name)}</span><span class="g">${esc(g.genre)}</span></div>`).join('');
  $$('.tile,.card,.li').forEach(el=>el.onclick=()=>{if(st.mode!=='home')return;const i=+el.dataset.i; if(i===st.game)act.A(); else{st.game=i;renderGames()}});
  $('#vA .rowLabel span').textContent=GAMES.length+(GAMES.length===1?' game':' games');
  $('#vB .dots').innerHTML=GAMES.slice(0,30).map(()=>'<i></i>').join('');
  $('#vC .cnt').textContent=GAMES.length;
  const empty=!GAMES.length; $('#gEmpty').style.display=empty?'block':'none'; ['vA','vB','vC'].forEach(id=>$('#'+id).style.visibility=empty?'hidden':'visible');
  lastBg='';
}
function metaHTML(g){ return usageOK
  ? `<span><b>${fmtDur(g.total)}</b> played</span><span>Last played <b>${fmtLast(g.last)}</b></span>`
  : `<span>${esc(g.genre)}</span><span style="color:var(--accent)">Turn on usage access to see hours</span>` }
function renderGames(){
  if(!GAMES.length){ renderBg(); return }
  const i=st.game,g=GAMES[i];
  const A=$('#vA');
  A.querySelector('.eyebrow').textContent=g.genre; A.querySelector('h1').textContent=g.name; A.querySelector('.meta').innerHTML=metaHTML(g);
  replay(A.querySelector('.eyebrow'),'enter');replay(A.querySelector('h1'),'enter2');replay(A.querySelector('.meta'),'enter3');
  const Ls=A.querySelectorAll('.layer'); heroFlip^=1; Ls[heroFlip].innerHTML=coverInner(g); Ls[heroFlip].classList.add('on'); Ls[heroFlip^1].classList.remove('on');
  row.style.transform=`translateX(${-i*252}px)`;
  row.querySelectorAll('.tile').forEach((t,k)=>{t.classList.toggle('f',k===i);t.classList.toggle('after',k>i);t.classList.toggle('gone',k<i)});
  const B=$('#vB');
  ring.querySelectorAll('.card').forEach((c,k)=>{const o=k-i,a=Math.abs(o);
    c.classList.toggle('f',o===0);
    c.style.transform=`translateX(${o*196+Math.sign(o)*60}px) translateZ(${-a*150}px) rotateY(${o===0?0:-Math.sign(o)*38}deg)`;
    c.style.opacity=a>3?0:1; c.style.zIndex=100-a; c.style.visibility=a>4?'hidden':'visible'});
  B.querySelector('.eyebrow').textContent=g.genre; B.querySelector('h2').textContent=g.name; B.querySelector('.meta').innerHTML=metaHTML(g);
  replay(B.querySelector('h2'),'enter');replay(B.querySelector('.meta'),'enter2');
  B.querySelectorAll('.dots i').forEach((d,k)=>d.classList.toggle('on',k===Math.min(i,29)));
  const C=$('#vC');
  C.querySelectorAll('.li').forEach((l,k)=>l.classList.toggle('f',k===i));
  C.querySelector('.inner').style.transform=`translateY(${150-i*54}px)`;
  const pv=C.querySelector('.pv'); pv.innerHTML=coverInner(g); replay(pv,'enter');
  C.querySelector('.preview .eyebrow').textContent=g.genre;
  C.querySelector('.preview h2').textContent=g.name; C.querySelector('.preview .meta').innerHTML=metaHTML(g);
  replay(C.querySelector('.preview h2'),'enter2');
  renderBg(); save();
}
function renderBg(){
  const mode=BGS[st.bg][0], bg=$('#bg'); bg.className='mode-'+mode;
  const g=GAMES[st.game];
  if(mode==='art'&&g&&lastBg!==g.pkg+coverKey(g)){const Ls=bg.querySelectorAll('.art');bgFlip^=1;Ls[bgFlip].innerHTML=coverInner(g);Ls[bgFlip].classList.add('on');Ls[bgFlip^1].classList.remove('on');lastBg=g.pkg+coverKey(g)}
  if(mode!=='art') lastBg='';
}
function renderVariant(){ ['vA','vB','vC'].forEach((id,k)=>$('#'+id).classList.toggle('on',k===st.variant)) }

/* ================= STREAMING ================= */
function buildStreams(){
  const cards=STREAMS.map((s,i)=>{const ic=iconURL(s.pkg);return `<div class="sc" data-i="${i}"><img class="bgi" src="${ic}" alt=""><img class="ic" src="${ic}" alt=""><div class="nm">${esc(s.name)}</div><div class="sub">${s.last?'Last used '+fmtLast(s.last):'Ready to stream'}</div></div>`});
  cards.push(`<div class="sc add" data-i="${STREAMS.length}"><div class="plus">+</div>Add or remove<br>streaming apps</div>`);
  $('.strow').innerHTML=cards.join('');
  $('#sCount').textContent=STREAMS.length?`${STREAMS.length} app${STREAMS.length>1?'s':''}`:'No streaming apps yet';
  $$('.sc').forEach(el=>el.onclick=()=>{if(st.mode!=='home')return;const i=+el.dataset.i; if(i===st.stream)act.A(); else{st.stream=i;renderStreams()}});
}
function renderStreams(){
  const i=Math.min(st.stream,STREAMS.length);
  $$('.sc').forEach((c,k)=>c.classList.toggle('f',k===i));
  $('.strow').style.transform=`translateX(${-Math.max(0,i-3)*258}px)`;
}

/* ================= APPS ================= */
function buildApps(){
  $('.apps').innerHTML=APPS.map((a,i)=>`<div class="app" data-i="${i}"><div class="ic"><img src="${iconURL(a.pkg)}" alt="" loading="lazy"></div><div class="lb">${esc(a.name)}</div></div>`).join('');
  $('#appCount').textContent=APPS.length;
  $$('.app').forEach(el=>el.onclick=()=>{if(st.mode!=='home')return;const i=+el.dataset.i; if(i===st.app)act.A(); else{st.app=i;renderApps()}});
}
function renderApps(){ $$('.app').forEach((a,k)=>a.classList.toggle('f',k===st.app)); const r=Math.floor(st.app/6); $('.apps').style.transform=`translateY(${-Math.max(0,r-2)*154}px)` }

/* ================= TABS / HINTS ================= */
function homeHints(){ setHints(st.tab===0?[['A','Open'],['Y','Choose apps'],['B','Games']]:st.tab===1?[['A','Play'],['Y','Details'],['B','Back']]:st.tab===2?[['A','Open'],['Y','Move to…'],['B','Games']]:[['A','Change'],['B','Games']]) }
function renderTabs(){
  $$('.tab').forEach((t,k)=>t.classList.toggle('on',k===st.tab));
  const t=$$('.tab')[st.tab],ind=$('#tabInd'); ind.style.left=(t.offsetLeft+16)+'px'; ind.style.width=(t.offsetWidth-32)+'px';
  [0,1,2,3].forEach(k=>{const p=$('#p'+k);p.classList.toggle('on',k===st.tab);p.classList.toggle('left',k<st.tab)});
  homeHints();
}
function setTab(t){ st.tab=(t+4)%4; renderTabs(); if(st.tab===3) renderPrefs() }
function renderNP(){ const t=TRACKS[st.track]; $('#np .t').innerHTML=st.music?`<b>${t.name}</b> · ${t.mood}`:'Music off'; $('#np').classList.toggle('off',!st.music) }

/* ================= PREFERENCES ================= */
const arrow=v=>`<span class="arr">‹</span>${v}<span class="arr">›</span>`;
const PREFS=[
 {lbl:'Home layout',sub:'How your games are presented',desc:'Console Hero puts the highlighted game front and centre. Carousel is a 3D cover-flow built for handhelds. List is the fastest on low-end devices.',
  val:()=>arrow(LAYOUTS[st.variant]),step:d=>{st.variant=(st.variant+(d||1)+3)%3;renderVariant();renderGames()}},
 {lbl:'Menu music',sub:'Plays while you browse Lobby',desc:'Music fades out the moment a game or app opens, and fades back in when you come back to Lobby.',
  val:()=>`<span class="tog ${st.music?'on':''}"></span>`,step:()=>{st.music=!st.music;M.applyLevel();renderNP()}},
 {lbl:'Music track',sub:'5 original menu themes',desc:'All five themes are generated live on the device, so they add no download size and use almost no battery. Change the track to hear it right away.',
  val:()=>arrow(`<span class="trk">${TRACKS[st.track].name}<small>${TRACKS[st.track].mood} · ${st.track+1}/5</small></span>`),step:d=>{st.track=(st.track+(d||1)+5)%5;if(!st.music){st.music=true}M.play(st.track);renderNP()}},
 {lbl:'Music volume',sub:'Separate from system volume',desc:'Lobby\'s music only. Games keep using your system volume.',
  val:()=>arrow(`<span class="vol">${Array.from({length:10},(_,k)=>`<i class="${k<st.vol?'on':''}" style="height:${8+k*2}px"></i>`).join('')}</span>`),step:d=>{st.vol=Math.max(0,Math.min(10,st.vol+(d||1)));M.applyLevel()}},
 {lbl:'Background',sub:'Black is the default',desc:'Black uses true #000 for the best OLED battery life. Game art blurs the highlighted cover behind everything.',
  val:()=>arrow(`<span style="min-width:74px;text-align:right">${BGS[st.bg][1]}</span><span class="sw">${BGS.map((b,k)=>`<i class="${k===st.bg?'on':''}" style="background:${b[2]}"></i>`).join('')}</span>`),step:d=>{st.bg=(st.bg+(d||1)+BGS.length)%BGS.length;renderBg()}},
 {lbl:'Motion',sub:'Animations and transitions',desc:'Reduced turns off all motion. Everything appears instantly, which helps on low-end chips.',
  val:()=>arrow(st.reduced?'Reduced':'Full'),step:()=>{st.reduced=!st.reduced;document.documentElement.classList.toggle('reduced',st.reduced)}},
 {lbl:'Streaming apps',sub:'Choose what appears on the Streaming tab',desc:'Pick any installed app: Xbox, PS Remote Play, Chiaki, Moonlight, Steam Link, GeForce NOW, Parsec or anything else.',
  val:()=>`<span>${STREAMS.length} selected</span><span class="arr">›</span>`,step:()=>openPicker()},
 {lbl:'Usage access',sub:'Needed for hours played',desc:'Android only shares playtime once you allow Usage access for Lobby. Nothing leaves your device.',
  val:()=>usageOK?`<span style="color:var(--live)">On</span>`:`<span style="color:var(--accent)">Turn on ›</span>`,step:()=>{ if(usageOK) toast('Usage access is on'); else startOnboarding(2,true) }},
 {lbl:'Home app',sub:'Home button opens Lobby',desc:'Make Lobby your home screen so the Home button always brings you back here. You can switch back in Android Settings at any time.',
  val:()=>homeOK?`<span style="color:var(--live)">Lobby</span>`:`<span style="color:var(--accent)">Set ›</span>`,step:()=>{ if(homeOK) toast('Lobby is your home app'); else startOnboarding(1,true) }},
 {lbl:'Re-scan artwork',sub:'Play Store → IGDB → Generated',desc:'Looks again for missing covers and genres. Covers, names and genres you changed yourself are never overwritten.',
  val:()=>`<span class="arr">A</span>`,step:()=>startOnboarding(4,true,true)},
 {lbl:'Replay setup',sub:'Run the welcome steps again',desc:'Walks through layout, home app, usage access, your games and artwork again.',
  val:()=>`<span class="arr">A</span>`,step:()=>startOnboarding(0)},
];
$('.prefs .rows').innerHTML=PREFS.map((p,i)=>`<div class="pr" data-i="${i}"><div><div class="lbl">${p.lbl}</div><div class="sub">${p.sub}</div></div><div class="val"></div></div>`).join('');
$$('.pr').forEach(el=>el.onclick=()=>{if(st.mode!=='home')return;st.pref=+el.dataset.i;act.A()});
function renderPrefs(){
  $$('.pr').forEach((r,k)=>{r.classList.toggle('f',k===st.pref);r.querySelector('.val').innerHTML=PREFS[k].val()});
  $('.prefs .rows').style.transform=`translateY(${-Math.max(0,st.pref-7)*59}px)`;
  $('#pdesc').textContent=PREFS[st.pref].desc;
  const mode=BGS[st.bg][0],mb=$('.mini .mbg'); mb.className='mbg'; mb.style.background=getComputedStyle($('#bg')).backgroundImage!=='none'?getComputedStyle($('#bg')).backgroundImage:'#000';
  const g=GAMES[st.game]; mb.innerHTML=mode==='art'&&g?`<div class="art">${coverInner(g)}</div>`:'';
  $('.mini .mtitle').textContent=g?g.name:'Lobby'; save();
}

/* ================= DETAILS ================= */
const DT={focus:0,sheet:null,sf:0,edit:null};
const DACTS=[['A','Play','play'],['','Change cover','cover'],['','Edit info','edit'],['','Move to…','move'],['','App info','info']];
function openDetails(){ if(!GAMES.length) return; st.mode='details'; DT.focus=0; DT.sheet=null; renderDetails(true); $('#details').classList.add('on'); setHints([['A','Select'],['B','Back']]) }
function closeDetails(){ st.mode='home'; $('#details').classList.remove('on'); closeSheet(true); homeHints() }
function renderDetails(full){
  const g=GAMES[st.game],D=$('#details'); if(!g) return;
  if(full){
    const k=coverKey(g);
    D.querySelector('.dbg .art').innerHTML=coverInner(g);
    D.querySelector('.dcov').innerHTML=coverInner(g)+`<div class="srcchip ${k==='gen'?'fb':''}"><i></i>Cover · ${SRCNAME[k]}</div>`;
    D.querySelector('.dcap').innerHTML=`Info from <b>${SRCNAME[(meta[g.pkg]||{}).src||'fallback']==='Generated'?'this device':SRCNAME[(meta[g.pkg]||{}).src]}</b> · Hours from <b>Android usage stats</b><br>${esc(g.pkg)}${g.ver?' · v'+esc(g.ver):''}`;
    D.querySelector('.eyebrow').textContent=g.genre; D.querySelector('h1').textContent=g.name;
    const stats=usageOK?[[fmtDur(g.total),'Played'],[fmtDur(g.week),'This week'],[fmtLast(g.last),'Last played'],[g.installed?new Date(g.installed).toLocaleDateString([], {month:'short',year:'numeric'}):'—','Installed']]
      :[['—','Played'],['dim','Turn on usage access in Preferences'],[g.installed?new Date(g.installed).toLocaleDateString([], {month:'short',year:'numeric'}):'—','Installed']];
    D.querySelector('.stats').innerHTML=stats.map(([v,k])=>v==='dim'?`<div class="stat"><span class="v dim">${k}</span></div>`:`<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    const names=[];for(let d=6;d>=0;d--){const x=new Date(Date.now()-d*86400000);names.push(d===0?'Today':x.toLocaleDateString([], {weekday:'short'}))}
    const mx=Math.max(60,...g.days);
    D.querySelector('.sess').innerHTML=g.days.map((m,k)=>`<div class="b ${k===6?'today':''}"><i style="height:${usageOK?Math.max(4,m/mx*70):4}px"></i><span>${names[k]}</span></div>`).join('');
    replay(D.querySelector('h1'),'enter'); replay(D.querySelector('.dcov'),'enter');
  }
  D.querySelector('.dacts').innerHTML=DACTS.map(([gl,l],k)=>`<button class="obtn ${k===0?'primary':''} ${k===DT.focus&&!DT.sheet?'f':''}" data-k="${k}">${gl?G(gl):''}${l}</button>`).join('');
  D.querySelectorAll('.dacts .obtn').forEach(b=>b.onclick=()=>{if(DT.sheet)return;DT.focus=+b.dataset.k;DTa.A()});
}
function closeSheet(silent){ DT.sheet=null; $$('#details .sheet').forEach(s=>s.classList.remove('on')); const inp=$('#ename'); if(inp)inp.blur(); if(!silent){renderDetails(); setHints([['A','Select'],['B','Back']])} }
function renderCoverSheet(){
  const g=GAMES[st.game];
  $('#coverSheet .copts').innerHTML=COVEROPTS.map((o,k)=>{const av=avail(g,o.k), hasGal=((meta[g.pkg]||{}).variants||{}).gal, cur=coverKey(g)===o.k;
    let body; if(o.k==='gal') body=hasGal?coverInner(g,'gal'):`<div class="gal"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>Choose image</div>`;
    else body=av?coverInner(g,o.k):`<div class="na">NOT FOUND</div>`;
    const status=cur?'In use':(o.k==='gal'?(hasGal?'Saved':''):(av?'Found':'—'));
    return `<div class="copt ${k===DT.sf?'f':''} ${cur?'cur':''}" data-k="${k}"><div class="cv">${body}</div><div class="l">${o.l}<span>${status}</span></div></div>`}).join('');
  $$('#coverSheet .copt').forEach(c=>c.onclick=()=>{DT.sf=+c.dataset.k;DTa.A()});
}
function renderEditSheet(){
  const e=DT.edit;
  $('#editSheet .erows').innerHTML=`
   <div class="erow ${DT.sf===0?'f':''}"><span class="k">Name</span><input id="ename" value="${esc(e.name)}" autocomplete="off" spellcheck="false"></div>
   <div class="erow ${DT.sf===1?'f':''}"><span class="k">Genre</span><span class="gv"><span class="arr">‹</span>${esc(e.genre)}<span class="arr">›</span></span></div>
   <div class="erow" style="padding:0;margin-top:10px;gap:10px"><button class="obtn primary ${DT.sf===2?'f':''}" id="esave">${G('A')}Save</button><button class="obtn ghost ${DT.sf===3?'f':''}" id="erevert">Restore scanned info</button></div>`;
  const inp=$('#ename');
  inp.oninput=ev=>{DT.edit.name=ev.target.value};
  inp.onfocus=()=>{DT.sf=0;L.setTyping(true)}; inp.onblur=()=>L.setTyping(false);
  inp.onkeydown=ev=>{ if(ev.key==='Enter'){ev.preventDefault();inp.blur();DT.sf=2;renderEditSheet()} };
  $('#esave').onclick=()=>{DT.sf=2;DTa.A()}; $('#erevert').onclick=()=>{DT.sf=3;DTa.A()};
}
const DTa={
  move(dx,dy){
    if(DT.sheet==='cover'){ if(dx){DT.sf=Math.max(0,Math.min(COVEROPTS.length-1,DT.sf+dx));renderCoverSheet()} return }
    if(DT.sheet==='edit'){
      if(DT.sf>=2&&dx){DT.sf=dx>0?3:2;renderEditSheet();return}
      if(dy){DT.sf=Math.max(0,Math.min(2,(DT.sf>=2&&dy<0)?1:DT.sf+dy)); $('#ename').blur(); renderEditSheet()}
      else if(dx&&DT.sf===1){const i=GENRES.indexOf(DT.edit.genre);DT.edit.genre=GENRES[(i+dx+GENRES.length)%GENRES.length];renderEditSheet()} return }
    if(dx){DT.focus=Math.max(0,Math.min(DACTS.length-1,DT.focus+dx));renderDetails()}
  },
  A(){
    const g=GAMES[st.game]; if(!g) return;
    if(DT.sheet==='cover'){ const o=COVEROPTS[DT.sf];
      if(o.k==='gal'){ toast('Opening your photos…'); L.pickImage(g.pkg); return }
      if(!avail(g,o.k)){toast(`No ${o.l} found for ${g.name}`);return}
      edits[g.pkg]=Object.assign(edits[g.pkg]||{},{cover:o.k}); save(); afterEdit(); renderCoverSheet(); toast('Cover updated'); return }
    if(DT.sheet==='edit'){ if(DT.sf===0){$('#ename').focus();return} if(DT.sf===1){DTa.move(1,0);return}
      if(DT.sf===3){ const e=edits[g.pkg]||{}; delete e.name; delete e.genre; edits[g.pkg]=e; save(); closeSheet(); afterEdit(); toast('Restored'); return }
      const nm=DT.edit.name.trim(); edits[g.pkg]=Object.assign(edits[g.pkg]||{},{name:nm&&nm!==g.label?nm:undefined,genre:DT.edit.genre}); save(); closeSheet(); afterEdit(); toast('Saved'); return }
    const k=DACTS[DT.focus][2];
    if(k==='play') launch(g.pkg,g.name);
    else if(k==='cover'){DT.sheet='cover';DT.sf=COVEROPTS.findIndex(o=>o.k===coverKey(g));renderCoverSheet();renderDetails();$('#coverSheet').classList.add('on');setHints([['A','Use this cover'],['B','Close']])}
    else if(k==='edit'){DT.sheet='edit';DT.sf=0;DT.edit={name:g.name,genre:GENRES.includes(g.genre)?g.genre:'Action'};renderEditSheet();renderDetails();$('#editSheet').classList.add('on');setHints([['A','Select'],['B','Cancel']])}
    else if(k==='move') openMove(g);
    else L.openAppInfo(g.pkg);
  },
  B(){ if(DT.sheet) closeSheet(); else closeDetails() },
  Y(){}, L1(){}, R1(){}, X(){}
};
function afterEdit(){ const pkg=GAMES[st.game]&&GAMES[st.game].pkg; buildLists(); const i=GAMES.findIndex(g=>g.pkg===pkg); if(i>=0){st.game=i;renderGames()} if(st.mode==='details'&&i>=0) renderDetails(true) }

/* ================= MOVE TO… ================= */
const MV={app:null,f:0,back:'home'};
const MOPTS=[['game','Games','Shows in your library'],['stream','Streaming','Shows on the Streaming tab'],['app','Apps','Back to the app drawer']];
function openMove(a){ MV.app=a; MV.back=st.mode; st.mode='move'; const cur=catOf(raw.find(r=>r.pkg===a.pkg)); MV.f=Math.max(0,MOPTS.findIndex(o=>o[0]===cur));
  $('#mvIcon').src=iconURL(a.pkg); $('#mvTitle').textContent=`Show "${a.name}" in`; renderMove(); $('#moveSheet').classList.add('on'); setHints([['A','Move'],['B','Cancel']]) }
function renderMove(){ const cur=catOf(raw.find(r=>r.pkg===MV.app.pkg));
  $('#moveSheet .mopts').innerHTML=MOPTS.map(([k,l,d],i)=>`<div class="mo ${i===MV.f?'f':''} ${k===cur?'cur':''}" data-i="${i}"><b>${l}</b><span>${k===cur?'Current':d}</span></div>`).join('');
  $$('#moveSheet .mo').forEach(m=>m.onclick=()=>{MV.f=+m.dataset.i;MVa.A()}) }
function closeMove(){ $('#moveSheet').classList.remove('on'); st.mode=MV.back==='details'&&GAMES.some(g=>g.pkg===MV.app.pkg)?'details':'home'; if(st.mode==='details') setHints([['A','Select'],['B','Back']]); else { $('#details').classList.remove('on'); homeHints() } }
const MVa={
  move(dx){ if(dx){MV.f=Math.max(0,Math.min(2,MV.f+dx));renderMove()} },
  A(){ const k=MOPTS[MV.f][0], a=MV.app; cats[a.pkg]=k; save(); buildLists(); closeMove(); if(st.mode==='details') renderDetails(true); toast(`${a.name} moved to ${MOPTS[MV.f][1]}`); if(k==='game') fetchArtFor([a]) },
  B(){ closeMove() }, Y(){}, L1(){}, R1(){}, X(){}
};

/* ================= PICKER (streaming apps) ================= */
const PK={list:[],f:0,sel:null};
function openPicker(){
  PK.list=raw.map(decorate).sort((x,y)=>{const sx=catOf(raw.find(r=>r.pkg===x.pkg))==='stream',sy=catOf(raw.find(r=>r.pkg===y.pkg))==='stream';return (sy-sx)||x.name.localeCompare(y.name)});
  PK.sel=new Set(PK.list.filter(a=>catOf(raw.find(r=>r.pkg===a.pkg))==='stream').map(a=>a.pkg)); PK.f=0;
  $('#picker .pg').innerHTML=PK.list.map((a,i)=>`<div class="pk" data-i="${i}"><span class="ck"></span><img src="${iconURL(a.pkg)}" alt="" loading="lazy"><div class="lb">${esc(a.name)}</div></div>`).join('');
  $$('#picker .pk').forEach(el=>el.onclick=()=>{PK.f=+el.dataset.i;PKa.A()});
  st.mode='picker'; renderPicker(); $('#picker').classList.add('on'); setHints([['A','Select'],['B','Done']]) }
function renderPicker(){ $$('#picker .pk').forEach((el,i)=>{const on=PK.sel.has(PK.list[i].pkg);el.classList.toggle('on',on);el.classList.toggle('f',i===PK.f);
  el.querySelector('.ck').innerHTML=on?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="4"><path d="M5 12l5 5 9-10"/></svg>':''});
  $('#picker .pg').style.transform=`translateY(${-Math.max(0,Math.floor(PK.f/6)-1)*126}px)` }
const PKa={
  move(dx,dy){ PK.f=Math.max(0,Math.min(PK.list.length-1,PK.f+dx+dy*6)); renderPicker() },
  A(){ const a=PK.list[PK.f]; if(!a) return; PK.sel.has(a.pkg)?PK.sel.delete(a.pkg):PK.sel.add(a.pkg); renderPicker() },
  B(){ PK.list.forEach(a=>{ const r=raw.find(x=>x.pkg===a.pkg), was=catOf(r)==='stream', now=PK.sel.has(a.pkg);
      if(now&&!was) cats[a.pkg]='stream'; else if(!now&&was) cats[a.pkg]=r.game?'game':'app' });
    save(); buildLists(); $('#picker').classList.remove('on'); st.mode='home'; homeHints(); if(st.tab===3) renderPrefs(); toast(`${STREAMS.length} streaming app${STREAMS.length===1?'':'s'}`) },
  Y(){}, L1(){}, R1(){}, X(){}
};

/* ================= ARTWORK ================= */
let artCb=null;
window.lobbyArt=(pkg,m)=>{ meta[pkg]=m; if(artCb) artCb(pkg,m) };
window.lobbyArtDone=()=>{ if(artCb) artCb(null); else { buildLists() } };
function fetchArtFor(list,force=false){ artCb=null; L.fetchArt(JSON.stringify(list.map(a=>({pkg:a.pkg,name:a.label||a.name}))),force) }
window.lobbyGallery=(pkg,ok)=>{ if(!ok){ return } meta[pkg]=meta[pkg]||{src:'fallback',variants:{}}; meta[pkg].variants=Object.assign({},meta[pkg].variants,{gal:true}); meta[pkg].t=Date.now();
  edits[pkg]=Object.assign(edits[pkg]||{},{cover:'gal'}); save(); afterEdit(); if(DT.sheet==='cover') renderCoverSheet(); toast('Cover updated') };

/* ================= LAUNCH ================= */
function launch(pkg,name){ replay($('#flash'),'go'); toast(`Launching ${name}…`); setTimeout(()=>{ if(!L.launch(pkg)) toast(`Couldn't open ${name}`) },260) }

/* ================= ONBOARDING ================= */
const STEPS=['Welcome','Home app','Usage access','Your games','Artwork'];
const OB={step:0,f:0,picks:null,list:[],fetchI:-1,single:false,force:false,lastStep:-1,cands:[]};
function startOnboarding(step=0,single=false,force=false){
  st.mode='ob'; OB.single=single; OB.force=force; OB.lastStep=-1; OB.picks=null;
  $('#ob').classList.add('on'); obGo(step) }
function finishOB(){ OB.lastStep=-1; st.onboarded=true; save(); $('#ob').classList.remove('on'); st.mode='home'; buildLists(); renderTabs(); if(st.tab===3) renderPrefs(); toast(OB.single?'Done':'You\'re all set') }
function obButtons(){
  const s=OB.step,b=[];
  if(s===1&&!homeOK) b.push(['ghost','Skip','skip'],['primary','Set Lobby as home app','do']);
  else if(s===2&&!usageOK) b.push(['ghost','Skip for now','skip'],['primary','Open Usage access settings','do']);
  else if(s===4&&OB.fetchI<OB.list.length) b.push(['','Fetching…','wait']);
  else b.push(['primary',s===4?(OB.single?'Done':'Start playing'):(OB.single?'Done':'Continue'),'next']);
  return b;
}
function renderOB(){
  const s=OB.step,body=$('#ob .obbody');
  $('#ob .steps').innerHTML=OB.single?'':STEPS.map((n,k)=>`<span class="stp ${k===s?'on':k<s?'done':''}"><i>${k<s?'✓':k+1}</i>${n}</span>`).join('');
  let h='';
  if(s===0){
    const wf=[
      `<div class="wf" style="left:16px;top:20px;width:110px;height:16px"></div><div class="wf" style="left:16px;top:44px;width:70px;height:8px"></div><div class="wf" style="right:0;top:0;width:150px;height:110px;opacity:.6"></div><div class="wf a" style="left:16px;bottom:16px;width:62px;height:36px"></div><div class="wf" style="left:86px;bottom:16px;width:56px;height:32px"></div><div class="wf" style="left:150px;bottom:16px;width:56px;height:32px"></div><div class="wf" style="left:214px;bottom:16px;width:56px;height:32px"></div>`,
      `<div class="wf" style="left:40px;top:28px;width:50px;height:70px;transform:perspective(200px) rotateY(30deg);opacity:.6"></div><div class="wf a" style="left:118px;top:20px;width:64px;height:86px"></div><div class="wf" style="left:210px;top:28px;width:50px;height:70px;transform:perspective(200px) rotateY(-30deg);opacity:.6"></div><div class="wf" style="left:110px;bottom:22px;width:80px;height:10px"></div>`,
      `<div class="wf" style="left:16px;top:22px;width:90px;height:8px"></div><div class="wf a" style="left:16px;top:42px;width:110px;height:12px"></div><div class="wf" style="left:16px;top:66px;width:80px;height:8px"></div><div class="wf" style="left:16px;top:86px;width:96px;height:8px"></div><div class="wf" style="left:16px;top:106px;width:70px;height:8px"></div><div class="wf" style="left:150px;top:20px;width:130px;height:80px;opacity:.6"></div><div class="wf" style="left:150px;top:112px;width:90px;height:12px"></div>`];
    h=`<div class="wel enter"><div class="eyebrow">LET'S SET UP YOUR LAUNCHER</div><h1 style="margin-top:16px">Welcome to Lobby<span>.</span></h1><p>Your games, front and centre. Pick a home layout to start. You can change it any time.</p>
      <div class="lays">${LAYOUTS.map((l,k)=>`<div class="lay ${k===st.variant?'sel':''}" data-f data-k="${k}"><div class="pv">${wf[k]}</div><div class="nm"><span class="rd"></span>${l}</div><div class="ds">${LAYDESC[k]}</div></div>`).join('')}</div></div>`;
  }else if(s===1){
    h=`<div class="obl enter"><div class="eyebrow">${OB.single?'HOME APP':'STEP 2 · HOME APP'}</div><h1>Make Lobby your home screen</h1>
      <p>So the Home button brings you straight back to your games. Android will ask you to confirm. Choose <b style="color:#fff">Lobby</b>${MOCK?', then <b style="color:#fff">Always</b>':''}.</p>
      ${homeOK?`<div class="status">✓ Lobby is your home app</div>`:`<div class="note">You can switch back to your old launcher at any time in Android Settings › Apps › Default apps.</div>`}</div>
      <div class="obr enter2"><div class="dlg"><div class="t">Set Lobby as your default home app?</div><div class="hint">Android shows a prompt like this</div>
        <div class="r ${homeOK?'sel':''}"><span class="ic" style="background:#000;border:1px solid #333;color:#fff">L</span>Lobby<span class="rad"></span></div>
        <div class="r"><span class="ic" style="background:#3A3A42">P</span>Current launcher<span class="rad"></span></div>
        <div class="bt"><span>Cancel</span><span class="${homeOK?'hl':''}">Set as default</span></div></div></div>`;
  }else if(s===2){
    h=`<div class="obl enter"><div class="eyebrow">${OB.single?'USAGE ACCESS':'STEP 3 · USAGE ACCESS'}</div><h1>Show your hours played</h1>
      <p>Android tracks how long you play, but only shares it once you allow <b style="color:#fff">Usage access</b>. We'll open the right page. Find <b style="color:#fff">Lobby</b>, switch it on, then press Back.</p>
      ${usageOK?`<div class="status">✓ Usage access is on</div>`:`<div class="note"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Stays on this device. Lobby never uploads your usage.</div>`}</div>
      <div class="obr enter2"><div class="setm"><div class="hd">Usage access<small>Settings › Apps › Special app access</small></div>
        <div class="r"><span class="ic" style="background:#2FBF71">W</span><div>Digital Wellbeing<small>Allowed</small></div></div>
        <div class="r hl"><span class="ic" style="background:#000;border:1px solid #333">L</span><div>Lobby<small>${usageOK?'Allowed':'Not allowed'}</small></div><span class="tog ${usageOK?'on':''}"></span>${usageOK?'':'<span class="tap"></span>'}</div>
        <div class="r"><span class="ic" style="background:#E8A400">F</span><div>Files<small>Not allowed</small></div></div></div></div>`;
  }else if(s===3){
    if(!OB.picks){ const all=raw.map(decorate); OB.cands=all.filter(a=>{const c=catOf(raw.find(r=>r.pkg===a.pkg));return c==='game'||(c==='app'&&a.maybe)}).sort((x,y)=>(x.maybe-y.maybe)||x.name.localeCompare(y.name)); OB.picks=new Set(OB.cands.filter(a=>!a.maybe).map(a=>a.pkg)) }
    const nG=OB.cands.filter(a=>!a.maybe).length, nM=OB.cands.length-nG, strm=raw.filter(r=>catOf(r)==='stream').map(r=>r.name);
    h=`<div class="obhead enter"><div class="eyebrow">STEP 4 · YOUR GAMES</div><h1>We found ${nG} game${nG===1?'':'s'}${nM?` and ${nM} maybe${nM>1?'s':''}`:''}</h1><p>Detected from what each app tells Android. Untick anything that isn't a game. ${strm.length?`Streaming apps found: <b style="color:#fff">${strm.map(esc).join(', ')}</b>. They go to the Streaming tab.`:'You can also move any app later with Y.'}</p></div>
      <div class="gg"><div class="ggi">${OB.cands.map((g,k)=>`<div class="gi ${OB.picks.has(g.pkg)?'on':''}" data-f data-k="${k}"><div class="cv">${coverInner(g,'gen')}<span class="ck">${OB.picks.has(g.pkg)?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="4"><path d="M5 12l5 5 9-10"/></svg>':''}</span></div><div class="nm">${esc(g.name)}<span class="${g.maybe?'maybe':''}">${g.maybe?'Maybe':esc(g.genre)}</span></div></div>`).join('')}</div></div>`;
  }else if(s===4){
    const done=Math.max(0,OB.fetchI);
    h=`<div class="obhead"><div class="eyebrow">${OB.single?'RE-SCAN':'STEP 5 · ARTWORK'}</div><h1>${OB.fetchI>=OB.list.length?'Artwork ready':'Finding artwork…'}</h1>
      <div class="pipe">Checked in order <b>Play Store</b>→<b>IGDB</b>→<b>Generated</b><span style="margin-left:8px">${L.igdbEnabled()?'':'IGDB is skipped until API keys are added. '}Change any cover from a game's Details.</span></div></div>
      <div class="pbar"><i style="width:${OB.list.length?Math.min(100,done/OB.list.length*100):100}%"></i></div>
      <div class="fl">${OB.list.slice(0,10).map((g,k)=>{const m=meta[g.pkg],d=!!(m&&OB.got.has(g.pkg)),src=m?(m.src==='fallback'?'fallback':m.src):'fallback';
        return `<div class="fr go ${d?'done':''}"><div class="th">${d?coverInner(g):''}</div><div class="nm">${esc(g.name)}</div><div class="tg ${d?src:''}">${d?`<i></i>${SRCNAME[src]}`:'<span class="spin"></span>Searching'}</div></div>`}).join('')}
        ${OB.list.length>10?`<div class="fr go" style="opacity:.6"><div class="nm">+ ${OB.list.length-10} more</div></div>`:''}</div>`;
  }
  if(OB.lastStep===s) h=h.replace(/ enter2?"/g,'"').replace(/ enter2? /g,' '); OB.lastStep=s;
  body.innerHTML=h;
  const items=[...body.querySelectorAll('[data-f]')];
  $('#ob .btns').innerHTML=obButtons().map(([c,l,a])=>`<button class="obtn ${c}" data-a="${a}" data-f>${c==='primary'?G('A'):''}${l}</button>`).join('');
  $('#ob .obfoot .left').innerHTML=OB.single?`<span class="h">${G('B')}Close</span>`:`<span class="h">${G('B')}Back</span>${s>0&&s<3?`<span class="h">${G('Y')}Skip</span>`:''}<span>Step ${s+1} of 5</span>`;
  OB.items=[...items,...$('#ob .btns').querySelectorAll('[data-f]')];
  if(OB.f>=OB.items.length||OB.f<0) OB.f=OB.items.length-1;
  OB.items.forEach((el,k)=>{el.classList.toggle('f',k===OB.f);el.onclick=()=>{OB.f=k;OBa.A()}});
  if(s===3) scrollGG();
  setHints([]);
}
function scrollGG(){ const r=Math.floor(Math.min(OB.f,OB.cands.length-1)/6); const g=$('.ggi'); if(g) g.style.transform=`translateY(${-Math.max(0,r-1)*142}px)` }
function obGo(step){ OB.step=step; OB.f=-1; if(step===0)OB.f=st.variant; if(step===1) homeOK=!!L.isDefaultHome(); if(step===2) usageOK=!!L.hasUsageAccess(); if(step===4) startFetch(); renderOB() }
function startFetch(){
  const games=raw.map(decorate).filter(a=>catOf(raw.find(r=>r.pkg===a.pkg))==='game');
  OB.list=games; OB.fetchI=0; OB.got=new Set();
  artCb=(pkg)=>{ if(pkg===null){ OB.fetchI=OB.list.length; artCb=null; OB.f=-1; buildLists(); renderOB(); return } OB.got.add(pkg); OB.fetchI=OB.got.size; renderOB() };
  if(!games.length){ OB.fetchI=0; setTimeout(()=>window.lobbyArtDone(),50); return }
  L.fetchArt(JSON.stringify(games.map(a=>({pkg:a.pkg,name:a.label}))),OB.force);
}
function commitPicks(){ if(!OB.picks) return; OB.cands.forEach(a=>{ const r=raw.find(x=>x.pkg===a.pkg); const want=OB.picks.has(a.pkg);
  if(want&&catOf(r)!=='game') cats[a.pkg]='game'; else if(!want&&catOf(r)==='game') cats[a.pkg]='app' }); save(); buildLists() }
const OBa={
  move(dx,dy){ const n=OB.items.length; let f=OB.f;
    if(OB.step===3){ const grid=n-$('#ob .btns').children.length, cols=6;
      if(f<grid){ if(dx)f+=dx; if(dy){ if(f+dy*cols>=grid&&dy>0)f=grid; else if(f+dy*cols>=0) f+=dy*cols } }
      else { if(dy<0)f=grid-1; else if(dx)f+=dx }
    } else f+=dx||dy;
    OB.f=Math.max(0,Math.min(n-1,f)); OB.items.forEach((el,k)=>el.classList.toggle('f',k===OB.f)); if(OB.step===3) scrollGG() },
  A(){ const el=OB.items[OB.f]; if(!el) return; const a=el.dataset.a;
    if(OB.step===0&&el.classList.contains('lay')){st.variant=+el.dataset.k;renderVariant();save();renderOB();OB.f=OB.items.length-1;OBa.move(0,0);return}
    if(OB.step===3&&el.classList.contains('gi')){const g=OB.cands[+el.dataset.k];OB.picks.has(g.pkg)?OB.picks.delete(g.pkg):OB.picks.add(g.pkg);const f=OB.f;renderOB();OB.f=f;OBa.move(0,0);return}
    if(a==='wait') return;
    if(a==='skip'){ if(OB.single){finishOB();return} obGo(OB.step+1); return }
    if(a==='do'&&OB.step===1){ L.requestHome(); return }
    if(a==='do'&&OB.step===2){ toast('Opening Android Settings…'); L.openUsageSettings(); return }
    if(a==='next'){ if(OB.step===3) commitPicks(); if(OB.single||OB.step===4){finishOB();return} obGo(OB.step+1) }
  },
  B(){ if(OB.single){ if(OB.step===4&&OB.fetchI<OB.list.length) return; finishOB();return} if(OB.step>0){ if(OB.step===3) commitPicks(); obGo(OB.step-1) } },
  Y(){ if(!OB.single&&(OB.step===1||OB.step===2)) obGo(OB.step+1) },
  L1(){},R1(){},X(){}
};

/* ================= HOME INPUT ================= */
const act={
  L1(){press('L1');setTab(st.tab-1)}, R1(){press('R1');setTab(st.tab+1)},
  move(dx,dy){
    if(st.tab===1){ if(!GAMES.length) return; const d=st.variant===2?(dy||dx):(dx||0); if(!d)return; const n=Math.max(0,Math.min(GAMES.length-1,st.game+d)); if(n!==st.game){st.game=n;renderGames()} }
    else if(st.tab===0){ if(dx){ st.stream=Math.max(0,Math.min(STREAMS.length,st.stream+dx)); renderStreams() } }
    else if(st.tab===2){ const n=st.app+dx+dy*6; if(n>=0&&n<APPS.length){st.app=n;renderApps()} }
    else{ if(dy)st.pref=Math.max(0,Math.min(PREFS.length-1,st.pref+dy)); else if(dx)PREFS[st.pref].step(dx); if(st.mode==='home') renderPrefs() }
  },
  A(){
    if(st.tab===1){ const g=GAMES[st.game]; if(g) launch(g.pkg,g.name) }
    else if(st.tab===0){ const s=STREAMS[st.stream]; if(s) launch(s.pkg,s.name); else openPicker() }
    else if(st.tab===2){ const a=APPS[st.app]; if(a) launch(a.pkg,a.name) }
    else{ PREFS[st.pref].step(0); if(st.mode==='home') renderPrefs() }
  },
  B(){ if(st.tab!==1) setTab(1) },
  Y(){ if(st.tab===1) openDetails(); else if(st.tab===0) openPicker(); else if(st.tab===2&&APPS[st.app]) openMove(APPS[st.app]) },
  X(){}
};
const HANDLERS={home:act,details:DTa,ob:OBa,picker:PKa,move:MVa};
function route(a,...x){ const h=HANDLERS[st.mode]||act; h[a]&&h[a](...x) }
window.lobbyInput=(name,dx,dy)=>{ if(!booted) return; if(name==='move') route('move',dx,dy); else if(name!=='START') route(name) };

/* ================= NATIVE CALLBACKS ================= */
window.lobbyPause=()=>M.pause();
window.lobbyResume=()=>{ M.resume(); const wasU=usageOK, wasH=homeOK; homeOK=!!L.isDefaultHome(); refreshUsage(true);
  if(st.mode==='ob'){ if(OB.step===2&&usageOK&&!wasU){ OB.f=-1; renderOB(); toast('Usage access is on') } else if(OB.step===1&&homeOK&&!wasH){ OB.f=-1; renderOB() } else renderOB() }
  if(st.tab===3&&st.mode==='home') renderPrefs(); battery() };
window.lobbyHomeResult=ok=>{ homeOK=!!ok||!!L.isDefaultHome(); if(st.mode==='ob'&&OB.step===1){ OB.f=-1; renderOB(); if(homeOK) toast('Lobby is your home app') } };
window.lobbyHome=()=>{ if(st.mode==='ob') return; if(st.mode==='details') closeDetails(); if(st.mode==='picker') PKa.B(); if(st.mode==='move') closeMove(); st.mode='home'; setTab(1) };
window.lobbyRefresh=()=>{ loadAll(); const fresh=GAMES.filter(g=>!meta[g.pkg]); if(fresh.length) fetchArtFor(fresh) };

/* ================= BOOT ================= */
let booted=false;
function boot(){ if(booted) return; booted=true; $('#boot').classList.add('gone'); M.init(); M.play(st.track);
  if(!st.onboarded) setTimeout(()=>startOnboarding(0),300) }
function battery(){ try{ const b=JSON.parse(L.getBattery()); if(b.level>=0){ $('#batPct').textContent=b.level+'%'; $('.bat .lvl').setAttribute('width',Math.max(1,Math.round(15*b.level/100))); $('.bat .lvl').setAttribute('fill',b.charging?'#3DFFB5':b.level<=15?'#FF2D6F':'#F5F5F7') } }catch(e){} }
function clock(){$('#clock').textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}

// Pointer / touch
$$('.tab').forEach(t=>t.onclick=()=>{if(st.mode==='home')setTab(+t.dataset.t)});
$('#L1').onclick=()=>route('L1'); $('#R1').onclick=()=>route('R1');
$$('[data-act="play"]').forEach(b=>b.onclick=()=>{if(st.mode==='home')act.A()});
$$('[data-act="details"]').forEach(b=>b.onclick=()=>{if(st.mode==='home')openDetails()});
$('#hints').addEventListener('click',e=>{const h=e.target.closest('.h');if(!h)return;const g=h.querySelector('.btnglyph');if(g)route(g.textContent)});
let wheelLock=0; stage.addEventListener('wheel',e=>{if(!booted||st.mode!=='home'||Date.now()-wheelLock<140)return;wheelLock=Date.now();const d=Math.sign(e.deltaY||e.deltaX);(st.tab===1&&st.variant!==2)||st.tab===0?act.move(d,0):act.move(0,d)},{passive:true});
// Swipe left/right on the games/streaming rows (touch)
let tx=null; stage.addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
stage.addEventListener('touchend',e=>{ if(tx===null||st.mode!=='home') return; const dx=e.changedTouches[0].clientX-tx; tx=null; if(Math.abs(dx)>60&&(st.tab<=1)) act.move(dx<0?1:-1,0) },{passive:true});

// Keyboard (computer preview only — on the phone the app forwards controller input via lobbyInput)
if(MOCK) addEventListener('keydown',e=>{
  if(!booted){boot();return}
  const k=e.key, inInput=document.activeElement&&document.activeElement.tagName==='INPUT';
  if(inInput) return;
  const map={q:'L1',Q:'L1',PageUp:'L1',e:'R1',E:'R1',PageDown:'R1',Enter:'A',' ':'A',Escape:'B',Backspace:'B',y:'Y',Y:'Y'};
  if(map[k]){e.preventDefault();route(map[k]);return}
  const mv={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];
  if(mv){e.preventDefault();route('move',...mv)}
});
if(MOCK) $('#boot').addEventListener('click',boot);

/* init */
document.documentElement.classList.toggle('reduced',st.reduced);
homeOK=!!L.isDefaultHome();
loadAll(); renderVariant(); renderNP(); renderPrefs(); clock(); battery();
setInterval(clock,15000); setInterval(battery,60000);
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{ renderTabs(); if(!MOCK) setTimeout(boot,650) });
renderTabs();
// Pick up artwork for any game we haven't looked up yet (after first-run setup)
if(st.onboarded){ const fresh=GAMES.filter(g=>!meta[g.pkg]); if(fresh.length) fetchArtFor(fresh) }
