// Pure demo-logica. Nooit naar opslag of internet schrijven.
export const TARGET_DARTS = Object.freeze([
  { code: 'T20', label: 'T20', points: 60, prompt: 'Pijl 2! Raak je een gewone 5? Tik op 5.' },
  { code: 'S5', label: '5', points: 5, prompt: 'Laatste pijl! Je raakt dubbel 10. Tik op DOUBLE 10.' },
  { code: 'D10', label: 'D10', points: 20, prompt: 'Goed gedaan! 60 + 5 + 20 = 85 punten. Je oefenbeurt is klaar.' }
]);
export function initialState() {
  return { index: 0, total: 0, darts: [], finished: false, message: 'Raak je de triple 20? Tik hieronder op TRIPLE 20.', wrong: false };
}
export function throwPractice(state, code) {
  if (state.finished) return state;
  const target = TARGET_DARTS[state.index];
  if (!target || code !== target.code) {
    const hints = [
      'Probeer TRIPLE 20: de smalle binnenste ring bij de 20 is 60 punten.',
      'Probeer de gewone 5: zonder DOUBLE of TRIPLE.',
      'Probeer DOUBLE 10: de smalle buitenste ring bij de 10 is 20 punten.'
    ];
    return { ...state, wrong: true, message: hints[state.index] || 'Probeer opnieuw.' };
  }
  const next = state.index + 1;
  return {
    index: next,
    total: state.total + target.points,
    darts: [...state.darts, { code: target.label, points: target.points }],
    finished: next === TARGET_DARTS.length,
    wrong: false,
    message: target.prompt
  };
}
