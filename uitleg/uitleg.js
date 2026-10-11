import { initialState, throwPractice } from './score-oefening.js';

const buttons = Array.from(document.querySelectorAll('[data-throw]'));
const total = document.getElementById('demo-total');
const step = document.getElementById('demo-step');
const message = document.getElementById('demo-message');
const slots = [0, 1, 2].map(i => document.getElementById('slot-' + i));
const reset = document.getElementById('demo-reset');
let state = initialState();

function render(animate = false) {
  total.textContent = String(state.total);
  step.textContent = state.finished ? 'GOED GEDAAN!' : 'PIJL ' + (state.index + 1) + ' VAN 3';
  message.textContent = state.message;
  message.classList.toggle('wrong', state.wrong);
  message.classList.toggle('success', state.finished);
  slots.forEach((slot, i) => {
    const value = state.darts[i];
    slot.querySelector('strong').textContent = value?.code || '?';
    slot.classList.toggle('filled', Boolean(value));
    slot.classList.toggle('active', !state.finished && state.index === i);
  });
  buttons.forEach(button => {
    button.disabled = state.finished;
    button.setAttribute('aria-disabled', state.finished ? 'true' : 'false');
  });
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    total.classList.remove('bounce');
    // Force a layout pass so the score animation can restart after each correct throw.
    void total.offsetWidth;
    total.classList.add('bounce');
  }
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-throw]');
  if (!button || !buttons.includes(button)) return;
  const previous = state.index;
  state = throwPractice(state, button.dataset.throw);
  render(state.index !== previous);
});
reset.addEventListener('click', () => {
  state = initialState();
  render();
  buttons[0]?.focus();
});
render();
