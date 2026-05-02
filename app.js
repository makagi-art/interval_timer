// --- Elements ---
const setupView = document.getElementById('setup-view');
const timerView = document.getElementById('timer-view');

const workTimeInput = document.getElementById('work-time');
const restTimeInput = document.getElementById('rest-time');
const roundsInput = document.getElementById('rounds');

const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');

const phaseLabel = document.getElementById('phase-label');
const roundLabel = document.getElementById('round-label');
const timeDisplay = document.getElementById('time-left');
const progressCircle = document.getElementById('progress-ring');

// --- Configuration ---
let config = {
    workTime: 20,
    restTime: 10,
    rounds: 8,
    prepareTime: 5
};

// --- State ---
let state = {
    phase: 'setup', // setup, prepare, work, rest, done
    currentRound: 1,
    timeLeft: 0,
    totalPhaseTime: 0,
    intervalId: null,
    isPaused: false
};

// --- Audio Context for Beeps ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playBeep(frequency, duration, vol = 0.5) {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

function beepLow() { playBeep(440, 0.3); }
function beepHigh() { playBeep(880, 0.5); }
function beepEnd() {
    playBeep(440, 0.2);
    setTimeout(() => playBeep(440, 0.2), 200);
    setTimeout(() => playBeep(880, 0.6), 400);
}

// --- Circle Progress Logic ---
const circleRadius = progressCircle.r.baseVal.value;
const circleCircumference = circleRadius * 2 * Math.PI;
progressCircle.style.strokeDasharray = `${circleCircumference} ${circleCircumference}`;
progressCircle.style.strokeDashoffset = circleCircumference;

function setProgress(percent) {
    const offset = circleCircumference - percent * circleCircumference;
    progressCircle.style.strokeDashoffset = offset;
}

// --- Input Controls Logic ---
function attachControls(id, min, max, step, configKey) {
    const minusBtn = document.getElementById(`${id}-minus`);
    const plusBtn = document.getElementById(`${id}-plus`);
    const input = document.getElementById(id);

    minusBtn.addEventListener('click', () => {
        let val = parseInt(input.value);
        if (val > min) {
            val -= step;
            input.value = val;
            config[configKey] = val;
        }
    });

    plusBtn.addEventListener('click', () => {
        let val = parseInt(input.value);
        if (val < max) {
            val += step;
            input.value = val;
            config[configKey] = val;
        }
    });
}

attachControls('work', 5, 900, 5, 'workTime');
attachControls('rest', 0, 900, 5, 'restTime');
attachControls('rounds', 1, 99, 1, 'rounds');

// --- Timer Logic ---
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) {
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return s.toString();
}

function updateDisplay() {
    timeDisplay.textContent = formatTime(state.timeLeft);
    const progress = state.timeLeft / state.totalPhaseTime;
    setProgress(progress);
}

function switchPhase(newPhase) {
    state.phase = newPhase;
    document.body.className = `phase-${newPhase}`;
    
    if (newPhase === 'prepare') {
        phaseLabel.textContent = 'PREPARE';
        state.totalPhaseTime = config.prepareTime;
        state.timeLeft = config.prepareTime;
        beepHigh();
    } else if (newPhase === 'work') {
        phaseLabel.textContent = 'WORK';
        state.totalPhaseTime = config.workTime;
        state.timeLeft = config.workTime;
        beepHigh();
    } else if (newPhase === 'rest') {
        phaseLabel.textContent = 'REST';
        state.totalPhaseTime = config.restTime;
        state.timeLeft = config.restTime;
        playBeep(600, 0.4); 
    } else if (newPhase === 'done') {
        phaseLabel.textContent = 'DONE!';
        timeDisplay.textContent = "0";
        setProgress(0);
        beepEnd();
        stopTimer();
        setTimeout(resetToSetup, 3000);
        return;
    }

    roundLabel.textContent = `Round ${state.currentRound} / ${config.rounds}`;
    updateDisplay();
}

function tick() {
    if (state.isPaused) return;

    state.timeLeft--;

    if (state.timeLeft <= 3 && state.timeLeft > 0) {
        beepLow();
    }

    if (state.timeLeft <= 0) {
        if (state.phase === 'prepare') {
            switchPhase('work');
        } else if (state.phase === 'work') {
            if (state.currentRound >= config.rounds) {
                switchPhase('done');
            } else {
                if (config.restTime > 0) {
                    switchPhase('rest');
                } else {
                    state.currentRound++;
                    switchPhase('work');
                }
            }
        } else if (state.phase === 'rest') {
            state.currentRound++;
            switchPhase('work');
        }
    } else {
        updateDisplay();
    }
}

function startTimer() {
    initAudio();
    if(audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    setupView.classList.remove('active');
    timerView.classList.add('active');
    
    state.currentRound = 1;
    state.isPaused = false;
    pauseBtn.textContent = 'PAUSE';
    document.body.style.opacity = '1';

    switchPhase('prepare');
    
    clearInterval(state.intervalId);
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
        document.body.style.opacity = '0.7';
    } else {
        pauseBtn.textContent = 'PAUSE';
        document.body.style.opacity = '1';
    }
}

// --- Event Listeners ---
startBtn.addEventListener('click', startTimer);
stopBtn.addEventListener('click', resetToSetup);
pauseBtn.addEventListener('click', togglePause);
