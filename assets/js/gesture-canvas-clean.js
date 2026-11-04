const $ = (selector) => document.querySelector(selector);
const ws = $('#ws');
const trash = $('#trash');
const toastEl = $('#toast');
const video = $('#video');
const ov = $('#ov');
const ovCtx = ov.getContext('2d');

let items = [];
let sel = null;
let drag = null;
let projects = [];
let currentProject = null;
let hist = [];
let histIndex = 0;
let fullOpen = false;
let fullPinch = null;
let cameraRunning = false;
let stream = null;
let hands = null;
let cameraBusy = false;
let edOpen = false;
let edState = null;
let tool = 'pencil';
let pointerState = null;
let gestureText = 'Gesture: —';
let swipeCooldown = 0;
let swipeQueue = [];
let lastGestureTime = 0;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function updateUndoRedo() {
  $('#bUndo').disabled = histIndex <= 0;
  $('#bRedo').disabled = histIndex >= hist.length - 1;
}

function serializeState() {
  return JSON.stringify({
    items: items.map((item) => ({
      id: item.id,
      url: item.url,
      w: item.w,
      h: item.h,
      s: item.s,
      x: item.x,
      y: item.y,
      p: item.p || null
    })),
    projects,
    currentProject
  });
}

function scheduleHistory() {
  const snapshot = serializeState();
  if (hist[histIndex] === snapshot) return;
  hist = hist.slice(0, histIndex + 1);
  hist.push(snapshot);
  if (hist.length > 60) hist.shift();
  histIndex = hist.length - 1;
  updateUndoRedo();
}

function restoreState(snapshot) {
  const parsed = JSON.parse(snapshot);
  const selectedId = sel && sel.id;
  items.forEach((item) => item.el.remove());

  items = (parsed.items || []).map((entry) => {
    const item = {
      id: entry.id,
      url: entry.url,
      w: entry.w,
      h: entry.h,
      s: entry.s,
      x: entry.x,
      y: entry.y,
      p: entry.p || null,
      el: null
    };

    const el = document.createElement('div');
    el.className = 'item';
    const img = new Image();
    img.src = item.url;
    img.alt = 'Canvas item';
    el.appendChild(img);
    item.el = el;
    el.addEventListener('pointerdown', (event) => {
      if (edOpen) return;
      event.preventDefault();
      selectItem(item);
      startDrag(item, event.clientX, event.clientY);
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener('pointermove', (event) => {
      if (drag && drag.item === item) moveDrag(event.clientX, event.clientY);
    });
    el.addEventListener('pointerup', (event) => endDrag(event.clientX, event.clientY));
    el.addEventListener('pointercancel', (event) => endDrag(event.clientX, event.clientY));
    el.addEventListener('wheel', (event) => {
      event.preventDefault();
      selectItem(item);
      setScale(item, item.s * (event.deltaY < 0 ? 1.1 : 0.9));
      scheduleHistory();
    }, { passive: false });
    ws.appendChild(el);
    layoutItem(item);
    return item;
  });

  projects = parsed.projects || [];
  currentProject = parsed.currentProject || null;
  renderProjectControls();
  sel = items.find((item) => item.id === selectedId) || items[items.length - 1] || null;
  selectItem(sel);
  $('#empty').style.display = items.length ? 'none' : 'flex';
  updateUndoRedo();
}

function undo() {
  if (drag || edOpen) return;
  if (histIndex > 0) {
    histIndex -= 1;
    restoreState(hist[histIndex]);
    toast('↩ Undo');
  } else {
    toast('Nothing to undo');
  }
}

function redo() {
  if (drag || edOpen) return;
  if (histIndex < hist.length - 1) {
    histIndex += 1;
    restoreState(hist[histIndex]);
    toast('↪ Redo');
  } else {
    toast('Nothing to redo');
  }
}

function selectItem(item) {
  sel = item;
  items.forEach((entry) => {
    if (entry.el) entry.el.classList.toggle('sel', entry === item);
  });
  ['bZoomOut', 'bZoomIn', 'bFull', 'bDel', 'bEdit'].forEach((id) => {
    $('#' + id).disabled = !item;
  });
  if (item && item.el) ws.appendChild(item.el);
  syncProjectSelect();
}

function layoutItem(item) {
  if (!item || !item.el) return;
  item.el.style.left = item.x + 'px';
  item.el.style.top = item.y + 'px';
  item.el.style.width = item.w * item.s + 'px';
  item.el.style.height = item.h * item.s + 'px';
  item.el.style.display = (!currentProject || item.p === currentProject) ? 'block' : 'none';
}

function setScale(item, scale) {
  if (!item) return;
  const clamped = Math.min(6, Math.max(0.2, scale));
  const cx = item.x + (item.w * item.s) / 2;
  const cy = item.y + (item.h * item.s) / 2;
  item.s = clamped;
  item.x = cx - (item.w * item.s) / 2;
  item.y = cy - (item.h * item.s) / 2;
  layoutItem(item);
}

function addImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const rect = ws.getBoundingClientRect();
    const width = Math.min(260, img.naturalWidth);
    const height = (width * img.naturalHeight) / img.naturalWidth;
    const item = {
      id: 'img-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      url,
      w: width,
      h: height,
      s: 1,
      x: Math.max(10, rect.width / 2 - width / 2 - 120 + (items.length % 5) * 40),
      y: Math.max(10, rect.height / 2 - height / 2 - 100 + (items.length % 5) * 28),
      p: currentProject || null,
      el: null
    };

    const el = document.createElement('div');
    el.className = 'item';
    const image = new Image();
    image.src = url;
    image.alt = 'Canvas item';
    el.appendChild(image);
    item.el = el;

    el.addEventListener('pointerdown', (event) => {
      if (edOpen) return;
      event.preventDefault();
      selectItem(item);
      startDrag(item, event.clientX, event.clientY);
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener('pointermove', (event) => {
      if (drag && drag.item === item) moveDrag(event.clientX, event.clientY);
    });
    el.addEventListener('pointerup', (event) => endDrag(event.clientX, event.clientY));
    el.addEventListener('pointercancel', (event) => endDrag(event.clientX, event.clientY));
    el.addEventListener('wheel', (event) => {
      event.preventDefault();
      selectItem(item);
      setScale(item, item.s * (event.deltaY < 0 ? 1.1 : 0.9));
      scheduleHistory();
    }, { passive: false });

    ws.appendChild(el);
    items.push(item);
    layoutItem(item);
    selectItem(item);
    $('#empty').style.display = 'none';
    scheduleHistory();
  };
  img.src = url;
}

function overTrash(x, y) {
  const rect = trash.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function removeItem(item) {
  if (!item) return;
  if (item.el) item.el.remove();
  items = items.filter((entry) => entry !== item);
  if (sel === item) selectItem(null);
  if (!items.length) $('#empty').style.display = 'flex';
  if (fullOpen) closeFull();
  scheduleHistory();
}

function hitTest(x, y) {
  const rect = ws.getBoundingClientRect();
  const px = x - rect.left;
  const py = y - rect.top;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (!item || !item.el) continue;
    if (item.el.style.display === 'none') continue;
    if (px >= item.x && px <= item.x + item.w * item.s && py >= item.y && py <= item.y + item.h * item.s) {
      return item;
    }
  }
  return null;
}

function startDrag(item, x, y) {
  const rect = ws.getBoundingClientRect();
  drag = {
    item,
    offsetX: x - rect.left - item.x,
    offsetY: y - rect.top - item.y
  };
}

function moveDrag(x, y) {
  if (!drag) return;
  const rect = ws.getBoundingClientRect();
  const item = drag.item;
  item.x = x - rect.left - drag.offsetX;
  item.y = y - rect.top - drag.offsetY;
  layoutItem(item);
  trash.classList.toggle('hot', overTrash(x, y));
}

function endDrag(x, y) {
  if (!drag) return;
  const item = drag.item;
  drag = null;
  trash.classList.remove('hot');
  if (typeof x === 'number' && typeof y === 'number' && overTrash(x, y)) {
    removeItem(item);
    toast('Image deleted');
    return;
  }
  scheduleHistory();
}

function openFull() {
  if (edOpen) return;
  if (!sel) {
    toast('Select an image first');
    return;
  }
  $('#fullImg').src = sel.url;
  $('#full').style.display = 'flex';
  fullOpen = true;
  swipeQueue = [];
  fullPinch = null;
  setFullScale(1);
}

function closeFull() {
  $('#full').style.display = 'none';
  fullOpen = false;
  fullPinch = null;
  swipeQueue = [];
}

function setFullScale(scale) {
  if (!sel) return;
  const maxWidth = window.innerWidth * 0.94;
  const maxHeight = window.innerHeight * 0.86;
  const fitted = Math.min(maxWidth / sel.w, maxHeight / sel.h, 1.5);
  const next = Math.min(5, Math.max(0.3, scale));
  const width = Math.min(maxWidth, sel.w * next * fitted);
  const height = Math.min(maxHeight, sel.h * next * fitted);
  $('#fullImg').style.width = width + 'px';
  $('#fullImg').style.height = height + 'px';
}

function setStatus(on, text) {
  $('#dot').classList.toggle('on', on);
  $('#pdot').style.background = on ? 'var(--ok)' : 'var(--danger)';
  $('#camStatus').textContent = text;
  $('#pillTxt').textContent = on ? 'Camera on' : 'Camera off';
  $('#bCam').textContent = 'Camera: ' + (on ? 'on' : 'off');
}

function showErr(title, steps) {
  const err = $('#err');
  err.style.display = 'block';
  err.innerHTML = '<b>' + title + '</b>' + (steps ? '<ul>' + steps.map((s) => '<li>' + s + '</li>').join('') + '</ul>' : '');
  cam.style.display = 'block';
  pill.style.display = 'none';
}

function clearErr() {
  $('#err').style.display = 'none';
}

function setGestureText(text) {
  gestureText = 'Gesture: ' + text;
  $('#gest').textContent = gestureText;
}

function isPinch(hand) {
  if (!hand || hand.length < 21) return false;
  const size = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y) || 0.1;
  return Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) / size < 0.35;
}

function isPointing(hand) {
  if (!hand || hand.length < 21) return false;
  const ext = (tip, knuckle) => Math.hypot(hand[tip].x - hand[0].x, hand[tip].y - hand[0].y) > Math.hypot(hand[knuckle].x - hand[0].x, hand[knuckle].y - hand[0].y) * 1.2;
  return ext(8, 5) && !ext(12, 9) && !ext(16, 13) && !ext(20, 17);
}

function isOpenPalm(hand) {
  if (!hand || hand.length < 21) return false;
  const ext = (tip, knuckle) => Math.hypot(hand[tip].x - hand[0].x, hand[tip].y - hand[0].y) > Math.hypot(hand[knuckle].x - hand[0].x, hand[knuckle].y - hand[0].y) * 1.2;
  return ext(8, 5) && ext(12, 9) && ext(16, 13) && ext(20, 17);
}

function handleGestureResults(results) {
  const handsFound = results.multiHandLandmarks || [];
  if (!handsFound.length) {
    setGestureText('No hand');
    return;
  }

  ovCtx.clearRect(0, 0, ov.width, ov.height);
  handsFound.forEach((hand) => {
    ovCtx.strokeStyle = '#4cd68a';
    ovCtx.lineWidth = 2;
    const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    connections.forEach(([a, b]) => {
      ovCtx.beginPath();
      ovCtx.moveTo(hand[a].x * ov.width, hand[a].y * ov.height);
      ovCtx.lineTo(hand[b].x * ov.width, hand[b].y * ov.height);
      ovCtx.stroke();
    });
    hand.forEach((p) => {
      ovCtx.beginPath();
      ovCtx.fillStyle = '#fff';
      ovCtx.arc(p.x * ov.width, p.y * ov.height, 3, 0, Math.PI * 2);
      ovCtx.fill();
    });
  });

  const hand = handsFound[0];
  const point = isPointing(hand);
  const palm = isOpenPalm(hand);
  const pinch = isPinch(hand);

  if (fullOpen) {
    const touched = handsFound.length >= 2 ? true : false;
    if (touched) {
      setGestureText('Full-screen pinch');
      return;
    }
    if (point) {
      const x = (1 - hand[8].x) * window.innerWidth;
      swipeQueue.push([performance.now(), x]);
      swipeQueue = swipeQueue.filter(([time]) => performance.now() - time < 600);
      const max = Math.max(...swipeQueue.map(([, value]) => value));
      const min = Math.min(...swipeQueue.map(([, value]) => value));
      if (performance.now() > swipeCooldown && max - x > window.innerWidth * 0.22) {
        closeFull();
        swipeCooldown = performance.now() + 800;
        toast('Swipe left → back');
        setGestureText('Back');
        return;
      }
      if (performance.now() > swipeCooldown && x - min > window.innerWidth * 0.22) {
        setGestureText('Swipe right → stay');
        return;
      }
    }
    setGestureText('Full screen');
    return;
  }

  if (drag || edOpen) {
    setGestureText('Dragging / editing');
    return;
  }

  if (pinch) {
    setGestureText('Pinch drag');
    const cx = (hand[4].x + hand[8].x) / 2;
    const cy = (hand[4].y + hand[8].y) / 2;
    const under = hitTest((1 - cx) * window.innerWidth, cy * window.innerHeight);
    if (under) {
      selectItem(under);
      const rect = ws.getBoundingClientRect();
      startDrag(under, (1 - cx) * window.innerWidth + rect.left, cy * window.innerHeight + rect.top);
      drag = { item: under, offsetX: (1 - cx) * window.innerWidth - under.x, offsetY: cy * window.innerHeight - under.y };
    }
    return;
  }

  if (palm && performance.now() - lastGestureTime > 700) {
    lastGestureTime = performance.now();
    openFull();
    toast('Open palm → full screen');
    setGestureText('Open palm');
    return;
  }

  if (point) {
    const x = hand[8].x;
    swipeQueue.push([performance.now(), x]);
    swipeQueue = swipeQueue.filter(([time]) => performance.now() - time < 600);
    const max = Math.max(...swipeQueue.map(([, value]) => value));
    const min = Math.min(...swipeQueue.map(([, value]) => value));
    if (performance.now() > swipeCooldown && x - min > 0.22) {
      undo();
      swipeCooldown = performance.now() + 800;
      setGestureText('Swipe right → Undo');
      return;
    }
    if (performance.now() > swipeCooldown && max - x > 0.22) {
      redo();
      swipeCooldown = performance.now() + 800;
      setGestureText('Swipe left → Redo');
      return;
    }
    setGestureText('Pointing');
    return;
  }

  setGestureText('Camera ready');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Hands) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load MediaPipe Hands'));
    document.head.appendChild(script);
  });
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showErr('Camera unavailable here', ['Use HTTPS or localhost.', 'If embedded, open the page in its own tab to allow permission.']);
    return;
  }

  try {
    clearErr();
    setStatus(false, 'Requesting camera…');
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play().catch(() => {});
    setStatus(true, 'Camera on · loading tracker…');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js');
    if (!hands) {
      hands = new Hands({ locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + file });
      hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
      hands.onResults(handleGestureResults);
      await hands.initialize();
    }
    cameraRunning = true;
    setStatus(true, 'Camera on · tracking');
    cameraLoop();
  } catch (error) {
    console.error(error);
    setStatus(false, 'Camera blocked');
    showErr('Camera permission denied', ['Click the camera or lock icon and allow camera access.', 'Open the page in its own tab if it is inside an iframe.', 'Check browser or OS privacy settings.']);
  }
}

function stopCamera() {
  cameraRunning = false;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  if (video) video.srcObject = null;
  ovCtx.clearRect(0, 0, ov.width, ov.height);
  setStatus(false, 'Camera off');
  setGestureText('No hand');
}

async function cameraLoop() {
  if (!cameraRunning || !hands || video.readyState < 2) {
    requestAnimationFrame(cameraLoop);
    return;
  }
  if (!cameraBusy) {
    cameraBusy = true;
    try {
      await hands.send({ image: video });
    } catch (error) {
      console.warn('Camera send failed', error);
    }
    cameraBusy = false;
  }
  requestAnimationFrame(cameraLoop);
}

async function requestFlow() {
  if (!navigator.permissions) {
    startCamera();
    return;
  }
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    if (result.state === 'granted') {
      startCamera();
      return;
    }
  } catch (_) {
    // Some browsers do not expose the permission API.
  }
  $('#ask').style.display = 'flex';
}

function renderProjectControls() {
  const chips = $('#chips');
  chips.innerHTML = '';

  const createChip = (label, projectId) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = 'chip' + (currentProject === projectId ? ' active' : '');
    btn.onclick = () => {
      currentProject = projectId;
      items.forEach((item) => layoutItem(item));
      if (sel && sel.el && sel.el.style.display === 'none') selectItem(null);
      renderProjectControls();
      scheduleHistory();
    };
    chips.appendChild(btn);
    chips.appendChild(document.createTextNode(' '));
  };

  createChip('All images', null);
  projects.forEach((project) => createChip('📁 ' + project.name, project.id));

  const selectEl = $('#projSel');
  selectEl.innerHTML = '<option value="">No project</option>' + projects.map((project) => '<option value="' + project.id + '">' + project.name + '</option>').join('');
  selectEl.value = sel && sel.p ? sel.p : '';
  selectEl.disabled = !sel;
}

function syncProjectSelect() {
  const selectEl = $('#projSel');
  selectEl.disabled = !sel;
  selectEl.value = sel && sel.p ? sel.p : '';
}

function createProject(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    toast('Type a project name');
    return;
  }
  projects.push({ id: 'p-' + Date.now(), name: trimmed });
  currentProject = projects[projects.length - 1].id;
  renderProjectControls();
  items.forEach((item) => layoutItem(item));
  scheduleHistory();
  toast('Project created');
}

$('#bUpload').onclick = () => $('#file').click();
$('#file').onchange = (event) => {
  Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/')).forEach(addImage);
  event.target.value = '';
};
$('#bZoomIn').onclick = () => sel && setScale(sel, sel.s * 1.2);
$('#bZoomOut').onclick = () => sel && setScale(sel, sel.s / 1.2);
$('#bFull').onclick = openFull;
$('#bDel').onclick = () => sel && removeItem(sel);
$('#bBack').onclick = closeFull;
$('#bHelp').onclick = () => $('#help').style.display = 'flex';
$('#bHelpClose').onclick = () => $('#help').style.display = 'none';
$('#bGuide').onclick = () => $('#guide').style.display = 'flex';
$('#bGuideClose').onclick = () => $('#guide').style.display = 'none';
$('#bFsIn').onclick = () => setFullScale(1.2);
$('#bFsOut').onclick = () => setFullScale(0.8);
$('#bUndo').onclick = undo;
$('#bRedo').onclick = redo;
$('#bCam').onclick = () => (cameraRunning ? stopCamera() : startCamera());
$('#askYes').onclick = () => { $('#ask').style.display = 'none'; startCamera(); };
$('#askNo').onclick = () => { $('#ask').style.display = 'none'; setStatus(false, 'Camera off'); toast('Camera is off'); };

$('#bNewProj').onclick = () => {
  $('#newBox').style.display = 'inline';
  $('#bNewProj').style.display = 'none';
  $('#projName').focus();
};
$('#bProjNo').onclick = () => {
  $('#newBox').style.display = 'none';
  $('#bNewProj').style.display = '';
  $('#projName').value = '';
};
$('#bProjOk').onclick = () => {
  createProject($('#projName').value);
  $('#newBox').style.display = 'none';
  $('#bNewProj').style.display = '';
  $('#projName').value = '';
};
$('#projName').addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'Enter') {
    createProject($('#projName').value);
    $('#newBox').style.display = 'none';
    $('#bNewProj').style.display = '';
    $('#projName').value = '';
  }
  if (event.key === 'Escape') {
    $('#newBox').style.display = 'none';
    $('#bNewProj').style.display = '';
    $('#projName').value = '';
  }
});
$('#projSel').onchange = () => {
  if (!sel) return;
  sel.p = $('#projSel').value || null;
  layoutItem(sel);
  scheduleHistory();
  toast(sel.p ? 'Moved to project' : 'Removed from project');
  if (currentProject && sel.p !== currentProject) selectItem(null);
};

$('#full').addEventListener('wheel', (event) => {
  event.preventDefault();
  const current = parseFloat($('#fullImg').style.width || '300');
  const next = current * (event.deltaY < 0 ? 1.1 : 0.9);
  setFullScale((next / Math.max(sel.w, 1)) * 1);
}, { passive: false });

$('#full').addEventListener('touchstart', (event) => {
  if (event.touches.length === 2) {
    const [a, b] = [event.touches[0], event.touches[1]];
    fullPinch = {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      width: parseFloat($('#fullImg').style.width || '300')
    };
  }
}, { passive: false });

$('#full').addEventListener('touchmove', (event) => {
  if (event.touches.length === 2 && fullPinch && sel) {
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = distance / Math.max(fullPinch.distance, 1);
    const next = fullPinch.width * ratio;
    $('#fullImg').style.width = Math.min(window.innerWidth * 0.94, Math.max(150, next)) + 'px';
    $('#fullImg').style.height = 'auto';
  }
}, { passive: false });

$('#full').addEventListener('touchend', () => {
  fullPinch = null;
});

function setupCameraDock() {
  let dragState = null;
  $('#camHead').addEventListener('pointerdown', (event) => {
    if (event.target.tagName === 'BUTTON') return;
    const rect = $('#cam').getBoundingClientRect();
    dragState = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    $('#camHead').setPointerCapture(event.pointerId);
  });
  $('#camHead').addEventListener('pointermove', (event) => {
    if (!dragState) return;
    $('#cam').style.left = Math.min(window.innerWidth - $('#cam').offsetWidth, Math.max(0, event.clientX - dragState.dx)) + 'px';
    $('#cam').style.top = Math.max(0, event.clientY - dragState.dy) + 'px';
    $('#cam').style.right = 'auto';
  });
  $('#camHead').addEventListener('pointerup', () => { dragState = null; });
}

$('#bHide').onclick = () => {
  $('#cam').style.display = 'none';
  $('#pill').style.display = 'flex';
};
$('#pill').onclick = () => {
  $('#pill').style.display = 'none';
  $('#cam').style.display = 'block';
};

function setupEditor() {
  const edCanvas = $('#edc');
  const ctx = edCanvas.getContext('2d');

  document.querySelectorAll('#ed [data-t]').forEach((button) => {
    button.onclick = () => {
      tool = button.dataset.t;
      document.querySelectorAll('#ed [data-t]').forEach((b) => b.classList.toggle('active', b.dataset.t === tool));
      $('#edApplyCrop').style.display = tool === 'crop' ? '' : 'none';
      $('#edHint').textContent = {
        pencil: 'Draw on the image. Pick a color and size.',
        eraser: 'Erase pencil strokes.',
        crop: 'Drag the crop box or its edges, then apply the crop.'
      }[tool];
      edCanvas.style.cursor = tool === 'crop' ? 'move' : 'crosshair';
      drawEditor();
    };
  });

  function editorPoint(event) {
    const rect = edCanvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * edCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * edCanvas.height
    };
  }

  function drawEditor() {
    if (!edState) return;
    const { base, layer, width, height, crop } = edState;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(base, 0, 0, width, height);
    ctx.drawImage(layer, 0, 0, width, height);

    if (tool === 'crop') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, width, crop.y);
      ctx.fillRect(0, crop.y, crop.x, crop.h);
      ctx.fillRect(crop.x + crop.w, crop.y, width - (crop.x + crop.w), crop.h);
      ctx.fillRect(0, crop.y + crop.h, width, height - (crop.y + crop.h));
      ctx.strokeStyle = '#2f6bff';
      ctx.lineWidth = Math.max(2, width / 250);
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      const h = Math.max(7, width / 80);
      [[crop.x, crop.y], [crop.x + crop.w, crop.y], [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h]].forEach(([x, y]) => {
        ctx.fillRect(x - h, y - h, h * 2, h * 2);
      });
    }
  }

  function stroke(from, to) {
    if (!edState) return;
    const layerCtx = edState.layer.getContext('2d');
    layerCtx.lineCap = 'round';
    layerCtx.lineJoin = 'round';
    layerCtx.lineWidth = Math.max(1, Number($('#edSize').value) * edState.width / 700);
    layerCtx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    layerCtx.strokeStyle = $('#edColor').value;
    layerCtx.beginPath();
    layerCtx.moveTo(from.x, from.y);
    layerCtx.lineTo(to.x, to.y);
    layerCtx.stroke();
    drawEditor();
  }

  function doCrop() {
    if (!edState) return false;
    const crop = edState.crop;
    if (crop.w >= edState.width - 1 && crop.h >= edState.height - 1) return false;
    const baseCanvas = document.createElement('canvas');
    const layerCanvas = document.createElement('canvas');
    baseCanvas.width = Math.round(crop.w);
    baseCanvas.height = Math.round(crop.h);
    layerCanvas.width = Math.round(crop.w);
    layerCanvas.height = Math.round(crop.h);
    baseCanvas.getContext('2d').drawImage(edState.base, crop.x, crop.y, crop.w, crop.h, 0, 0, baseCanvas.width, baseCanvas.height);
    layerCanvas.getContext('2d').drawImage(edState.layer, crop.x, crop.y, crop.w, crop.h, 0, 0, layerCanvas.width, layerCanvas.height);
    edState.base = baseCanvas;
    edState.layer = layerCanvas;
    edState.width = baseCanvas.width;
    edState.height = baseCanvas.height;
    edCanvas.width = edState.width;
    edCanvas.height = edState.height;
    edState.crop = { x: 0, y: 0, w: edState.width, h: edState.height };
    drawEditor();
    return true;
  }

  function openEditor() {
    if (!sel) {
      toast('Select an image first');
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.round(img.naturalWidth * scale);
      const height = Math.round(img.naturalHeight * scale);
      const base = document.createElement('canvas');
      const layer = document.createElement('canvas');
      base.width = width;
      base.height = height;
      layer.width = width;
      layer.height = height;
      base.getContext('2d').drawImage(img, 0, 0, width, height);
      edState = { item: sel, base, layer, width, height, crop: { x: 0, y: 0, w: width, h: height } };
      edCanvas.width = width;
      edCanvas.height = height;
      edOpen = true;
      $('#ed').style.display = 'flex';
      tool = 'pencil';
      document.querySelectorAll('#ed [data-t]').forEach((button) => button.classList.toggle('active', button.dataset.t === tool));
    };
    img.src = sel.url;
  }

  function closeEditor() {
    edOpen = false;
    edState = null;
    $('#ed').style.display = 'none';
  }

  $('#bEdit').onclick = openEditor;
  $('#edCancel').onclick = closeEditor;
  $('#edApplyCrop').onclick = () => toast(doCrop() ? 'Crop applied' : 'Drag the crop box first');
  $('#edDone').onclick = () => {
    if (!edState) return;
    if (tool === 'crop') doCrop();
    const merged = document.createElement('canvas');
    merged.width = edState.width;
    merged.height = edState.height;
    const mergedCtx = merged.getContext('2d');
    mergedCtx.drawImage(edState.base, 0, 0);
    mergedCtx.drawImage(edState.layer, 0, 0);
    const item = edState.item;
    item.url = merged.toDataURL('image/png');
    item.el.querySelector('img').src = item.url;
    item.h = (item.w * edState.height) / edState.width;
    layoutItem(item);
    scheduleHistory();
    closeEditor();
    toast('Edit saved');
  };
  $('#edSave').onclick = () => {
    if (!edState) return;
    if (tool === 'crop') doCrop();
    const merged = document.createElement('canvas');
    merged.width = edState.width;
    merged.height = edState.height;
    const mergedCtx = merged.getContext('2d');
    mergedCtx.drawImage(edState.base, 0, 0);
    mergedCtx.drawImage(edState.layer, 0, 0);
    const link = document.createElement('a');
    link.href = merged.toDataURL('image/png');
    link.download = 'gesture-canvas-edited.png';
    link.click();
    toast('Saved edited image');
  };

  edCanvas.addEventListener('pointerdown', (event) => {
    if (!edState) return;
    const point = editorPoint(event);
    if (tool === 'crop') {
      const crop = edState.crop;
      const handle = Math.max(18, edState.width / 30);
      let mode = 'move';
      const left = Math.abs(point.x - crop.x) < handle;
      const right = Math.abs(point.x - (crop.x + crop.w)) < handle;
      const top = Math.abs(point.y - crop.y) < handle;
      const bottom = Math.abs(point.y - (crop.y + crop.h)) < handle;
      if (left && top) mode = 'lt';
      else if (right && top) mode = 'rt';
      else if (left && bottom) mode = 'lb';
      else if (right && bottom) mode = 'rb';
      else if (left) mode = 'left';
      else if (right) mode = 'right';
      else if (top) mode = 'top';
      else if (bottom) mode = 'bottom';
      pointerState = { mode, start: point, original: { ...crop } };
      edCanvas.setPointerCapture(event.pointerId);
      return;
    }
    pointerState = { last: point };
    stroke(point, point);
    edCanvas.setPointerCapture(event.pointerId);
  });

  edCanvas.addEventListener('pointermove', (event) => {
    if (!edState || !pointerState) return;
    const point = editorPoint(event);

    if (tool === 'crop') {
      const { original, mode } = pointerState;
      const crop = { ...edState.crop };
      const dx = point.x - pointerState.start.x;
      const dy = point.y - pointerState.start.y;

      if (mode === 'move') {
        crop.x = Math.min(edState.width - crop.w, Math.max(0, original.x + dx));
        crop.y = Math.min(edState.height - crop.h, Math.max(0, original.y + dy));
      } else if (mode === 'left') {
        crop.x = Math.min(original.x + original.w - 20, Math.max(0, original.x + dx));
        crop.w = original.w - (crop.x - original.x);
      } else if (mode === 'right') {
        crop.w = Math.max(20, Math.min(edState.width - original.x, original.w + dx));
      } else if (mode === 'top') {
        crop.y = Math.min(original.y + original.h - 20, Math.max(0, original.y + dy));
        crop.h = original.h - (crop.y - original.y);
      } else if (mode === 'bottom') {
        crop.h = Math.max(20, Math.min(edState.height - original.y, original.h + dy));
      } else if (mode === 'lt') {
        crop.x = Math.min(original.x + original.w - 20, Math.max(0, original.x + dx));
        crop.y = Math.min(original.y + original.h - 20, Math.max(0, original.y + dy));
        crop.w = original.w - (crop.x - original.x);
        crop.h = original.h - (crop.y - original.y);
      } else if (mode === 'rt') {
        crop.y = Math.min(original.y + original.h - 20, Math.max(0, original.y + dy));
        crop.w = Math.max(20, Math.min(edState.width - original.x, original.w + dx));
        crop.h = original.h - (crop.y - original.y);
      } else if (mode === 'lb') {
        crop.x = Math.min(original.x + original.w - 20, Math.max(0, original.x + dx));
        crop.w = original.w - (crop.x - original.x);
        crop.h = Math.max(20, Math.min(edState.height - original.y, original.h + dy));
      } else if (mode === 'rb') {
        crop.w = Math.max(20, Math.min(edState.width - original.x, original.w + dx));
        crop.h = Math.max(20, Math.min(edState.height - original.y, original.h + dy));
      }
      edState.crop = crop;
      drawEditor();
      return;
    }

    stroke(pointerState.last, point);
    pointerState.last = point;
  });

  edCanvas.addEventListener('pointerup', () => { pointerState = null; });
  edCanvas.addEventListener('pointerleave', () => { if (tool !== 'crop') pointerState = null; });
}

$('#bHelp').onclick = () => $('#help').style.display = 'flex';
$('#bHelpClose').onclick = () => $('#help').style.display = 'none';
$('#bGuide').onclick = () => $('#guide').style.display = 'flex';
$('#bGuideClose').onclick = () => $('#guide').style.display = 'none';

window.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (event.key === 'Escape') {
    if (edOpen) {
      $('#ed').style.display = 'none';
      edState = null;
      edOpen = false;
    } else {
      closeFull();
    }
  }
  if (event.key === 'Delete' && sel && !fullOpen) removeItem(sel);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
  }
});

window.addEventListener('resize', () => {
  items.forEach(layoutItem);
  if (fullOpen && sel) setFullScale(1);
});

ws.addEventListener('pointerdown', (event) => {
  if (event.target === ws || event.target.id === 'empty') selectItem(null);
});

addEventListener('dragover', (event) => event.preventDefault());
addEventListener('drop', (event) => {
  event.preventDefault();
  Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith('image/')).forEach(addImage);
});

$('#bHelp').onclick = () => $('#help').style.display = 'flex';
$('#bHelpClose').onclick = () => $('#help').style.display = 'none';

setupCameraDock();
setupEditor();
renderProjectControls();
hist = [serializeState()];
updateUndoRedo();
setStatus(false, 'Camera off');
setGestureText('No hand');
requestFlow();
