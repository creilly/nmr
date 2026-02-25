let audioCtx, analyser, dataArray, source;
let scaleControl = null;
let scaleValueDisplay = null;

// Bloch vector (normalized)
let M = { x: 0, y: 0, z: 1 };
const M0 = 1;
const T1 = 1.0;   // seconds
const T2 = 0.5;   // seconds

let lastTime = null;
const canvas = document.getElementById('bloch');
const ctx = canvas.getContext('2d');
const width = canvas.width;
const height = canvas.height;
const cx = width / 2;
const cy = height / 2;
const radius = Math.min(cx, cy) - 10;

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.fftSize;
    dataArray = new Float32Array(bufferLength);
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
        })
        .catch(err => {
            console.error('mic error', err);
        });
}

function getAmplitude() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i];
        sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return rms;
}

function updateBloch(dt) {
    const amp = getAmplitude();
    const scale = parseFloat(scaleControl.value);
    const w1 = amp * scale;
    // Bloch equations in rotating frame
    const dMx = -M.x / T2;
    const dMy = w1 * M.z - M.y / T2;
    const dMz = -w1 * M.y - (M.z - M0) / T1;
    M.x += dMx * dt;
    M.y += dMy * dt;
    M.z += dMz * dt;
    // normalize drift (keep inside sphere)
    const mag = Math.hypot(M.x, M.y, M.z);
    if (mag > 0) {
        M.x /= mag;
        M.y /= mag;
        M.z /= mag;
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(cx, cy);
    // sphere outline
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.stroke();
    // axes (x horizontal, z vertical)
    ctx.strokeStyle = '#aaa';
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.stroke();
    // Bloch vector
    ctx.strokeStyle = 'red';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const vx = M.x * radius;
    const vy = -M.z * radius;
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.restore();
    // info text
    document.getElementById('info').textContent =
        `M = (${M.x.toFixed(2)}, ${M.y.toFixed(2)}, ${M.z.toFixed(2)})`;
}

function animate(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    updateBloch(dt);
    draw();
    requestAnimationFrame(animate);
}

document.getElementById('start').addEventListener('click', () => {
    if (!audioCtx) initAudio();
    requestAnimationFrame(animate);
});

scaleControl = document.getElementById('scale');
scaleValueDisplay = document.getElementById('scale-val');
scaleControl.addEventListener('input', () => {
    scaleValueDisplay.textContent = scaleControl.value;
});
