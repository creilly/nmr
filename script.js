// Global variables for rotating frame phi and rho
let phi_rot = 0;
let rho_rot = 0;
let Mx_rot = 0;
let My_rot = 0;
let Mz_rot = -1;
let labTime = 0; // track seconds elapsed for rotating frame
let scriptProcessor = null;
let outputGainNode = null;
let audioOutputEnabled = false;
let audioOutputToggle = null;

let toneControl = null;
let toneValueDisplay = null;
let toneBtn = null;
let toneLed = null;
let toneLockBtn = null;
let toneLocked = false;
let pulsePi2Btn = null;
let pulsePiBtn = null;
let holdTone = false;
let pulseActive = false;
let pulseSamplesRemaining = 0; // kept for compat reference; timing now uses pulseTimeRemaining
let pulseTimeRemaining = 0;    // seconds remaining in current pulse
let physicsIntervalId = null;  // setInterval id used before audio init
let toneOn = false;
let tonePhase = 0;
let toneFreq = 1; // Hz (also B0 Larmor frequency)
let omega0 = 2 * Math.PI * toneFreq; // = 2π rad/s
let detuneHz = 0;
let detuneControl = null;
let detuneValueDisplay = null;
let larmorControl = null;
let larmorValueDisplay = null;

let frameToggle = null;
let useRotatingFrame = false;
let showTorque = true;

let t1Slider = null;
let t1Display = null;
let t1Toggle = null;
let t1Enabled = false;
let t2Slider = null;
let t2Display = null;
let t2Toggle = null;
let t2Enabled = false;

// Bloch vector (normalized)
let M = { x: 0, y: 0, z: -1 };
const M0 = -1;   // equilibrium now downwards
let T1 = 10.0;   // seconds, adjustable
let T2 = 20.0;   // seconds, adjustable

let audioCtx;
const canvas = document.getElementById('bloch');
const ctx = canvas.getContext('2d');
const width = canvas.width;
const height = canvas.height;
const cx = width / 2;
const cy = height / 2;
const radius = Math.min(cx, cy) - 10;

// Projection parameter: ratio of y-axis projection length to x-axis projection length
let yScale = 0.3; // Adjust this to change y-axis foreshortening (0.25 = very short, 1.0 = isometric)
let yAngleDeg = 45; // Angle (in degrees) of y-axis projection relative to x-axis (positive = up-right)

function initAudio() {
    stopPhysicsInterval(); // audio thread takes over physics
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const sampleDt = 1 / audioCtx.sampleRate;

        scriptProcessor = audioCtx.createScriptProcessor(1024, 0, 1);
        outputGainNode = audioCtx.createGain();
        outputGainNode.gain.value = 0.1;
        scriptProcessor.onaudioprocess = (e) => {
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < output.length; i++) {
                physicsStep(sampleDt);
                output[i] = audioOutputEnabled ? M.x : 0;
            }
            updateRotatingFrame();
        };
        scriptProcessor.connect(outputGainNode);
        outputGainNode.connect(audioCtx.destination);
    } catch (err) {
        console.warn('Audio init failed, running without audio:', err);
        audioCtx = null;
        audioOutputEnabled = false;
        if (audioOutputToggle) audioOutputToggle.checked = false;
        startPhysicsInterval(); // fall back to interval-based physics
    }
}

function tryStartAudio() {
    if (!audioCtx) {
        initAudio();
    } else {
        audioCtx.resume().catch(err => console.warn('AudioContext resume failed:', err));
    }
}

// helper computes Bloch derivative in the lab frame for given magnetization and B1
function blochDerivLab(m, B1) {
    const invT1 = t1Enabled ? (1 / T1) : 0;
    const invT2 = t2Enabled ? (1 / T2) : 0;
    const invT2eff = invT1 / 2 + invT2; // correct transverse rate: 1/(2T1) + 1/T2
    return {
        x: omega0 * m.y - m.z * B1 - m.x * invT2eff,
        y: -omega0 * m.x - m.y * invT2eff,
        z: m.x * B1 - (m.z - M0) * invT1
    };
}

// Advance Bloch equations by dt seconds (single RK4 step)
function physicsStep(dt) {
    const toneHz = toneControl ? Math.pow(10, parseFloat(toneControl.value)) : 1;
    const rabiOmega = 2 * Math.PI * toneHz;
    const omegaDrive = 2 * Math.PI * (toneFreq + detuneHz);
    let B1 = 0;
    if (holdTone || pulseTimeRemaining > 0) {
        B1 = rabiOmega * Math.sin(tonePhase);
        tonePhase += omegaDrive * dt;
        if (tonePhase > 2 * Math.PI) tonePhase -= 2 * Math.PI;
        if (pulseTimeRemaining > 0) {
            pulseTimeRemaining -= dt;
            if (pulseTimeRemaining <= 0) {
                pulseTimeRemaining = 0;
                pulseActive = false;
                setTimeout(updateToneState, 0);
            }
        }
    }
    const k1 = blochDerivLab(M, B1);
    const m2 = { x: M.x + 0.5*k1.x*dt, y: M.y + 0.5*k1.y*dt, z: M.z + 0.5*k1.z*dt };
    const k2 = blochDerivLab(m2, B1);
    const m3 = { x: M.x + 0.5*k2.x*dt, y: M.y + 0.5*k2.y*dt, z: M.z + 0.5*k2.z*dt };
    const k3 = blochDerivLab(m3, B1);
    const m4 = { x: M.x + k3.x*dt, y: M.y + k3.y*dt, z: M.z + k3.z*dt };
    const k4 = blochDerivLab(m4, B1);
    M.x += (k1.x + 2*k2.x + 2*k3.x + k4.x) * (dt / 6);
    M.y += (k1.y + 2*k2.y + 2*k3.y + k4.y) * (dt / 6);
    M.z += (k1.z + 2*k2.z + 2*k3.z + k4.z) * (dt / 6);
    const mag = Math.hypot(M.x, M.y, M.z);
    if (mag > 2) { M.x /= mag; M.y /= mag; M.z /= mag; }
    labTime += dt;
}

// Update rotating-frame display coords (called once per audio buffer or per interval tick)
function updateRotatingFrame() {
    const omegaRot = 2 * Math.PI * (toneFreq + detuneHz);
    const angle = omegaRot * labTime;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    Mx_rot = M.x * cosA - M.y * sinA;
    My_rot = M.x * sinA + M.y * cosA;
    Mz_rot = M.z;
    rho_rot = Math.hypot(Mx_rot, My_rot);
    phi_rot = Math.atan2(My_rot, Mx_rot);
}

// Lightweight physics interval used before audio is initialised
function startPhysicsInterval() {
    if (physicsIntervalId !== null) return;
    const SUB_DT = 1 / 4000; // max 0.25 ms per RK4 step — keeps integrator stable
    let lastTime = performance.now();
    physicsIntervalId = setInterval(() => {
        const now = performance.now();
        let remaining = Math.min((now - lastTime) / 1000, 0.05); // cap at 50 ms
        lastTime = now;
        while (remaining > 0) {
            const dt = Math.min(remaining, SUB_DT);
            physicsStep(dt);
            remaining -= dt;
        }
        updateRotatingFrame();
    }, 1);
}

function stopPhysicsInterval() {
    if (physicsIntervalId !== null) {
        clearInterval(physicsIntervalId);
        physicsIntervalId = null;
    }
}

function draw() {
    // Select frame for display
    let Mx_r = M.x;
    let My_r = M.y;
    let Mz_r = M.z;
    if (useRotatingFrame) {
        Mx_r = Mx_rot;
        My_r = My_rot;
        Mz_r = Mz_rot;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    // sphere outline
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Projection helper: x_bloch → x_canvas, z_bloch → -y_canvas, y_bloch at variable angle
    // yScale controls the foreshortening of the y-axis
    const yAngleRad = yAngleDeg * Math.PI / 180;
    const projCos = Math.cos(yAngleRad);
    const projSin = Math.sin(yAngleRad);
    const toCanvas = (x, y, z) => ({
        px: (x + yScale * projCos * y) * radius,
        py: (-z + yScale * projSin * y) * radius
    });
    
    // Latitude lines (circles in XY plane at different z values)
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (let z = -0.8; z <= 0.8; z += 0.4) {
        if (Math.abs(z) < 0.01) continue; // Skip equator, we'll draw it boldly below
        const rho_lat = Math.sqrt(1 - z*z);
        ctx.beginPath();
        let firstPoint = true;
        for (let theta = 0; theta <= 2 * Math.PI; theta += 0.1) {
            const x_bloch = rho_lat * Math.cos(theta);
            const y_bloch = rho_lat * Math.sin(theta);
            const proj = toCanvas(x_bloch, y_bloch, z);
            if (firstPoint) {
                ctx.moveTo(proj.px, proj.py);
                firstPoint = false;
            } else {
                ctx.lineTo(proj.px, proj.py);
            }
        }
        ctx.closePath();
        ctx.stroke();
    }
    
    // Longitude lines (great circles through z-axis at different phi angles)
    for (let phi = 0; phi < Math.PI; phi += Math.PI / 6) {
        ctx.beginPath();
        let firstPoint = true;
        for (let z = -1; z <= 1; z += 0.1) {
            const rho_lon = Math.sqrt(Math.max(0, 1 - z*z));
            const x_bloch = rho_lon * Math.cos(phi);
            const y_bloch = rho_lon * Math.sin(phi);
            const proj = toCanvas(x_bloch, y_bloch, z);
            if (firstPoint) {
                ctx.moveTo(proj.px, proj.py);
                firstPoint = false;
            } else {
                ctx.lineTo(proj.px, proj.py);
            }
        }
        ctx.stroke();
    }
    
    // Bold black equator (xy-plane circle at z=0)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let firstPoint = true;
    for (let theta = 0; theta <= 2 * Math.PI; theta += 0.05) {
        const x_bloch = Math.cos(theta);
        const y_bloch = Math.sin(theta);
        const proj = toCanvas(x_bloch, y_bloch, 0);
        if (firstPoint) {
            ctx.moveTo(proj.px, proj.py);
            firstPoint = false;
        } else {
            ctx.lineTo(proj.px, proj.py);
        }
    }
    ctx.closePath();
    ctx.stroke();
    
    // Bold black unit circle in xz-plane (y=0)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    firstPoint = true;
    for (let theta = 0; theta <= 2 * Math.PI; theta += 0.05) {
        const x_bloch = Math.cos(theta);
        const z_bloch = Math.sin(theta);
        const proj = toCanvas(x_bloch, 0, z_bloch);
        if (firstPoint) {
            ctx.moveTo(proj.px, proj.py);
            firstPoint = false;
        } else {
            ctx.lineTo(proj.px, proj.py);
        }
    }
    ctx.closePath();
    ctx.stroke();
    
    // axes: x (horizontal), z (vertical), y (diagonal at 30°)
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // x-axis
    const proj_x_negative = toCanvas(-1, 0, 0);
    const proj_x_positive = toCanvas(1, 0, 0);
    ctx.moveTo(proj_x_negative.px, proj_x_negative.py);
    ctx.lineTo(proj_x_positive.px, proj_x_positive.py);
    // z-axis
    const proj_z_positive = toCanvas(0, 0, 1);
    const proj_z_negative = toCanvas(0, 0, -1);
    ctx.moveTo(proj_z_positive.px, proj_z_positive.py);
    ctx.lineTo(proj_z_negative.px, proj_z_negative.py);
    // y-axis
    const proj_y_positive = toCanvas(0, 1, 0);
    const proj_y_negative = toCanvas(0, -1, 0);
    ctx.moveTo(proj_y_positive.px, proj_y_positive.py);
    ctx.lineTo(proj_y_negative.px, proj_y_negative.py);
    ctx.stroke();
    
    // Projection lines: blue (z), red (y), green (x)
    const rho_display = Math.hypot(Mx_r, My_r);
    
    // Blue dotted line: from Bloch vector straight down to xy plane (z direction)
    const bloch_proj = toCanvas(Mx_r, My_r, Mz_r);
    const xy_plane_proj = toCanvas(Mx_r, My_r, 0);
    
    ctx.strokeStyle = '#6699ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(bloch_proj.px, bloch_proj.py);
    ctx.lineTo(xy_plane_proj.px, xy_plane_proj.py);
    ctx.stroke();
    
    // Red dotted line: from xy projection point along y direction to x-axis
    const x_axis_proj = toCanvas(Mx_r, 0, 0);
    
    ctx.strokeStyle = '#ff6666';
    ctx.beginPath();
    ctx.moveTo(xy_plane_proj.px, xy_plane_proj.py);
    ctx.lineTo(x_axis_proj.px, x_axis_proj.py);
    ctx.stroke();
    
    // Green dotted line: from x-axis point along x axis to origin
    ctx.strokeStyle = '#66cc66';
    ctx.beginPath();
    ctx.moveTo(x_axis_proj.px, x_axis_proj.py);
    ctx.lineTo(0, 0);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // Applied torque vector: lab-frame B1 = (0, sin(tonePhase), 0)
    // In rotating frame, apply same rotation used to transform M
    if (showTorque && (holdTone || pulseTimeRemaining > 0)) {
        const torqueY_lab = Math.sin(tonePhase);
        let torqueX_disp = 0;
        let torqueY_disp = torqueY_lab;
        if (useRotatingFrame) {
            const omegaRot = 2 * Math.PI * (toneFreq + detuneHz);
            const rfAngle = omegaRot * labTime;
            const rfCos = Math.cos(rfAngle), rfSin = Math.sin(rfAngle);
            torqueX_disp = 0 * rfCos - torqueY_lab * rfSin;
            torqueY_disp = 0 * rfSin + torqueY_lab * rfCos;
        }
        const projTorque = toCanvas(torqueX_disp, torqueY_disp, 0);
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(projTorque.px, projTorque.py);
        ctx.stroke();
    }

    // Bloch vector projection using rotating-frame components
    const projBloch = toCanvas(Mx_r, My_r, Mz_r);
    ctx.strokeStyle = '#9933ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(projBloch.px, projBloch.py);
    ctx.stroke();
    // Legend — upper right, ~15% canvas height (~52px)
    const legW = 150, legH = 52, legPad = 8;
    const legX = cx - legW - 6;
    const legY = -cy + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(legX, legY, legW, legH);
    ctx.fill();
    ctx.stroke();
    ctx.font = '12px sans-serif';
    const row1Y = legY + legPad + 6;
    const row2Y = legY + legPad + 6 + 24;
    // Purple — magnetization
    ctx.strokeStyle = '#9933ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(legX + legPad, row1Y);
    ctx.lineTo(legX + legPad + 22, row1Y);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.fillText('magnetization', legX + legPad + 28, row1Y + 4);
    // Orange — torque
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(legX + legPad, row2Y);
    ctx.lineTo(legX + legPad + 22, row2Y);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.fillText('torque vector', legX + legPad + 28, row2Y + 4);
    // Torque checkbox (right side of row 2)
    const tcbSize = 11;
    const tcbX = legX + legW - legPad - tcbSize;
    const tcbY = row2Y - 8;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.fillStyle = showTorque ? '#ff8800' : '#fff';
    ctx.fillRect(tcbX, tcbY, tcbSize, tcbSize);
    ctx.strokeRect(tcbX, tcbY, tcbSize, tcbSize);
    if (showTorque) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tcbX + 2, tcbY + 6);
        ctx.lineTo(tcbX + 4, tcbY + 9);
        ctx.lineTo(tcbX + 9, tcbY + 2);
        ctx.stroke();
    }

    // Axis indicator — bottom left
    {
        const axLen = 28;
        const axOx = -cx + 28;
        const axOy = cy - 28;
        const axes = [
            { vec: [1,0,0], color: '#228822', label: 'x' },
            { vec: [0,1,0], color: '#cc2222', label: 'y' },
            { vec: [0,0,1], color: '#2255cc', label: 'z' },
        ];
        ctx.lineWidth = 2;
        ctx.font = 'bold 11px sans-serif';
        for (const ax of axes) {
            const tip = toCanvas(ax.vec[0], ax.vec[1], ax.vec[2]);
            const ex = axOx + tip.px / radius * axLen;
            const ey = axOy + tip.py / radius * axLen;
            ctx.strokeStyle = ax.color;
            ctx.beginPath();
            ctx.moveTo(axOx, axOy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.fillStyle = ax.color;
            ctx.fillText(ax.label, ex + 3, ey + 4);
        }
    }

    // Frame radio buttons (drawn in canvas, upper left) — drawn last so they appear over the sphere
    {
        const rbX = -radius + 12;
        const rbR = 5;
        const rb1Y = -radius + 13;
        const rb2Y = rb1Y + 18;
        const rbBoxX = -radius + 4, rbBoxY = -radius + 4, rbBoxW = 122, rbBoxH = 36;
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(rbBoxX, rbBoxY, rbBoxW, rbBoxH);
        ctx.fill();
        ctx.stroke();
        const drawRadio = (x, y, selected) => {
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x, y, rbR, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            if (selected) {
                ctx.fillStyle = '#9933ff';
                ctx.beginPath();
                ctx.arc(x, y, rbR - 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        };
        ctx.font = '12px sans-serif';
        drawRadio(rbX, rb1Y, !useRotatingFrame);
        ctx.fillStyle = '#444';
        ctx.lineWidth = 1;
        ctx.fillText('Lab frame', rbX + rbR + 5, rb1Y + 4);
        drawRadio(rbX, rb2Y, useRotatingFrame);
        ctx.fillStyle = '#444';
        ctx.fillText('Rotating frame', rbX + rbR + 5, rb2Y + 4);
    }

    ctx.restore();
    // info meters in cylindrical coords for selected frame
    const phi_threshold = 0.05;
    let phi_meter_display = '—';
    let phi_meter_fill = 50;
    if (!draw.lastPhi) draw.lastPhi = 0;
    if (rho_display > phi_threshold) {
        let phi_meter = Math.atan2(My_r, Mx_r) * 180 / Math.PI;
        draw.lastPhi = phi_meter;
        phi_meter_display = phi_meter.toFixed(0) + '°';
        phi_meter_fill = ((phi_meter + 180) / 360 * 100);
    } else {
        phi_meter_fill = ((draw.lastPhi + 180) / 360 * 100);
    }
    // Mic level meter: scale by gain, clamp to [0,1] for display
    document.getElementById('rho-val').textContent = rho_display.toFixed(2);
    document.getElementById('phi-val').textContent = phi_meter_display;
    document.getElementById('z-val').textContent = Mz_r.toFixed(2);
    document.getElementById('rho-fill').style.width = (rho_display * 100).toFixed(1) + '%';
    document.getElementById('phi-fill').style.width = phi_meter_fill.toFixed(1) + '%';
    document.getElementById('z-fill').style.width = ((Mz_r + 1) / 2 * 100).toFixed(1) + '%';
    // Grey out phi bar if rho below threshold
    const phiFillElem = document.getElementById('phi-fill');
    if (rho_display > phi_threshold) {
        phiFillElem.classList.remove('disabled');
    } else {
        phiFillElem.classList.add('disabled');
    }
}

function animate() {
    draw();
    requestAnimationFrame(animate);
}

// Auto-start animation and physics immediately
requestAnimationFrame(animate);
startPhysicsInterval();

// Eagerly init audio on first interaction with any control (pointerdown fires before click)
document.querySelector('.controls').addEventListener('pointerdown', () => {
    tryStartAudio();
}, { once: true });

// tone UI
toneControl = document.getElementById('tone-vol');
toneValueDisplay = document.getElementById('tone-val');
toneBtn = document.getElementById('tone-btn');
toneLockBtn = document.getElementById('tone-lock');
toneLed = document.getElementById('tone-led');
pulsePi2Btn = document.getElementById('pulse-pi2');
pulsePiBtn = document.getElementById('pulse-pi');
detuneControl = document.getElementById('detune');
detuneValueDisplay = document.getElementById('detune-val');
larmorControl = document.getElementById('larmor');
larmorValueDisplay = document.getElementById('larmor-val');

// frame toggle
// Canvas click: toggle rotating frame checkbox
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Frame radio buttons (upper left)
    const rbCanvasX = cx + (-radius + 12);
    const rb1CanvasY = cy + (-radius + 13);
    const rb2CanvasY = rb1CanvasY + 18;
    if (my >= rb1CanvasY - 8 && my <= rb1CanvasY + 8 && mx >= rbCanvasX - 8 && mx <= rbCanvasX + 120) {
        useRotatingFrame = false;
    } else if (my >= rb2CanvasY - 8 && my <= rb2CanvasY + 8 && mx >= rbCanvasX - 8 && mx <= rbCanvasX + 120) {
        useRotatingFrame = true;
    }
    // Torque checkbox (legend row 2, right side)
    const legW = 150, legPad = 8, tcbSize = 11;
    const legX = cx - legW - 6;
    const legY = -cy + 6;
    const row2Y = legY + legPad + 6 + 24;
    const tcbCanvasX = cx + (legX + legW - legPad - tcbSize);
    const tcbCanvasY = cy + (row2Y - 8);
    if (mx >= tcbCanvasX && mx <= tcbCanvasX + tcbSize && my >= tcbCanvasY && my <= tcbCanvasY + tcbSize) {
        showTorque = !showTorque;
    }
});

toneControl.addEventListener('input', () => {
    const toneHz = Math.pow(10, parseFloat(toneControl.value));
    toneValueDisplay.textContent = toneHz.toFixed(3).padStart(9, ' ');
});
if (detuneControl) {
    detuneControl.addEventListener('input', () => {
        detuneHz = parseFloat(detuneControl.value);
        detuneValueDisplay.textContent = detuneHz.toFixed(3).padStart(9, ' ');
    });
    detuneControl.addEventListener('dblclick', () => {
        detuneHz = 0;
        detuneControl.value = '0';
        detuneValueDisplay.textContent = detuneHz.toFixed(3).padStart(9, ' ');
    });
}
if (larmorControl) {
    larmorControl.addEventListener('input', () => {
        toneFreq = Math.pow(10, parseFloat(larmorControl.value));
        omega0 = 2 * Math.PI * toneFreq;
        larmorValueDisplay.textContent = toneFreq.toFixed(3).padStart(9, ' ');
    });
}

function updateToneState() {
    toneOn = holdTone || pulseActive;
    if (toneLed) {
        toneLed.classList.toggle('on', toneOn);
    }
    if (toneBtn) {
        toneBtn.disabled = toneLocked || pulseActive;
    }
    if (pulsePi2Btn) pulsePi2Btn.disabled = toneLocked;
    if (pulsePiBtn)  pulsePiBtn.disabled  = toneLocked;
}

// Tone button: hold to drive (only active when not latched)
toneBtn.addEventListener('click', () => {
    tryStartAudio();
});

toneBtn.addEventListener('mousedown', () => {
    tryStartAudio();
    if (!toneLocked && !pulseActive) {
        holdTone = true;
        updateToneState();
    }
});

toneBtn.addEventListener('mouseup', () => {
    if (!toneLocked) {
        holdTone = false;
        updateToneState();
    }
});

toneBtn.addEventListener('mouseleave', () => {
    if (!toneLocked) {
        holdTone = false;
        updateToneState();
    }
});

// Latch button: toggles constant drive; disables Fire and pulse buttons while active
toneLockBtn.addEventListener('click', () => {
    toneLocked = !toneLocked;
    holdTone = toneLocked;
    toneLockBtn.style.fontWeight = toneLocked ? 'bold' : 'normal';
    toneLockBtn.style.backgroundColor = toneLocked ? '#ddd' : '';
    updateToneState();
});
toneLockBtn.click(); // start latched

function triggerPulse(pulseAngle) {
    tryStartAudio();
    const toneHz = Math.pow(10, parseFloat(toneControl.value));
    if (toneHz <= 0 || pulseActive) return;
    const rabiOmega = 2 * Math.PI * toneHz;
    // RWA: effective Rabi = rabiOmega/2, so duration = 2*pulseAngle / rabiOmega
    const duration = 2 * pulseAngle / rabiOmega; // seconds
    pulseTimeRemaining = duration;
    pulseActive = true;
    updateToneState();
}

if (pulsePi2Btn) {
    pulsePi2Btn.addEventListener('click', () => { triggerPulse(Math.PI / 2); });
}
if (pulsePiBtn) {
    pulsePiBtn.addEventListener('click', () => { triggerPulse(Math.PI); });
}

// ensure tone value display matches slider default (pi)
if (toneControl) {
    const toneHz = Math.pow(10, parseFloat(toneControl.value));
    toneValueDisplay.textContent = toneHz.toFixed(3).padStart(9, ' ');
}
if (detuneControl) {
    detuneHz = parseFloat(detuneControl.value);
    detuneValueDisplay.textContent = detuneHz.toFixed(3).padStart(9, ' ');
}
if (larmorControl) {
    larmorControl.value = Math.log10(toneFreq);
    larmorValueDisplay.textContent = toneFreq.toFixed(3).padStart(9, ' ');
}

// audio output toggle
audioOutputToggle = document.getElementById('audio-out-toggle');
if (audioOutputToggle) {
    audioOutputToggle.addEventListener('change', () => {
        audioOutputEnabled = audioOutputToggle.checked;
        if (audioOutputEnabled) {
            tryStartAudio();
        }
    });
    audioOutputEnabled = audioOutputToggle.checked;
}

// T1/T2 sliders (log scale -1 to 2 corresponds to 0.1s–100s)
function logToVal(x) { return Math.pow(10, x); }
function valToLog(v) { return Math.log10(v); }


t1Slider = document.getElementById('t1-slider');
t1Display = document.getElementById('t1-val');
t1Toggle = document.getElementById('t1-toggle');
t2Slider = document.getElementById('t2-slider');
t2Display = document.getElementById('t2-val');
t2Toggle = document.getElementById('t2-toggle');

// Reset magnetization to equilibrium
const setMagBtn = document.getElementById('set-mag');
const magPreset = document.getElementById('mag-preset');
if (setMagBtn) {
    setMagBtn.addEventListener('click', () => {
        const preset = magPreset ? magPreset.value : 'south';
        if (preset === 'equator') {
            M.x = 1; M.y = 0; M.z = 0;
        } else {
            M.x = 0; M.y = 0; M.z = -1;
        }
    });
}

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
t1Slider.value = valToLog(10.0);
t2Slider.value = valToLog(20.0);
updateT1();
updateT2();

// T1/T2 toggle checkboxes
if (t1Toggle) {
    t1Toggle.addEventListener('change', () => {
        t1Enabled = t1Toggle.checked;
        t1Slider.disabled = !t1Enabled;
    });
    t1Enabled = t1Toggle.checked;
    t1Slider.disabled = !t1Enabled;
}

if (t2Toggle) {
    t2Toggle.addEventListener('change', () => {
        t2Enabled = t2Toggle.checked;
        t2Slider.disabled = !t2Enabled;
    });
    t2Enabled = t2Toggle.checked;
    t2Slider.disabled = !t2Enabled;
}
