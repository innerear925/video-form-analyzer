// --- DOM Elements ---
const fileInput1 = document.getElementById('fileInput1');
const fileInput2 = document.getElementById('fileInput2');
const video1 = document.getElementById('video1');
const video2 = document.getElementById('video2');
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');

const fileName1 = document.getElementById('fileName1');
const fileName2 = document.getElementById('fileName2');

const opacitySlider = document.getElementById('opacitySlider');

const timeSlider1 = document.getElementById('timeSlider1');
const timeValue1 = document.getElementById('timeValue1');
const playPauseButton1 = document.getElementById('playPauseButton1');
const restartButton1 = document.getElementById('restartButton1');

const timeSlider2 = document.getElementById('timeSlider2');
const timeValue2 = document.getElementById('timeValue2');
const playPauseButton2 = document.getElementById('playPauseButton2');
const restartButton2 = document.getElementById('restartButton2');
const resetPositionScaleButton = document.getElementById('resetPositionScaleButton');

const playAllButton = document.getElementById('playAllButton');
const pauseAllButton = document.getElementById('pauseAllButton');
const syncAllStartsButton = document.getElementById('syncAllStartsButton');
const toggleAnalysisButton = document.getElementById('toggleAnalysisButton');

const uploadStatus = document.getElementById('uploadStatus');
const statusText = document.getElementById('status');

let animationFrameId = null;

// --- State Variables ---
let isPlaying1 = false;
let isPlaying2 = false;
let video1Ready = false;
let video2Ready = false;

// --- Touch/Transform State ---
let lastDistance = null;
let currentScale = 1.0;
let currentOffsetX = 0;
let currentOffsetY = 0;
let initialTouchData = { x: 0, y: 0, scale: 1, offsetX: 0, offsetY: 0, distance: 0 };
let isDragging = false;

// --- AI Analysis State ---
let isAnalysisEnabled = false;
let pose1 = null;
let pose2 = null;
let results1 = null;
let results2 = null;
let aiLoading = false;

// --- Event Listeners ---

fileInput1.addEventListener('change', (event) => {
    if(event.target.files[0]) {
        fileName1.textContent = event.target.files[0].name;
        loadVideo(event, video1, 1);
    }
});

fileInput2.addEventListener('change', (event) => {
    if(event.target.files[0]) {
        fileName2.textContent = event.target.files[0].name;
        loadVideo(event, video2, 2);
    }
});

video1.addEventListener('loadedmetadata', () => setupVideo(video1, 1));
video2.addEventListener('loadedmetadata', () => setupVideo(video2, 2));

video1.addEventListener('timeupdate', () => updateTimeSlider(video1, timeSlider1, timeValue1));
video2.addEventListener('timeupdate', () => updateTimeSlider(video2, timeSlider2, timeValue2));

video1.addEventListener('ended', () => { isPlaying1 = false; playPauseButton1.textContent = '▶'; });
video2.addEventListener('ended', () => { isPlaying2 = false; playPauseButton2.textContent = '▶'; });

opacitySlider.addEventListener('input', drawFrame);

playPauseButton1.addEventListener('click', () => togglePlayPauseIndividual(video1, playPauseButton1, 1));
restartButton1.addEventListener('click', () => restartVideo(video1, playPauseButton1, 1));

playPauseButton2.addEventListener('click', () => togglePlayPauseIndividual(video2, playPauseButton2, 2));
restartButton2.addEventListener('click', () => restartVideo(video2, playPauseButton2, 2));
resetPositionScaleButton.addEventListener('click', resetPositionAndScale);

timeSlider1.addEventListener('input', () => scrubVideo(video1, timeSlider1));
timeSlider2.addEventListener('input', () => scrubVideo(video2, timeSlider2));

playAllButton.addEventListener('click', playAllVideos);
pauseAllButton.addEventListener('click', pauseAllVideos);
syncAllStartsButton.addEventListener('click', syncAllStarts);

// Toggle AI Analysis
toggleAnalysisButton.addEventListener('click', toggleAnalysis);

window.addEventListener('resize', adjustCanvasSize);

videoCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
videoCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
videoCanvas.addEventListener('touchend', handleTouchEnd);


// --- Core Functions ---

function loadVideo(event, videoElement, videoNum) {
    const file = event.target.files[0];
    if (file) {
        if (videoElement.src && videoElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(videoElement.src);
        }
        const url = URL.createObjectURL(file);
        videoElement.src = url;
        videoElement.load();
        
        statusText.textContent = `Loading Video ${videoNum}...`;
        
        if (videoNum === 1) { video1Ready = false; results1 = null; }
        else { video2Ready = false; results2 = null; }
        
        pauseAllVideos();
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    }
}

function setupVideo(videoElement, videoNum) {
    if (videoNum === 1) video1Ready = true;
    else video2Ready = true;

    const timeSlider = (videoNum === 1) ? timeSlider1 : timeSlider2;
    timeSlider.max = videoElement.duration;
    timeSlider.value = 0;
    
    updateTimeSlider(videoElement, timeSlider, (videoNum === 1) ? timeValue1 : timeValue2);

    if (video1Ready && video2Ready) {
        statusText.textContent = 'Ready to Compare.';
        uploadStatus.textContent = 'Videos loaded.';
        adjustCanvasSize();
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(drawLoop);
        }
        drawFrame();
    }
}

function adjustCanvasSize() {
    if (!video1Ready || !video2Ready || !video1.videoWidth || !video2.videoWidth) return;
    const containerWidth = document.querySelector('.container').clientWidth - 20; 
    const aspectRatio = video1.videoWidth / video1.videoHeight;
    videoCanvas.width = containerWidth;
    videoCanvas.height = containerWidth / aspectRatio;
    drawFrame();
}

function updateTimeSlider(videoElement, slider, valueSpan) {
    if (!slider || !valueSpan) return;
    slider.value = videoElement.currentTime;
    valueSpan.textContent = videoElement.currentTime.toFixed(2) + 's';
}

function scrubVideo(videoElement, slider) {
    videoElement.currentTime = parseFloat(slider.value);
    drawFrame();
}

function togglePlayPauseIndividual(videoElement, playPauseButton, videoNum) {
    if (!video1Ready || !video2Ready) return;
    if (videoElement.paused) {
        videoElement.play().then(() => {
            if (videoElement === video1) isPlaying1 = true;
            else isPlaying2 = true;
            playPauseButton.textContent = '⏸';
        });
    } else {
        videoElement.pause();
        if (videoElement === video1) isPlaying1 = false;
        else isPlaying2 = false;
        playPauseButton.textContent = '▶';
    }
}

function restartVideo(videoElement, playPauseButton, videoNum) {
    videoElement.pause();
    videoElement.currentTime = 0;
    if (videoElement === video1) isPlaying1 = false;
    else isPlaying2 = false;
    playPauseButton.textContent = '▶';
    drawFrame();
}

function resetPositionAndScale() {
    currentOffsetX = 0;
    currentOffsetY = 0;
    currentScale = 1.0;
    drawFrame();
    statusText.textContent = 'Position Reset';
}

function playAllVideos() {
    if (!video1Ready || !video2Ready) return;
    video1.play();
    video2.play();
    isPlaying1 = true;
    isPlaying2 = true;
    playPauseButton1.textContent = '⏸';
    playPauseButton2.textContent = '⏸';
}

function pauseAllVideos() {
    video1.pause();
    video2.pause();
    isPlaying1 = false;
    isPlaying2 = false;
    playPauseButton1.textContent = '▶';
    playPauseButton2.textContent = '▶';
}

function syncAllStarts() {
    pauseAllVideos();
    video1.currentTime = 0;
    video2.currentTime = 0;
    resetPositionAndScale();
    drawFrame();
}

// --- AI Analysis Logic ---

async function initPose() {
    if (pose1 && pose2) return; // Already initialized

    aiLoading = true;
    statusText.textContent = "Loading AI models... (this may take a moment)";
    toggleAnalysisButton.disabled = true;

    try {
        const createPose = () => {
            const pose = new Pose({locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }});
            pose.setOptions({
                modelComplexity: 1, // 0=Lite, 1=Full, 2=Heavy. 1 is good balance.
                smoothLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            return pose;
        };

        pose1 = createPose();
        pose1.onResults(onResults1);

        pose2 = createPose();
        pose2.onResults(onResults2);

        statusText.textContent = "AI Ready. Analysis Active.";
        toggleAnalysisButton.disabled = false;
        aiLoading = false;
        
    } catch (e) {
        console.error(e);
        statusText.textContent = "Error loading AI.";
        aiLoading = false;
        isAnalysisEnabled = false;
        toggleAnalysisButton.classList.remove('active');
        toggleAnalysisButton.disabled = false;
    }
}

function toggleAnalysis() {
    if (!video1Ready || !video2Ready) {
        statusText.textContent = "Load videos first.";
        return;
    }

    isAnalysisEnabled = !isAnalysisEnabled;
    
    if (isAnalysisEnabled) {
        toggleAnalysisButton.classList.add('active');
        if (!pose1) {
            initPose();
        } else {
            statusText.textContent = "Analysis Active.";
        }
    } else {
        toggleAnalysisButton.classList.remove('active');
        statusText.textContent = "Analysis Off.";
        // Clear results to stop drawing lines immediately
        results1 = null;
        results2 = null; 
        drawFrame();
    }
}

function onResults1(results) {
    results1 = results;
}

function onResults2(results) {
    results2 = results;
}

// Send frames to AI for processing
async function processAI() {
    if (!isAnalysisEnabled || aiLoading || !pose1 || !pose2) return;
    
    // We send data, but don't await strictly to avoid blocking UI too much,
    // though MediaPipe is async.
    await pose1.send({image: video1});
    await pose2.send({image: video2});
}

function drawLoop() {
    if (video1Ready && video2Ready) {
        // Trigger AI processing if enabled
        if (isAnalysisEnabled) {
            processAI();
        }
        drawFrame();
    }
    animationFrameId = requestAnimationFrame(drawLoop);
}

// Helper to draw the specific chain: Wrist->Elbow->Shoulder->Hip->Knee->Ankle
function drawSkeletonChain(ctx, landmarks, scaleX, scaleY, offsetX, offsetY, scale, videoScaleX, videoScaleY) {
    if (!landmarks) return;

    // Indices for Left side chain and Right side chain
    // 11:L_Shoulder, 13:L_Elbow, 15:L_Wrist, 23:L_Hip, 25:L_Knee, 27:L_Ankle
    // 12:R_Shoulder, 14:R_Elbow, 16:R_Wrist, 24:R_Hip, 26:R_Knee, 28:R_Ankle
    const leftChain = [15, 13, 11, 23, 25, 27];
    const rightChain = [16, 14, 12, 24, 26, 28];

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "white";

    const drawChain = (indices) => {
        ctx.beginPath();
        let first = true;
        
        for (let i of indices) {
            const lm = landmarks[i];
            if (lm && lm.visibility > 0.5) {
                // Calculate position based on video dimensions
                let x = lm.x * videoScaleX;
                let y = lm.y * videoScaleY;

                // Apply Transformations (Zoom/Pan/Scale)
                // Logic: (Coord * scale) + offset + centerShift
                // This math must match the ctx.transform used for the video layer
                if (scale !== 1.0 || offsetX !== 0 || offsetY !== 0) {
                     const centerX = videoCanvas.width / 2;
                     const centerY = videoCanvas.height / 2;
                     
                     // 1. Center alignment shift (done in drawFrame)
                     // 2. Translate to center, Scale, Translate back
                     
                     // Apply Scale
                     let centeredX = x - centerX;
                     let centeredY = y - centerY;
                     
                     x = (centeredX * scale) + centerX + offsetX;
                     y = (centeredY * scale) + centerY + offsetY;
                }

                if (first) {
                    ctx.moveTo(x, y);
                    first = false;
                } else {
                    ctx.lineTo(x, y);
                }
            } else {
                first = true; // Break line if point invisible
            }
        }
        ctx.stroke();
    };

    drawChain(leftChain);
    drawChain(rightChain);
}


function drawFrame() {
    if (!video1Ready || !video2Ready) return;

    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

    // --- Layer 1: Video 1 (Reference) ---
    ctx.drawImage(video1, 0, 0, videoCanvas.width, videoCanvas.height);
    
    // Draw Skeleton 1 (No zoom transforms usually on Ref video in this UI)
    if (isAnalysisEnabled && results1 && results1.poseLandmarks) {
        drawSkeletonChain(ctx, results1.poseLandmarks, 1, 1, 0, 0, 1.0, videoCanvas.width, videoCanvas.height);
    }

    // --- Layer 2: Video 2 (Attempt) ---
    ctx.save();
    ctx.globalAlpha = parseFloat(opacitySlider.value);

    const centerX = videoCanvas.width / 2;
    const centerY = videoCanvas.height / 2;
    
    // Apply Transform for Video 2
    ctx.translate(centerX + currentOffsetX, centerY + currentOffsetY);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-centerX, -centerY);

    ctx.drawImage(video2, 0, 0, videoCanvas.width, videoCanvas.height);
    ctx.restore();

    // Draw Skeleton 2 (MUST Match Transform of Video 2)
    // We pass the transform values to the helper to calculate coord positions manually
    // because drawing lines on a transformed context with globalAlpha affects the line opacity too.
    // We want SOLID white lines on top of semi-transparent video.
    if (isAnalysisEnabled && results2 && results2.poseLandmarks) {
        // We do NOT use globalAlpha for the skeleton. It should be solid.
        drawSkeletonChain(
            ctx, 
            results2.poseLandmarks, 
            1, 1, 
            currentOffsetX, 
            currentOffsetY, 
            currentScale,
            videoCanvas.width, 
            videoCanvas.height
        );
    }
}


// --- Touch Logic ---

function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleTouchStart(event) {
    if (!video1Ready || !video2Ready) return;
    event.preventDefault();

    if (event.touches.length === 2) {
        initialTouchData.distance = getDistance(event.touches);
        initialTouchData.scale = currentScale;
        initialTouchData.offsetX = currentOffsetX;
        initialTouchData.offsetY = currentOffsetY;
        isDragging = false;
    } else if (event.touches.length === 1) {
        initialTouchData.x = event.touches[0].clientX;
        initialTouchData.y = event.touches[0].clientY;
        initialTouchData.offsetX = currentOffsetX;
        initialTouchData.offsetY = currentOffsetY;
        isDragging = true;
    }
}

function handleTouchMove(event) {
    if (!video1Ready || !video2Ready) return;
    event.preventDefault();

    if (event.touches.length === 2 && initialTouchData.distance > 0) {
        const currentDistance = getDistance(event.touches);
        const scaleFactor = currentDistance / initialTouchData.distance;
        let newScale = initialTouchData.scale * scaleFactor;
        newScale = Math.max(0.5, Math.min(4.0, newScale));
        currentScale = newScale;
    } else if (event.touches.length === 1 && isDragging) {
        const touch = event.touches[0];
        const deltaX = touch.clientX - initialTouchData.x;
        const deltaY = touch.clientY - initialTouchData.y;
        currentOffsetX = initialTouchData.offsetX + deltaX;
        currentOffsetY = initialTouchData.offsetY + deltaY;
    }
}

function handleTouchEnd(event) {
    if (event.touches.length < 2) initialTouchData.distance = 0;
    if (event.touches.length === 0) isDragging = false;
}