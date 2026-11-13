// The screens of the app, in navigation order, with the group each belongs to in the sidebar. The names follow the
// project's split: the Machina writes, the BPM Grid is where your hands shape every note.

/** @type {{ id: string, label: string, icon: string, group: 'Compose' | 'Studio', summary: string }[]} */
export const VIEWS = [
  { id: 'home', label: 'Home', icon: 'home', group: 'Compose', summary: 'Your song at a glance, and what to do next' },
  { id: 'machina', label: 'Machina', icon: 'machina', group: 'Compose', summary: 'Direct the AI composer' },
  { id: 'grid', label: 'BPM Grid', icon: 'grid', group: 'Compose', summary: 'Shape every note by hand' },
  { id: 'arrange', label: 'Arrangement', icon: 'arrange', group: 'Compose', summary: 'Sections, cues and the export' },
  { id: 'settings', label: 'Settings', icon: 'gear', group: 'Studio', summary: 'Your Anthropic API key' },
];

export const GROUPS = ['Compose', 'Studio'];
