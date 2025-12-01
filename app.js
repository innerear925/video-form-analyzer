// Get DOM elements
const fileInput1 = document.getElementById('fileInput1');
const fileInput2 = document.getElementById('fileInput2');
const video1 = document.getElementById('video1');
const video2 = document.getElementById('video2');
const videoCanvas = document.getElementById('videoCanvas');
const ctx = videoCanvas.getContext('2d');
const opacitySlider = document.getElementById('opacitySlider');
const offsetSlider = document.getElementById('offsetSlider');
const offsetValueSpan = document.getElementById('offsetValue');
const playPauseButton = document.getElementById('playPauseButton');
const restartButton = document.getElementById('restartButton');
const syncStartButton = document.getElementById('syncStartButton');
const uploadStatus = document.getElementById('uploadStatus');
const statusText = document.getElementById('status');

let animationFrameId = null; // To store the requestAnimationFrame ID
let isPlaying = false;
let videoLoadedCount = 0; // To track when both videos are ready
let videoDuration = 0; // Max duration of the two videos

// --- Event Listeners ---

// Handle video file uploads
fileInput1.addEventListener('change', (event) => loadVideo(event, video1, 1));
fileInput2.addEventListener('change', (event) => loadVideo(event, video2, 2));

// When videos are loaded and can play
// Using 'canplay' which means enough data is loaded to start playing
video1.addEventListener('canplay', () => videoReady(video1, 1));
video2.addEventListener('canplay', () => videoReady(video2, 2));

// Update canvas when opacity changes
opacitySlider.addEventListener('input', drawFrame);

// Update offset value display and re-sync
offsetSlider.addEventListener('input', () => {
    offsetValueSpan.textContent = parseFloat(offsetSlider.value).toFixed(2) + 's';
    // When slider changes while playing, adjust video2's current time relative to video1
    if (isPlaying) {
        video2.currentTime = video1.currentTime + parseFloat(offsetSlider.value);
    }
    drawFrame(); // Redraw immediately to reflect change
});

playPauseButton.addEventListener('click', togglePlayPause);
restartButton.addEventListener('click', restartVideos);
syncStartButton.addEventListener('click', syncVideoStarts);

// Adjust canvas size on window resize
window.addEventListener('resize', adjustCanvasSize);


// --- Functions ---

function loadVideo(event, videoElement, videoNum) {
    const file = event.target.files[0];
    if (file) {
        // Revoke previous object URL to free memory if re-uploading
        if (videoElement.src && videoElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(videoElement.src);
        }
        const url = URL.createObjectURL(file);
        videoElement.src = url;
        videoElement.load(); // Load the video
        statusText.textContent = `Loading Video ${videoNum}...`;
        uploadStatus.textContent = `Video ${videoNum} loaded.`;
        // Reset loaded count if a new video is loaded to re-trigger readiness
        videoLoadedCount = 0;
        // Pause any active playback
        pauseVideos();
        // Clear old video in canvas
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    }
}

function videoReady(videoElement, videoNum) {
    videoLoadedCount++;
    statusText.textContent = `Video ${videoNum} ready.`;
    if (videoLoadedCount === 2) {
        statusText.textContent = 'Both videos ready! Adjust controls and play.';
        videoDuration = Math.max(video1.duration || 0, video2.duration || 0);
        
        adjustCanvasSize(); // Set canvas dimensions
        drawFrame(); // Draw initial frame
    }
}

function adjustCanvasSize() {
    // Only adjust if videos are actually loaded and have metadata
    if (video1.readyState < 2 || video2.readyState < 2) return; 

    const viewportWidth = window.innerWidth;
    const maxDesktopCanvasWidth = 900;
    const maxMobileCanvasWidth = 600; // Example max width for mobile
    
    let targetWidth;

    if (viewportWidth < 768) { // Mobile breakpoint
        targetWidth = Math.min(viewportWidth - 40, maxMobileCanvasWidth); // -40 for padding/margin
    } else {
        targetWidth = Math.min(video1.videoWidth, maxDesktopCanvasWidth);
    }
    
    // Ensure targetWidth is at least a reasonable minimum
    if (targetWidth < 300) targetWidth = 300; 

    const aspectRatio = video1.videoWidth / video1.videoHeight;
    const targetHeight = targetWidth / aspectRatio;

    videoCanvas.width = targetWidth;
    videoCanvas.height = targetHeight;
    
    drawFrame(); // Redraw after resizing
}


function togglePlayPause() {
    if (videoLoadedCount < 2) {
        statusText.textContent = "Please upload both videos first!";
        return;
    }

    if (isPlaying) {
        pauseVideos();
    } else {
        playVideos();
    }
}

function playVideos() {
    if (isPlaying) return; // Prevent multiple play calls

    isPlaying = true;
    playPauseButton.textContent = 'Pause';
    
    // Set video2's current time relative to video1's current time + offset
    const offsetSeconds = parseFloat(offsetSlider.value);
    video2.currentTime = video1.currentTime + offsetSeconds;
    
    // Ensure videos start from valid times (not before 0 or after duration)
    video1.currentTime = Math.max(0, Math.min(video1.currentTime, video1.duration));
    video2.currentTime = Math.max(0, Math.min(video2.currentTime, video2.duration));

    // Play videos
    const playPromise1 = video1.play();
    const playPromise2 = video2.play();

    // Handle potential autoplay policy rejections (especially on mobile)
    Promise.all([playPromise1, playPromise2])
        .then(() => {
            animationFrameId = requestAnimationFrame(drawLoop); // Start drawing loop
        })
        .catch(error => {
            isPlaying = false;
            playPauseButton.textContent = 'Play';
            statusText.textContent = `Autoplay prevented: ${error.message}. Please tap play again.`;
            console.error("Autoplay failed:", error);
        });
}

function pauseVideos() {
    isPlaying = false;
    playPauseButton.textContent = 'Play';
    video1.pause();
    video2.pause();
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function restartVideos() {
    pauseVideos();
    video1.currentTime = 0;
    video2.currentTime = 0;
    drawFrame(); // Draw the first frame
    statusText.textContent = "Videos restarted.";
}

function syncVideoStarts() {
    pauseVideos(); // Pause to ensure accurate current time setting
    video1.currentTime = 0;
    video2.currentTime = 0;
    offsetSlider.value = 0; // Reset offset to 0
    offsetValueSpan.textContent = "0.00s";
    drawFrame();
    statusText.textContent = "Videos synced to start (offset reset to 0).";
}


function drawLoop() {
    // Check if either video has ended or if we manually paused
    if (video1.ended || video2.ended || !isPlaying) {
        pauseVideos(); // Stop playback and drawing loop
        if (video1.ended || video2.ended) {
            statusText.textContent = "Playback ended.";
        }
        return;
    }

    // Adjust video2's time based on video1's current time and offset
    // This keeps them synchronized if one video slightly lags or gets out of sync
    const offsetSeconds = parseFloat(offsetSlider.value);
    const expectedVideo2Time = video1.currentTime + offsetSeconds;
    
    // Only adjust if the difference is significant to avoid constant minor adjustments
    // and potential seeking overhead. Threshold can be fine-tuned.
    if (Math.abs(video2.currentTime - expectedVideo2Time) > 0.05) { // 50ms tolerance
        video2.currentTime = expectedVideo2Time;
    }
    
    drawFrame();

    animationFrameId = requestAnimationFrame(drawLoop);
}

function drawFrame() {
    // Only draw if both videos have enough data to draw a frame
    if (video1.readyState < 2 || video2.readyState < 2 || !video1.videoWidth || !video2.videoWidth) {
        ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height); // Clear if not ready
        return;
    }

    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

    // Draw Video 1 (bottom layer)
    ctx.drawImage(video1, 0, 0, videoCanvas.width, videoCanvas.height);

    // Set global alpha for Video 2 (top layer)
    ctx.globalAlpha = parseFloat(opacitySlider.value);

    // Draw Video 2 (top layer)
    ctx.drawImage(video2, 0, 0, videoCanvas.width, videoCanvas.height);

    // Reset global alpha for other drawings (important!)
    ctx.globalAlpha = 1;
}

// Initial setup
statusText.textContent = 'Ready to upload videos.';
// Ensure canvas is drawn even before videos are loaded, potentially showing black background
drawFrame(); 