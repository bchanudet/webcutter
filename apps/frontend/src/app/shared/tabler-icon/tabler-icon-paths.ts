/**
 * Inner <path> markup for a small subset of Tabler Icons (MIT licensed,
 * https://tabler.io/icons), copied verbatim from the @tabler/icons package. Kept as inline
 * strings because the Angular wrapper package (angular-tabler-icons) only supports
 * Angular 17-19, while this workspace runs Angular 22.
 */
export type TablerIconName =
  | 'route'
  | 'download'
  | 'file-upload'
  | 'file-download'
  | 'trash-x'
  | 'zoom-scan'
  | 'arrow-left-dashed'
  | 'arrow-right-dashed'
  | 'adjustments-horizontal'
  | 'code'
  | 'code-circle'
  | 'building-factory-2'
  | 'settings'
  | 'file-scissors'
  | 'plus'
  | 'pencil'
  | 'chevron-right'
  | 'chevron-down'
  | 'plug-connected'
  | 'home'
  | 'player-pause'
  | 'player-stop'
  | 'arrow-badge-right'
  | 'arrow-badge-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right';

export type TablerIconVariant = 'outline' | 'filled';

interface TablerIconDefinition {
  variant: TablerIconVariant;
  paths: string;
}

export const TABLER_ICON_PATHS: Record<TablerIconName, TablerIconDefinition> = {
  route: {
    variant: 'outline',
    paths: `
      <path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4" />
      <path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5" />
    `,
  },
  download: {
    variant: 'outline',
    paths: `
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 11l5 5l5 -5" />
      <path d="M12 4l0 12" />
    `,
  },
  'file-upload': {
    variant: 'outline',
    paths: `
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M12 11v6" />
      <path d="M9.5 13.5l2.5 -2.5l2.5 2.5" />
    `,
  },
  'file-download': {
    variant: 'outline',
    paths: `
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M12 17v-6" />
      <path d="M9.5 14.5l2.5 2.5l2.5 -2.5" />
    `,
  },
  'trash-x': {
    variant: 'outline',
    paths: `
      <path d="M4 7h16" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
      <path d="M10 12l4 4m0 -4l-4 4" />
    `,
  },
  'zoom-scan': {
    variant: 'outline',
    paths: `
      <path d="M8 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M16 16l-2.5 -2.5" />
      <path d="M3 7v-2a2 2 0 0 1 2 -2h2" />
      <path d="M3 17v2a2 2 0 0 0 2 2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M17 21h2a2 2 0 0 0 2 -2v-2" />
    `,
  },
  'arrow-left-dashed': {
    variant: 'outline',
    paths: `
      <path d="M5 12h6m3 0h1.5m3 0h.5" />
      <path d="M5 12l6 6" />
      <path d="M5 12l6 -6" />
    `,
  },
  'arrow-right-dashed': {
    variant: 'outline',
    paths: `
      <path d="M5 12h.5m3 0h1.5m3 0h6" />
      <path d="M13 18l6 -6" />
      <path d="M13 6l6 6" />
    `,
  },
  'adjustments-horizontal': {
    variant: 'outline',
    paths: `
      <path d="M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 6l8 0" />
      <path d="M16 6l4 0" />
      <path d="M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 12l2 0" />
      <path d="M10 12l10 0" />
      <path d="M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M4 18l11 0" />
      <path d="M19 18l1 0" />
    `,
  },
  code: {
    variant: 'outline',
    paths: `
      <path d="M7 8l-4 4l4 4" />
      <path d="M17 8l4 4l-4 4" />
      <path d="M14 4l-4 16" />
    `,
  },
  'code-circle': {
    variant: 'outline',
    paths: `
      <path d="M10 14l-2 -2l2 -2" />
      <path d="M14 10l2 2l-2 2" />
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    `,
  },
  'building-factory-2': {
    variant: 'outline',
    paths: `
      <path d="M3 21h18" />
      <path d="M5 21v-12l5 4v-4l5 4h4" />
      <path d="M19 21v-8l-1.436 -9.574a.5 .5 0 0 0 -.495 -.426h-1.145a.5 .5 0 0 0 -.494 .418l-1.43 8.582" />
      <path d="M9 17h1" />
      <path d="M14 17h1" />
    `,
  },
  settings: {
    variant: 'outline',
    paths: `
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    `,
  },
  'file-scissors': {
    variant: 'filled',
    paths: `
      <path d="M12 2l.117 .007a1 1 0 0 1 .876 .876l.007 .117v4l.005 .15a2 2 0 0 0 1.838 1.844l.157 .006h4l.117 .007a1 1 0 0 1 .876 .876l.007 .117v9a3 3 0 0 1 -2.824 2.995l-.176 .005h-10a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-14a3 3 0 0 1 2.824 -2.995l.176 -.005zm-2.293 9.293a1 1 0 1 0 -1.414 1.414l2.292 2.293l-1.068 1.067a2.003 2.003 0 0 0 -2.512 1.784l-.005 .149a2 2 0 1 0 3.933 -.516l1.067 -1.069l1.067 1.068a2 2 0 0 0 -.062 .368l-.005 .149a2 2 0 1 0 1.484 -1.933l-1.069 -1.067l2.292 -2.293a1 1 0 0 0 -1.414 -1.414l-2.293 2.292z" />
      <path d="M19 7h-4l-.001 -4.001z" />
    `,
  },
  plus: {
    variant: 'outline',
    paths: `
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    `,
  },
  pencil: {
    variant: 'outline',
    paths: `
      <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
      <path d="M13.5 6.5l4 4" />
    `,
  },
  'chevron-right': {
    variant: 'outline',
    paths: `
      <path d="M9 6l6 6l-6 6" />
    `,
  },
  'chevron-down': {
    variant: 'outline',
    paths: `
      <path d="M6 9l6 6l6 -6" />
    `,
  },
  'plug-connected': {
    variant: 'outline',
    paths: `
      <path d="M7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1 -5 -5l1.5 -1.5z" />
      <path d="M17 12l-5 -5l1.5 -1.5a3.536 3.536 0 1 1 5 5l-1.5 1.5z" />
      <path d="M3 21l2.5 -2.5" />
      <path d="M18.5 5.5l2.5 -2.5" />
      <path d="M10 11l-2 2" />
      <path d="M13 14l-2 2" />
    `,
  },
  home: {
    variant: 'outline',
    paths: `
      <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
      <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
    `,
  },
  'player-pause': {
    variant: 'outline',
    paths: `
      <path d="M6 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
      <path d="M14 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    `,
  },
  'player-stop': {
    variant: 'outline',
    paths: `
      <path d="M6 6m0 1a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z" />
    `,
  },
  'arrow-badge-right': {
    variant: 'outline',
    paths: `
      <path d="M13 7h-6l4 5l-4 5h6l4 -5l-4 -5" />
    `,
  },
  'arrow-badge-left': {
    variant: 'outline',
    paths: `
      <path d="M11 17h6l-4 -5l4 -5h-6l-4 5l4 5" />
    `,
  },
  'arrow-up': {
    variant: 'outline',
    paths: `
      <path d="M12 5l0 14" />
      <path d="M18 11l-6 -6" />
      <path d="M6 11l6 -6" />
    `,
  },
  'arrow-down': {
    variant: 'outline',
    paths: `
      <path d="M12 5l0 14" />
      <path d="M18 13l-6 6" />
      <path d="M6 13l6 6" />
    `,
  },
  'arrow-left': {
    variant: 'outline',
    paths: `
      <path d="M5 12l14 0" />
      <path d="M5 12l6 6" />
      <path d="M5 12l6 -6" />
    `,
  },
  'arrow-right': {
    variant: 'outline',
    paths: `
      <path d="M5 12l14 0" />
      <path d="M13 18l6 -6" />
      <path d="M13 6l6 6" />
    `,
  },
};
