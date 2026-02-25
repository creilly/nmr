let audioCtx, analyser, dataArray, source;
let scaleControl = null;
let scaleValueDisplay = null;

let toneControl = null;
let toneValueDisplay = null;
let toneBtn = null;
let toneOn = false;
let tonePhase = 0;
const toneFreq = 300; // Hz

let t1Slider = null;
let t1Display = null;
let t2Slider = null;
let t2Display = null;

// Bloch vector (normalized)
let M = { x: 0, y: 0, z: 1 };
const M0 = 1;
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

function updateBlochWithSignal(data, dt) {
    const scale = parseFloat(scaleControl.value);
    const toneVol = parseFloat(toneControl.value);
    const sampleDt = 1 / audioCtx.sampleRate;
    const twoPiF = 2 * Math.PI * toneFreq;
    // integrate one little step per sample
    for (let i = 0; i < data.length; i++) {
        let w1 = data[i] * scale; // direct microphone drive
        if (toneOn) {
            w1 += Math.sin(tonePhase) * toneVol;
            tonePhase += twoPiF * sampleDt;
            if (tonePhase > 2 * Math.PI) tonePhase -= 2 * Math.PI;
        }
        const dMx = -M.x / T2;
        const dMy = w1 * M.z - M.y / T2;
        const dMz = -w1 * M.y - (M.z - M0) / T1;
        M.x += dMx * sampleDt;
        M.y += dMy * sampleDt;
        M.z += dMz * sampleDt;
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
    // Bloch vector with simple oblique projection (show y component)
    const k = 0.5; // projection factor for y
    const k2 = 0.3;
    const projX = (M.x + k * M.y) * radius;
    const projY = (-M.z + k2 * M.y) * radius;
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
