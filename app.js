// --- Elements ---
const setupView   = document.getElementById('setup-view');
const timerView   = document.getElementById('timer-view');
const pauseBtn    = document.getElementById('pause-btn');
const stopBtn     = document.getElementById('stop-btn');
const phaseLabel  = document.getElementById('phase-label');
const roundLabel  = document.getElementById('round-label');
const timeDisplay = document.getElementById('time-left');
const progressCircle = document.getElementById('progress-ring');

// --- Circle Geometry ---
// r="120" は HTML の SVG 属性に合わせてハードコード
const circleCircumference = 120 * 2 * Math.PI; // ≈ 753.98
progressCircle.style.strokeDasharray  = `${circleCircumference} ${circleCircumference}`;
progressCircle.style.strokeDashoffset = `${circleCircumference}`;

function setProgress(ratio) {
    const offset = circleCircumference - Math.max(0, Math.min(1, ratio)) * circleCircumference;
    progressCircle.style.strokeDashoffset = offset;
}

// --- Audio ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
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

function beepWorkStart() {
    playBeep(880, 0.15, 0.7);
    setTimeout(() => playBeep(1100, 0.25, 0.7), 160);
}
function beepRestStart() {
    playBeep(660, 0.15, 0.5);
    setTimeout(() => playBeep(440, 0.35, 0.5), 160);
}
function beepDone() {
    playBeep(880, 0.15, 0.7);
    setTimeout(() => playBeep(880, 0.15, 0.7), 200);
    setTimeout(() => playBeep(1320, 0.5,  0.8), 400);
}

// --- Wake Lock（画面スリープ防止）---
let wakeLock = null;
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {
            // 非対応 or 拒否された場合は無視
        }
    }
}
async function releaseWakeLock() {
    if (wakeLock) {
        try { await wakeLock.release(); } catch (e) {}
        wakeLock = null;
    }
}

// --- State ---
let config = { workTime: 50, restTime: 10 };
let state  = {
    phase: 'setup',
    currentRound: 1,
    timeLeft: 0,
    totalPhaseTime: 0,
    endTime: 0,       // フェーズ終了の絶対タイムスタンプ (ms)
    pausedAt: 0,      // ポーズした時刻
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
    timeDisplay.textContent = formatTime(Math.max(0, state.timeLeft));
    setProgress(state.timeLeft / state.totalPhaseTime);
}

// --- Phase Switching ---
function switchPhase(newPhase) {
    state.phase = newPhase;
    document.body.className = `phase-${newPhase}`;

    if (newPhase === 'prepare') {
        phaseLabel.textContent    = 'READY';
        state.totalPhaseTime      = 5;
        state.timeLeft            = 5;

    } else if (newPhase === 'work') {
        phaseLabel.textContent    = 'WORK';
        state.totalPhaseTime      = config.workTime;
        state.timeLeft            = config.workTime;
        beepWorkStart();

    } else if (newPhase === 'rest') {
        phaseLabel.textContent    = 'REST';
        state.totalPhaseTime      = config.restTime;
        state.timeLeft            = config.restTime;
        beepRestStart();

    } else if (newPhase === 'done') {
        phaseLabel.textContent    = 'DONE!';
        roundLabel.textContent    = `Round ${state.currentRound}`;
        timeDisplay.textContent   = '0';
        setProgress(0);
        beepDone();
        stopTimer();
        releaseWakeLock();
        setTimeout(resetToSetup, 3000);
        return;
    }

    // フェーズ終了の絶対時刻を記録
    state.endTime = Date.now() + state.totalPhaseTime * 1000;

    roundLabel.textContent = `Round ${state.currentRound}`;
    updateDisplay();
}

// --- フェーズ終了処理（共通） ---
function advanceFromCurrentPhase() {
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
}

// --- Tick（タイムスタンプ基準で残り時間を計算）---
function tick() {
    if (state.isPaused) return;

    // setInterval の遅延誤差・バックグラウンド復帰に関わらず正確な残り時間を取得
    state.timeLeft = Math.ceil((state.endTime - Date.now()) / 1000);

    if (state.timeLeft <= 0) {
        advanceFromCurrentPhase();
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
    state.intervalId = setInterval(tick, 500); // 0.5秒ごとに更新して精度向上
    requestWakeLock();
}

function stopTimer() {
    clearInterval(state.intervalId);
}

function resetToSetup() {
    stopTimer();
    releaseWakeLock();
    document.body.className = '';
    document.body.style.opacity = '1';
    timerView.classList.remove('active');
    setupView.classList.add('active');
    state.phase = 'setup';
}

function togglePause() {
    state.isPaused = !state.isPaused;

    if (state.isPaused) {
        // ポーズ：残り時間を保存
        state.pausedAt = Date.now();
        pauseBtn.textContent = 'RESUME';
        document.body.style.opacity = '0.65';
        releaseWakeLock();
    } else {
        // 再開：ポーズしていた分だけ終了時刻を延長
        const pausedDuration = Date.now() - state.pausedAt;
        state.endTime += pausedDuration;
        pauseBtn.textContent = 'PAUSE';
        document.body.style.opacity = '1';
        requestWakeLock();
    }
}

// --- Page Visibility API（バックグラウンド復帰時の補正）---
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // バックグラウンドへ：Wake Lock が自動解除される場合があるので記録
        return;
    }

    // フォアグラウンド復帰
    if (state.phase === 'setup' || state.phase === 'done' || state.isPaused) return;

    // バックグラウンド中に複数フェーズ経過していた場合でも対応
    // 現在時刻と endTime を比較し、必要なら即座にフェーズを進める
    if (Date.now() >= state.endTime) {
        advanceFromCurrentPhase();
    } else {
        // フェーズ途中なら表示を即更新（次の tick まで待たない）
        tick();
    }

    // Wake Lock を再取得（バックグラウンドで解除された可能性）
    requestWakeLock();
});

// --- Event Listeners ---
pauseBtn.addEventListener('click', togglePause);
stopBtn.addEventListener('click', resetToSetup);
