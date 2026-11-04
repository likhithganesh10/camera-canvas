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
let fullScale = 1;
let fullPinch = null;
let cameraRunning = false;
let stream = null;
let hands = null;
let cameraBusy = false;
let edOpen = false;
let edState = null;
let tool = 'pencil';
let pointerState = null;
let swipeCooldown = 0;
let swipeQueue = [];
let lastOpenPalmTime = 0;

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function setGestureText(text) {
  $('#gest').textContent = 'Gesture: ' + text;
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
  $('#cam').style.display = 'block';
  $('#pill').style.display = 'none';
}

function clearErr() {
  $('#err').style.display = 'none';
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

function updateUndoRedo() {
  $('#bUndo').disabled = histIndex <= 0;
  $('#bRedo').disabled = histIndex >= hist.length - 1;
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

function addImage(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const rect = ws.getBoundingClientRect();
    const width = Math.min(260, img.naturalWidth);
    const height = width * (img.naturalHeight / Math.max(1, img.naturalWidth));
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

function removeItem(item) {
  if (!item) return;
  if (item.el) item.el.remove();
  items = items.filter((entry) => entry !== item);
  if (sel === item) selectItem(null);
  if (!items.length) $('#empty').style.display = 'flex';
  if (fullOpen) closeFull();
  scheduleHistory();
}

function openFull() {
  if (edOpen) return;
  if (!sel) {
    toast('Select an image first');
    return;
  }
  $('#fullImg').src = sel.url;
  fullOpen = true;
  fullScale = 1;
  fullPinch = null;
  setFullScale(1);
  $('#full').style.display = 'flex';
  swipeQueue = [];
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
  fullScale = Math.min(5, Math.max(0.3, scale));
  const fit = Math.min(maxWidth / sel.w, maxHeight / sel.h, 1.5);
  const width = Math.min(maxWidth, sel.w * fullScale * fit);
  const height = Math.min(maxHeight, sel.h * fullScale * fit);
  $('#fullImg').style.width = width + 'px';
  $('#fullImg').style.height = height + 'px';
}

function renderProjectControls() {
  const chips = $('#chips');
  chips.innerHTML = '';

  const createChip = (label, projectId) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'chip' + (currentProject === projectId ? ' active' : '');
    button.onclick = () => {
      currentProject = projectId;
      items.forEach((item) => layoutItem(item));
      if (sel && sel.el && sel.el.style.display === 'none') selectItem(null);
      renderProjectControls();
      scheduleHistory();
    };
    chips.appendChild(button);
    chips.appendChild(document.createTextNode(' '));
  };

  createChip('All images', null);
  projects.forEach((project) => createChip('📁 ' + project.name, project.id));

  const selectEl = $('#projSel');
  selectEl.innerHTML = '<option value="">No project</option>' + projects.map((project) => '<option value="' + project.id + '">' + project.name + '</option>').join('');
  syncProjectSelect();
}

function syncProjectSelect() {
  const selectEl = $('#projSel');
  if (!selectEl) return;
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

function editorPoint(event) {
  const rect = $('#edc').getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * $('#edc').width,
    y: ((event.clientY - rect.top) / rect.height) * $('#edc').height
  };
}

function drawEditor() {
  if (!edState) return;
  const { base, layer, width, height, crop } = edState;
  const ctx = $('#edc').getContext('2d');
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
    const handle = Math.max(7, width / 80);
    [[crop.x, crop.y], [crop.x + crop.w, crop.y], [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h]].forEach(([x, y]) => {
      ctx.fillRect(x - handle, y - handle, handle * 2, handle * 2);
    });
  }
}

function setTool(nextTool) {
  tool = nextTool;
  document.querySelectorAll('#ed [data-t]').forEach((button) => {
    button.classList.toggle('active', button.dataset.t === nextTool);
  });
  $('#edApplyCrop').style.display = nextTool === 'crop' ? '' : 'none';
  $('#edHint').textContent = {
    pencil: 'Draw on the image. Pick a color and size.',
    eraser: 'Erase pencil strokes.',
    crop: 'Drag the crop box or its edges, then apply the crop.'
  }[nextTool];
  $('#edc').style.cursor = nextTool === 'crop' ? 'move' : 'crosshair';
  drawEditor();
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

function applyCrop() {
  if (!edState) return false;
  const crop = edState.crop;
  const width = edState.width;
  const height = edState.height;
  if (crop.w >= width - 1 && crop.h >= height - 1) return false;

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
  $('#edc').width = edState.width;
  $('#edc').height = edState.height;
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
    $('#edc').width = width;
    $('#edc').height = height;
    edOpen = true;
    $('#ed').style.display = 'flex';
    setTool('pencil');
  };
  img.src = sel.url;
}

function closeEditor() {
  edOpen = false;
  edState = null;
  $('#ed').style.display = 'none';
}

async function composeSheet() {
  const visible = items.filter((item) => item.el && item.el.style.display !== 'none');
  if (!visible.length) {
    toast('Nothing on the sheet yet');
    return null;
  }

  const left = Math.min(...visible.map((item) => item.x));
  const top = Math.min(...visible.map((item) => item.y));
  const right = Math.max(...visible.map((item) => item.x + item.w * item.s));
  const bottom = Math.max(...visible.map((item) => item.y + item.h * item.s));
  const padding = 20;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(320, Math.round(right - left + padding * 2));
  canvas.height = Math.max(240, Math.round(bottom - top + padding * 2));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const item of visible) {
    const image = new Image();
    await new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
      image.src = item.url;
    });
    ctx.drawImage(image, item.x - left + padding, item.y - top + padding, item.w * item.s, item.h * item.s);
  }

  return canvas;
}

async function openSheetEditor() {
  const sheetCanvas = await composeSheet();
  if (!sheetCanvas) return;
  const base = document.createElement('canvas');
  const layer = document.createElement('canvas');
  base.width = sheetCanvas.width;
  base.height = sheetCanvas.height;
  layer.width = sheetCanvas.width;
  layer.height = sheetCanvas.height;
  const ctx = base.getContext('2d');
  ctx.drawImage(sheetCanvas, 0, 0);

  edState = { sheet: true, base, layer, width: sheetCanvas.width, height: sheetCanvas.height, crop: { x: 0, y: 0, w: sheetCanvas.width, h: sheetCanvas.height } };
  $('#edc').width = sheetCanvas.width;
  $('#edc').height = sheetCanvas.height;
  edOpen = true;
  $('#ed').style.display = 'flex';
  setTool('pencil');
}

function isFingerExtended(hand, tip, knuckle) {
  return Math.hypot(hand[tip].x - hand[0].x, hand[tip].y - hand[0].y) > Math.hypot(hand[knuckle].x - hand[0].x, hand[knuckle].y - hand[0].y) * 1.2;
}

function isPinch(hand) {
  if (!hand || hand.length < 21) return false;
  const size = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y) || 0.1;
  return Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) / size < 0.35;
}

function isPointing(hand) {
  if (!hand || hand.length < 21) return false;
  return isFingerExtended(hand, 8, 5) && !isFingerExtended(hand, 12, 9) && !isFingerExtended(hand, 16, 13) && !isFingerExtended(hand, 20, 17);
}

function isOpenPalm(hand) {
  if (!hand || hand.length < 21) return false;
  return isFingerExtended(hand, 8, 5) && isFingerExtended(hand, 12, 9) && isFingerExtended(hand, 16, 13) && isFingerExtended(hand, 20, 17);
}

function handleGestureResults(results) {
  const handsFound = results.multiHandLandmarks || [];
  ovCtx.clearRect(0, 0, ov.width, ov.height);
  if (!handsFound.length) {
    setGestureText('No hand');
    return;
  }

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
    hand.forEach((point) => {
      ovCtx.beginPath();
      ovCtx.fillStyle = '#fff';
      ovCtx.arc(point.x * ov.width, point.y * ov.height, 3, 0, Math.PI * 2);
      ovCtx.fill();
    });
  });

  const hand = handsFound[0];
  const point = isPointing(hand);
  const palm = isOpenPalm(hand);
  const pinch = isPinch(hand);

  if (fullOpen) {
    if (handsFound.length >= 2) {
      const [a, b] = handsFound;
      const distance = Math.hypot(a[9].x - b[9].x, a[9].y - b[9].y) * 800;
      if (fullPinch) {
        const ratio = distance / Math.max(fullPinch.distance, 1);
        setFullScale(fullPinch.scale * ratio);
      } else {
        fullPinch = { distance, scale: fullScale };
      }
      setGestureText('Resizing full screen');
      return;
    }
    fullPinch = null;

    if (point) {
      const x = hand[8].x;
      swipeQueue.push([performance.now(), x]);
      swipeQueue = swipeQueue.filter(([time]) => performance.now() - time < 600);
      const max = Math.max(...swipeQueue.map(([, value]) => value));
      if (performance.now() > swipeCooldown && max - x > 0.24) {
        closeFull();
        swipeCooldown = performance.now() + 900;
        setGestureText('Back');
        toast('Swipe left → back');
        return;
      }
      setGestureText('Full screen');
      return;
    }

    setGestureText('Full screen');
    return;
  }

  if (drag || edOpen) {
    setGestureText('Dragging / editing');
    return;
  }

  if (pinch) {
    const cx = (hand[4].x + hand[8].x) / 2;
    const cy = (hand[4].y + hand[8].y) / 2;
    const under = hitTest((1 - cx) * window.innerWidth, cy * window.innerHeight);
    if (under) {
      selectItem(under);
      const rect = ws.getBoundingClientRect();
      startDrag(under, (1 - cx) * window.innerWidth + rect.left, cy * window.innerHeight + rect.top);
      drag = { item: under, offsetX: (1 - cx) * window.innerWidth - under.x, offsetY: cy * window.innerHeight - under.y };
    }
    setGestureText('Pinch drag');
    return;
  }

  if (palm && performance.now() - lastOpenPalmTime > 700) {
    lastOpenPalmTime = performance.now();
    openFull();
    setGestureText('Open palm');
    toast('Open palm → full screen');
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
      swipeCooldown = performance.now() + 900;
      setGestureText('Swipe right → Undo');
      return;
    }
    if (performance.now() > swipeCooldown && max - x > 0.22) {
      redo();
      swipeCooldown = performance.now() + 900;
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
    script.crossOrigin = 'anonymous';
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
      hands = new window.Hands({ locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + file });
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
  if (!navigator.permissions || !navigator.permissions.query) {
    startCamera();
    return;
  }
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    if (result.state === 'granted') {
      startCamera();
      return;
    }
    if (result.state === 'denied') {
      showErr('Camera permission denied', ['Open the page in its own tab and allow camera access.', 'Check browser or OS privacy settings.']);
      return;
    }
  } catch (_) {
    // Some browsers do not expose permission query.
  }
  $('#ask').style.display = 'flex';
}

$('#bUpload').onclick = () => $('#file').click();
$('#file').onchange = (event) => {
  Array.from(event.target.files || []).forEach(addImage);
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
$('#bUndo').onclick = undo;
$('#bRedo').onclick = redo;
$('#bCam').onclick = () => (cameraRunning ? stopCamera() : requestFlow());
$('#askYes').onclick = () => { $('#ask').style.display = 'none'; startCamera(); };
$('#askNo').onclick = () => { $('#ask').style.display = 'none'; setStatus(false, 'Camera off'); toast('Camera is off'); };
$('#bEdit').onclick = openEditor;
$('#bSheet').onclick = openSheetEditor;
$('#edCancel').onclick = closeEditor;
$('#edApplyCrop').onclick = () => toast(applyCrop() ? 'Crop applied' : 'Drag the crop box first');
$('#edDone').onclick = () => {
  if (!edState) return;
  if (tool === 'crop') applyCrop();
  const merged = document.createElement('canvas');
  merged.width = edState.width;
  merged.height = edState.height;
  const ctx = merged.getContext('2d');
  ctx.drawImage(edState.base, 0, 0);
  ctx.drawImage(edState.layer, 0, 0);

  if (edState.sheet) {
    const image = new Image();
    image.src = merged.toDataURL('image/png');
    items.forEach((item) => item.el.remove());
    items = [];
    const item = {
      id: 'img-' + Date.now(),
      url: image.src,
      w: 260,
      h: 200,
      s: 1,
      x: 40,
      y: 40,
      p: currentProject || null,
      el: null
    };
    const el = document.createElement('div');
    el.className = 'item';
    const img = new Image();
    img.src = item.url;
    el.appendChild(img);
    item.el = el;
    el.addEventListener('pointerdown', (event) => {
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
    ws.appendChild(el);
    items.push(item);
    layoutItem(item);
    selectItem(item);
  } else {
    const item = edState.item;
    item.url = merged.toDataURL('image/png');
    item.el.querySelector('img').src = item.url;
    item.h = (item.w * edState.height) / edState.width;
    layoutItem(item);
  }

  scheduleHistory();
  closeEditor();
  toast('Edit saved');
};
$('#edSave').onclick = () => {
  if (!edState) return;
  if (tool === 'crop') applyCrop();
  const merged = document.createElement('canvas');
  merged.width = edState.width;
  merged.height = edState.height;
  const ctx = merged.getContext('2d');
  ctx.drawImage(edState.base, 0, 0);
  ctx.drawImage(edState.layer, 0, 0);
  const link = document.createElement('a');
  link.href = merged.toDataURL('image/png');
  link.download = 'gesture-canvas-edited.png';
  link.click();
  toast('Saved edited image');
};

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
  $('#fullImg').style.width = Math.min(window.innerWidth * 0.94, Math.max(150, next)) + 'px';
  $('#fullImg').style.height = 'auto';
}, { passive: false });

$('#full').addEventListener('touchstart', (event) => {
  if (event.touches.length === 2 && sel) {
    const [a, b] = [event.touches[0], event.touches[1]];
    fullPinch = {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      scale: fullScale
    };
  }
}, { passive: false });

$('#full').addEventListener('touchmove', (event) => {
  if (event.touches.length === 2 && fullPinch && sel) {
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = distance / Math.max(fullPinch.distance, 1);
    setFullScale(fullPinch.scale * ratio);
  }
}, { passive: false });

$('#full').addEventListener('touchend', () => {
  fullPinch = null;
});

$('#camHead').addEventListener('pointerdown', (event) => {
  if (event.target.tagName === 'BUTTON') return;
  const rect = $('#cam').getBoundingClientRect();
  pointerState = { drag: { dx: event.clientX - rect.left, dy: event.clientY - rect.top } };
  $('#camHead').setPointerCapture(event.pointerId);
});
$('#camHead').addEventListener('pointermove', (event) => {
  if (!pointerState || !pointerState.drag) return;
  $('#cam').style.left = Math.min(window.innerWidth - $('#cam').offsetWidth, Math.max(0, event.clientX - pointerState.drag.dx)) + 'px';
  $('#cam').style.top = Math.max(0, event.clientY - pointerState.drag.dy) + 'px';
  $('#cam').style.right = 'auto';
});
$('#camHead').addEventListener('pointerup', () => { pointerState = null; });
$('#camHead').addEventListener('pointercancel', () => { pointerState = null; });

$('#bHide').onclick = () => {
  $('#cam').style.display = 'none';
  $('#pill').style.display = 'flex';
};
$('#pill').onclick = () => {
  $('#pill').style.display = 'none';
  $('#cam').style.display = 'block';
};

$('#edc').addEventListener('pointerdown', (event) => {
  if (!edState) return;
  const point = editorPoint(event);
  if (tool === 'crop') {
    const crop = edState.crop;
    const handle = Math.max(18, $('#edc').width / 30);
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
    $('#edc').setPointerCapture(event.pointerId);
    return;
  }
  pointerState = { last: point };
  stroke(point, point);
  $('#edc').setPointerCapture(event.pointerId);
});

$('#edc').addEventListener('pointermove', (event) => {
  if (!edState || !pointerState) return;
  const point = editorPoint(event);

  if (tool === 'crop') {
    const crop = { ...edState.crop };
    const dx = point.x - pointerState.start.x;
    const dy = point.y - pointerState.start.y;
    const original = pointerState.original;
    const W = $('#edc').width;
    const H = $('#edc').height;

    if (pointerState.mode === 'move') {
      crop.x = Math.min(W - crop.w, Math.max(0, original.x + dx));
      crop.y = Math.min(H - crop.h, Math.max(0, original.y + dy));
    } else if (pointerState.mode === 'left') {
      crop.x = Math.min(original.x + original.w - 20, Math.max(0, original.x + dx));
      crop.w = original.w - (crop.x - original.x);
    } else if (pointerState.mode === 'right') {
      crop.w = Math.max(20, Math.min(W - original.x, original.w + dx));
    } else if (pointerState.mode === 'top') {
      crop.y = Math.min(original.y + original.h - 20, Math.max(0, original.y + dy));
      crop.h = original.h - (crop.y - original.y);
    } else if (pointerState.mode === 'bottom') {
      crop.h = Math.max(20, Math.min(H - original.y, original.h + dy));
    } else if (pointerState.mode === 'lt') {
      crop.x = Math.min(original.x + original.w - 20, Math.max(0, original.x + dx));
      crop.y = Math.min(original.y + original.h - 20, Math.max(0, original.y + dy));
      crop.w = original.w - (crop.x - original.x);
      crop.h = original.h - (crop.y - original.y);
    } else if (pointerState.mode === 'rt') {
      crop.y = Math.min(original.y + original.h - 20, Math.max(0, original.y + dy));
      crop.w = Math.max(20, Math.min(W - original.x, original.w + dx));
      crop.h = original.h - (crop.y - original.y);
    } else if (pointerState.mode === 'lb') {
      crop.x = Math.min(original.x + original.w - 20, Math.max(0, original.x + dx));
      crop.w = original.w - (crop.x - original.x);
      crop.h = Math.max(20, Math.min(H - original.y, original.h + dy));
    } else if (pointerState.mode === 'rb') {
      crop.w = Math.max(20, Math.min(W - original.x, original.w + dx));
      crop.h = Math.max(20, Math.min(H - original.y, original.h + dy));
    }
    edState.crop = crop;
    drawEditor();
    return;
  }

  stroke(pointerState.last, point);
  pointerState.last = point;
});

$('#edc').addEventListener('pointerup', () => { pointerState = null; });
$('#edc').addEventListener('pointerleave', () => { if (tool !== 'crop') pointerState = null; });

window.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (event.key === 'Escape') {
    if (edOpen) {
      closeEditor();
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
  items.forEach((item) => layoutItem(item));
  if (fullOpen && sel) setFullScale(1);
});

ws.addEventListener('pointerdown', (event) => {
  if (event.target === ws || event.target.id === 'empty') selectItem(null);
});

addEventListener('dragover', (event) => event.preventDefault());
addEventListener('drop', (event) => {
  event.preventDefault();
  Array.from(event.dataTransfer.files || []).forEach(addImage);
});

window.addImage = addImage;
window.startCamera = startCamera;
setStatus(false, 'Camera off');
setGestureText('No hand');
renderProjectControls();
hist = [serializeState()];
updateUndoRedo();
requestFlow();
