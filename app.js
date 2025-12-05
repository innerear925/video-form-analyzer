// --- DOM Elements ---
const fileInput1 = document.getElementById('fileInput1');
const fileInput2 = document.getElementById('fileInput2');
const video1 = document.getElementById('video1');
const video2 = document.getElementById('video2');
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');

// Labels for file names (New in this UI)
const fileName1 = document.getElementById('fileName1');
const fileName2 = document.getElementById('fileName2');

// Controls
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


// --- Event Listeners ---

// 1. File Uploads (Updated for new UI to show filename)
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

// 2. Video Metadata Loaded
video1.addEventListener('loadedmetadata', () => setupVideo(video1, 1));
video2.addEventListener('loadedmetadata', () => setupVideo(video2, 2));

// 3. Time Updates (Sync sliders to video)
video1.addEventListener('timeupdate', () => updateTimeSlider(video1, timeSlider1, timeValue1));
video2.addEventListener('timeupdate', () => updateTimeSlider(video2, timeSlider2, timeValue2));

// 4. Video Ended
video1.addEventListener('ended', () => { isPlaying1 = false; playPauseButton1.textContent = '▶'; });
video2.addEventListener('ended', () => { isPlaying2 = false; playPauseButton2.textContent = '▶'; });

// 5. Controls
opacitySlider.addEventListener('input', drawFrame);

// Individual Controls
playPauseButton1.addEventListener('click', () => togglePlayPauseIndividual(video1, playPauseButton1, 1));
restartButton1.addEventListener('click', () => restartVideo(video1, playPauseButton1, 1));

playPauseButton2.addEventListener('click', () => togglePlayPauseIndividual(video2, playPauseButton2, 2));
restartButton2.addEventListener('click', () => restartVideo(video2, playPauseButton2, 2));
resetPositionScaleButton.addEventListener('click', resetPositionAndScale);

// Scrubbing
timeSlider1.addEventListener('input', () => scrubVideo(video1, timeSlider1));
timeSlider2.addEventListener('input', () => scrubVideo(video2, timeSlider2));

// Global Controls
playAllButton.addEventListener('click', playAllVideos);
pauseAllButton.addEventListener('click', pauseAllVideos);
syncAllStartsButton.addEventListener('click', syncAllStarts);

// Resize
window.addEventListener('resize', adjustCanvasSize);

// 6. Touch Events (Canvas)
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
        
        // Reset readiness to force recalculation
        if (videoNum === 1) video1Ready = false;
        else video2Ready = false;
        
        pauseAllVideos();
        // Clear canvas temporarily
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    }
}

function setupVideo(videoElement, videoNum) {
    if (videoNum === 1) video1Ready = true;
    else video2Ready = true;

    // Set slider max to video duration
    const timeSlider = (videoNum === 1) ? timeSlider1 : timeSlider2;
    timeSlider.max = videoElement.duration;
    timeSlider.value = 0;
    
    // Update text display
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

    // Logic to fit canvas within screen width while maintaining aspect ratio
    const viewportWidth = document.querySelector('.container').clientWidth - 20; // Account for padding
    const aspectRatio = video1.videoWidth / video1.videoHeight;
    
    videoCanvas.width = viewportWidth;
    videoCanvas.height = viewportWidth / aspectRatio;
    
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
        }).catch(err => console.error(err));
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

function drawLoop() {
    if (video1Ready && video2Ready) {
        drawFrame();
    }
    animationFrameId = requestAnimationFrame(drawLoop);
}

function drawFrame() {
    if (!video1Ready || !video2Ready) return;

    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

    // Draw Video 1 (Reference) - Bottom Layer
    ctx.drawImage(video1, 0, 0, videoCanvas.width, videoCanvas.height);

    // Draw Video 2 (Attempt) - Top Layer with Opacity & Transform
    ctx.save();
    ctx.globalAlpha = parseFloat(opacitySlider.value);

    // Math to center the scaling
    const centerX = videoCanvas.width / 2;
    const centerY = videoCanvas.height / 2;
    
    ctx.translate(centerX + currentOffsetX, centerY + currentOffsetY);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-centerX, -centerY);

    ctx.drawImage(video2, 0, 0, videoCanvas.width, videoCanvas.height);
    
    ctx.restore();
}


// --- Touch Logic (Pinch to Zoom / Drag to Pan) ---

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
        
        // Limit zoom
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
    if (event.touches.length < 2) {
        initialTouchData.distance = 0;
    }
    if (event.touches.length === 0) {
        isDragging = false;
    }
}