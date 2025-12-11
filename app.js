// --- DOM Elements ---
const video1 = document.getElementById('video1');
const video2 = document.getElementById('video2');
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');
const aiLoader = document.getElementById('aiLoader');

// Controls
const opacitySlider = document.getElementById('opacitySlider');

// Video 1
const timeSlider1 = document.getElementById('timeSlider1');
const timeValue1 = document.getElementById('timeValue1');
const playPauseButton1 = document.getElementById('playPauseButton1');
const moveV1Btn = document.getElementById('moveV1Btn');
const setStart1 = document.getElementById('setStart1');
const setEnd1 = document.getElementById('setEnd1');
const boneBtn1 = document.getElementById('boneBtn1');

// Video 2
const timeSlider2 = document.getElementById('timeSlider2');
const timeValue2 = document.getElementById('timeValue2');
const playPauseButton2 = document.getElementById('playPauseButton2');
const moveV2Btn = document.getElementById('moveV2Btn');
const setStart2 = document.getElementById('setStart2');
const setEnd2 = document.getElementById('setEnd2');
const boneBtn2 = document.getElementById('boneBtn2');
const resetPositionScaleButton = document.getElementById('resetPositionScaleButton');

// Annotations
const drawBtn = document.getElementById('drawBtn');
const textBtn = document.getElementById('textBtn');
const undoBtn = document.getElementById('undoBtn');
const colorPalette = document.getElementById('colorPalette');
const toolStatus = document.getElementById('toolStatus');

const statusText = document.getElementById('status');
const uploadStatus = document.getElementById('uploadStatus');

// --- State ---
let video1Ready = false;
let video2Ready = false;
let isPlaying1 = false;
let isPlaying2 = false;

// Transforms (Independent for each video)
let transform1 = { scale: 1.0, offsetX: 0, offsetY: 0 };
let transform2 = { scale: 1.0, offsetX: 0, offsetY: 0 };

// Trimming
let trim1 = { start: 0, end: null }; // end is duration
let trim2 = { start: 0, end: null };

// Interaction Modes
const MODE_NONE = 'none';
const MODE_MOVE_V1 = 'move_v1';
const MODE_MOVE_V2 = 'move_v2';
const MODE_DRAW = 'draw';
const MODE_TEXT = 'text';
let currentMode = MODE_NONE;

// Annotations
let annotations = []; // { type: 'line'|'text', color, points: [] or content/x/y }
let currentStroke = null;
let selectedColor = '#ff3b30';

// AI State
let analyze1 = false, analyze2 = false;
let pose1 = null, pose2 = null;
let results1 = null, results2 = null;
let loading1 = false, loading2 = false;

// Touch/Transform Cache
let initialTouchData = { x: 0, y: 0, scale: 1, offsetX: 0, offsetY: 0, distance: 0 };
let isDragging = false;

// --- Setup Event Listeners ---

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

// Playback Controls
playPauseButton1.addEventListener('click', () => togglePlayPause(video1, playPauseButton1));
playPauseButton2.addEventListener('click', () => togglePlayPause(video2, playPauseButton2));
document.getElementById('playAllButton').addEventListener('click', playAllVideos);
document.getElementById('pauseAllButton').addEventListener('click', pauseAllVideos);
document.getElementById('syncAllStartsButton').addEventListener('click', syncAllStarts);

document.getElementById('restartButton1').addEventListener('click', () => { video1.currentTime = trim1.start; });
document.getElementById('restartButton2').addEventListener('click', () => { video2.currentTime = trim2.start; });

// Sliders
opacitySlider.addEventListener('input', drawFrame);
timeSlider1.addEventListener('input', () => { video1.currentTime = parseFloat(timeSlider1.value); drawFrame(); });
timeSlider2.addEventListener('input', () => { video2.currentTime = parseFloat(timeSlider2.value); drawFrame(); });

// Transform Controls
moveV1Btn.addEventListener('click', () => setMode(MODE_MOVE_V1));
moveV2Btn.addEventListener('click', () => setMode(MODE_MOVE_V2));
resetPositionScaleButton.addEventListener('click', () => {
    transform2 = { scale: 1.0, offsetX: 0, offsetY: 0 };
    drawFrame();
});

// Trimming Controls
setStart1.addEventListener('click', () => setTrimStart(1));
setEnd1.addEventListener('click', () => setTrimEnd(1));
setStart2.addEventListener('click', () => setTrimStart(2));
setEnd2.addEventListener('click', () => setTrimEnd(2));

// AI Controls
boneBtn1.addEventListener('click', () => toggleAI(1));
boneBtn2.addEventListener('click', () => toggleAI(2));

// Annotation Controls
drawBtn.addEventListener('click', () => setMode(MODE_DRAW));
textBtn.addEventListener('click', () => setMode(MODE_TEXT));
undoBtn.addEventListener('click', () => {
    annotations.pop();
    drawFrame();
});

// Color Picker
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedColor = e.target.getAttribute('data-color');
    });
});

// Touch/Mouse Events on Canvas
videoCanvas.addEventListener('mousedown', handlePointerStart);
videoCanvas.addEventListener('mousemove', handlePointerMove);
videoCanvas.addEventListener('mouseup', handlePointerEnd);
videoCanvas.addEventListener('touchstart', handlePointerStart, { passive: false });
videoCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
videoCanvas.addEventListener('touchend', handlePointerEnd);

// Resize
window.addEventListener('resize', adjustCanvasSize);

// --- Mode Management ---

function setMode(mode) {
    // If clicking same mode, toggle off
    if (currentMode === mode) {
        currentMode = MODE_NONE;
    } else {
        currentMode = mode;
    }

    // UI Updates
    moveV1Btn.classList.toggle('active', currentMode === MODE_MOVE_V1);
    moveV2Btn.classList.toggle('active', currentMode === MODE_MOVE_V2);
    drawBtn.classList.toggle('active', currentMode === MODE_DRAW);
    textBtn.classList.toggle('active', currentMode === MODE_TEXT);

    // Show/Hide Palette
    if (currentMode === MODE_DRAW || currentMode === MODE_TEXT) {
        colorPalette.style.display = 'flex';
        toolStatus.textContent = currentMode === MODE_DRAW ? "Sketching..." : "Tap to add text";
    } else {
        colorPalette.style.display = 'none';
        toolStatus.textContent = "";
    }
}

// --- Video Loading & Setup ---

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
        pauseAllVideos();
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
        statusText.textContent = `Loading Video ${videoNum}...`;
    }
}

function setupVideo(videoElement, videoNum) {
    if (videoNum === 1) { video1Ready = true; trim1.end = videoElement.duration; }
    else { video2Ready = true; trim2.end = videoElement.duration; }

    const slider = (videoNum === 1) ? timeSlider1 : timeSlider2;
    slider.max = videoElement.duration;
    slider.value = 0;
    
    updateSliderVisuals(videoNum);

    if (video1Ready && video2Ready) {
        uploadStatus.textContent = "Videos Loaded";
        adjustCanvasSize();
        requestAnimationFrame(drawLoop);
    }
}

function adjustCanvasSize() {
    if (!video1Ready || !video2Ready) return;
    const containerWidth = document.querySelector('.container').clientWidth - 20; 
    const aspectRatio = video1.videoWidth / video1.videoHeight;
    videoCanvas.width = containerWidth;
    videoCanvas.height = containerWidth / aspectRatio;
    drawFrame();
}

// --- Trimming Logic ---

function handleTimeUpdate(video, num) {
    const slider = num === 1 ? timeSlider1 : timeSlider2;
    const valSpan = num === 1 ? timeValue1 : timeValue2;
    const trim = num === 1 ? trim1 : trim2;

    // Loop logic
    if (video.currentTime >= trim.end) {
        video.currentTime = trim.start;
        // If it wasn't playing, don't auto-play (prevents glitches when scrubbing)
        if (num === 1 && !isPlaying1) video.pause();
        if (num === 2 && !isPlaying2) video.pause();
    }
    
    slider.value = video.currentTime;
    valSpan.textContent = video.currentTime.toFixed(2) + 's';
}

function setTrimStart(num) {
    const vid = num === 1 ? video1 : video2;
    const trim = num === 1 ? trim1 : trim2;
    trim.start = vid.currentTime;
    if (trim.start >= trim.end) trim.start = 0; // Safety
    updateSliderVisuals(num);
    statusText.textContent = `V${num} Start set to ${trim.start.toFixed(2)}s`;
}

function setTrimEnd(num) {
    const vid = num === 1 ? video1 : video2;
    const trim = num === 1 ? trim1 : trim2;
    trim.end = vid.currentTime;
    if (trim.end <= trim.start) trim.end = vid.duration; // Safety
    updateSliderVisuals(num);
    statusText.textContent = `V${num} End set to ${trim.end.toFixed(2)}s`;
}

function updateSliderVisuals(num) {
    const slider = num === 1 ? timeSlider1 : timeSlider2;
    const trim = num === 1 ? trim1 : trim2;
    const max = slider.max || 100;
    
    const startPct = (trim.start / max) * 100;
    const endPct = (trim.end / max) * 100;
    
    // Create CSS gradient to show active range
    // Gray (0 to start), Blue (start to end), Gray (end to 100)
    slider.style.background = `linear-gradient(to right, 
        #555 0%, 
        #555 ${startPct}%, 
        var(--primary-blue) ${startPct}%, 
        var(--primary-blue) ${endPct}%, 
        #555 ${endPct}%, 
        #555 100%)`;
}

// --- Playback ---

function togglePlayPause(video, btn) {
    if (video.paused) {
        video.play();
        if(video === video1) isPlaying1 = true; else isPlaying2 = true;
        btn.textContent = '⏸';
    } else {
        video.pause();
        if(video === video1) isPlaying1 = false; else isPlaying2 = false;
        btn.textContent = '▶';
    }
}

function playAllVideos() {
    if (video1Ready) togglePlayPause(video1, playPauseButton1);
    if (video2Ready) togglePlayPause(video2, playPauseButton2);
}

function pauseAllVideos() {
    video1.pause(); isPlaying1 = false; playPauseButton1.textContent = '▶';
    video2.pause(); isPlaying2 = false; playPauseButton2.textContent = '▶';
}

function syncAllStarts() {
    video1.currentTime = trim1.start;
    video2.currentTime = trim2.start;
    pauseAllVideos();
    drawFrame();
}

// --- Touch/Pointer Logic (Unified) ---

function getPointerPos(e) {
    const rect = videoCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        clientX: clientX,
        clientY: clientY
    };
}

function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handlePointerStart(e) {
    if (e.target !== videoCanvas) return;
    // Allow default browser zoom ONLY if we are NOT in a canvas interaction mode
    // However, if we are in Draw/Move, we must prevent default to stop scrolling
    if (currentMode !== MODE_NONE) {
        e.preventDefault();
    }

    const pos = getPointerPos(e);
    const touches = e.touches;

    if (currentMode === MODE_TEXT) {
        const text = prompt("Enter text:");
        if (text) {
            annotations.push({ type: 'text', content: text, x: pos.x, y: pos.y, color: selectedColor });
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

    // Move/Scale Modes
    if (currentMode === MODE_MOVE_V1 || currentMode === MODE_MOVE_V2) {
        const activeTransform = currentMode === MODE_MOVE_V1 ? transform1 : transform2;
        
        if (touches && touches.length === 2) {
            isDragging = false;
            initialTouchData.distance = getDistance(touches);
            initialTouchData.scale = activeTransform.scale;
        } else {
            isDragging = true;
            initialTouchData.x = pos.clientX;
            initialTouchData.y = pos.clientY;
            initialTouchData.offsetX = activeTransform.offsetX;
            initialTouchData.offsetY = activeTransform.offsetY;
        }
    }
}

function handlePointerMove(e) {
    if (currentMode === MODE_NONE || e.target !== videoCanvas) return;
    e.preventDefault(); // Stop scrolling when interacting

    const pos = getPointerPos(e);
    const touches = e.touches;

    if (currentMode === MODE_DRAW && isDragging) {
        currentStroke.points.push({x: pos.x, y: pos.y});
        drawFrame(); // Re-render to show line immediately
        return;
    }

    if ((currentMode === MODE_MOVE_V1 || currentMode === MODE_MOVE_V2)) {
        const activeTransform = currentMode === MODE_MOVE_V1 ? transform1 : transform2;

        if (touches && touches.length === 2 && initialTouchData.distance > 0) {
            // Pinch Zoom
            const dist = getDistance(touches);
            const scaleFactor = dist / initialTouchData.distance;
            let newScale = initialTouchData.scale * scaleFactor;
            activeTransform.scale = Math.max(0.1, Math.min(5.0, newScale));
            drawFrame();
        } else if (isDragging) {
            // Pan
            const deltaX = pos.clientX - initialTouchData.x;
            const deltaY = pos.clientY - initialTouchData.y;
            activeTransform.offsetX = initialTouchData.offsetX + deltaX;
            activeTransform.offsetY = initialTouchData.offsetY + deltaY;
            drawFrame();
        }
    }
}

function handlePointerEnd(e) {
    isDragging = false;
    currentStroke = null;
    initialTouchData.distance = 0;
}

// --- Drawing & Rendering ---

function drawLoop() {
    if (video1Ready && video2Ready) {
        processAI();
        drawFrame();
    }
    requestAnimationFrame(drawLoop);
}

function drawFrame() {
    if (!video1Ready || !video2Ready) return;

    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    const centerX = videoCanvas.width / 2;
    const centerY = videoCanvas.height / 2;

    // Helper to draw video with transform
    const drawLayer = (vid, transform, opacity) => {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(centerX + transform.offsetX, centerY + transform.offsetY);
        ctx.scale(transform.scale, transform.scale);
        ctx.translate(-centerX, -centerY);
        ctx.drawImage(vid, 0, 0, videoCanvas.width, videoCanvas.height);
        ctx.restore();
    };

    // 1. Draw Reference Video
    drawLayer(video1, transform1, 1.0);
    
    // 2. Draw Reference AI Skeleton
    if (analyze1 && results1 && results1.poseLandmarks) {
        drawSkeletonChain(ctx, results1.poseLandmarks, 'white', transform1);
    }

    // 3. Draw Attempt Video
    drawLayer(video2, transform2, parseFloat(opacitySlider.value));

    // 4. Draw Attempt AI Skeleton
    if (analyze2 && results2 && results2.poseLandmarks) {
        drawSkeletonChain(ctx, results2.poseLandmarks, '#FFFF00', transform2);
    }

    // 5. Draw Annotations (Fixed Overlay)
    drawAnnotations();
}

function drawAnnotations() {
    ctx.globalAlpha = 1.0;
    annotations.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3;
        
        if (item.type === 'text') {
            ctx.font = "bold 20px Arial";
            ctx.fillText(item.content, item.x, item.y);
        } else if (item.type === 'line') {
            ctx.beginPath();
            if (item.points.length > 0) {
                ctx.moveTo(item.points[0].x, item.points[0].y);
                for (let i = 1; i < item.points.length; i++) {
                    ctx.lineTo(item.points[i].x, item.points[i].y);
                }
            }
            ctx.stroke();
        }
    });
}

function drawSkeletonChain(ctx, landmarks, color, transform) {
    const leftChain = [15, 13, 11, 23, 25, 27];
    const rightChain = [16, 14, 12, 24, 26, 28];
    const centerX = videoCanvas.width / 2;
    const centerY = videoCanvas.height / 2;

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;

    const draw = (indices) => {
        ctx.beginPath();
        let first = true;
        for (let i of indices) {
            const lm = landmarks[i];
            if (lm && lm.visibility > 0.5) {
                // Map to Video Size
                let x = lm.x * videoCanvas.width;
                let y = lm.y * videoCanvas.height;

                // Apply Transforms MANUALLY to match video layer
                let cx = x - centerX;
                let cy = y - centerY;
                x = (cx * transform.scale) + centerX + transform.offsetX;
                y = (cy * transform.scale) + centerY + transform.offsetY;

                if (first) { ctx.moveTo(x, y); first = false; }
                else ctx.lineTo(x, y);
            } else first = true;
        }
        ctx.stroke();
    };
    draw(leftChain);
    draw(rightChain);
}

// --- AI Logic (Simplified for brevity) ---
function createPoseModel(cb) {
    const pose = new Pose({locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
    pose.setOptions({modelComplexity: 1, smoothLandmarks: true});
    pose.onResults(cb);
    return pose;
}

async function toggleAI(num) {
    const isV1 = num === 1;
    const btn = isV1 ? boneBtn1 : boneBtn2;
    const isActive = isV1 ? analyze1 : analyze2;

    if (isActive) {
        if(isV1) { analyze1 = false; results1 = null; } else { analyze2 = false; results2 = null; }
        btn.classList.remove('active');
    } else {
        if (!video1Ready) return;
        btn.classList.add('loading');
        aiLoader.style.display = 'block';
        setTimeout(async () => {
            if(isV1) {
                if(!pose1) pose1 = createPoseModel(r => results1 = r);
                loading1 = true; await pose1.send({image: video1}); analyze1 = true; loading1 = false;
            } else {
                if(!pose2) pose2 = createPoseModel(r => results2 = r);
                loading2 = true; await pose2.send({image: video2}); analyze2 = true; loading2 = false;
            }
            btn.classList.remove('loading'); btn.classList.add('active'); aiLoader.style.display = 'none';
        }, 50);
    }
}

async function processAI() {
    if (analyze1 && pose1 && !loading1) await pose1.send({image: video1});
    if (analyze2 && pose2 && !loading2) await pose2.send({image: video2});
}