/* Browser-only stand-in for the native bridge, so the UI can be previewed on a computer.
   On the phone, window.Lobby is injected by the app before this runs and this file does nothing. */
(function(){
  if (window.Lobby) return;
  window.LOBBY_MOCK = true;
  const C=['#FF2D6F','#7FE7FF','#FFC94D','#FF6A2B','#B6FF6B','#8FB8FF','#FFE14D','#3DFFE0','#FF3B3B','#FFB3D1','#3E7BFA','#18B37E','#6B4EFF','#107C10','#003791','#1E88E5'];
  const apps=[
    ['com.neonworks.drift','Neon Drift',1],['com.lantern.hollowpeaks','Hollow Peaks',1],['gg.orbital.starfall','Starfall Tactics',1],
    ['com.ironhull.rustrain','Rust & Rain',1],['io.softlight.lumen','Lumen Garden',1],['com.tidal.irontide','Iron Tide',1],
    ['com.eightbit.knights','Pixel Knights',1],['com.epic.longname','The Legend of the Extremely Long Game Title: Definitive Remastered Edition',1],['com.mid.name','Call of Destiny: Warzone Mobile',1],['com.loopgames.echorun','Echo Run',1],
    ['com.microsoft.xboxone.smartglass','Xbox',0],['com.playstation.remoteplay','PS Remote Play',0],['com.metallic.chiaki','Chiaki',0],
    ['com.retroarch','RetroArch',0],['com.android.chrome','Chrome',0],['com.spotify.music','Spotify',0],['com.google.android.youtube','YouTube',0],
    ['com.android.settings','Settings',0],['com.google.android.apps.photos','Photos',0],['com.whatsapp','WhatsApp',0],['com.android.camera','Camera',0],
    ['com.google.android.gm','Gmail',0],['com.google.android.apps.maps','Maps',0],['com.android.vending','Play Store',0]];
  const col=p=>C[[...p].reduce((a,c)=>a+c.charCodeAt(0),0)%C.length];
  window.MOCK_ICON=p=>{const a=apps.find(x=>x[0]===p),n=a?a[1]:'?';
    return 'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="${col(p)}"/><text x="48" y="64" text-anchor="middle" font-family="Arial" font-weight="700" font-size="44" fill="#fff">${n[0]}</text></svg>`)};
  const motif=(p,v)=>{const c=col(p);const k=[...p].length%3;
    const body=k===0?`<circle cx="100" cy="50" r="24" fill="${c}"/><rect y="54" width="160" height="36" fill="#0a0010"/>`:k===1?`<polygon points="0,90 0,58 30,30 56,56 84,22 122,60 160,38 160,90" fill="${c}" opacity=".7"/>`:`<circle cx="104" cy="44" r="16" fill="${c}"/><circle cx="104" cy="44" r="34" fill="none" stroke="${c}" opacity=".5"/>`;
    return 'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice"><rect width="160" height="90" fill="#0b0b14"/>${v==='igdb2'?'<rect width="160" height="90" fill="#1a0f2a"/>':''}${body}</svg>`)};
  window.MOCK_ART=motif;
  let usageOn=false, home=false; const meta={};
  window.Lobby={
    getApps:()=>JSON.stringify(apps.map(([pkg,name,g])=>({pkg,name,game:!!g,system:false,ver:'1.0.0',installed:Date.now()-86400000*30}))),
    launch:p=>true, openAppInfo:()=>{}, setTyping:()=>{},
    isDefaultHome:()=>home, requestHome:()=>setTimeout(()=>{home=true;window.lobbyHomeResult&&lobbyHomeResult(true)},700),
    hasUsageAccess:()=>usageOn, openUsageSettings:()=>setTimeout(()=>{usageOn=true;window.lobbyResume&&lobbyResume()},1200),
    getUsage:()=>{ if(!usageOn) return '{}'; const o={}; apps.forEach(([p],i)=>{o[p]={total:(i*7+3)*3600000,last:Date.now()-i*86400000*1.3,week:i<3?(4-i)*3600000:0,days:[30,0,55,80,20,95,60].map(m=>i<3?m:0)}}); return JSON.stringify(o)},
    getMeta:()=>JSON.stringify(meta),
    fetchArt:(list)=>{ JSON.parse(list).forEach((x,i)=>setTimeout(()=>{ const n=x.pkg.length%4; const m={src:n===0?'fallback':n===1?'igdb':'play',variants:{play:n>1,igdb:n===1||n===2,igdb2:n===1},genre:['Racing','Adventure','Strategy','Shooter','Puzzle','Action','RPG','Platformer'][i%8]}; meta[x.pkg]=m; lobbyArt(x.pkg,m); if(i===JSON.parse(list).length-1) setTimeout(()=>lobbyArtDone(),100)},250*(i+1))) },
    pickImage:p=>setTimeout(()=>lobbyGallery(p,false),300),
    getPlayCategories:()=>'{}', checkCategories:l=>{ JSON.parse(l).forEach((p,i)=>setTimeout(()=>lobbyCategory(p,p==='com.retroarch'?'GAME_ARCADE':'TOOLS'),400+i*30)) },
    getBattery:()=>JSON.stringify({level:82,charging:true}), systemLauncherName:()=>'Pixel Launcher', openSystemLauncher:()=>true, igdbEnabled:()=>false, openSettings:()=>{}
  };
})();
