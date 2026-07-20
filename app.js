// --- Architectural Cleanup: VideoLayer Class ---
class VideoLayer {
    constructor(id) {
        this.id = id;
        this.video = document.getElementById(`video${id}`);
        this.timeSlider = document.getElementById(`timeSlider${id}`);
        this.timeValue = document.getElementById(`timeValue${id}`);
        this.playPauseBtn = document.getElementById(`playPauseButton${id}`);
        this.moveBtn = document.getElementById(`moveV${id}Btn`);
        this.setStartBtn = document.getElementById(`setStart${id}`);
        this.setEndBtn = document.getElementById(`setEnd${id}`);
        this.boneBtn = document.getElementById(`boneBtn${id}`);
        this.restartBtn = document.getElementById(`restartButton${id}`);
        this.fileNameSpan = document.getElementById(`fileName${id}`);
        this.fileInput = document.getElementById(`fileInput${id}`);

        // Transforms & Trimming State
        this.isReady = false;
        this.isPlaying = false;
        this.transform = { scale: 1.0, offsetX: 0, offsetY: 0 };
        this.trim = { start: 0, end: null };

        // AI State & Throttling Locks
        this.analyze = false;
        this.pose = null;
        this.results = null;
        this.loading = false;
        this.isProcessingAI = false;
        this.lastAnalyzedTime = -1;
    }

    reset() {
        this.isReady = false;
        this.isPlaying = false;
        this.trim = { start: 0, end: null };
        this.analyze = false;
        this.results = null;
        this.isProcessingAI = false;
        this.lastAnalyzedTime = -1;
        this.boneBtn.classList.remove('active', 'loading');
    }
}

// Instantiate layers cleanly
const layers = [new VideoLayer(1), new VideoLayer(2)];

// --- Global DOM Elements ---
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');
const aiLoader = document.getElementById('aiLoader');
const recordingStatus = document.getElementById('recordingStatus');
const opacitySlider = document.getElementById('opacitySlider');

// Annotations & Tools
const drawBtn = document.getElementById('drawBtn');
const textBtn = document.getElementById('textBtn');
const undoBtn = document.getElementById('undoBtn');
const annotationToolbar = document.getElementById('annotationToolbar');
const toolStatus = document.getElementById('status');
const globalPlayPauseBtn = document.getElementById('globalPlayPauseBtn');
const recordBtn = document.getElementById('recordBtn');

// --- Global State ---
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = 0;
let expectedRecordingDuration = 0;

// Interaction Modes
const MODE_NONE = 'none';
const MODE_MOVE_V1 = 'move_v1';
const MODE_MOVE_V2 = 'move_v2';
const MODE_DRAW = 'draw';
const MODE_TEXT = 'text';
let currentMode = MODE_NONE;

// Annotations State
let annotations = []; 
let currentStroke = null;
let selectedColor = '#ff3b30';
let activeTextIndex = -1; 
let initialTouchData = { x: 0, y: 0, scale: 1, offsetX: 0, offsetY: 0, distance: 0, fontSize: 20 };
let isDragging = false;

// --- Event Listeners ---

document.addEventListener('touchmove', function(e) {
    if (e.touches.length > 1) {
        if (e.target.id !== 'videoCanvas') e.preventDefault();
    }
}, { passive: false });

// Setup Event Listeners dynamically for both layers
layers.forEach(layer => {
    layer.fileInput.addEventListener('change', (e) => loadVideo(e, layer));
    layer.video.addEventListener('loadedmetadata', () => setupVideo(layer));
    layer.video.addEventListener('timeupdate', () => handleTimeUpdate(layer));
    layer.video.addEventListener('ended', () => { 
        layer.isPlaying = false; 
        layer.playPauseBtn.textContent = '▶'; 
        checkGlobalPlayState(); 
    });

    layer.playPauseBtn.addEventListener('click', () => { 
        togglePlayPause(layer); 
        checkGlobalPlayState(); 
    });
    
    layer.restartBtn.addEventListener('click', () => { 
        if (layer.isReady) layer.video.currentTime = layer.trim.start; 
    });

    layer.timeSlider.addEventListener('input', () => { 
        if (layer.isReady) { 
            layer.video.currentTime = parseFloat(layer.timeSlider.value); 
            drawFrame(); 
        } 
    });

    layer.setStartBtn.addEventListener('click', () => setTrimStart(layer));
    layer.setEndBtn.addEventListener('click', () => setTrimEnd(layer));
    layer.boneBtn.addEventListener('click', () => toggleAI(layer));
});

globalPlayPauseBtn.addEventListener('click', toggleGlobalPlayPause);
document.getElementById('syncAllStartsButton').addEventListener('click', syncAllStarts);
recordBtn.addEventListener('click', startRecording);
opacitySlider.addEventListener('input', drawFrame);

layers[0].moveBtn.addEventListener('click', () => setMode(MODE_MOVE_V1));
layers[1].moveBtn.addEventListener('click', () => setMode(MODE_MOVE_V2));
drawBtn.addEventListener('click', () => setMode(MODE_DRAW));
textBtn.addEventListener('click', () => setMode(MODE_TEXT));
undoBtn.addEventListener('click', () => { annotations.pop(); drawFrame(); });

document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedColor = e.target.getAttribute('data-color');
    });
});

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

    layers[0].moveBtn.classList.toggle('active', currentMode === MODE_MOVE_V1);
    layers[1].moveBtn.classList.toggle('active', currentMode === MODE_MOVE_V2);
    drawBtn.classList.toggle('active', currentMode === MODE_DRAW);
    textBtn.classList.toggle('active', currentMode === MODE_TEXT);

    if (currentMode === MODE_DRAW || currentMode === MODE_TEXT) {
        annotationToolbar.style.display = 'flex';
    } else {
        annotationToolbar.style.display = 'none';
    }

    if (currentMode === MODE_NONE) {
        videoCanvas.style.touchAction = 'auto'; 
        toolStatus.textContent = "Ready";
    } else {
        videoCanvas.style.touchAction = 'none'; 
        if (currentMode === MODE_TEXT) toolStatus.textContent = "Tap to add text, Drag to move, Pinch to resize";
    }
}

function loadVideo(event, layer) {
    const file = event.target.files[0];
    if (file) {
        if (layer.video.src && layer.video.src.startsWith('blob:')) {
            URL.revokeObjectURL(layer.video.src);
        }
        layer.video.src = URL.createObjectURL(file);
        layer.video.muted = true;
        layer.video.load();
        
        layer.fileNameSpan.textContent = file.name;
        layer.reset();
        
        toolStatus.textContent = `Loading Video ${layer.id}...`;
    }
}

function setupVideo(layer) {
    layer.isReady = true;
    layer.trim.end = layer.video.duration;
    layer.timeSlider.max = layer.video.duration;
    layer.timeSlider.value = 0;
    updateSliderVisuals(layer);

    if (layers.some(l => l.isReady)) {
        adjustCanvasSize();
        requestAnimationFrame(drawLoop);
    }
}

function adjustCanvasSize() {
    const container = document.querySelector('.container');
    if (!container) return;
    
    let aspect = 16/9;
    const readyLayer = layers.find(l => l.isReady && l.video.videoWidth);
    if (readyLayer) {
        aspect = readyLayer.video.videoWidth / readyLayer.video.videoHeight;
    }

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
            annotations.push({ type: 'text', content: text, x: pos.x, y: pos.y, color: selectedColor, size: 30 });
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
        const layerIdx = currentMode === MODE_MOVE_V1 ? 0 : 1;
        const layer = layers[layerIdx];
        if (!layer.isReady) return;
        
        if (touches && touches.length === 2) {
            isDragging = false;
            initialTouchData.distance = getDistance(touches);
            initialTouchData.scale = layer.transform.scale;
        } else {
            isDragging = true;
            initialTouchData.x = pos.clientX;
            initialTouchData.y = pos.clientY;
            initialTouchData.offsetX = layer.transform.offsetX;
            initialTouchData.offsetY = layer.transform.offsetY;
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
        const layerIdx = currentMode === MODE_MOVE_V1 ? 0 : 1;
        const layer = layers[layerIdx];
        if (touches && touches.length === 2 && initialTouchData.distance > 0) {
            const dist = getDistance(touches);
            layer.transform.scale = Math.max(0.1, initialTouchData.scale * (dist / initialTouchData.distance));
            drawFrame();
        } else if (isDragging) {
            const dx = pos.clientX - initialTouchData.x;
            const dy = pos.clientY - initialTouchData.y;
            layer.transform.offsetX = initialTouchData.offsetX + dx;
            layer.transform.offsetY = initialTouchData.offsetY + dy;
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

// --- AUTOMATED RECORDING LOGIC ---
function startRecording() {
    if (!layers.some(l => l.isReady)) {
        alert("Load a video first.");
        return;
    }
    if (isRecording) return;

    let dur1 = layers[0].isReady ? (layers[0].trim.end - layers[0].trim.start) : 0;
    let dur2 = layers[1].isReady ? (layers[1].trim.end - layers[1].trim.start) : 0;
    expectedRecordingDuration = Math.max(dur1, dur2) * 1000; 

    if (expectedRecordingDuration <= 0) {
        alert("Invalid video duration.");
        return;
    }

    syncAllStarts();
    isRecording = true;
    recordBtn.classList.add('recording');
    recordingStatus.style.display = 'block';

    const stream = videoCanvas.captureStream(30);
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'formcheck_video.webm';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordingStatus.style.display = 'none';
        pauseAllVideos();
    };

    mediaRecorder.start();
    recordingStartTime = Date.now();

    playAllVideos();
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        pauseAllVideos();
    }
}

function checkRecordingStopCondition() {
    if (!isRecording) return;
    const elapsed = Date.now() - recordingStartTime;
    if (elapsed >= expectedRecordingDuration + 200) {
        stopRecording();
    }
}

// --- Draw Loop ---
function drawLoop() {
    processAI();
    drawFrame();
    if (isRecording) checkRecordingStopCondition();
    requestAnimationFrame(drawLoop);
}

function drawFrame() {
    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    const centerX = videoCanvas.width / 2;
    const centerY = videoCanvas.height / 2;

    const drawLayer = (vid, t, alpha, fitContain) => {
        if (!vid || vid.readyState === 0) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        
        let dw = videoCanvas.width;
        let dh = videoCanvas.height;
        let dx = 0, dy = 0;

        if (fitContain && vid.videoWidth) {
            const scaleFactor = Math.min(videoCanvas.width / vid.videoWidth, videoCanvas.height / vid.videoHeight);
            dw = vid.videoWidth * scaleFactor;
            dh = vid.videoHeight * scaleFactor;
            dx = (videoCanvas.width - dw) / 2;
            dy = (videoCanvas.height - dh) / 2;
        }

        ctx.translate(centerX + t.offsetX, centerY + t.offsetY);
        ctx.scale(t.scale, t.scale);
        ctx.translate(-centerX, -centerY);
        
        ctx.drawImage(vid, dx, dy, dw, dh);
        ctx.restore();
        
        return { dw, dh, dx, dy };
    };

    let v1Info = {dw: videoCanvas.width, dh: videoCanvas.height, dx: 0, dy: 0};
    let v2Info = {dw: videoCanvas.width, dh: videoCanvas.height, dx: 0, dy: 0};

    if (layers[0].isReady) {
        v1Info = drawLayer(layers[0].video, layers[0].transform, 1.0, false) || v1Info;
        if (layers[0].analyze && layers[0].results && layers[0].results.poseLandmarks) {
            drawSkeletonChain(ctx, layers[0].results.poseLandmarks, 'white', layers[0].transform, v1Info);
        }
    }

    if (layers[1].isReady) {
        v2Info = drawLayer(layers[1].video, layers[1].transform, parseFloat(opacitySlider.value), true) || v2Info;
        if (layers[1].analyze && layers[1].results && layers[1].results.poseLandmarks) {
            drawSkeletonChain(ctx, layers[1].results.poseLandmarks, '#FFFF00', layers[1].transform, v2Info);
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

function drawSkeletonChain(ctx, landmarks, color, t, dims) {
    if (!landmarks) return;
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
                let x = (lm.x * dims.dw) + dims.dx;
                let y = (lm.y * dims.dh) + dims.dy;
                x = ((x - cx) * t.scale) + cx + t.offsetX;
                y = ((y - cy) * t.scale) + cy + t.offsetY;
                if(first) { ctx.moveTo(x,y); first=false; }
                else ctx.lineTo(x,y);
            } else first = true;
        });
        ctx.stroke();
    });
}

// --- Utils ---
function handleTimeUpdate(layer) {
    if (layer.video.currentTime >= layer.trim.end) {
        if (!isRecording) { 
            layer.video.currentTime = layer.trim.start;
            if (!layer.isPlaying) layer.video.pause(); 
        }
    }
    layer.timeSlider.value = layer.video.currentTime;
    layer.timeValue.textContent = layer.video.currentTime.toFixed(2) + 's';
}

function updateSliderVisuals(layer) {
    const max = layer.timeSlider.max || 100;
    const s = (layer.trim.start / max) * 100;
    const e = (layer.trim.end / max) * 100;
    layer.timeSlider.style.background = `linear-gradient(to right, #555 0%, #555 ${s}%, var(--primary-blue) ${s}%, var(--primary-blue) ${e}%, #555 ${e}%, #555 100%)`;
}

function setTrimStart(layer) {
    layer.trim.start = layer.video.currentTime;
    if (layer.trim.start >= layer.trim.end) layer.trim.start = 0;
    updateSliderVisuals(layer);
}

function setTrimEnd(layer) {
    layer.trim.end = layer.video.currentTime;
    if (layer.trim.end <= layer.trim.start) layer.trim.end = layer.video.duration;
    updateSliderVisuals(layer);
}

function togglePlayPause(layer) {
    if (!layer.video.readyState) return;
    if (layer.video.paused) { 
        layer.video.play(); 
        layer.isPlaying = true; 
        layer.playPauseBtn.textContent = '⏸'; 
    } else { 
        layer.video.pause(); 
        layer.isPlaying = false; 
        layer.playPauseBtn.textContent = '▶'; 
    }
}

function toggleGlobalPlayPause() {
    if (layers.some(l => l.isReady && !l.video.paused)) {
        pauseAllVideos();
    } else {
        playAllVideos();
    }
}

function checkGlobalPlayState() {
    if (layers.some(l => l.isReady && !l.video.paused)) {
        globalPlayPauseBtn.textContent = '⏸';
    } else {
        globalPlayPauseBtn.textContent = '▶ / ⏸';
    }
}

function playAllVideos() {
    layers.forEach(layer => {
        if (layer.isReady) {
            layer.video.play().then(() => { 
                layer.isPlaying = true; 
                layer.playPauseBtn.textContent = '⏸'; 
            }).catch(e => console.log(e));
        }
    });
    checkGlobalPlayState();
}

function pauseAllVideos() {
    layers.forEach(layer => {
        if (layer.isReady) {
            layer.video.pause(); 
            layer.isPlaying = false; 
            layer.playPauseBtn.textContent = '▶'; 
        }
    });
    checkGlobalPlayState();
}

function syncAllStarts() {
    layers.forEach(layer => {
        if (layer.isReady) layer.video.currentTime = layer.trim.start;
    });
    pauseAllVideos();
    drawFrame();
}

function createPoseModel(cb) {
    const p = new Pose({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
    p.setOptions({modelComplexity: 1, smoothLandmarks: true});
    p.onResults(cb);
    return p;
}

async function toggleAI(layer) {
    if (!layer.video.readyState) return;

    if (layer.analyze) {
        layer.analyze = false;
        layer.results = null;
        layer.boneBtn.classList.remove('active');
    } else {
        layer.boneBtn.classList.add('loading');
        setTimeout(async () => {
            if (!layer.pose) {
                layer.pose = createPoseModel(r => layer.results = r);
            }
            layer.loading = true;
            await layer.pose.send({ image: layer.video });
            layer.analyze = true;
            layer.loading = false;
            layer.boneBtn.classList.remove('loading'); 
            layer.boneBtn.classList.add('active');
        }, 50);
    }
}

// --- Throttled AI Loop ---
async function processAI() {
    for (const layer of layers) {
        // Only run if active, loaded, not currently processing, and timestamp actually changed
        if (layer.analyze && layer.pose && !layer.loading && !layer.isProcessingAI) {
            if (layer.video.currentTime !== layer.lastAnalyzedTime) {
                layer.isProcessingAI = true;
                layer.lastAnalyzedTime = layer.video.currentTime;
                try {
                    await layer.pose.send({ image: layer.video });
                } catch (e) {
                    console.error(`AI processing error on Video ${layer.id}:`, e);
                } finally {
                    layer.isProcessingAI = false;
                }
            }
        }
    }
}