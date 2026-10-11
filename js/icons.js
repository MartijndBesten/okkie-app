// OKKIE. — eigen lijniconen (24 x 24, kleur via currentColor). Vervangen emoji in navigatie en knoppen.
const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  // Twee ringen met een pijl: dezelfde vorm als de O van OKKIE.
  train: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="3.2"/><path d="m11 13 8.5-8.5M16.5 4.5h3v3"/>',
  // Scorebord met twee kolommen (zoals bij 301/501 op het krijtbord)
  match: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14M6.5 9.5h3M14.5 9.5h3M6.5 13h2M14.5 13h2.5"/>',
  stats: '<path d="M4 20h16"/><path d="M6.5 16.5 10.5 11l3.5 3 4.5-7"/><circle cx="18.5" cy="7" r="1.2" fill="currentColor"/>',
  more: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v3.5M8.5 20h7M10 16.5h4l.5 3.5h-5z"/>',
  friends: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="8" r="2.6"/><path d="M15.5 13.6A4.6 4.6 0 0 1 21 18"/>',
  invite: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
  whatsapp: '<path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6z"/><path d="M9.2 8.6c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .4-.1.6l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.1.4-.2.6-.1l1.5.6c.3.1.4.3.4.5v.5c0 .3 0 .5-.4.7-.5.3-1.2.5-1.8.4-2.6-.5-4.6-2.5-5.1-5.1-.1-.6.1-1.3.4-1.8z" fill="currentColor" stroke="none"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  install: '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M12 7.5v6M9.5 11l2.5 2.5 2.5-2.5M10.5 18h3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9M12 8v4.5l3 1.5"/>',
  book: '<path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h5.5v15H6a1.5 1.5 0 0 0-1.5 1.5zM19.5 5.5A1.5 1.5 0 0 0 18 4h-5.5v15H18a1.5 1.5 0 0 1 1.5 1.5z"/>',
  import: '<path d="M12 3.5v10M8 9.5l4 4 4-4"/><path d="M4.5 14.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4.5"/>',
  group: '<circle cx="12" cy="8.5" r="3"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="5" cy="10" r="2"/><circle cx="19" cy="10" r="2"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  keyboard: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M7 10h.01M10.3 10h.01M13.6 10h.01M17 10h.01M8 14h8"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
};

export function icon(name, { size = 22, label = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ico ico-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${P[name] || ''}</svg>`;
}
