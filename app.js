// --- Add this to your existing Event Listeners in app.js ---

fileInput1.addEventListener('change', (event) => {
    loadVideo(event, video1, 1);
    document.getElementById('fileName1').textContent = event.target.files[0] ? event.target.files[0].name : 'No file chosen';
});

fileInput2.addEventListener('change', (event) => {
    loadVideo(event, video2, 2);
    document.getElementById('fileName2').textContent = event.target.files[0] ? event.target.files[0].name : 'No file chosen';
});

// IMPORTANT: Make sure you remove or comment out the old event listeners for fileInput1 and fileInput2
// fileInput1.addEventListener('change', (event) => loadVideo(event, video1, 1)); // <-- Remove this line
// fileInput2.addEventListener('change', (event) => loadVideo(event, video2, 2)); // <-- Remove this line