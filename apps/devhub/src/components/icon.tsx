/**
 * Line icons drawn here: the shared UI ships none. Decorative only — the text next to each icon
 * carries the meaning, so every icon is `aria-hidden`. Stroke is `currentColor`, so icons follow
 * the text color and the light/dark theme.
 */
const PATHS = {
  overview: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 8h.01'],
  source: ['m8 7-5 5 5 5', 'm16 7 5 5-5 5', 'm14 4-4 16'],
  document: ['M6 3h8l4 4v14H6Z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  test: [
    'M9 3h6',
    'M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3',
    'M7.5 15h9',
  ],
  api: ['M4 8h14', 'm15 5 3 3-3 3', 'M20 16H6', 'm9 13-3 3 3 3'],
  related: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  external: [
    'M14 4h6v6',
    'M20 4 11 13',
    'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  ],
  copy: ['M9 9h11v11H9Z', 'M5 15V5a1 1 0 0 1 1-1h9'],
  check: ['m5 12 5 5 9-10'],
  warning: ['M12 3 22 20H2Z', 'M12 10v4', 'M12 17h.01'],
  runtime: ['M4 5h16v11H4Z', 'M9 20h6', 'M12 16v4'],
  owner: ['M4 7.5 12 3l8 4.5v9L12 21l-8-4.5Z', 'm4 7.5 8 4.5 8-4.5', 'M12 12v9'],
  contract: [
    'M9 4H8a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1',
    'M15 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1',
  ],
  outgoing: ['M5 12h14', 'm14 7 5 5-5 5'],
  minus: ['M5 12h14'],
  plus: ['M12 5v14', 'M5 12h14'],
  brand: [
    'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    'M12 3v6.5',
    'M12 14.5V21',
    'M4 7.5l5.8 3.3',
    'M20 7.5l-5.8 3.3',
    'M4 16.5l5.8-3.3',
    'M20 16.5l-5.8-3.3',
  ],
  home: ['m4 11 8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-6h4v6'],
  scenario: [
    'M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    'M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    'M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  ],
  architecture: ['m12 3 9 5-9 5-9-5Z', 'm3 12.5 9 5 9-5', 'm3 17 9 5 9-5'],
  application: ['M4 5h16v14H4Z', 'M4 9h16', 'M7 7h.01'],
  library: ['M5 4h4v16H5Z', 'M11 4h4v16h-4Z', 'm17 5.5 3 .8-3.6 14.2-3-.8'],
  engineering: ['m5 8 4 4-4 4', 'M12 16h7', 'M3 4h18v16H3Z'],
  sun: [
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M12 2v2',
    'M12 20v2',
    'm4.9 4.9 1.4 1.4',
    'm17.7 17.7 1.4 1.4',
    'M2 12h2',
    'M20 12h2',
    'm4.9 19.1 1.4-1.4',
    'm17.7 6.3 1.4-1.4',
  ],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z'],
  hash: ['M5 9h14', 'M5 15h14', 'M10 4 8 20', 'M16 4l-2 16'],
  incoming: ['M19 12H5', 'm10 7-5 5 5 5'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  globe: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    'M3 12h18',
    'M12 3a14 14 0 0 1 0 18',
    'M12 3a14 14 0 0 0 0 18',
  ],
  help: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6',
    'M12 17h.01',
  ],
  fit: [
    'M4 8V5a1 1 0 0 1 1-1h3',
    'M16 4h3a1 1 0 0 1 1 1v3',
    'M20 16v3a1 1 0 0 1-1 1h-3',
    'M8 20H5a1 1 0 0 1-1-1v-3',
    'M9 9h6v6H9Z',
  ],
  'chevron-left': ['m15 6-6 6 6 6'],
  'chevron-right': ['m9 6 6 6-6 6'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-4-4'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['shrink-0', className].filter(Boolean).join(' ')}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
