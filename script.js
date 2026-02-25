let audioCtx, analyser, dataArray, source;
let scaleControl = null;
let scaleValueDisplay = null;

let toneControl = null;
let toneValueDisplay = null;
let toneBtn = null;
let toneOn = false;
let tonePhase = 0;
const toneFreq = 300; // Hz (also B0 Larmor frequency)
const omega0 = 2 * Math.PI * toneFreq;

let labTime = 0; // track seconds elapsed for rotating frame

let micEnabled = true;
let micToggle = null;
let frameToggle = null;
let useRotatingFrame = true;

let t1Slider = null;
let t1Display = null;
let t2Slider = null;
let t2Display = null;

// Bloch vector (normalized)
let M = { x: 0, y: 0, z: -1 };
const M0 = -1;   // equilibrium now downwards
let T1 = 1.0;   // seconds, adjustable
let T2 = 0.5;   // seconds, adjustable

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

// the dataArray is refreshed each animation frame; we'll step
// through its samples using the known audio sample rate.

// helper computes Bloch derivative in rotating frame for given magnetization and w1
function blochDeriv(m, w1) {
    return {
        x: -m.x / T2,
        y: w1 * m.z - m.y / T2,
        z: -w1 * m.y - (m.z - M0) / T1
    };
}

function updateBlochWithSignal(data, dt) {
    const scale = parseFloat(scaleControl.value);
    const toneVol = parseFloat(toneControl.value);
    const sampleDt = 1 / audioCtx.sampleRate;
    // integrate one little step per sample using RK4 in rotating frame
    for (let i = 0; i < data.length; i++) {
        let w1 = micEnabled ? data[i] * scale : 0;
        if (toneOn) {
            w1 += toneVol; // constant transverse field in rotating frame
        }
        // RK4
        const k1 = blochDeriv(M, w1);
        const m2 = { x: M.x + 0.5 * k1.x * sampleDt,
                     y: M.y + 0.5 * k1.y * sampleDt,
                     z: M.z + 0.5 * k1.z * sampleDt };
        const k2 = blochDeriv(m2, w1);
        const m3 = { x: M.x + 0.5 * k2.x * sampleDt,
                     y: M.y + 0.5 * k2.y * sampleDt,
                     z: M.z + 0.5 * k2.z * sampleDt };
        const k3 = blochDeriv(m3, w1);
        const m4 = { x: M.x + k3.x * sampleDt,
                     y: M.y + k3.y * sampleDt,
                     z: M.z + k3.z * sampleDt };
        const k4 = blochDeriv(m4, w1);
        M.x += (k1.x + 2 * k2.x + 2 * k3.x + k4.x) * (sampleDt / 6);
        M.y += (k1.y + 2 * k2.y + 2 * k3.y + k4.y) * (sampleDt / 6);
        M.z += (k1.z + 2 * k2.z + 2 * k3.z + k4.z) * (sampleDt / 6);
        // clamp magnitude to avoid drift
        const mag = Math.hypot(M.x, M.y, M.z);
        if (mag > 2) {
            M.x /= mag;
            M.y /= mag;
            M.z /= mag;
        }
        labTime += sampleDt;
    }
}

function draw() {
    // compute coordinates for display
    let Mx_r = M.x, My_r = M.y, Mz_r = M.z;
    if (useRotatingFrame) {
        // already stored in rotating frame so nothing to do
    } else {
        // transform from rotating frame back to lab frame by rotating about z
        const angle = omega0 * labTime;
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        Mx_r = M.x * cosA - M.y * sinA;
        My_r = M.x * sinA + M.y * cosA;
        Mz_r = M.z;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(cx, cy);
    // sphere outline
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.stroke();
    // axes: x (horizontal), z (vertical), y (diagonal)
    ctx.strokeStyle = '#aaa';
    ctx.beginPath();
    // x-axis
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    // z-axis
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    // y-axis drawn as a diagonal out of plane
    const yoff = radius * 0.5;
    ctx.moveTo(0, 0);
    ctx.lineTo(yoff, -yoff);
    ctx.stroke();
    // Bloch vector projection using rotating-frame components
    const projX = (Mx_r + 0.5 * My_r) * radius;
    const projY = (-Mz_r + 0.3 * My_r) * radius;
    ctx.strokeStyle = 'red';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(projX, projY);
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

    if (analyser) {
        analyser.getFloatTimeDomainData(dataArray);
        updateBlochWithSignal(dataArray, dt);
    }

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

// tone UI
toneControl = document.getElementById('tone-vol');
toneValueDisplay = document.getElementById('tone-val');
toneBtn = document.getElementById('tone-btn');

// mic toggle
micToggle = document.getElementById('mic-toggle');
if (micToggle) {
    micToggle.addEventListener('change', () => { micEnabled = micToggle.checked; });
}
// frame toggle
frameToggle = document.getElementById('frame-toggle');
if (frameToggle) {
    frameToggle.addEventListener('change', () => { useRotatingFrame = frameToggle.checked; });
}
toneControl.addEventListener('input', () => {
    toneValueDisplay.textContent = toneControl.value;
});

toneBtn.addEventListener('mousedown', () => { toneOn = true; });
toneBtn.addEventListener('mouseup', () => { toneOn = false; });
toneBtn.addEventListener('mouseleave', () => { toneOn = false; });

// ensure tone value display matches slider default (pi)
if (toneControl) {
    toneValueDisplay.textContent = toneControl.value;
}

// mic toggle default
if (micToggle) {
    micEnabled = micToggle.checked;
}

// T1/T2 sliders (log scale -1 to 2 corresponds to 0.1s–100s)
function logToVal(x) { return Math.pow(10, x); }
function valToLog(v) { return Math.log10(v); }

t1Slider = document.getElementById('t1-slider');
t1Display = document.getElementById('t1-val');
t2Slider = document.getElementById('t2-slider');
t2Display = document.getElementById('t2-val');

function updateT1() {
    T1 = logToVal(parseFloat(t1Slider.value));
    t1Display.textContent = T1.toFixed(2);
}
function updateT2() {
    T2 = logToVal(parseFloat(t2Slider.value));
    t2Display.textContent = T2.toFixed(2);
}

t1Slider.addEventListener('input', updateT1);
t2Slider.addEventListener('input', updateT2);
// initialize values according to defaults
updateT1();
updateT2();
