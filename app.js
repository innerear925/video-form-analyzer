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
const offsetXSlider = document.getElementById('offsetXSlider');
const offsetValueX = document.getElementById('offsetValueX');
const offsetYSlider = document.getElementById('offsetYSlider');
const offsetValueY = document.getElementById('offsetValueY');
const scaleSlider = document.getElementById('scaleSlider'); // New slider
const scaleValue = document.getElementById('scaleValue');     // New span
const playPauseButton2 = document.getElementById('playPauseButton2');
const restartButton2 = document.getElementById('restartButton2');
const resetPositionScaleButton = document.getElementById('resetPositionScaleButton'); // New button

const playAllButton = document.getElementById('playAllButton');
const pauseAllButton = document.getElementById('pauseAllButton');
const syncAllStartsButton = document.getElementById('syncAllStartsButton');

const uploadStatus = document.getElementById('uploadStatus');
const statusText = document.getElementById('status');

let animationFrameId = null; // To store the requestAnimationFrame ID
let videoLoadedCount = 0; // To track when both videos are ready

// --- State Variables for Playback ---
let isPlaying1 = false;
let isPlaying2 = false;

// --- Touch Interaction State ---
let lastDistance = null; // Distance between two fingers for pinch-zoom
let initialScale = 1.0; // Scale when pinch started
let initialOffsetX = 0; // Offset when pan started
let initialOffsetY = 0;
let lastTouch = { x: 0, y: 0 }; // Last single touch position for pan
let isDragging = false; // Flag for single-finger drag (pan)

// --- Event Listeners ---

// File uploads
fileInput1.addEventListener('change', (event) => loadVideo(event, video1, 1));
fileInput2.addEventListener('change', (event) => loadVideo(event, video2, 2));

// Video ready events
video1.addEventListener('loadedmetadata', () => setupVideo(video1, 1));
video2.addEventListener('loadedmetadata', () => setupVideo(video2, 2));

// Video time updates (for timeline sliders)
video1.addEventListener('timeupdate', () => updateTimeSlider(video1, timeSlider1, timeValue1));
video2.addEventListener('timeupdate', () => updateTimeSlider(video2, timeSlider2, timeValue2));

// Video ended events
video1.addEventListener('ended', () => { isPlaying1 = false; playPauseButton1.textContent = 'Play 1'; });
video2.addEventListener('ended', () => { isPlaying2 = false; playPauseButton2.textContent = 'Play 2'; });

// Global controls
opacitySlider.addEventListener('input', drawFrame);

// Position and Scale sliders for Video 2
offsetXSlider.addEventListener('input', () => { offsetValueX.textContent = offsetXSlider.value + 'px'; drawFrame(); });
offsetYSlider.addEventListener('input', () => { offsetValueY.textContent = offsetYSlider.value + 'px'; drawFrame(); });
scaleSlider.addEventListener('input', () => { scaleValue.textContent = parseFloat(scaleSlider.value).toFixed(2) + 'x'; drawFrame(); });

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
        videoLoadedCount = 0;
        pauseAllVideos();
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    }
}

function setupVideo(videoElement, videoNum) {
    videoLoadedCount++;
    statusText.textContent = `Video ${videoNum} metadata loaded.`;

    // Initialize timeline slider range
    const timeSlider = (videoNum === 1) ? timeSlider1 : timeSlider2;
    timeSlider.max = videoElement.duration;
    timeSlider.value = 0;
    updateTimeSlider(videoElement, timeSlider, (videoNum === 1) ? timeValue1 : timeValue2);

    if (videoLoadedCount === 2) {
        statusText.textContent = 'Both videos ready! Adjust controls and compare.';
        adjustCanvasSize(); // Set canvas dimensions and position/scale slider limits
        if (!animationFrameId) { // Start the continuous drawing loop if not already running
            animationFrameId = requestAnimationFrame(drawLoop);
        }
        // Ensure initial draw
        drawFrame();
    }
}

function adjustCanvasSize() {
    if (video1.readyState < 1 || video2.readyState < 1 || !video1.videoWidth || !video2.videoWidth) return;

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
    
    // Adjust max/min for position sliders based on new canvas size
    offsetXSlider.max = videoCanvas.width / 2;
    offsetXSlider.min = -videoCanvas.width / 2;
    offsetYSlider.max = videoCanvas.height / 2;
    offsetYSlider.min = -videoCanvas.height / 2;

    drawFrame();
}

function updateTimeSlider(videoElement, slider, valueSpan) {
    slider.value = videoElement.currentTime;
    valueSpan.textContent = videoElement.currentTime.toFixed(2) + 's';
}

function scrubVideo(videoElement, slider) {
    if (!videoElement.paused) {
        videoElement.pause();
        const playButton = (videoElement === video1) ? playPauseButton1 : playPauseButton2;
        playButton.textContent = `Play ${videoElement === video1 ? '1' : '2'}`;
        if (videoElement === video1) isPlaying1 = false;
        else isPlaying2 = false;
    }
    videoElement.currentTime = parseFloat(slider.value);
    drawFrame();
}

function togglePlayPauseIndividual(videoElement, playPauseButton, videoNum) {
    if (videoLoadedCount < 2) {
        statusText.textContent = "Please upload both videos first!";
        return;
    }

    if (videoElement.paused) {
        const playPromise = videoElement.play();
        playPromise.then(() => {
            if (videoElement === video1) isPlaying1 = true;
            else isPlaying2 = true;
            playPauseButton.textContent = `Pause ${videoNum}`;
            statusText.textContent = `Playing Video ${videoNum}.`;
        }).catch(error => {
            statusText.textContent = `Autoplay prevented for Video ${videoNum}: ${error.message}.`;
            console.error("Autoplay failed:", error);
        });
    } else {
        videoElement.pause();
        if (videoElement === video1) isPlaying1 = false;
        else isPlaying2 = false;
        playPauseButton.textContent = `Play ${videoNum}`;
        statusText.textContent = `Paused Video ${videoNum}.`;
    }
}

function restartVideo(videoElement, playPauseButton, videoNum) {
    videoElement.pause();
    videoElement.currentTime = 0;
    if (videoElement === video1) isPlaying1 = false;
    else isPlaying2 = false;
    playPauseButton.textContent = `Play ${videoNum}`;
    updateTimeSlider(videoElement, (videoNum === 1) ? timeSlider1 : timeSlider2, (videoNum === 1) ? timeValue1 : timeValue2);
    drawFrame();
    statusText.textContent = `Video ${videoNum} restarted.`;
}

function resetPositionAndScale() {
    offsetXSlider.value = 0;
    offsetYSlider.value = 0;
    scaleSlider.value = 1.0;
    offsetValueX.textContent = '0px';
    offsetValueY.textContent = '0px';
    scaleValue.textContent = '1.00x';
    drawFrame();
    statusText.textContent = 'Video 2 position and scale reset.';
}

function playAllVideos() {
    if (videoLoadedCount < 2) {
        statusText.textContent = "Please upload both videos first!";
        return;
    }

    const playPromise1 = video1.play();
    const playPromise2 = video2.play();

    Promise.all([playPromise1, playPromise2])
        .then(() => {
            isPlaying1 = true;
            isPlaying2 = true;
            playPauseButton1.textContent = 'Pause 1';
            playPauseButton2.textContent = 'Pause 2';
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
    playPauseButton1.textContent = 'Play 1';
    playPauseButton2.textContent = 'Play 2';
    statusText.textContent = 'All videos paused.';
}

function syncAllStarts() {
    pauseAllVideos();
    video1.currentTime = 0;
    video2.currentTime = 0;
    
    resetPositionAndScale(); // Also resets position and scale

    updateTimeSlider(video1, timeSlider1, timeValue1);
    updateTimeSlider(video2, timeSlider2, timeValue2);
    drawFrame();
    statusText.textContent = 'All videos restarted and synced to start. Position and scale reset.';
}

function drawLoop() {
    // Only continue drawing if at least one video is playing
    // or if we're paused but need to draw due to user interaction (sliders, gestures)
    if (isPlaying1 || isPlaying2 || videoLoadedCount === 2) {
        drawFrame();
    }
    
    // Request next frame if either video is playing or if we are loaded and not explicitly paused.
    // This ensures that even when paused, if a slider changes, the frame updates.
    // We keep animationFrameId as a way to "keep the loop alive" when loaded.
    if (videoLoadedCount === 2) { // Only run loop if both videos are ready
        animationFrameId = requestAnimationFrame(drawLoop);
    } else if (animationFrameId) {
        // If videos are not ready and loop is running, stop it
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function drawFrame() {
    if (video1.readyState < 2 || video2.readyState < 2 || !video1.videoWidth || !video2.videoWidth) {
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
        return;
    }

    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

    // Draw Video 1 (bottom layer)
    ctx.drawImage(video1, 0, 0, videoCanvas.width, videoCanvas.height);

    // Set global alpha for Video 2 (top layer)
    ctx.globalAlpha = parseFloat(opacitySlider.value);

    // Get position and scale for Video 2
    const offsetX = parseFloat(offsetXSlider.value);
    const offsetY = parseFloat(offsetYSlider.value);
    const scale = parseFloat(scaleSlider.value);

    // Calculate scaled dimensions
    const scaledWidth = videoCanvas.width * scale;
    const scaledHeight = videoCanvas.height * scale;

    // Calculate position for drawing the scaled video
    // We want to center the scaled video, then apply offsets.
    const drawX = offsetX + (videoCanvas.width - scaledWidth) / 2;
    const drawY = offsetY + (videoCanvas.height - scaledHeight) / 2;

    // Draw Video 2 (top layer) at its new position and scale
    ctx.drawImage(video2, drawX, drawY, scaledWidth, scaledHeight);

    // Reset global alpha for other drawings (important!)
    ctx.globalAlpha = 1;
}

// --- Touch Event Handlers ---

function getDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleTouchStart(event) {
    event.preventDefault(); // Prevent scrolling and other default browser actions

    if (event.touches.length === 2) {
        lastDistance = getDistance(event.touches);
        initialScale = parseFloat(scaleSlider.value); // Store current scale
        initialOffsetX = parseFloat(offsetXSlider.value); // Store current offset for reference
        initialOffsetY = parseFloat(offsetYSlider.value);
        isDragging = false; // Disable single-finger drag
    } else if (event.touches.length === 1) {
        lastTouch.x = event.touches[0].clientX;
        lastTouch.y = event.touches[0].clientY;
        isDragging = true; // Enable single-finger drag
        lastDistance = null; // Clear two-finger state
    }
}

function handleTouchMove(event) {
    event.preventDefault(); // Prevent scrolling

    if (event.touches.length === 2 && lastDistance !== null) {
        const currentDistance = getDistance(event.touches);
        if (currentDistance === 0) return; // Avoid division by zero

        const scaleFactor = currentDistance / lastDistance;
        let newScale = initialScale * scaleFactor;

        // Clamp scale to slider min/max
        newScale = Math.max(parseFloat(scaleSlider.min), Math.min(parseFloat(scaleSlider.max), newScale));
        
        scaleSlider.value = newScale.toFixed(2);
        scaleValue.textContent = newScale.toFixed(2) + 'x';
        drawFrame();

    } else if (event.touches.length === 1 && isDragging) {
        const touch = event.touches[0];
        const deltaX = touch.clientX - lastTouch.x;
        const deltaY = touch.clientY - lastTouch.y;

        let newOffsetX = parseFloat(offsetXSlider.value) + deltaX;
        let newOffsetY = parseFloat(offsetYSlider.value) + deltaY;

        // Clamp offsets to slider min/max (which are based on canvas size)
        newOffsetX = Math.max(parseFloat(offsetXSlider.min), Math.min(parseFloat(offsetXSlider.max), newOffsetX));
        newOffsetY = Math.max(parseFloat(offsetYSlider.min), Math.min(parseFloat(offsetYSlider.max), newOffsetY));

        offsetXSlider.value = newOffsetX;
        offsetYSlider.value = newOffsetY;
        offsetValueX.textContent = newOffsetX.toFixed(0) + 'px';
        offsetValueY.textContent = newOffsetY.toFixed(0) + 'px';

        lastTouch.x = touch.clientX;
        lastTouch.y = touch.clientY;
        drawFrame();
    }
}

function handleTouchEnd(event) {
    lastDistance = null;
    isDragging = false;
    // No need to redraw on touchend unless specific state change needs it
}

// Initial setup
statusText.textContent = 'Ready to upload videos.';
drawFrame();