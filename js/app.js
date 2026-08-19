// =========================================================
// СМОЛЕНСКИЙ ПОКЕР — ЗВУКИ ИНТЕРФЕЙСА
// =========================================================

let audioContext = null;

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (
            window.AudioContext ||
            window.webkitAudioContext
        )();
    }

    return audioContext;
}


// Короткий приятный звук нажатия
function playButtonSound() {

    const ctx = getAudioContext();

    if (ctx.state === "suspended") {
        ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";

    // Небольшой высокий click
    oscillator.frequency.setValueAtTime(520, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
        760,
        ctx.currentTime + 0.035
    );

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);

    gain.gain.exponentialRampToValueAtTime(
        0.12,
        ctx.currentTime + 0.005
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + 0.07
    );

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();

    oscillator.stop(ctx.currentTime + 0.08);
}


// Все кнопки сайта
document.addEventListener("DOMContentLoaded", () => {

    const buttons = document.querySelectorAll("button");

    buttons.forEach(button => {

        button.addEventListener("click", () => {
            playButtonSound();
        });

    });

});
