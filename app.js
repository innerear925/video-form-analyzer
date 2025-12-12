// --- DOM Elements ---
const video1 = document.getElementById('video1');
const video2 = document.getElementById('video2');
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');
const aiLoader = document.getElementById('aiLoader');

// Controls
const opacitySlider = document.getElementById('opacitySlider');

// Video 1 Inputs
const timeSlider1 = document.getElementById('timeSlider1');
const timeValue1 = document.getElementById('timeValue1');
const playPauseButton1 = document.getElementById('playPauseButton1');
const moveV1Btn = document.getElementById('moveV1Btn');
const setStart1 = document.getElementById('setStart1');
const setEnd1 = document.getElementById('setEnd1');
const boneBtn1 = document.getElementById('boneBtn1');

// Video 2 Inputs
const timeSlider2 = document.getElementById('timeSlider2');
const timeValue2 = document.getElementById('timeValue2');
const playPauseButton2 = document.getElementById('playPauseButton2');
const moveV2Btn = document.getElementById('moveV2Btn');
const setStart2 = document.getElementById('setStart2');
const setEnd2 = document.getElementById('setEnd2');
const boneBtn2 = document.getElementById('boneBtn2');

// Annotations
const drawBtn = document.getElementById('drawBtn');
const textBtn = document.getElementById('textBtn');
const undoBtn = document.getElementById('undoBtn');
const annotationToolbar = document.getElementById('annotationToolbar');
const toolStatus = document.getElementById('status');

// --- State ---
let video1Ready = false;
let video2Ready = false;
let isPlaying1 = false;
let isPlaying2 = false;

// Transforms
let transform1 = { scale: 1.0, offsetX: 0, offsetY: 0 };
let transform2 = { scale: 1.0, offsetX: 0, offsetY: 0 };

// Trimming
let trim1 = { start: 0, end: null };
let trim2 = { start: 0, end: null };

// Interaction Modes
const MODE_NONE = 'none';
const MODE_MOVE_V1 = 'move_v1';
const MODE_MOVE_V2 = 'move_v2';
const MODE_DRAW = 'draw';
const MODE_TEXT = 'text';
let currentMode = MODE_NONE;

// Annotations
let annotations = []; // { type: 'line'|'text', color, points: [] or content/x/y/size }
let currentStroke = null;
let selectedColor = '#ff3b30';

// Text Interaction State
let activeTextIndex = -1; // Index of text being manipulated
let initialTextScale = 1;

// AI State
let analyze1 = false, analyze2 = false;
let pose1 = null, pose2 = null;
let results1 = null, results2 = null;
let loading1 = false, loading2 = false;

// Touch Cache
let initialTouchData = { x: 0, y: 0, scale: 1, offsetX: 0, offsetY: 0, distance: 0, fontSize: 20 };
let isDragging = false;

// --- Event Listeners ---

// File Uploads
document.getElementById('fileInput1').addEventListener('change', (e) => loadVideo(e, video1, 1));
document.getElementById('fileInput2').addEventListener('change', (e) => loadVideo(e, video2, 2));

// Video Events
video1.addEventListener('loadedmetadata', () => setupVideo(video1, 1));
video2.addEventListener('loadedmetadata', () => setupVideo(video2, 2));
video1.addEventListener('timeupdate', () => handleTimeUpdate(video1, 1));
video2.addEventListener('timeupdate', () => handleTimeUpdate(video2, 2));
video1.addEventListener('ended', () => { isPlaying1 = false; playPauseButton1.textContent = '▶'; });
video2.addEventListener('ended', () => { isPlaying2 = false; playPauseButton2.textContent = '▶'; });

// Controls
playPauseButton1.addEventListener('click', () => togglePlayPause(video1, playPauseButton1));
playPauseButton2.addEventListener('click', () => togglePlayPause(video2, playPauseButton2));
document.getElementById('playAllButton').addEventListener('click', playAllVideos);
document.getElementById('pauseAllButton').addEventListener('click', pauseAllVideos);
document.getElementById('syncAllStartsButton').addEventListener('click', syncAllStarts);

document.getElementById('restartButton1').addEventListener('click', () => { if(video1Ready) video1.currentTime = trim1.start; });
document.getElementById('restartButton2').addEventListener('click', () => { if(video2Ready) video2.currentTime = trim2.start; });

opacitySlider.addEventListener('input', drawFrame);
timeSlider1.addEventListener('input', () => { if(video1Ready) { video1.currentTime = parseFloat(timeSlider1.value); drawFrame(); } });
timeSlider2.addEventListener('input', () => { if(video2Ready) { video2.currentTime = parseFloat(timeSlider2.value); drawFrame(); } });

// Modes
moveV1Btn.addEventListener('click', () => setMode(MODE_MOVE_V1));
moveV2Btn.addEventListener('click', () => setMode(MODE_MOVE_V2));
drawBtn.addEventListener('click', () => setMode(MODE_DRAW));
textBtn.addEventListener('click', () => setMode(MODE_TEXT));

undoBtn.addEventListener('click', () => {
    annotations.pop();
    drawFrame();
});

// Trims
setStart1.addEventListener('click', () => setTrimStart(1));
setEnd1.addEventListener('click', () => setTrimEnd(1));
setStart2.addEventListener('click', () => setTrimStart(2));
setEnd2.addEventListener('click', () => setTrimEnd(2));

// AI
boneBtn1.addEventListener('click', () => toggleAI(1));
boneBtn2.addEventListener('click', () => toggleAI(2));

// Colors
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedColor = e.target.getAttribute('data-color');
    });
});

// Canvas Interaction
videoCanvas.addEventListener('mousedown', handlePointerStart);
videoCanvas.addEventListener('mousemove', handlePointerMove);
videoCanvas.addEventListener('mouseup', handlePointerEnd);
videoCanvas.addEventListener('touchstart', handlePointerStart, { passive: false });
videoCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
videoCanvas.addEventListener('touchend', handlePointerEnd);

window.addEventListener('resize', adjustCanvasSize);

// --- Functions ---

function setMode(mode) {
    if (currentMode === mode) currentMode = MODE_NONE;
    else currentMode = mode;

    // Button states
    moveV1Btn.classList.toggle('active', currentMode === MODE_MOVE_V1);
    moveV2Btn.classList.toggle('active', currentMode === MODE_MOVE_V2);
    drawBtn.classList.toggle('active', currentMode === MODE_DRAW);
    textBtn.classList.toggle('active', currentMode === MODE_TEXT);

    // Toolbar visibility
    if (currentMode === MODE_DRAW || currentMode === MODE_TEXT) {
        annotationToolbar.style.display = 'flex';
    } else {
        annotationToolbar.style.display = 'none';
    }

    // Canvas touch-action: Allow page zoom only when mode is NONE
    if (currentMode === MODE_NONE) {
        videoCanvas.style.touchAction = 'auto';
        toolStatus.textContent = "Ready";
    } else {
        videoCanvas.style.touchAction = 'none';
        if (currentMode === MODE_TEXT) toolStatus.textContent = "Tap to add text, Drag to move, Pinch to resize";
    }
}

function loadVideo(event, videoElement, videoNum) {
    const file = event.target.files[0];
    if (file) {
        if (videoElement.src && videoElement.src.startsWith('blob:')) URL.revokeObjectURL(videoElement.src);
        videoElement.src = URL.createObjectURL(file);
        videoElement.load();
        
        document.getElementById(`fileName${videoNum}`).textContent = file.name;

        if (videoNum === 1) { 
            video1Ready = false; trim1 = { start: 0, end: null }; analyze1 = false;
        } else { 
            video2Ready = false; trim2 = { start: 0, end: null }; analyze2 = false;
        }
        
        toolStatus.textContent = `Loading Video ${videoNum}...`;
    }
}

function setupVideo(videoElement, videoNum) {
    if (videoNum === 1) { video1Ready = true; trim1.end = videoElement.duration; }
    else { video2Ready = true; trim2.end = videoElement.duration; }

    const slider = (videoNum === 1) ? timeSlider1 : timeSlider2;
    slider.max = videoElement.duration;
    slider.value = 0;
    updateSliderVisuals(videoNum);

    if (video1Ready || video2Ready) {
        adjustCanvasSize();
        requestAnimationFrame(drawLoop);
    }
}

function adjustCanvasSize() {
    const container = document.querySelector('.container');
    if (!container) return;
    
    let aspect = 16/9;
    if (video1Ready && video1.videoWidth) aspect = video1.videoWidth / video1.videoHeight;
    else if (video2Ready && video2.videoWidth) aspect = video2.videoWidth / video2.videoHeight;

    const w = container.clientWidth - 20;
    videoCanvas.width = w;
    videoCanvas.height = w / aspect;
    drawFrame();
}

// --- Interaction Logic ---

function getPointerPos(e) {
    const rect = videoCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top, clientX, clientY };
}

function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function hitTestText(x, y) {
    for (let i = annotations.length - 1; i >= 0; i--) {
        const item = annotations[i];
        if (item.type === 'text') {
            ctx.font = `bold ${item.size}px Arial`;
            const width = ctx.measureText(item.content).width;
            const height = item.size; 
            if (x >= item.x && x <= item.x + width && y >= item.y - height && y <= item.y) {
                return i;
            }
        }
    }
    return -1;
}

function handlePointerStart(e) {
    if (currentMode === MODE_NONE) return; 
    
    e.preventDefault();
    const pos = getPointerPos(e);
    const touches = e.touches;

    if (currentMode === MODE_TEXT) {
        activeTextIndex = hitTestText(pos.x, pos.y);
        
        if (activeTextIndex !== -1) {
            isDragging = true;
            const item = annotations[activeTextIndex];
            
            if (touches && touches.length === 2) {
                initialTouchData.distance = getDistance(touches);
                initialTouchData.fontSize = item.size;
            } else {
                initialTouchData.x = pos.clientX;
                initialTouchData.y = pos.clientY;
                initialTouchData.offsetX = item.x;
                initialTouchData.offsetY = item.y;
            }
            return;
        }

        const text = prompt("Enter text:");
        if (text) {
            annotations.push({ 
                type: 'text', 
                content: text, 
                x: pos.x, 
                y: pos.y, 
                color: selectedColor, 
                size: 30 
            });
            drawFrame();
        }
        return;
    }

    if (currentMode === MODE_DRAW) {
        isDragging = true;
        currentStroke = { type: 'line', color: selectedColor, points: [{x: pos.x, y: pos.y}] };
        annotations.push(currentStroke);
        return;
    }

    if (currentMode === MODE_MOVE_V1 || currentMode === MODE_MOVE_V2) {
        if (!video1Ready && currentMode === MODE_MOVE_V1) return;
        if (!video2Ready && currentMode === MODE_MOVE_V2) return;

        const t = currentMode === MODE_MOVE_V1 ? transform1 : transform2;
        
        if (touches && touches.length === 2) {
            isDragging = false;
            initialTouchData.distance = getDistance(touches);
            initialTouchData.scale = t.scale;
        } else {
            isDragging = true;
            initialTouchData.x = pos.clientX;
            initialTouchData.y = pos.clientY;
            initialTouchData.offsetX = t.offsetX;
            initialTouchData.offsetY = t.offsetY;
        }
    }
}

function handlePointerMove(e) {
    if (currentMode === MODE_NONE) return;
    e.preventDefault();

    const pos = getPointerPos(e);
    const touches = e.touches;

    if (currentMode === MODE_TEXT && activeTextIndex !== -1) {
        const item = annotations[activeTextIndex];

        if (touches && touches.length === 2 && initialTouchData.distance > 0) {
            const dist = getDistance(touches);
            const scaleFactor = dist / initialTouchData.distance;
            item.size = Math.max(10, initialTouchData.fontSize * scaleFactor);
            drawFrame();
        } else if (isDragging) {
            const deltaX = pos.clientX - initialTouchData.x;
            const deltaY = pos.clientY - initialTouchData.y;
            item.x = initialTouchData.offsetX + deltaX;
            item.y = initialTouchData.offsetY + deltaY;
            drawFrame();
        }
        return;
    }

    if (currentMode === MODE_DRAW && isDragging) {
        currentStroke.points.push({x: pos.x, y: pos.y});
        drawFrame();
        return;
    }

    if (currentMode === MODE_MOVE_V1 || currentMode === MODE_MOVE_V2) {
        const t = currentMode === MODE_MOVE_V1 ? transform1 : transform2;
        if (touches && touches.length === 2 && initialTouchData.distance > 0) {
            const dist = getDistance(touches);
            t.scale = Math.max(0.1, initialTouchData.scale * (dist / initialTouchData.distance));
            drawFrame();
        } else if (isDragging) {
            const dx = pos.clientX - initialTouchData.x;
            const dy = pos.clientY - initialTouchData.y;
            t.offsetX = initialTouchData.offsetX + dx;
            t.offsetY = initialTouchData.offsetY + dy;
            drawFrame();
        }
    }
}

function handlePointerEnd(e) {
    isDragging = false;
    currentStroke = null;
    activeTextIndex = -1;
    initialTouchData.distance = 0;
}

function drawLoop() {
    processAI();
    drawFrame();
    requestAnimationFrame(drawLoop);
}

function drawFrame() {
    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    const centerX = videoCanvas.width / 2;
    const centerY = videoCanvas.height / 2;

    const drawLayer = (vid, t, alpha) => {
        if (!vid || vid.readyState < 2) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(centerX + t.offsetX, centerY + t.offsetY);
        ctx.scale(t.scale, t.scale);
        ctx.translate(-centerX, -centerY);
        ctx.drawImage(vid, 0, 0, videoCanvas.width, videoCanvas.height);
        ctx.restore();
    };

    if (video1Ready) {
        drawLayer(video1, transform1, 1.0);
        if (analyze1 && results1 && results1.poseLandmarks) {
            drawSkeletonChain(ctx, results1.poseLandmarks, 'white', transform1);
        }
    }

    if (video2Ready) {
        drawLayer(video2, transform2, parseFloat(opacitySlider.value));
        if (analyze2 && results2 && results2.poseLandmarks) {
            drawSkeletonChain(ctx, results2.poseLandmarks, '#FFFF00', transform2);
        }
    }

    ctx.globalAlpha = 1.0;
    annotations.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3;

        if (item.type === 'text') {
            ctx.font = `bold ${item.size}px Arial`;
            ctx.fillText(item.content, item.x, item.y);
        } else if (item.type === 'line') {
            ctx.beginPath();
            if(item.points.length > 0) {
                ctx.moveTo(item.points[0].x, item.points[0].y);
                for(let i=1; i<item.points.length; i++) ctx.lineTo(item.points[i].x, item.points[i].y);
            }
            ctx.stroke();
        }
    });
}

function drawSkeletonChain(ctx, landmarks, color, t) {
    const chains = [[15,13,11,23,25,27], [16,14,12,24,26,28]];
    const cx = videoCanvas.width/2;
    const cy = videoCanvas.height/2;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    chains.forEach(indices => {
        ctx.beginPath();
        let first = true;
        indices.forEach(i => {
            const lm = landmarks[i];
            if(lm && lm.visibility > 0.5) {
                let x = lm.x * videoCanvas.width;
                let y = lm.y * videoCanvas.height;
                x = ((x - cx) * t.scale) + cx + t.offsetX;
                y = ((y - cy) * t.scale) + cy + t.offsetY;
                if(first) { ctx.moveTo(x,y); first=false; }
                else ctx.lineTo(x,y);
            } else first = true;
        });
        ctx.stroke();
    });
}

function handleTimeUpdate(vid, num) {
    const slider = num===1 ? timeSlider1 : timeSlider2;
    const val = num===1 ? timeValue1 : timeValue2;
    const trim = num===1 ? trim1 : trim2;
    const isPlaying = num===1 ? isPlaying1 : isPlaying2;

    if (vid.currentTime >= trim.end) {
        vid.currentTime = trim.start;
        if (!isPlaying) vid.pause(); 
    }
    slider.value = vid.currentTime;
    val.textContent = vid.currentTime.toFixed(2)+'s';
}

function updateSliderVisuals(num) {
    const slider = num===1 ? timeSlider1 : timeSlider2;
    const trim = num===1 ? trim1 : trim2;
    const max = slider.max || 100;
    const s = (trim.start/max)*100;
    const e = (trim.end/max)*100;
    slider.style.background = `linear-gradient(to right, #555 0%, #555 ${s}%, var(--primary-blue) ${s}%, var(--primary-blue) ${e}%, #555 ${e}%, #555 100%)`;
}

function setTrimStart(num) {
    const v = num===1 ? video1 : video2;
    const t = num===1 ? trim1 : trim2;
    t.start = v.currentTime;
    if(t.start >= t.end) t.start = 0;
    updateSliderVisuals(num);
}
function setTrimEnd(num) {
    const v = num===1 ? video1 : video2;
    const t = num===1 ? trim1 : trim2;
    t.end = v.currentTime;
    if(t.end <= t.start) t.end = v.duration;
    updateSliderVisuals(num);
}

function togglePlayPause(v, btn) {
    if(!v.readyState) return;
    if(v.paused) { v.play(); if(v===video1) isPlaying1=true; else isPlaying2=true; btn.textContent='⏸'; }
    else { v.pause(); if(v===video1) isPlaying1=false; else isPlaying2=false; btn.textContent='▶'; }
}

function playAllVideos() {
    if(video1Ready) togglePlayPause(video1, playPauseButton1);
    if(video2Ready) togglePlayPause(video2, playPauseButton2);
}
function pauseAllVideos() {
    if(video1Ready) { video1.pause(); isPlaying1=false; playPauseButton1.textContent='▶'; }
    if(video2Ready) { video2.pause(); isPlaying2=false; playPauseButton2.textContent='▶'; }
}
function syncAllStarts() {
    if(video1Ready) video1.currentTime = trim1.start;
    if(video2Ready) video2.currentTime = trim2.start;
    pauseAllVideos();
    drawFrame();
}

function createPoseModel(cb) {
    const p = new Pose({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
    p.setOptions({modelComplexity: 1, smoothLandmarks: true});
    p.onResults(cb);
    return p;
}
async function toggleAI(num) {
    const isV1 = num===1;
    const btn = isV1 ? boneBtn1 : boneBtn2;
    const isActive = isV1 ? analyze1 : analyze2;
    const vid = isV1 ? video1 : video2;
    if(!vid.readyState) return;

    if(isActive) {
        if(isV1) { analyze1=false; results1=null; } else { analyze2=false; results2=null; }
        btn.classList.remove('active');
    } else {
        btn.classList.add('loading');
        setTimeout(async () => {
            if(isV1) { if(!pose1) pose1=createPoseModel(r=>results1=r); loading1=true; await pose1.send({image:video1}); analyze1=true; loading1=false; }
            else { if(!pose2) pose2=createPoseModel(r=>results2=r); loading2=true; await pose2.send({image:video2}); analyze2=true; loading2=false; }
            btn.classList.remove('loading'); btn.classList.add('active');
        }, 50);
    }
}
async function processAI() {
    if(analyze1 && pose1 && !loading1) await pose1.send({image:video1});
    if(analyze2 && pose2 && !loading2) await pose2.send({image:video2});
}