// === index.html dan ajratildi (XOLERIC SEO) ===
(function(){
  const $ = s => document.querySelector(s);
  const app = $('#app'), mesh = $('#mesh'), canvas = $('#wave'), ctx = canvas.getContext('2d');
  const meta = $('#meta'), titleEl = $('#title'), artistEl = $('#artist'), stateLabel = $('#stateLabel');
  const playlistEl = $('#playlist'), settingsEl = $('#settings'), tracksEl = $('#tracks'), emptyEl = $('#empty');
  const toast = $('#toast'), fileInput = $('#fileInput'), addBtn = $('#addBtn');
  const toggleNotif = $('#toggleNotif'), toggleSurprise = $('#toggleSurprise'), toggleCrossfade = $('#toggleCrossfade');

  function resize(){ canvas.width = innerWidth*devicePixelRatio; canvas.height = innerHeight*devicePixelRatio; }
  resize(); addEventListener('resize', resize);

  // ---------------- STATE ----------------
  let library = [];        // {id,name,artist,url,file,plays,likes,seconds,lastPlayed}
  let current = -1;
  let isPlaying = false;
  let notifOn = false, surpriseOn = true, crossfadeOn = true;
  let panelOpen = null;     // 'playlist' | 'settings' | null

  const audio = new Audio();
  audio.crossOrigin = "anonymous";

  // Web Audio analyser
  const actx = new (window.AudioContext||window.webkitAudioContext)();
  const srcNode = actx.createMediaElementSource(audio);
  const analyser = actx.createAnalyser();
  analyser.fftSize = 256;
  srcNode.connect(analyser); analyser.connect(actx.destination);
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // ---------------- PERSISTENCE ----------------
  async function loadStats(){
    try{
      const r = await window.storage.get('xoleric:stats', false);
      return r ? JSON.parse(r.value) : {};
    }catch(e){ return {}; }
  }
  async function saveStats(stats){
    try{ await window.storage.set('xoleric:stats', JSON.stringify(stats), false); }catch(e){}
  }
  let statsMap = {};

  function trackKey(name){ return 'k_'+name.replace(/[^a-z0-9]/gi,'').toLowerCase(); }

  // ---------------- MOOD MESH ----------------
  function hueForName(name){
    let h=0; for(let i=0;i<name.length;i++) h = (h*31 + name.charCodeAt(i)) % 360;
    return h;
  }
  function applyMood(name, energy){
    const h = hueForName(name||'xoleric');
    const c1 = `hsl(${h} 55% ${18+energy*10}%)`;
    const c2 = `hsl(${(h+40)%360} 45% 8%)`;
    mesh.style.background = `radial-gradient(60% 55% at 30% 25%, ${c1}, transparent 70%),
                              radial-gradient(50% 60% at 75% 70%, ${c2}, transparent 75%), #000`;
  }

  // ---------------- WAVE RENDER LOOP ----------------
  let idlePhase = 0;
  function draw(){
    requestAnimationFrame(draw);
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    const cx = w/2, cy = h/2;

    if(isPlaying){
      analyser.getByteFrequencyData(freqData);
      let sum=0; for(let i=0;i<freqData.length;i++) sum+=freqData[i];
      const energy = sum/(freqData.length*255);
      applyMood(library[current] && library[current].name, energy);

      ctx.beginPath();
      const bars = 64;
      const radius = Math.min(w,h)*0.16;
      for(let i=0;i<bars;i++){
        const v = freqData[Math.floor(i*freqData.length/bars)]/255;
        const angle = (i/bars)*Math.PI*2;
        const len = radius + v*radius*1.9;
        const x1 = cx+Math.cos(angle)*radius, y1 = cy+Math.sin(angle)*radius;
        const x2 = cx+Math.cos(angle)*len, y2 = cy+Math.sin(angle)*len;
        ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
      }
      ctx.strokeStyle = 'rgba(245,245,242,0.85)';
      ctx.lineWidth = 2.4*devicePixelRatio;
      ctx.lineCap='round';
      ctx.stroke();
      $('#pulse').style.opacity = 0;
    } else {
      idlePhase += 0.02;
      const r = Math.min(w,h)*0.08 + Math.sin(idlePhase)*4*devicePixelRatio;
      ctx.beginPath();
      ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.strokeStyle='rgba(245,245,242,0.25)';
      ctx.lineWidth=1.4*devicePixelRatio;
      ctx.stroke();
      $('#pulse').style.opacity = .9;
      if(!library.length) applyMood('xoleric', .2);
    }
  }
  draw();

  // ---------------- PLAYBACK ----------------
  function showToast(msg){
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toast.classList.remove('show'), 2200);
  }

  function renderMeta(swap){
    const t = library[current];
    const apply = ()=>{
      titleEl.textContent = t ? t.name : 'XOLERIC';
      artistEl.textContent = t ? (t.artist||'Noma\u02bblum ijrochi') : 'Musiqa qo\u02bbshish uchun pastdan tepaga suring';
      stateLabel.textContent = isPlaying ? "IJRO ETILMOQDA" : "PAUZA";
    };
    if(swap){ meta.classList.add('swap-out'); setTimeout(()=>{apply(); meta.classList.remove('swap-out');},220); }
    else apply();
    if('mediaSession' in navigator && t){
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.name, artist: t.artist||'XOLERIC', album:'XOLERIC MUSIC'
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing':'paused';
    }
  }

  function playIndex(i, swap=true){
    if(!library.length) return;
    if(actx.state==='suspended') actx.resume();
    current = (i+library.length)%library.length;
    const t = library[current];
    if(crossfadeOn){
      audio.volume = 0;
      audio.src = t.url;
      audio.play().then(()=>{
        let v=0; const fade=setInterval(()=>{ v+=0.08; audio.volume=Math.min(1,v); if(v>=1) clearInterval(fade); },30);
      }).catch(()=>{});
    } else {
      audio.src = t.url; audio.volume=1; audio.play().catch(()=>{});
    }
    isPlaying = true;
    t.plays = (t.plays||0)+1; t.lastPlayed = Date.now();
    persistCurrentStats();
    renderMeta(swap);
    renderTracks();
  }

  function togglePlay(){
    if(!library.length){ return; }
    if(!audio.src){ playIndex(0); return; }
    if(isPlaying){ audio.pause(); isPlaying=false; }
    else { if(actx.state==='suspended') actx.resume(); audio.play(); isPlaying=true; }
    renderMeta(false);
  }

  function next(){ playIndex(pickNext()); }
  function prev(){ playIndex(current-1); }

  function pickNext(){
    if(surpriseOn && library.length>2 && Math.random()<0.35){
      // weighted "surprise me": favor less-recently played, keep some randomness
      const scored = library.map((t,i)=>({i, score: Math.random()*2 - (t.plays||0)*0.1 + ((Date.now()-(t.lastPlayed||0))/1e8)}));
      scored.sort((a,b)=>b.score-a.score);
      return scored[0].i;
    }
    return current+1;
  }

  audio.addEventListener('ended', ()=> next());

  function persistCurrentStats(){
    library.forEach(t=>{ statsMap[trackKey(t.name)] = {plays:t.plays||0, likes:t.likes||0, lastPlayed:t.lastPlayed||0}; });
    saveStats(statsMap);
    renderSettingsStats();
  }

  // ---------------- LIBRARY / FILES ----------------
  addBtn.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', e=>{
    const files = Array.from(e.target.files);
    files.forEach(f=>{
      const name = f.name.replace(/\.[^/.]+$/,'');
      const id = name + '_' + f.size;
      const url = URL.createObjectURL(f);
      const saved = statsMap[trackKey(name)] || {};
      library.push({id, name, artist:'Mahalliy fayl', url, file:f, plays:saved.plays||0, likes:saved.likes||0, lastPlayed:saved.lastPlayed||0});
    });
    emptyEl.style.display = library.length? 'none':'flex';
    renderTracks(); renderSettingsStats();
    if(current<0 && library.length){ current = 0; }
    showToast(files.length+" ta qo'shiq qo'shildi");
    fileInput.value='';
  });

  function renderTracks(){
    tracksEl.innerHTML='';
    library.forEach((t,i)=>{
      const row = document.createElement('div');
      row.className = 'track'+(i===current?' active':'');
      row.innerHTML = `<div class="idx">${String(i+1).padStart(2,'0')}</div>
        <div class="info"><div class="t">${t.name}</div><div class="a">${t.artist}</div></div>
        <div class="stat">${t.plays||0}\u00d7</div>`;
      row.addEventListener('click', ()=>{ playIndex(i); closePanels(); });
      tracksEl.appendChild(row);
    });
  }

  function renderSettingsStats(){
    $('#statCount').textContent = library.length;
    const total = library.reduce((s,t)=>s+(t.plays||0),0);
    $('#statTotal').textContent = total+" marta";
    const bars = $('#algoBars');
    bars.innerHTML = '';
    const top = [...library].sort((a,b)=>(b.plays||0)-(a.plays||0)).slice(0,5);
    const max = Math.max(1, ...top.map(t=>t.plays||0));
    top.forEach(t=>{
      const row = document.createElement('div'); row.className='bar-row';
      row.innerHTML = `<div class="name">${t.name}</div><div class="bar-track"><div class="bar-fill" style="width:${((t.plays||0)/max*100)}%"></div></div>`;
      bars.appendChild(row);
    });
  }

  // ---------------- GESTURES ----------------
  let touchStartX=0, touchStartY=0, touchStartT=0, dragging=false;
  let lastTap=0, tapTimer=null;

  app.addEventListener('touchstart', e=>{
    const t = e.touches[0];
    touchStartX=t.clientX; touchStartY=t.clientY; touchStartT=Date.now(); dragging=true;
  }, {passive:true});

  app.addEventListener('touchmove', e=>{
    if(!dragging || panelOpen) return;
    const t = e.touches[0];
    const dx = t.clientX-touchStartX, dy = t.clientY-touchStartY;
    if(Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)){
      if(dx>0) $('#edgeGlowR').style.opacity=1; else $('#edgeGlowL').style.opacity=1;
    }
  }, {passive:true});

  app.addEventListener('touchend', e=>{
    dragging=false;
    $('#edgeGlowL').style.opacity=0; $('#edgeGlowR').style.opacity=0;
    const t = e.changedTouches[0];
    const dx = t.clientX-touchStartX, dy = t.clientY-touchStartY;
    const dt = Date.now()-touchStartT;
    const absX=Math.abs(dx), absY=Math.abs(dy);

    if(panelOpen){
      // allow closing settings/playlist by dragging back toward origin edge
      if(panelOpen==='playlist' && dy>70 && absY>absX){ closePanels(); }
      if(panelOpen==='settings' && dy<-70 && absY>absX){ closePanels(); }
      return;
    }

    if(absX>60 && absX>absY && dt<600){
      if(dx<0) next(); else prev();
      return;
    }
    if(absY>70 && absY>absX){
      if(dy<0 && touchStartY > innerHeight*0.55){ openPanel('playlist'); return; }
      if(dy>0 && touchStartY < innerHeight*0.45){ openPanel('settings'); return; }
    }
    if(absX<12 && absY<12){
      const now = Date.now();
      if(now-lastTap<300){ clearTimeout(tapTimer); lastTap=0; likeBurst(t.clientX,t.clientY); }
      else{
        lastTap=now;
        tapTimer=setTimeout(()=>{ togglePlay(); }, 260);
      }
    }
  });

  // mouse (desktop testing) fallback
  let mDown=false, mx=0,my=0;
  app.addEventListener('mousedown', e=>{mDown=true; mx=e.clientX; my=e.clientY;});
  app.addEventListener('mouseup', e=>{
    if(!mDown) return; mDown=false;
    const dx=e.clientX-mx, dy=e.clientY-my;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)){ dx<0?next():prev(); return; }
    if(Math.abs(dx)<8 && Math.abs(dy)<8){
      const now=Date.now();
      if(now-lastTap<300){ likeBurst(e.clientX,e.clientY); lastTap=0; }
      else { lastTap=now; setTimeout(()=>{ if(Date.now()-lastTap>=250) togglePlay(); },260); }
    }
  });
  $('#topHint').parentElement; // noop keep refs alive

  function likeBurst(x,y){
    if(current>=0){ library[current].likes = (library[current].likes||0)+1; persistCurrentStats(); }
    for(let i=0;i<6;i++){
      const h = document.createElement('div');
      h.className='heart'; h.textContent='\u2665';
      h.style.left=(x + (Math.random()*40-20))+'px';
      h.style.top=(y + (Math.random()*20-10))+'px';
      h.style.color = `hsl(${hueForName((library[current]&&library[current].name)||'x')} 70% 70%)`;
      h.style.animationDelay=(i*0.03)+'s';
      app.appendChild(h);
      setTimeout(()=>h.remove(), 1300);
    }
  }

  // ---------------- PANELS ----------------
  function openPanel(name){
    closePanels(false);
    panelOpen = name;
    (name==='playlist'?playlistEl:settingsEl).classList.add('open');
    history.pushState({panel:name}, '');
  }
  function closePanels(pop=true){
    playlistEl.classList.remove('open'); settingsEl.classList.remove('open');
    panelOpen = null;
    if(pop && history.state && history.state.panel) history.back();
  }
  addEventListener('popstate', ()=>{ playlistEl.classList.remove('open'); settingsEl.classList.remove('open'); panelOpen=null; });

  // block page scroll/bounce
  document.addEventListener('touchmove', e=>{ if(!panelOpen) e.preventDefault(); }, {passive:false});

  // ---------------- TOGGLES ----------------
  function bindToggle(el, onChange, initial){
    if(initial) el.classList.add('on');
    el.addEventListener('click', ()=>{
      el.classList.toggle('on');
      onChange(el.classList.contains('on'));
    });
  }
  bindToggle(toggleSurprise, v=>surpriseOn=v, true);
  bindToggle(toggleCrossfade, v=>crossfadeOn=v, true);
  bindToggle(toggleNotif, v=>{
    notifOn=v;
    if(v && 'Notification' in window){
      Notification.requestPermission().then(p=>{
        if(p!=='granted'){ notifOn=false; toggleNotif.classList.remove('on'); showToast('Bildirishnoma ruxsati berilmadi'); }
        else showToast('Bildirishnomalar yoqildi');
      });
    }
  }, false);

  // ---------------- MEDIA SESSION ----------------
  if('mediaSession' in navigator){
    navigator.mediaSession.setActionHandler('play', ()=>togglePlay());
    navigator.mediaSession.setActionHandler('pause', ()=>togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', ()=>prev());
    navigator.mediaSession.setActionHandler('nexttrack', ()=>next());
  }

  // ---------------- NOTIFICATION SCHEDULER (demo, tab-open only) ----------------
  const notifLines = [
    n=>`${n} — yana tinglang`, n=>`${n} kutmoqda`, n=>`Xotiralaringizni eslang: ${n}`,
    n=>`Bugun ${n} bilan boshlang`, n=>`${n} — allaqachon sog'inibsiz`, n=>`Sizga ${n} yoqishi mumkin`,
    n=>`${n} — yangi kayfiyat`, n=>`Tinch bir lahza: ${n}`, n=>`${n} sizni kutyapti`,
    n=>`Ummon yo'q — ${n} qulog'ingizga tegishi kerak`, n=>`${n} bilan kayfiyatni ko'taring`,
    n=>`Uzoq eshitilmagan: ${n}`, n=>`${n} — yana bir bor`, n=>`Sokin daqiqa uchun: ${n}`,
    n=>`${n} qaytadi`, n=>`Kayfiyatga mos: ${n}`, n=>`${n} — sevimlilaringizdan`,
    n=>`Bugungi tavsiya: ${n}`, n=>`${n} bilan davom eting`, n=>`Yana bir marta: ${n}`
  ];
  function fireNotification(){
    if(!notifOn || !library.length || document.hidden===false && !notifOn) {}
    if(!notifOn || !library.length) return;
    const t = library[Math.floor(Math.random()*library.length)];
    const line = notifLines[Math.floor(Math.random()*notifLines.length)](t.name);
    if('Notification' in window && Notification.permission==='granted'){
      new Notification('XOLERIC', {body: line, silent:true});
    }
  }
  setInterval(fireNotification, 45000); // demo cadence

  // ---------------- INIT ----------------
  (async ()=>{
    statsMap = await loadStats();
    emptyEl.style.display = 'flex';
    renderMeta(false);
    renderSettingsStats();
  })();

})();