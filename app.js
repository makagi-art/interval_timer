// --- Elements ---
const setupView  = document.getElementById('setup-view');
const timerView  = document.getElementById('timer-view');
const pauseBtn   = document.getElementById('pause-btn');
const stopBtn    = document.getElementById('stop-btn');
const phaseLabel = document.getElementById('phase-label');
const roundLabel = document.getElementById('round-label');
const timeDisplay = document.getElementById('time-left');
const progressCircle = document.getElementById('progress-ring');

// --- Circle Geometry ---
const circleRadius = progressCircle.r.baseVal.value;
const circleCircumference = circleRadius * 2 * Math.PI;
progressCircle.style.strokeDasharray  = `${circleCircumference} ${circleCircumference}`;
progressCircle.style.strokeDashoffset = circleCircumference;

function setProgress(ratio) {
    // ratio: 1 = full, 0 = empty
    const offset = circleCircumference - ratio * circleCircumference;
    progressCircle.style.strokeDashoffset = offset;
}

// --- Audio ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playBeep(frequency, duration, vol = 0.6) {
    if (!audioCtx) return;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// フェーズ切り替え時だけ鳴らす音
function beepWorkStart() {
    // 高め・元気よく
    playBeep(880, 0.15, 0.7);
    setTimeout(() => playBeep(1100, 0.25, 0.7), 160);
}

function beepRestStart() {
    // 低め・落ち着いて
    playBeep(660, 0.15, 0.5);
    setTimeout(() => playBeep(440, 0.35, 0.5), 160);
}

function beepDone() {
    // 終了3連打
    playBeep(880, 0.15, 0.7);
    setTimeout(() => playBeep(880, 0.15, 0.7), 200);
    setTimeout(() => playBeep(1320, 0.5,  0.8), 400);
}

// --- State ---
let config = { workTime: 50, restTime: 10 };
let state  = {
    phase: 'setup',
    currentRound: 1,
    timeLeft: 0,
    totalPhaseTime: 0,
    intervalId: null,
    isPaused: false
};

// --- Preset Selection ---
document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => {
        config.workTime = parseInt(card.dataset.work);
        config.restTime = parseInt(card.dataset.rest);
        startTimer();
    });
});

// --- Helpers ---
function formatTime(seconds) {
    if (seconds < 60) return String(seconds);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    timeDisplay.textContent = formatTime(state.timeLeft);
    setProgress(state.timeLeft / state.totalPhaseTime);
}

// --- Phase Switching ---
function switchPhase(newPhase) {
    state.phase = newPhase;
    document.body.className = `phase-${newPhase}`;

    if (newPhase === 'prepare') {
        phaseLabel.textContent = 'READY';
        state.totalPhaseTime = 5;
        state.timeLeft = 5;
        // 準備カウントダウンは音なし

    } else if (newPhase === 'work') {
        phaseLabel.textContent = 'WORK';
        state.totalPhaseTime = config.workTime;
        state.timeLeft = config.workTime;
        beepWorkStart();

    } else if (newPhase === 'rest') {
        phaseLabel.textContent = 'REST';
        state.totalPhaseTime = config.restTime;
        state.timeLeft = config.restTime;
        beepRestStart();

    } else if (newPhase === 'done') {
        phaseLabel.textContent = 'DONE!';
        roundLabel.textContent  = `Round ${state.currentRound}`;
        timeDisplay.textContent = '0';
        setProgress(0);
        beepDone();
        stopTimer();
        setTimeout(resetToSetup, 3000);
        return;
    }

    roundLabel.textContent = `Round ${state.currentRound}`;
    updateDisplay();
}

// --- Tick ---
function tick() {
    if (state.isPaused) return;
    state.timeLeft--;

    if (state.timeLeft <= 0) {
        // フェーズ終了 → 次へ
        if (state.phase === 'prepare') {
            switchPhase('work');
        } else if (state.phase === 'work') {
            if (config.restTime > 0) {
                switchPhase('rest');
            } else {
                state.currentRound++;
                switchPhase('work');
            }
        } else if (state.phase === 'rest') {
            state.currentRound++;
            switchPhase('work');
        }
    } else {
        updateDisplay();
    }
}

// --- Start / Stop / Pause ---
function startTimer() {
    initAudio();
    setupView.classList.remove('active');
    timerView.classList.add('active');

    state.currentRound = 1;
    state.isPaused = false;
    pauseBtn.textContent = 'PAUSE';
    document.body.style.opacity = '1';

    clearInterval(state.intervalId);
    switchPhase('prepare');
    state.intervalId = setInterval(tick, 1000);
}

function stopTimer() {
    clearInterval(state.intervalId);
}

function resetToSetup() {
    stopTimer();
    document.body.className = '';
    document.body.style.opacity = '1';
    timerView.classList.remove('active');
    setupView.classList.add('active');
}

function togglePause() {
    state.isPaused = !state.isPaused;
    if (state.isPaused) {
        pauseBtn.textContent = 'RESUME';
        document.body.style.opacity = '0.65';
    } else {
        pauseBtn.textContent = 'PAUSE';
        document.body.style.opacity = '1';
    }
}

// --- Event Listeners ---
pauseBtn.addEventListener('click', togglePause);
stopBtn.addEventListener('click', resetToSetup);
