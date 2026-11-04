const $=s=>document.querySelector(s);
const ws=$('#ws'), trash=$('#trash'), toastEl=$('#toast');
let items=[], sel=null, nid=1, drag=null, zoomRef=null, fullOpen=false;

function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>toastEl.classList.remove('show'),1800)}

/* ---------- images ---------- */
function layout(it){const e=it.el;e.style.left=it.x+'px';e.style.top=it.y+'px';e.style.width=it.w*it.s+'px';e.style.height=it.h*it.s+'px'}
function select(it){sel=it;items.forEach(i=>i.el.classList.toggle('sel',i===it));['bZoomOut','bZoomIn','bFull','bDel'].forEach(id=>$('#'+id).disabled=!it);if(it){ws.appendChild(it.el)}}
function addImage(file){
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
    const w=Math.min(260,img.naturalWidth),h=w*img.naturalHeight/img.naturalWidth,r=ws.getBoundingClientRect(),n=items.length;
    const it={id:nid++,url,w,h,s:1,x:Math.max(10,r.width/2-w/2-120+(n%5)*40),y:Math.max(10,r.height/2-h/2-100+(n%5)*30)};
    const el=document.createElement('div');el.className='item';el.innerHTML='<img alt="">';el.firstChild.src=url;it.el=el;
    el.addEventListener('pointerdown',ev=>{ev.preventDefault();select(it);startDrag(it,ev.clientX,ev.clientY);el.setPointerCapture(ev.pointerId)});
    el.addEventListener('pointermove',ev=>{if(drag&&drag.it===it)moveDrag(ev.clientX,ev.clientY)});
    el.addEventListener('pointerup',ev=>endDrag(ev.clientX,ev.clientY));
    el.addEventListener('wheel',ev=>{ev.preventDefault();select(it);setScale(it,it.s*(ev.deltaY<0?1.1:.9))},{passive:false});
    ws.appendChild(el);items.push(it);layout(it);select(it);$('#empty').style.display='none';
  };
  img.src=url;
}
function setScale(it,s){s=Math.min(6,Math.max(.2,s));const cx=it.x+it.w*it.s/2,cy=it.y+it.h*it.s/2;it.s=s;it.x=cx-it.w*s/2;it.y=cy-it.h*s/2;layout(it)}
function removeItem(it){it.el.remove();items=items.filter(i=>i!==it);URL.revokeObjectURL(it.url);if(sel===it)select(null);if(!items.length)$('#empty').style.display='flex';if(fullOpen)closeFull()}
function overTrash(cx,cy){const r=trash.getBoundingClientRect();return cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom}
function startDrag(it,cx,cy){const r=ws.getBoundingClientRect();drag={it,ox:cx-r.left-it.x,oy:cy-r.top-it.y}}
function moveDrag(cx,cy){if(!drag)return;const r=ws.getBoundingClientRect(),it=drag.it;it.x=cx-r.left-drag.ox;it.y=cy-r.top-drag.oy;layout(it);trash.classList.toggle('hot',overTrash(cx,cy))}
function endDrag(cx,cy){if(!drag)return;const it=drag.it;drag=null;const hot=overTrash(cx,cy);trash.classList.remove('hot');if(hot){removeItem(it);toast('Image deleted')}}
function hit(cx,cy){const r=ws.getBoundingClientRect();for(let i=items.length-1;i>=0;i--){const it=items[i];const x=cx-r.left,y=cy-r.top;if(x>=it.x&&x<=it.x+it.w*it.s&&y>=it.y&&y<=it.y+it.h*it.s)return it}return null}

/* ---------- full screen ---------- */
function openFull(){if(!sel){toast('Select an image first');return}$('#fullImg').src=sel.url;$('#full').style.display='flex';fullOpen=true;swipeHist=[]}
function closeFull(){$('#full').style.display='none';fullOpen=false}

/* ---------- buttons ---------- */
$('#bUpload').onclick=()=>$('#file').click();
$('#file').onchange=e=>{[...e.target.files].forEach(addImage);e.target.value=''};
$('#bZoomIn').onclick=()=>sel&&setScale(sel,sel.s*1.2);
$('#bZoomOut').onclick=()=>sel&&setScale(sel,sel.s/1.2);
$('#bFull').onclick=openFull;
$('#bDel').onclick=()=>sel&&removeItem(sel);
$('#bBack').onclick=closeFull;
$('#bHelp').onclick=()=>$('#help').style.display='flex';
$('#bHelpClose').onclick=()=>$('#help').style.display='none';
ws.addEventListener('pointerdown',e=>{if(e.target===ws||e.target.id==='empty')select(null)});
addEventListener('keydown',e=>{if(e.key==='Escape')closeFull();if(e.key==='Delete'&&sel&&!fullOpen)removeItem(sel)});
/* drag & drop files */
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();[...e.dataTransfer.files].filter(f=>f.type.startsWith('image/')).forEach(addImage)});

/* ---------- camera preview: move / hide ---------- */
const cam=$('#cam'),pill=$('#pill');
(function(){let d=null;const h=$('#camHead');
h.addEventListener('pointerdown',e=>{if(e.target.tagName==='BUTTON')return;const r=cam.getBoundingClientRect();d={dx:e.clientX-r.left,dy:e.clientY-r.top};h.setPointerCapture(e.pointerId)});
h.addEventListener('pointermove',e=>{if(!d)return;cam.style.left=Math.min(innerWidth-cam.offsetWidth,Math.max(0,e.clientX-d.dx))+'px';cam.style.top=Math.max(0,e.clientY-d.dy)+'px';cam.style.right='auto'});
h.addEventListener('pointerup',()=>d=null)})();
$('#bHide').onclick=()=>{cam.style.display='none';pill.style.display='flex'};
pill.onclick=()=>{pill.style.display='none';cam.style.display='block'};
function setStatus(on,text){$('#dot').classList.toggle('on',on);$('#pdot').style.background=on?'var(--ok)':'var(--danger)';$('#camStatus').textContent=text;$('#pillTxt').textContent=on?'Camera on':'Camera off';$('#bCam').textContent='Camera: '+(on?'on':'off')}
function showErr(title,steps){const e=$('#err');e.style.display='block';e.innerHTML='<b>'+title+'</b>'+(steps?'<ul>'+steps.map(s=>'<li>'+s+'</li>').join('')+'</ul>':'');cam.style.display='block';pill.style.display='none'}
function clearErr(){$('#err').style.display='none'}

/* ---------- MediaPipe Hands ---------- */
const HANDS_URL='https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/';
let stream=null,hands=null,running=false,busy=false;
const video=$('#video'),ov=$('#ov'),octx=ov.getContext('2d');
function loadScript(src){return new Promise((res,rej)=>{if(window.Hands)return res();const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';s.onload=res;s.onerror=()=>rej(new Error('script'));document.head.appendChild(s)})}

$('#bCam').onclick=()=>running?stopCam():requestFlow();
async function startCam(){
  clearErr();
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    showErr('Camera unavailable here',['Camera access requires HTTPS or http://localhost.','Your browser may not support webcams.']);return}
  setStatus(false,'Requesting cameraâ€¦');
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});
  }catch(err){
    setStatus(false,'Camera blocked');
    const n=err&&err.name;
    if(n==='NotAllowedError'||n==='SecurityError'||n==='PermissionDeniedError')
      showErr('Camera permission denied',['Click the camera/lock icon in the address bar and choose Allow, then reload.','Safari: Settings for This Website â†’ Camera â†’ Allow.','Check OS privacy settings for your browser.','If embedded in another page, open it in its own tab.']);
    else if(n==='NotFoundError'||n==='OverconstrainedError')showErr('No camera found',['Plug in or enable a webcam, then try again.']);
    else if(n==='NotReadableError'||n==='AbortError')showErr('Camera is busy',['Close other apps or tabs using the camera, then try again.']);
    else showErr('Could not start camera',[String(err&&err.message||err)]);
    return}
  video.srcObject=stream;await video.play().catch(()=>{});
  setStatus(true,'Camera on Â· loading trackerâ€¦');
  try{
    await loadScript(HANDS_URL+'hands.js');
    if(!hands){hands=new Hands({locateFile:f=>HANDS_URL+f});hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.6,minTrackingConfidence:.5});hands.onResults(onResults)}
    await hands.initialize();
  }catch(err){
    showErr('Hand tracking could not load',['The MediaPipe files come from cdn.jsdelivr.net â€” check your connection or network blocking.','The camera is on, and all buttons still work.','If this page is hosted with restricted network access, run it locally (see Help).']);
    setStatus(true,'Camera on Â· tracking unavailable');running=true;return}
  running=true;setStatus(true,'Camera on Â· tracking');loop();
}
function stopCam(){
  running=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null;
  octx.clearRect(0,0,640,480);setStatus(false,'Camera off');$('#gest').textContent='Gesture: â€”';clearErr();
  document.querySelectorAll('.hand').forEach(h=>h.style.display='none');
  if(drag){endDrag(-1,-1)}zoomRef=null;
}
async function loop(){
  if(!running||!hands)return;
  if(!busy&&video.readyState>=2){busy=true;try{await hands.send({image:video})}catch(e){}busy=false}
  requestAnimationFrame(loop);
}

/* ---------- gesture logic ---------- */
const CONN=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const ext=(lm,tip,pip)=>dist(lm[tip],lm[0])>dist(lm[pip],lm[0])*1.12;
const hs=[{pinch:false},{pinch:false}];
let palmSince=0,cooldown=0,swipeHist=[];

function onResults(res){
  octx.clearRect(0,0,640,480);
  const list=res.multiHandLandmarks||[];
  const H=[];
  list.forEach((lm,i)=>{
    octx.strokeStyle='#4cd68a';octx.lineWidth=2;
    CONN.forEach(([a,b])=>{octx.beginPath();octx.moveTo(lm[a].x*640,lm[a].y*480);octx.lineTo(lm[b].x*640,lm[b].y*480);octx.stroke()});
    octx.fillStyle='#fff';lm.forEach(p=>{octx.beginPath();octx.arc(p.x*640,p.y*480,3,0,7);octx.fill()});
    if(i>1)return;
    const size=dist(lm[0],lm[9])||.1,ratio=dist(lm[4],lm[8])/size;
    const st=hs[i];st.pinch=st.pinch?ratio<.5:ratio<.32;
    const mx=(lm[4].x+lm[8].x)/2,my=(lm[4].y+lm[8].y)/2;
    H.push({lm,pinch:st.pinch,x:(1-mx)*innerWidth,y:my*innerHeight,
      open:ext(lm,8,6)&&ext(lm,12,10)&&ext(lm,16,14)&&ext(lm,20,18)&&dist(lm[4],lm[17])>size*.9,
      point:ext(lm,8,6)&&!ext(lm,12,10)&&!ext(lm,16,14)&&!ext(lm,20,18)});
  });
  [0,1].forEach(i=>{const el=$('#h'+i),h=H[i];if(!h){el.style.display='none';return}el.style.display='block';el.style.left=h.x+'px';el.style.top=h.y+'px';el.classList.toggle('pinch',h.pinch)});
  const now=performance.now();let label='No hand';

  if(fullOpen){
    /* swipe-left with index finger */
    const h=H.find(h=>h.point);
    if(h){label='Pointing';const x=(1-h.lm[8].x)*innerWidth;swipeHist.push([now,x]);swipeHist=swipeHist.filter(p=>now-p[0]<600);
      const mx=Math.max(...swipeHist.map(p=>p[1]));
      if(now>cooldown&&mx-x>innerWidth*.22){closeFull();toast('Swipe left â†’ back');cooldown=now+1200;swipeHist=[]}}
    else swipeHist=[];
    if(H.length&&!h)label='Hand';
    $('#gest').textContent='Gesture: '+label;return;
  }

  const pinchers=H.filter(h=>h.pinch);
  if(pinchers.length)label='Pinch';
  /* two-hand zoom */
  if(pinchers.length===2&&sel){
    const d=Math.hypot(pinchers[0].x-pinchers[1].x,pinchers[0].y-pinchers[1].y);
    if(!zoomRef)zoomRef={d0:d,s0:sel.s};
    setScale(sel,zoomRef.s0*d/Math.max(zoomRef.d0,30));label='Zoom';
    if(drag)endDrag(-1,-1);
  }else{
    zoomRef=null;
    const p=pinchers[0];
    if(p){
      if(!drag){const it=hit(p.x,p.y);if(it){select(it);startDrag(it,p.x,p.y)}}
      else moveDrag(p.x,p.y);
      if(drag)label='Dragging';
    }else if(drag){const last=H[0];endDrag(last?last.x:-1,last?last.y:-1)}
  }
  /* open palm â†’ full screen */
  const palm=!pinchers.length&&H.find(h=>h.open);
  if(palm){label='Open palm';if(!palmSince)palmSince=now;
    if(now-palmSince>700&&now>cooldown){cooldown=now+1500;palmSince=0;openFull()}}
  else palmSince=0;
  $('#gest').textContent='Gesture: '+label;
}
/* ---------- ask before using the camera ---------- */
async function camState(){try{return (await navigator.permissions.query({name:'camera'})).state}catch(e){return 'unknown'}}
async function requestFlow(){
  const s=await camState();
  if(s==='granted'||s==='denied'){startCam();return}
  $('#ask').style.display='flex';
}
$('#askYes').onclick=()=>{$('#ask').style.display='none';startCam()};
$('#askNo').onclick=()=>{$('#ask').style.display='none';setStatus(false,'Camera off');toast('Camera is off â€” use the buttons, or click Camera: off to enable')};
requestFlow(); // on load: ask first (or start straight away if already allowed)

/* ===== v2: history, projects, editor, new gestures ===== */
let hist=[],hi=-1,restoring=false,snapT=null,projects=[],curProj=null,edOpen=false,ed={},tool='pencil',fsS=1,fz=null,sw=[],swCool=0;
const urlList=[],uid=u=>{let i=urlList.indexOf(u);return i<0?urlList.push(u)-1:i};
const state=()=>JSON.stringify({items:items.map(i=>({id:i.id,u:uid(i.url),w:i.w,h:i.h,s:i.s,x:i.x,y:i.y,p:i.p||null})),projects});
function upd(){$('#bUndo').disabled=hi<=0;$('#bRedo').disabled=hi>=hist.length-1}
function snapNow(){clearTimeout(snapT);if(restoring)return;const s=state();if(hist[hi]===s)return;hist=hist.slice(0,hi+1);hist.push(s);if(hist.length>60)hist.shift();hi=hist.length-1;upd()}
function scheduleSnap(){if(restoring)return;clearTimeout(snapT);snapT=setTimeout(snapNow,350)}
function layout(it){const e=it.el;e.style.left=it.x+'px';e.style.top=it.y+'px';e.style.width=it.w*it.s+'px';e.style.height=it.h*it.s+'px';e.style.display=(!curProj||it.p===curProj)?'block':'none';scheduleSnap()}
function select(it){sel=it;items.forEach(i=>i.el.classList.toggle('sel',i===it));['bZoomOut','bZoomIn','bFull','bDel','bEdit'].forEach(id=>$('#'+id).disabled=!it);if(it)ws.appendChild(it.el);syncProjSel()}
function makeEl(it){const el=document.createElement('div');el.className='item';el._it=it;const im=new Image();im.draggable=false;im.src=it.url;el.appendChild(im);it.el=el;
  el.addEventListener('pointerdown',ev=>{ev.preventDefault();select(it);startDrag(it,ev.clientX,ev.clientY);el.setPointerCapture(ev.pointerId)});
  el.addEventListener('pointermove',ev=>{if(drag&&drag.it===it)moveDrag(ev.clientX,ev.clientY)});
  el.addEventListener('pointerup',ev=>endDrag(ev.clientX,ev.clientY));
  el.addEventListener('wheel',ev=>{ev.preventDefault();select(it);setScale(it,it.s*(ev.deltaY<0?1.1:.9))},{passive:false});
  ws.appendChild(el);layout(it)}
function addImage(file){const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const w=Math.min(260,img.naturalWidth),h=w*img.naturalHeight/img.naturalWidth,r=ws.getBoundingClientRect(),n=items.length;
  const it={id:Date.now()+n,url,w,h,s:1,x:Math.max(10,r.width/2-w/2-120+(n%5)*40),y:Math.max(10,r.height/2-h/2-100+(n%5)*30),p:curProj};makeEl(it);items.push(it);select(it);$('#empty').style.display='none';snapNow()};img.src=url}
function removeItem(it){if(edOpen)return;it.el.remove();items=items.filter(i=>i!==it);if(sel===it)select(null);if(!items.length)$('#empty').style.display='flex';if(fullOpen)closeFull();snapNow()}
function hit(cx,cy){if(edOpen)return null;const r=ws.getBoundingClientRect(),x=cx-r.left,y=cy-r.top;for(const el of [...ws.querySelectorAll('.item')].reverse()){const it=el._it;if(el.style.display==='none')continue;if(x>=it.x&&x<=it.x+it.w*it.s&&y>=it.y&&y<=it.y+it.h*it.s)return it}return null}
const _sd=startDrag;startDrag=function(it,x,y){if(!edOpen)_sd(it,x,y)};
function restore(s){restoring=true;const d=JSON.parse(s),sid=sel&&sel.id;items.forEach(i=>i.el.remove());items=d.items.map(o=>{const it={id:o.id,url:urlList[o.u],w:o.w,h:o.h,s:o.s,x:o.x,y:o.y,p:o.p};makeEl(it);return it});projects=d.projects;if(curProj&&!projects.find(p=>p.id===curProj))curProj=null;select(items.find(i=>i.id===sid)||null);$('#empty').style.display=items.length?'none':'flex';renderProj();restoring=false}
function undo(){if(drag||edOpen)return;snapNow();if(hi>0){hi--;restore(hist[hi]);upd();toast('â†¶ Undo')}else toast('Nothing to undo')}
function redo(){if(drag||edOpen)return;snapNow();if(hi<hist.length-1){hi++;restore(hist[hi]);upd();toast('â†· Redo')}else toast('Nothing to redo')}
$('#bUndo').onclick=undo;$('#bRedo').onclick=redo;

/* projects */
function syncProjSel(){const s=$('#projSel');s.disabled=!sel;s.value=sel?(sel.p||''):''}
function renderProj(){const c=$('#chips');c.innerHTML='';const mk=(l,id)=>{const b=document.createElement('button');b.textContent=l;b.className='chip'+(curProj===id?' active':'');b.onclick=()=>{curProj=id;items.forEach(layout);if(sel&&sel.el.style.display==='none')select(null);renderProj()};c.appendChild(b);c.appendChild(document.createTextNode(' '))};
  mk('All images',null);projects.forEach(p=>mk('ðŸ“ '+p.name,p.id));
  const s=$('#projSel');s.innerHTML='<option value="">No project</option>'+projects.map(p=>'<option value="'+p.id+'">'+p.name.replace(/[<&]/g,'')+'</option>').join('');syncProjSel()}
$('#bNewProj').onclick=()=>{$('#newBox').style.display='inline';$('#bNewProj').style.display='none';$('#projName').focus()};
function closeNew(){$('#newBox').style.display='none';$('#bNewProj').style.display='';$('#projName').value=''}
function createProj(){const n=$('#projName').value.trim();if(!n){toast('Type a project name');return}projects.push({id:'p'+Date.now(),name:n});curProj=projects[projects.length-1].id;closeNew();renderProj();items.forEach(layout);if(sel&&sel.el.style.display==='none')select(null);snapNow();toast('Project â€œ'+n+'â€ created â€” new uploads go into it')}
$('#bProjOk').onclick=createProj;$('#bProjNo').onclick=closeNew;
$('#projName').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')createProj();if(e.key==='Escape')closeNew()});
$('#projSel').onchange=e=>{if(!sel)return;sel.p=e.target.value||null;layout(sel);snapNow();toast(sel.p?'Moved to project':'Removed from project');if(curProj&&sel.p!==curProj)select(null)};

/* editor */
const edc=$('#edc'),ectx=edc.getContext('2d');let ep=null;
function openEd(){if(!sel){toast('Select an image first');return}const im=new Image();im.onload=()=>{const k=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight)),w=Math.round(im.naturalWidth*k),h=Math.round(im.naturalHeight*k);
  const mk=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c},base=mk(),layer=mk();base.getContext('2d').drawImage(im,0,0,w,h);
  ed={it:sel,base,layer,w,h,crop:{x:0,y:0,w,h}};edc.width=w;edc.height=h;if(drag)endDrag(-1,-1);edOpen=true;$('#ed').style.display='flex';setTool('pencil')};im.src=sel.url}
function closeEd(){edOpen=false;$('#ed').style.display='none'}
function setTool(t){tool=t;document.querySelectorAll('#ed [data-t]').forEach(b=>b.classList.toggle('active',b.dataset.t===t));$('#edApplyCrop').style.display=t==='crop'?'':'none';
  $('#edHint').textContent={pencil:'Draw on the image. Pick a color and size.',eraser:'Erases your pencil strokes.',crop:'Drag the box or its corners/edges, then Apply crop (or Done).'}[t];edc.style.cursor=t==='crop'?'move':'crosshair';edDraw()}
function edDraw(){const {w,h,base,layer,crop:c}=ed;ectx.clearRect(0,0,w,h);ectx.drawImage(base,0,0);ectx.drawImage(layer,0,0);
  if(tool==='crop'){ectx.fillStyle='#0009';ectx.fillRect(0,0,w,c.y);ectx.fillRect(0,c.y+c.h,w,h-c.y-c.h);ectx.fillRect(0,c.y,c.x,c.h);ectx.fillRect(c.x+c.w,c.y,w-c.x-c.w,c.h);ectx.strokeStyle='#2f6bff';ectx.lineWidth=Math.max(2,w/250);ectx.strokeRect(c.x,c.y,c.w,c.h);const q=Math.max(7,w/80);ectx.fillStyle='#2f6bff';[[c.x,c.y],[c.x+c.w,c.y],[c.x,c.y+c.h],[c.x+c.w,c.y+c.h]].forEach(([x,y])=>ectx.fillRect(x-q,y-q,q*2,q*2))}}
document.querySelectorAll('#ed [data-t]').forEach(b=>b.onclick=()=>setTool(b.dataset.t));
const pt=e=>{const r=edc.getBoundingClientRect();return{x:(e.clientX-r.left)*edc.width/r.width,y:(e.clientY-r.top)*edc.height/r.height}};
function stroke(a,b){const l=ed.layer.getContext('2d');l.lineCap=l.lineJoin='round';l.lineWidth=Math.max(1,+$('#edSize').value*ed.w/700);l.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';l.strokeStyle=$('#edColor').value;l.beginPath();l.moveTo(a.x,a.y);l.lineTo(b.x+.01,b.y);l.stroke();edDraw()}
edc.addEventListener('pointerdown',e=>{if(!edOpen)return;edc.setPointerCapture(e.pointerId);const p=pt(e);
  if(tool==='crop'){const c=ed.crop,hs=Math.max(18,ed.w/30);const nx=Math.abs(p.x-c.x)<hs?'l':Math.abs(p.x-c.x-c.w)<hs?'r':'',ny=Math.abs(p.y-c.y)<hs?'t':Math.abs(p.y-c.y-c.h)<hs?'b':'';let m=nx+ny;if(!m)m=(p.x<c.x||p.x>c.x+c.w||p.y<c.y||p.y>c.y+c.h)?null:'move';ep={m,p,c:{...c}}}
  else{ep={last:p};stroke(p,p)}});
edc.addEventListener('pointermove',e=>{if(!ep)return;const p=pt(e);if(tool!=='crop'){stroke(ep.last,p);ep.last=p;return}if(!ep.m)return;
  const c=ed.crop,o=ep.c,dx=p.x-ep.p.x,dy=p.y-ep.p.y,m=ep.m,W=ed.w,H=ed.h,mn=20;
  if(m==='move'){c.x=Math.min(W-o.w,Math.max(0,o.x+dx));c.y=Math.min(H-o.h,Math.max(0,o.y+dy))}
  else{let x1=o.x,y1=o.y,x2=o.x+o.w,y2=o.y+o.h;if(m.includes('l'))x1=Math.min(x2-mn,Math.max(0,x1+dx));if(m.includes('r'))x2=Math.max(x1+mn,Math.min(W,x2+dx));if(m.includes('t'))y1=Math.min(y2-mn,Math.max(0,y1+dy));if(m.includes('b'))y2=Math.max(y1+mn,Math.min(H,y2+dy));c.x=x1;c.y=y1;c.w=x2-x1;c.h=y2-y1}edDraw()});
edc.addEventListener('pointerup',()=>ep=null);
function doCrop(){const c=ed.crop;if(c.w>=ed.w-1&&c.h>=ed.h-1)return false;['base','layer'].forEach(k=>{const n=document.createElement('canvas');n.width=Math.round(c.w);n.height=Math.round(c.h);n.getContext('2d').drawImage(ed[k],c.x,c.y,c.w,c.h,0,0,n.width,n.height);ed[k]=n});ed.w=ed.base.width;ed.h=ed.base.height;edc.width=ed.w;edc.height=ed.h;ed.crop={x:0,y:0,w:ed.w,h:ed.h};edDraw();return true}
$('#edApplyCrop').onclick=()=>toast(doCrop()?'Crop applied':'Drag the crop box first');
$('#edDone').onclick=()=>{if(tool==='crop')doCrop();const m=document.createElement('canvas');m.width=ed.w;m.height=ed.h;const g=m.getContext('2d');g.drawImage(ed.base,0,0);g.drawImage(ed.layer,0,0);const it=ed.it;it.url=m.toDataURL('image/png');it.el.firstChild.src=it.url;it.h=it.w*ed.h/ed.w;layout(it);snapNow();closeEd();toast('Edit saved (undo with â†¶)')};
$('#edCancel').onclick=closeEd;$('#bEdit').onclick=openEd;

/* full screen with resize */
function fsApply(){if(!sel)return;const k=Math.min(innerWidth*.94/sel.w,innerHeight*.86/sel.h),bw=sel.w*k,bh=sel.h*k,mx=Math.min(innerWidth*.99/bw,innerHeight*.99/bh);fsS=Math.min(mx,Math.max(.2,fsS));const im=$('#fullImg');im.style.maxWidth=im.style.maxHeight='none';im.style.width=bw*fsS+'px';im.style.height=bh*fsS+'px'}
function setFs(v){fsS=v;fsApply()}
function openFull(){if(edOpen)return;if(!sel){toast('Select an image first');return}$('#fullImg').src=sel.url;fsS=1;fz=null;fsApply();$('#full').style.display='flex';fullOpen=true;swipeHist=[]}
$('#bFull').onclick=()=>openFull();$('#bFsIn').onclick=()=>setFs(fsS*1.2);$('#bFsOut').onclick=()=>setFs(fsS/1.2);
$('#full').addEventListener('wheel',e=>{e.preventDefault();setFs(fsS*(e.deltaY<0?1.1:.9))},{passive:false});
addEventListener('resize',()=>{if(fullOpen)fsApply()});

/* gestures */
function fsGesture(L){const info=L.slice(0,2).map(lm=>{const size=dist(lm[0],lm[9])||.1;return{r:dist(lm[4],lm[8])/size,mx:(1-(lm[4].x+lm[8].x)/2)*innerWidth,my:(lm[4].y+lm[8].y)/2*innerHeight,spread:ext(lm,8,6)&&!ext(lm,12,10)&&!ext(lm,16,14)&&!ext(lm,20,18)&&dist(lm[4],lm[5])>size*.75}});
  const pin=info.filter(h=>h.r<.4);
  if(pin.length===2){const d=Math.hypot(pin[0].mx-pin[1].mx,pin[0].my-pin[1].my);if(!fz||fz.k!=='two')fz={k:'two',d0:d,s0:fsS};setFs(fz.s0*d/Math.max(fz.d0,30))}
  else{const sp=info.find(h=>h.spread);if(sp){swipeHist=[];if(!fz||fz.k!=='one')fz={k:'one',r0:sp.r,s0:fsS};setFs(fz.s0*(.3+sp.r)/(.3+fz.r0))}else fz=null}}
function swipeUR(L){const now=performance.now(),lm=L[0];
  if(!lm||L.length!==1||drag||zoomRef||edOpen||hs[0].pinch||hs[1].pinch||!(ext(lm,8,6)&&!ext(lm,12,10)&&!ext(lm,16,14)&&!ext(lm,20,18))){sw=[];return}
  const x=(1-lm[8].x)*innerWidth;sw.push([now,x]);sw=sw.filter(p=>now-p[0]<600);if(now<swCool)return;
  const xs=sw.map(p=>p[1]),T=innerWidth*.22;
  if(x-Math.min(...xs)>T){undo();swCool=now+1000;sw=[];$('#gest').textContent='Gesture: Swipe right â†’ Undo'}
  else if(Math.max(...xs)-x>T){redo();swCool=now+1000;sw=[];$('#gest').textContent='Gesture: Swipe left â†’ Redo'}}
const _on=onResults;
onResults=function(res){const L=res.multiHandLandmarks||[];if(fullOpen)fsGesture(L);_on(res);if(fullOpen&&fz)$('#gest').textContent='Gesture: Resizing full screen';else if(!fullOpen&&!edOpen)swipeUR(L);else if(edOpen&&L.length)$('#gest').textContent='Gesture: editing (gestures paused)'};
setInterval(()=>$('#gest').classList.toggle('act',!/â€”|No hand/.test($('#gest').textContent)),250);

/* guide + keys */
$('#bGuide').onclick=()=>$('#guide').style.display='flex';$('#bGuideClose').onclick=()=>$('#guide').style.display='none';
addEventListener('keydown',e=>{const t=e.target.tagName;if(t==='INPUT'||t==='SELECT')return;if(e.key==='Escape'){if(edOpen)closeEd();$('#guide').style.display='none'}const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();redo()}});

renderProj();hist=[state()];hi=0;upd();

/* ===== v3: finger-count edit gestures, sheet editor, palm crop ===== */
let hold={k:null,t:0},gCool=0,hPalm=false,fgLabel='',fist=0,armed=false;
async function openSheet(){const vis=[...ws.querySelectorAll('.item')].map(e=>e._it).filter(i=>i.el.style.display!=='none');if(!vis.length){toast('Nothing on the sheet yet');return}
  const P=20,x0=Math.min(...vis.map(i=>i.x))-P,y0=Math.min(...vis.map(i=>i.y))-P,x1=Math.max(...vis.map(i=>i.x+i.w*i.s))+P,y1=Math.max(...vis.map(i=>i.y+i.h*i.s))+P;
  const k=Math.min(1,1600/Math.max(x1-x0,y1-y0)),w=Math.round((x1-x0)*k),h=Math.round((y1-y0)*k);
  const mk=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c},base=mk(),layer=mk(),g=base.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);
  for(const it of vis){await new Promise(r=>{const im=new Image();im.onload=()=>{g.drawImage(im,(it.x-x0)*k,(it.y-y0)*k,it.w*it.s*k,it.h*it.s*k);r()};im.onerror=r;im.src=it.url})}
  ed={sheet:{vis,x0,y0,k},it:null,base,layer,w,h,crop:{x:0,y:0,w,h}};edc.width=w;edc.height=h;if(drag)endDrag(-1,-1);edOpen=true;$('#ed').style.display='flex';setTool('pencil');toast('Editing the whole sheet')}
$('#bSheet').onclick=openSheet;$('#bEdit').onclick=()=>openEd();
$('#edDone').onclick=()=>{if(tool==='crop')doCrop();const m=document.createElement('canvas');m.width=ed.w;m.height=ed.h;const g=m.getContext('2d');g.drawImage(ed.base,0,0);g.drawImage(ed.layer,0,0);const url=m.toDataURL('image/png');
  if(ed.sheet){const s=ed.sheet,wasSel=sel&&s.vis.includes(sel);s.vis.forEach(i=>i.el.remove());items=items.filter(i=>!s.vis.includes(i));
    const it={id:Date.now(),url,w:ed.w/s.k,h:ed.h/s.k,s:1,x:s.x0,y:s.y0,p:curProj};makeEl(it);items.push(it);select(it);$('#empty').style.display='none'}
  else{const it=ed.it;it.url=url;it.el.firstChild.src=url;it.h=it.w*ed.h/ed.w;layout(it)}
  snapNow();closeEd();toast('Edit saved (undo with â†¶)')};
const _of=openFull;openFull=function(){if(hPalm)return;_of()};
function fingerGest(L){const now=performance.now(),lm=L[0];hPalm=false;fgLabel='';
  if(!lm||fullOpen){hold={k:null,t:0};fist=0;return}
  const e=[ext(lm,8,6),ext(lm,12,10),ext(lm,16,14),ext(lm,20,18)],n=e.filter(Boolean).length;
  const flat=n===4&&Math.abs(lm[12].x-lm[0].x)>Math.abs(lm[12].y-lm[0].y)*1.4;hPalm=flat;
  if(edOpen){
    if(flat){fist=0;armed=true;if(tool!=='crop')setTool('crop');const span=dist(lm[0],lm[12]),f=Math.min(1,Math.max(.2,(span-.1)/.3)),cw=ed.w*f,ch=ed.h*f;
      ed.crop={x:Math.min(ed.w-cw,Math.max(0,(1-lm[9].x)*ed.w-cw/2)),y:Math.min(ed.h-ch,Math.max(0,lm[9].y*ed.h-ch/2)),w:cw,h:ch};edDraw();fgLabel='Gesture: Crop box â€” close palm to cut'}
    else if(n===0&&armed&&tool==='crop'){if(++fist>=3){armed=false;fist=0;toast(doCrop()?'âœ‚ï¸ Cropped':'Crop box unchanged');fgLabel='Gesture: Palm closed â†’ cut'}else fgLabel='Gesture: Closing palmâ€¦'}
    else fist=0;
    return}
  fist=0;armed=false;
  const busy=drag||zoomRef||hs[0].pinch||hs[1].pinch;
  const k=busy?null:flat?'flat':(e[0]&&e[1]&&e[2]&&!e[3])?'three':(e[0]&&e[1]&&!e[2]&&!e[3])?'two':null;
  if(k!==hold.k)hold={k,t:now};if(!k)return;
  fgLabel='Gesture: '+{flat:'Flat palm â†’ crop',three:'Three fingers â†’ edit sheet',two:'Two fingers â†’ edit image'}[k]+'â€¦';
  if(now-hold.t>700&&now>gCool){gCool=now+1800;hold={k:null,t:0};
    if(k==='three')openSheet();
    else if(!sel)toast('Select an image first (pinch it)');
    else if(k==='two')openEd();
    else{openEd();const w=setInterval(()=>{if(edOpen){clearInterval(w);setTool('crop')}},50);setTimeout(()=>clearInterval(w),3000)}}}
const _on2=onResults;
onResults=function(res){fingerGest(res.multiHandLandmarks||[]);_on2(res);if(fgLabel&&!fullOpen)$('#gest').textContent=fgLabel};

/* ===== v3.1: sturdier finger counting + live hold progress ===== */
const fe=(lm,t,m)=>dist(lm[t],lm[0])>dist(lm[m],lm[0])*1.45; // fingertip far beyond its knuckle (MCP) = extended
function fingerGest(L){const now=performance.now(),lm=L[0];hPalm=false;fgLabel='';
  if(!lm||fullOpen){hold={k:null,t:0,last:0};fist=0;return}
  const e=[fe(lm,8,5),fe(lm,12,9),fe(lm,16,13),fe(lm,20,17)],n=e.filter(Boolean).length,size=dist(lm[0],lm[9])||.1,pinching=dist(lm[4],lm[8])/size<.3;
  const flat=n===4&&Math.abs(lm[12].x-lm[0].x)>Math.abs(lm[12].y-lm[0].y)*1.4;hPalm=flat;
  if(edOpen){
    if(flat){fist=0;armed=true;if(tool!=='crop')setTool('crop');const span=dist(lm[0],lm[12]),f=Math.min(1,Math.max(.2,(span-.1)/.3)),cw=ed.w*f,ch=ed.h*f;
      ed.crop={x:Math.min(ed.w-cw,Math.max(0,(1-lm[9].x)*ed.w-cw/2)),y:Math.min(ed.h-ch,Math.max(0,lm[9].y*ed.h-ch/2)),w:cw,h:ch};edDraw();fgLabel='Gesture: Crop box â€” close palm to cut'}
    else if(n===0&&armed&&tool==='crop'){if(++fist>=3){armed=false;fist=0;toast(doCrop()?'âœ‚ï¸ Cropped':'Crop box unchanged');fgLabel='Gesture: Palm closed â†’ cut'}else fgLabel='Gesture: Closing palmâ€¦'}
    else fist=0;
    return}
  fist=0;armed=false;
  const k=(drag||zoomRef||pinching)?null:flat?'flat':(e[0]&&e[1]&&e[2]&&!e[3])?'three':(e[0]&&e[1]&&!e[2]&&!e[3])?'two':null;
  if(k&&k===hold.k)hold.last=now;
  else if(!k&&hold.k&&now-hold.last<300)return; // brief flicker: keep the hold timer
  else hold={k,t:now,last:now};
  if(!k){if(n)fgLabel='Gesture: '+n+' finger'+(n>1?'s':'')+' up';return}
  const name={flat:'Flat palm â†’ crop',three:'3 fingers â†’ edit sheet',two:'2 fingers â†’ edit image'}[k];
  fgLabel='Gesture: '+name+' '+Math.min(100,Math.round((now-hold.t)/5))+'%';
  if(now-hold.t>500&&now>gCool){gCool=now+1800;hold={k:null,t:0,last:0};
    if(k==='three')openSheet();
    else if(!sel)toast('Select an image first (pinch it or click it)');
    else if(k==='two')openEd();
    else{openEd();const w=setInterval(()=>{if(edOpen){clearInterval(w);setTool('crop')}},50);setTimeout(()=>clearInterval(w),3000)}}}

/* ===== v4: whole-canvas sheet editor + save ===== */
async function composeSheet(cap){const r=ws.getBoundingClientRect(),W=r.width,H=r.height,k=Math.min(2,cap/Math.max(W,H)),w=Math.round(W*k),h=Math.round(H*k);
  const base=document.createElement('canvas');base.width=w;base.height=h;const g=base.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);
  const vis=[...ws.querySelectorAll('.item')].map(e=>e._it).filter(i=>i.el.style.display!=='none');
  for(const it of vis){await new Promise(res=>{const im=new Image();im.onload=()=>{g.drawImage(im,it.x*k,it.y*k,it.w*it.s*k,it.h*it.s*k);res()};im.onerror=res;im.src=it.url})}
  return{base,vis,k,w,h}}
async function openSheet(){const s=await composeSheet(1600),layer=document.createElement('canvas');layer.width=s.w;layer.height=s.h;
  ed={sheet:{vis:s.vis,x0:0,y0:0,k:s.k},it:null,base:s.base,layer,w:s.w,h:s.h,crop:{x:0,y:0,w:s.w,h:s.h}};edc.width=s.w;edc.height=s.h;if(drag)endDrag(-1,-1);edOpen=true;$('#ed').style.display='flex';setTool('pencil');toast('Editing the whole work sheet')}
function dl(c,name){c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('Saved '+name)},'image/png')}
$('#bSheet').onclick=()=>openSheet();
$('#bSave').onclick=async()=>{const s=await composeSheet(2400);dl(s.base,'gesture-canvas-sheet.png')};
$('#edSave').onclick=()=>{if(tool==='crop')doCrop();const m=document.createElement('canvas');m.width=ed.w;m.height=ed.h;const g=m.getContext('2d');g.drawImage(ed.base,0,0);g.drawImage(ed.layer,0,0);dl(m,ed.sheet?'gesture-canvas-sheet-edited.png':'gesture-canvas-image-edited.png')};
