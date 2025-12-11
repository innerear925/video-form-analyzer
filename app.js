// --- DOM Elements ---
const fileInput1 = document.getElementById('fileInput1');
const fileInput2 = document.getElementById('fileInput2');
const video1 = document.getElementById('video1');
const video2 = document.getElementById('video2');
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');
const aiLoader = document.getElementById('aiLoader');

const fileName1 = document.getElementById('fileName1');
const fileName2 = document.getElementById('fileName2');

const opacitySlider = document.getElementById('opacitySlider');

// Video 1 Controls
const timeSlider1 = document.getElementById('timeSlider1');
const timeValue1 = document.getElementById('timeValue1');
const playPauseButton1 = document.getElementById('playPauseButton1');
const restartButton1 = document.getElementById('restartButton1');
const boneBtn1 = document.getElementById('boneBtn1');

// Video 2 Controls
const timeSlider2 = document.getElementById('timeSlider2');
const timeValue2 = document.getElementById('timeValue2');
const playPauseButton2 = document.getElementById('playPauseButton2');
const restartButton2 = document.getElementById('restartButton2');
const resetPositionScaleButton = document.getElementById('resetPositionScaleButton');
const boneBtn2 = document.getElementById('boneBtn2');

// Global Controls
const playAllButton = document.getElementById('playAllButton');
const pauseAllButton = document.getElementById('pauseAllButton');
const syncAllStartsButton = document.getElementById('syncAllStartsButton');

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
let analyze1 = false;
let analyze2 = false;
let pose1 = null;
let pose2 = null;
let results1 = null;
let results2 = null;
let loading1 = false;
let loading2 = false;

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

// Separate AI Toggles
boneBtn1.addEventListener('click', () => toggleAI(1));
boneBtn2.addEventListener('click', () => toggleAI(2));

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
        
        if (videoNum === 1) { 
            video1Ready = false; 
            results1 = null; 
            analyze1 = false;
            boneBtn1.classList.remove('active', 'loading');
        } else { 
            video2Ready = false; 
            results2 = null; 
            analyze2 = false;
            boneBtn2.classList.remove('active', 'loading');
        }
        
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

function createPoseModel(callback) {
    const pose = new Pose({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }});
    pose.setOptions({
        modelComplexity: 1, 
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    pose.onResults(callback);
    return pose;
}

async function toggleAI(num) {
    const isV1 = (num === 1);
    const btn = isV1 ? boneBtn1 : boneBtn2;
    const currentState = isV1 ? analyze1 : analyze2;
    
    if (currentState) {
        if(isV1) { analyze1 = false; results1 = null; }
        else { analyze2 = false; results2 = null; }
        btn.classList.remove('active');
        statusText.textContent = `Video ${num} Analysis OFF.`;
        drawFrame();
    } else {
        if (!video1Ready || !video2Ready) {
            statusText.textContent = "Please wait for videos to load.";
            return;
        }

        btn.classList.add('loading');
        aiLoader.style.display = 'block';
        aiLoader.textContent = `Loading AI for Video ${num}...`;
        statusText.textContent = `Initializing AI for Video ${num}...`;

        setTimeout(async () => {
            try {
                if (isV1) {
                    if (!pose1) pose1 = createPoseModel((res) => results1 = res);
                    loading1 = true;
                    await pose1.send({image: video1});
                    analyze1 = true;
                    loading1 = false;
                } else {
                    if (!pose2) pose2 = createPoseModel((res) => results2 = res);
                    loading2 = true;
                    await pose2.send({image: video2});
                    analyze2 = true;
                    loading2 = false;
                }

                btn.classList.remove('loading');
                btn.classList.add('active');
                aiLoader.style.display = 'none';
                statusText.textContent = `Video ${num} Analysis Active.`;

            } catch (err) {
                console.error(err);
                statusText.textContent = "Error loading AI. Try refreshing.";
                aiLoader.style.display = 'none';
                btn.classList.remove('loading');
            }
        }, 100);
    }
}

async function processAI() {
    if (analyze1 && pose1 && !loading1 && video1.readyState >= 2) {
        await pose1.send({image: video1});
    }
    if (analyze2 && pose2 && !loading2 && video2.readyState >= 2) {
        await pose2.send({image: video2});
    }
}

function drawLoop() {
    if (video1Ready && video2Ready) {
        processAI(); 
        drawFrame(); 
    }
    animationFrameId = requestAnimationFrame(drawLoop);
}

// Updated Helper: Accepts 'color' parameter
function drawSkeletonChain(ctx, landmarks, color, offsetX, offsetY, scale, videoScaleX, videoScaleY) {
    if (!landmarks) return;

    const leftChain = [15, 13, 11, 23, 25, 27];
    const rightChain = [16, 14, 12, 24, 26, 28];

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color; // Uses specific color

    const drawChain = (indices) => {
        ctx.beginPath();
        let first = true;
        
        for (let i of indices) {
            const lm = landmarks[i];
            if (lm && lm.visibility > 0.5) {
                let x = lm.x * videoScaleX;
                let y = lm.y * videoScaleY;

                if (scale !== 1.0 || offsetX !== 0 || offsetY !== 0) {
                     const centerX = videoCanvas.width / 2;
                     const centerY = videoCanvas.height / 2;
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
                first = true; 
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
    
    // Draw Skeleton 1: WHITE
    if (analyze1 && results1 && results1.poseLandmarks) {
        drawSkeletonChain(ctx, results1.poseLandmarks, 'white', 0, 0, 1.0, videoCanvas.width, videoCanvas.height);
    }

    // --- Layer 2: Video 2 (Attempt) ---
    ctx.save();
    ctx.globalAlpha = parseFloat(opacitySlider.value);

    const centerX = videoCanvas.width / 2;
    const centerY = videoCanvas.height / 2;
    
    ctx.translate(centerX + currentOffsetX, centerY + currentOffsetY);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-centerX, -centerY);

    ctx.drawImage(video2, 0, 0, videoCanvas.width, videoCanvas.height);
    ctx.restore();

    // Draw Skeleton 2: YELLOW (#FFFF00)
    if (analyze2 && results2 && results2.poseLandmarks) {
        drawSkeletonChain(
            ctx, 
            results2.poseLandmarks, 
            '#FFFF00', // Yellow
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