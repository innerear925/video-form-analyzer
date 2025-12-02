// Get DOM elements
const fileInput1 = document.getElementById('fileInput1');
const fileInput2 = document.getElementById('fileInput2');
const video1 = document.getElementById('video1');
const video2 = document.getElementById('video2');
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');

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

let animationFrameId = null; // To store the requestAnimationFrame ID

// --- State Variables for Playback ---
let isPlaying1 = false;
let isPlaying2 = false;

// --- Video Readiness State ---
let video1Ready = false;
let video2Ready = false;

// --- Touch Interaction State (for Video 2 transform) ---
let lastDistance = null; // Distance between two fingers for pinch-zoom
let currentScale = 1.0;
let currentOffsetX = 0;
let currentOffsetY = 0;

let initialTouchData = { x: 0, y: 0, scale: 1, offsetX: 0, offsetY: 0, distance: 0 };
let isDragging = false; // Flag for single-finger drag (pan)


// --- Event Listeners ---

// File uploads
fileInput1.addEventListener('change', (event) => loadVideo(event, video1, 1));
fileInput2.addEventListener('change', (event) => loadVideo(event, video2, 2));

// Video ready events
// 'loadeddata' is generally sufficient for drawing frames.
video1.addEventListener('loadedmetadata', () => setupVideo(video1, 1));
video2.addEventListener('loadedmetadata', () => setupVideo(video2, 2));

// Video time updates (for timeline sliders)
video1.addEventListener('timeupdate', () => updateTimeSlider(video1, timeSlider1, timeValue1));
video2.addEventListener('timeupdate', () => updateTimeSlider(video2, timeSlider2, timeValue2));

// Video ended events
video1.addEventListener('ended', () => { isPlaying1 = false; playPauseButton1.textContent = '▶ / ⏸'; });
video2.addEventListener('ended', () => { isPlaying2 = false; playPauseButton2.textContent = '▶ / ⏸'; });

// Global controls
opacitySlider.addEventListener('input', drawFrame);

// Individual video controls
playPauseButton1.addEventListener('click', () => togglePlayPauseIndividual(video1, playPauseButton1, 1));
restartButton1.addEventListener('click', () => restartVideo(video1, playPauseButton1, 1));

playPauseButton2.addEventListener('click', () => togglePlayPauseIndividual(video2, playPauseButton2, 2));
restartButton2.addEventListener('click', () => restartVideo(video2, playPauseButton2, 2));
resetPositionScaleButton.addEventListener('click', resetPositionAndScale);

// Timeline scrubbing
timeSlider1.addEventListener('input', () => scrubVideo(video1, timeSlider1));
timeSlider2.addEventListener('input', () => scrubVideo(video2, timeSlider2));

// Global play/pause/sync
playAllButton.addEventListener('click', playAllVideos);
pauseAllButton.addEventListener('click', pauseAllVideos);
syncAllStartsButton.addEventListener('click', syncAllStarts);

// Adjust canvas size on window resize
window.addEventListener('resize', adjustCanvasSize);

// --- Touch Event Listeners for Canvas (Pan and Pinch-Zoom) ---
videoCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
videoCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
videoCanvas.addEventListener('touchend', handleTouchEnd);


// --- Functions ---

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
        uploadStatus.textContent = `Video ${videoNum} loaded.`;
        
        // Reset readiness flags for this video
        if (videoNum === 1) video1Ready = false;
        else video2Ready = false;
        
        pauseAllVideos();
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    }
}

function setupVideo(videoElement, videoNum) {
    if (videoNum === 1) video1Ready = true;
    else video2Ready = true;

    statusText.textContent = `Video ${videoNum} metadata loaded.`;

    // Initialize timeline slider range
    const timeSlider = (videoNum === 1) ? timeSlider1 : timeSlider2;
    timeSlider.max = videoElement.duration;
    timeSlider.value = 0;
    updateTimeSlider(videoElement, timeSlider, (videoNum === 1) ? timeValue1 : timeValue2);

    if (video1Ready && video2Ready) {
        statusText.textContent = 'Both videos ready! Adjust controls and compare.';
        adjustCanvasSize(); // Set canvas dimensions
        if (!animationFrameId) { // Start the continuous drawing loop if not already running
            animationFrameId = requestAnimationFrame(drawLoop);
        }
        drawFrame(); // Initial draw
    }
}

function adjustCanvasSize() {
    if (!video1Ready || !video2Ready || !video1.videoWidth || !video2.videoWidth) return;

    const viewportWidth = window.innerWidth;
    const maxDesktopCanvasWidth = 900;
    const maxMobileCanvasWidth = 600;

    let targetWidth;
    if (viewportWidth < 768) {
        targetWidth = Math.min(viewportWidth - 40, maxMobileCanvasWidth);
    } else {
        targetWidth = Math.min(video1.videoWidth, maxDesktopCanvasWidth);
    }
    if (targetWidth < 300) targetWidth = 300;

    const aspectRatio = video1.videoWidth / video1.videoHeight;
    const targetHeight = targetWidth / aspectRatio;

    videoCanvas.width = targetWidth;
    videoCanvas.height = targetHeight;
    
    drawFrame();
}

function updateTimeSlider(videoElement, slider, valueSpan) {
    slider.value = videoElement.currentTime;
    valueSpan.textContent = videoElement.currentTime.toFixed(2) + 's';
}

function scrubVideo(videoElement, slider) {
    videoElement.currentTime = parseFloat(slider.value);
    // No need to pause, drawFrame will pick up the new currentTime
    drawFrame();
}

function togglePlayPauseIndividual(videoElement, playPauseButton, videoNum) {
    if (!video1Ready || !video2Ready) {
        statusText.textContent = "Please upload both videos first!";
        return;
    }

    if (videoElement.paused) {
        const playPromise = videoElement.play();
        playPromise.then(() => {
            if (videoElement === video1) isPlaying1 = true;
            else isPlaying2 = true;
            playPauseButton.textContent = '⏸';
            statusText.textContent = `Playing Video ${videoNum}.`;
        }).catch(error => {
            statusText.textContent = `Autoplay prevented for Video ${videoNum}: ${error.message}.`;
            console.error("Autoplay failed:", error);
        });
    } else {
        videoElement.pause();
        if (videoElement === video1) isPlaying1 = false;
        else isPlaying2 = false;
        playPauseButton.textContent = '▶';
        statusText.textContent = `Paused Video ${videoNum}.`;
    }
}

function restartVideo(videoElement, playPauseButton, videoNum) {
    videoElement.pause();
    videoElement.currentTime = 0;
    if (videoElement === video1) isPlaying1 = false;
    else isPlaying2 = false;
    playPauseButton.textContent = '▶';
    updateTimeSlider(videoElement, (videoNum === 1) ? timeSlider1 : timeSlider2, (videoNum === 1) ? timeValue1 : timeValue2);
    drawFrame();
    statusText.textContent = `Video ${videoNum} restarted.`;
}

function resetPositionAndScale() {
    currentOffsetX = 0;
    currentOffsetY = 0;
    currentScale = 1.0;
    drawFrame();
    statusText.textContent = 'Video 2 position and scale reset.';
}

function playAllVideos() {
    if (!video1Ready || !video2Ready) {
        statusText.textContent = "Please upload both videos first!";
        return;
    }

    const playPromise1 = video1.play();
    const playPromise2 = video2.play();

    Promise.all([playPromise1, playPromise2])
        .then(() => {
            isPlaying1 = true;
            isPlaying2 = true;
            playPauseButton1.textContent = '⏸';
            playPauseButton2.textContent = '⏸';
            statusText.textContent = 'Playing both videos.';
        })
        .catch(error => {
            statusText.textContent = `Autoplay prevented for one or both videos: ${error.message}.`;
            console.error("Autoplay failed:", error);
        });
}

function pauseAllVideos() {
    video1.pause();
    video2.pause();
    isPlaying1 = false;
    isPlaying2 = false;
    playPauseButton1.textContent = '▶';
    playPauseButton2.textContent = '▶';
    statusText.textContent = 'All videos paused.';
}

function syncAllStarts() {
    pauseAllVideos();
    video1.currentTime = 0;
    video2.currentTime = 0;
    
    resetPositionAndScale();

    updateTimeSlider(video1, timeSlider1, timeValue1);
    updateTimeSlider(video2, timeSlider2, timeValue2);
    drawFrame();
    statusText.textContent = 'All videos restarted and synced to start. Position and scale reset.';
}

function drawLoop() {
    // Only continue drawing if both videos are ready
    if (video1Ready && video2Ready) {
        drawFrame();
    }
    
    // Request next frame if both videos are ready (even if paused, to allow for scrubbing/touch)
    // The loop keeps running to update the canvas based on video currentTime and touch transforms
    animationFrameId = requestAnimationFrame(drawLoop);
}

function drawFrame() {
    if (!video1Ready || !video2Ready || !video1.videoWidth || !video2.videoWidth) {
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
        return;
    }

    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

    // Draw Video 1 (bottom layer)
    ctx.drawImage(video1, 0, 0, videoCanvas.width, videoCanvas.height);

    // Set global alpha for Video 2 (top layer)
    ctx.globalAlpha = parseFloat(opacitySlider.value);

    // Get position and scale for Video 2
    const scale = currentScale; // Use currentScale from touch events
    const offsetX = currentOffsetX;
    const offsetY = currentOffsetY;

    // Calculate scaled dimensions
    const scaledWidth = videoCanvas.width * scale;
    const scaledHeight = videoCanvas.height * scale;

    // Calculate position for drawing the scaled video
    // We want to center the scaled video (relative to its own size), then apply offsets.
    const drawX = offsetX + (videoCanvas.width - scaledWidth) / 2;
    const drawY = offsetY + (videoCanvas.height - scaledHeight) / 2;

    // Draw Video 2 (top layer) at its new position and scale
    ctx.drawImage(video2, drawX, drawY, scaledWidth, scaledHeight);

    // Reset global alpha for other drawings (important!)
    ctx.globalAlpha = 1;
}

// --- Touch Event Handlers for Canvas (Pan and Pinch-Zoom for Video 2) ---

function getDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleTouchStart(event) {
    if (!video1Ready || !video2Ready) return; // Only enable gestures if videos are loaded

    event.preventDefault(); // Prevent scrolling and other default browser actions

    if (event.touches.length === 2) {
        initialTouchData.distance = getDistance(event.touches);
        initialTouchData.scale = currentScale;
        initialTouchData.offsetX = currentOffsetX;
        initialTouchData.offsetY = currentOffsetY;
        isDragging = false; // Two fingers override single-finger drag
    } else if (event.touches.length === 1) {
        initialTouchData.x = event.touches[0].clientX;
        initialTouchData.y = event.touches[0].clientY;
        initialTouchData.offsetX = currentOffsetX; // Store current offset for relative pan
        initialTouchData.offsetY = currentOffsetY;
        isDragging = true;
        initialTouchData.distance = 0; // Clear two-finger state
    }
}

function handleTouchMove(event) {
    if (!video1Ready || !video2Ready) return;
    event.preventDefault(); // Prevent scrolling

    if (event.touches.length === 2 && initialTouchData.distance > 0) {
        const currentDistance = getDistance(event.touches);
        if (currentDistance === 0) return;

        const scaleFactor = currentDistance / initialTouchData.distance;
        let newScale = initialTouchData.scale * scaleFactor;

        // Clamp scale to a reasonable range (e.g., 0.2x to 5x)
        newScale = Math.max(0.2, Math.min(5.0, newScale));
        currentScale = newScale;
        
        // Redraw with new scale
        drawFrame();

    } else if (event.touches.length === 1 && isDragging) {
        const touch = event.touches[0];
        const deltaX = touch.clientX - initialTouchData.x;
        const deltaY = touch.clientY - initialTouchData.y;

        let newOffsetX = initialTouchData.offsetX + deltaX;
        let newOffsetY = initialTouchData.offsetY + deltaY;
        
        // Clamp offsets to prevent video from disappearing entirely
        const maxOffset = Math.max(videoCanvas.width, videoCanvas.height); // Heuristic
        currentOffsetX = Math.max(-maxOffset, Math.min(maxOffset, newOffsetX));
        currentOffsetY = Math.max(-maxOffset, Math.min(maxOffset, newOffsetY));

        drawFrame();
    }
}

function handleTouchEnd(event) {
    initialTouchData.distance = 0; // Reset pinch state
    isDragging = false; // Reset pan state
}


// Initial setup
statusText.textContent = 'Ready to upload videos.';
drawFrame();