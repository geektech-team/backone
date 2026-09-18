import type { StyleSheet } from '@geektech/tsone';

const accent = '#0f766e';
const accentStrong = '#115e59';
const accentSoft = '#ccfbf1';

export const docsStyles: StyleSheet = [
  {
    selector: ':root',
    properties: {
      colorScheme: 'light',
      '--docs-bg': '#f6f8fb',
      '--docs-surface': '#ffffff',
      '--docs-text': '#182235',
      '--docs-muted': '#5b6b82',
      '--docs-border': '#dfe6f0',
      '--docs-accent': accent,
      '--docs-accent-strong': accentStrong,
      '--docs-accent-soft': accentSoft,
      '--docs-code-bg': '#0f172a',
      '--docs-code-text': '#dbeafe',
      '--docs-nav-active': '#e6f4f2',
    },
  },
  {
    selector: 'body',
    properties: {
      background: 'var(--docs-bg)',
      color: 'var(--docs-text)',
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: '16px',
      lineHeight: 1.7,
      margin: 0,
    },
  },
  {
    selector: 'a',
    properties: {
      color: 'var(--docs-accent-strong)',
      textDecoration: 'none',
    },
  },
  {
    selector: 'a:hover',
    properties: {
      textDecoration: 'underline',
    },
  },
  {
    selector: 'code',
    properties: {
      background: 'rgba(15, 23, 42, 0.06)',
      borderRadius: '4px',
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontSize: '0.88em',
      padding: '2px 6px',
    },
  },
  {
    selector: '.docs-shell',
    properties: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    },
  },
  {
    selector: '.docs-topbar',
    properties: {
      alignItems: 'center',
      background: 'var(--docs-surface)',
      borderBottom: '1px solid var(--docs-border)',
      display: 'flex',
      gap: '20px',
      justifyContent: 'space-between',
      left: 0,
      minHeight: '58px',
      padding: '0 28px',
      position: 'fixed',
      right: 0,
      top: 0,
      zIndex: 10,
    },
  },
  {
    selector: '.docs-brand',
    properties: {
      alignItems: 'center',
      display: 'flex',
      fontSize: '17px',
      fontWeight: 800,
      gap: '10px',
      textDecoration: 'none',
    },
  },
  {
    selector: '.docs-brand-mark',
    properties: {
      alignItems: 'center',
      background: 'var(--docs-accent)',
      borderRadius: '7px',
      color: '#ffffff',
      display: 'inline-flex',
      fontSize: '12px',
      fontWeight: 800,
      height: '26px',
      justifyContent: 'center',
      letterSpacing: '-0.02em',
      width: '26px',
    },
  },
  {
    selector: '.docs-brand-sub',
    properties: {
      color: 'var(--docs-muted)',
      fontSize: '13px',
      fontWeight: 500,
    },
  },
  {
    selector: '.docs-tools',
    properties: {
      alignItems: 'center',
      display: 'flex',
      gap: '12px',
    },
  },
  {
    selector: '.docs-badge',
    properties: {
      background: 'var(--docs-accent-soft)',
      border: '1px solid rgba(15, 118, 110, 0.25)',
      borderRadius: '999px',
      color: 'var(--docs-accent-strong)',
      fontSize: '12px',
      fontWeight: 700,
      padding: '3px 10px',
    },
  },
  {
    selector: '.docs-link',
    properties: {
      color: 'var(--docs-muted)',
      fontSize: '13px',
      fontWeight: 600,
      textDecoration: 'none',
    },
  },
  {
    selector: '.docs-layout',
    properties: {
      display: 'flex',
      flexGrow: 1,
      marginTop: '58px',
    },
  },
  {
    selector: '.docs-sidebar',
    properties: {
      background: 'var(--docs-surface)',
      borderRight: '1px solid var(--docs-border)',
      bottom: 0,
      boxSizing: 'border-box',
      overflowY: 'auto',
      padding: '22px 16px 48px',
      position: 'fixed',
      top: '58px',
      width: '264px',
    },
  },
  {
    selector: '.docs-search',
    properties: {
      marginBottom: '18px',
      position: 'relative',
    },
  },
  {
    selector: '.docs-search-input',
    properties: {
      background: 'var(--docs-bg)',
      border: '1px solid var(--docs-border)',
      borderRadius: '7px',
      boxSizing: 'border-box',
      color: 'var(--docs-text)',
      font: 'inherit',
      fontSize: '13px',
      outline: 'none',
      padding: '8px 12px',
      width: '100%',
    },
  },
  {
    selector: '.docs-search-input:focus',
    properties: {
      borderColor: 'var(--docs-accent)',
      boxShadow: '0 0 0 3px rgba(15, 118, 110, 0.12)',
    },
  },
  {
    selector: '.docs-nav-section',
    properties: {
      marginBottom: '20px',
    },
  },
  {
    selector: '.docs-nav-heading',
    properties: {
      alignItems: 'center',
      display: 'flex',
      fontSize: '12px',
      fontWeight: 700,
      gap: '6px',
      letterSpacing: '0.04em',
      marginBottom: '6px',
      textTransform: 'uppercase',
    },
  },
  {
    selector: '.docs-nav-pkg',
    properties: {
      color: 'var(--docs-accent-strong)',
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontSize: '10px',
      fontWeight: 700,
    },
  },
  {
    selector: '.docs-nav-item',
    properties: {
      borderRadius: '6px',
      color: 'var(--docs-muted)',
      display: 'block',
      fontSize: '14px',
      padding: '6px 10px',
      textDecoration: 'none',
    },
  },
  {
    selector: '.docs-nav-item:hover',
    properties: {
      background: 'var(--docs-bg)',
      color: 'var(--docs-text)',
      textDecoration: 'none',
    },
  },
  {
    selector: '.docs-nav-item-active',
    properties: {
      background: 'var(--docs-nav-active)',
      color: 'var(--docs-accent-strong)',
      fontWeight: 700,
    },
  },
  {
    selector: '.docs-main',
    properties: {
      boxSizing: 'border-box',
      flexGrow: 1,
      marginLeft: '264px',
      maxWidth: '960px',
      padding: '48px 56px 72px',
    },
  },
  {
    selector: '.docs-article',
    properties: {
      maxWidth: '820px',
    },
  },
  {
    selector: '.docs-eyebrow',
    properties: {
      color: 'var(--docs-accent-strong)',
      fontSize: '13px',
      fontWeight: 700,
      letterSpacing: '0.04em',
      marginBottom: '8px',
      textTransform: 'uppercase',
    },
  },
  {
    selector: '.docs-title',
    properties: {
      fontSize: '34px',
      fontWeight: 800,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
      margin: '0 0 10px',
    },
  },
  {
    selector: '.docs-lead',
    properties: {
      color: 'var(--docs-muted)',
      fontSize: '17px',
      lineHeight: 1.7,
      margin: '0 0 32px',
      maxWidth: '720px',
    },
  },
  {
    selector: '.docs-h2',
    properties: {
      fontSize: '22px',
      fontWeight: 700,
      letterSpacing: '-0.01em',
      margin: '44px 0 12px',
      paddingTop: '8px',
    },
  },
  {
    selector: '.docs-h3',
    properties: {
      fontSize: '18px',
      fontWeight: 700,
      margin: '32px 0 10px',
    },
  },
  {
    selector: '.docs-p',
    properties: {
      margin: '0 0 14px',
    },
  },
  {
    selector: '.docs-codeblock',
    properties: {
      background: 'var(--docs-code-bg)',
      borderRadius: '8px',
      margin: '14px 0 20px',
      overflow: 'auto',
    },
  },
  {
    selector: '.docs-codeblock-head',
    properties: {
      color: 'rgba(226, 232, 240, 0.55)',
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontSize: '11px',
      letterSpacing: '0.06em',
      padding: '10px 16px 0',
      textTransform: 'uppercase',
    },
  },
  {
    selector: '.docs-codeblock-pre',
    properties: {
      margin: 0,
      padding: '14px 16px 18px',
    },
  },
  {
    selector: '.docs-codeblock-code',
    properties: {
      background: 'transparent',
      color: 'var(--docs-code-text)',
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontSize: '13px',
      lineHeight: 1.65,
      padding: 0,
      whiteSpace: 'pre',
    },
  },
  {
    selector: '.docs-callout',
    properties: {
      background: 'var(--docs-surface)',
      border: '1px solid var(--docs-border)',
      borderLeft: '3px solid var(--docs-accent)',
      borderRadius: '7px',
      fontSize: '14px',
      margin: '16px 0 20px',
      padding: '12px 16px',
    },
  },
  {
    selector: '.docs-callout-title',
    properties: {
      color: 'var(--docs-accent-strong)',
      fontSize: '13px',
      fontWeight: 700,
      marginBottom: '4px',
    },
  },
  {
    selector: '.docs-table-wrap',
    properties: {
      margin: '14px 0 22px',
      overflowX: 'auto',
    },
  },
  {
    selector: '.docs-table',
    properties: {
      background: 'var(--docs-surface)',
      borderCollapse: 'collapse',
      fontSize: '14px',
      width: '100%',
    },
  },
  {
    selector: '.docs-table th',
    properties: {
      borderBottom: '2px solid var(--docs-border)',
      color: 'var(--docs-muted)',
      fontSize: '12px',
      fontWeight: 700,
      letterSpacing: '0.03em',
      padding: '10px 12px',
      textAlign: 'left',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    },
  },
  {
    selector: '.docs-table td',
    properties: {
      borderBottom: '1px solid var(--docs-border)',
      padding: '9px 12px',
      verticalAlign: 'top',
    },
  },
  {
    selector: '.docs-list',
    properties: {
      margin: '0 0 14px',
      paddingLeft: '22px',
    },
  },
  {
    selector: '.docs-list li',
    properties: {
      margin: '4px 0',
    },
  },
  {
    selector: '.docs-card-grid',
    properties: {
      display: 'grid',
      gap: '16px',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      margin: '28px 0 8px',
    },
  },
  {
    selector: '.docs-card',
    properties: {
      background: 'var(--docs-surface)',
      border: '1px solid var(--docs-border)',
      borderRadius: '10px',
      boxSizing: 'border-box',
      display: 'block',
      padding: '20px',
      textDecoration: 'none',
    },
  },
  {
    selector: '.docs-card:hover',
    properties: {
      borderColor: 'rgba(15, 118, 110, 0.45)',
      boxShadow: '0 10px 28px rgba(24, 34, 53, 0.08)',
      textDecoration: 'none',
    },
  },
  {
    selector: '.docs-card-title',
    properties: {
      color: 'var(--docs-text)',
      fontSize: '17px',
      fontWeight: 800,
      margin: '0 0 6px',
    },
  },
  {
    selector: '.docs-card-pkg',
    properties: {
      color: 'var(--docs-accent-strong)',
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontSize: '12px',
      fontWeight: 700,
      marginBottom: '8px',
    },
  },
  {
    selector: '.docs-card-desc',
    properties: {
      color: 'var(--docs-muted)',
      fontSize: '14px',
      lineHeight: 1.6,
      margin: 0,
    },
  },
  {
    selector: '.docs-pagenav',
    properties: {
      borderTop: '1px solid var(--docs-border)',
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: '48px',
      paddingTop: '20px',
    },
  },
  {
    selector: '.docs-pagenav-link',
    properties: {
      fontSize: '14px',
      fontWeight: 600,
    },
  },
  {
    selector: '.docs-pagenav-muted',
    properties: {
      color: 'var(--docs-muted)',
      display: 'block',
      fontSize: '12px',
      fontWeight: 500,
      marginBottom: '2px',
    },
  },
  {
    selector: '.docs-pagenav-next',
    properties: {
      textAlign: 'right',
    },
  },
  {
    selector: '.docs-footer',
    properties: {
      borderTop: '1px solid var(--docs-border)',
      color: 'var(--docs-muted)',
      fontSize: '13px',
      marginTop: '64px',
      paddingTop: '20px',
    },
  },
  {
    selector: '.docs-hero',
    properties: {
      marginBottom: '12px',
    },
  },
  {
    selector: '.docs-hero-title',
    properties: {
      fontSize: '46px',
      fontWeight: 800,
      letterSpacing: '-0.03em',
      lineHeight: 1.08,
      margin: '6px 0 14px',
    },
  },
  {
    selector: '.docs-hero-copy',
    properties: {
      color: 'var(--docs-muted)',
      fontSize: '19px',
      lineHeight: 1.75,
      margin: '0 0 8px',
      maxWidth: '680px',
    },
  },
  {
    selector: '.docs-home-grid',
    properties: {
      display: 'grid',
      gap: '20px',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      margin: '36px 0 12px',
    },
  },
  {
    selector: '.docs-home-card',
    properties: {
      background: 'var(--docs-surface)',
      border: '1px solid var(--docs-border)',
      borderRadius: '12px',
      padding: '24px',
    },
  },
  {
    selector: '.docs-home-card-title',
    properties: {
      fontSize: '18px',
      fontWeight: 800,
      margin: '0 0 4px',
    },
  },
  {
    selector: '.docs-home-card-pkg',
    properties: {
      color: 'var(--docs-accent-strong)',
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      fontSize: '12px',
      fontWeight: 700,
      marginBottom: '10px',
    },
  },
  {
    selector: '.docs-home-card-desc',
    properties: {
      color: 'var(--docs-muted)',
      fontSize: '14px',
      lineHeight: 1.65,
      margin: '0 0 14px',
    },
  },
  {
    selector: '.docs-home-card-link',
    properties: {
      fontSize: '14px',
      fontWeight: 700,
    },
  },
  {
    selector: '.docs-quickstart',
    properties: {
      marginTop: '36px',
    },
  },
  {
    selector: '.docs-hr',
    properties: {
      border: 'none',
      borderTop: '1px solid var(--docs-border)',
      margin: '36px 0',
    },
  },
  {
    selector: '.docs-mobile-nav',
    properties: {
      display: 'none',
    },
  },
  {
    atRule: '@media (max-width: 960px)',
    rules: [
      {
        selector: '.docs-layout',
        properties: {
          flexDirection: 'column',
        },
      },
      {
        selector: '.docs-sidebar',
        properties: {
          borderBottom: '1px solid var(--docs-border)',
          borderRight: 'none',
          bottom: 'auto',
          display: 'block',
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '10px 16px',
          position: 'static',
          top: 'auto',
          width: 'auto',
        },
      },
      {
        selector: '.docs-search',
        properties: {
          display: 'none',
        },
      },
      {
        selector: '.docs-nav',
        properties: {
          display: 'flex',
          gap: '4px',
        },
      },
      {
        selector: '.docs-nav-section',
        properties: {
          alignItems: 'center',
          display: 'flex',
          gap: '6px',
          marginBottom: 0,
          paddingRight: '12px',
        },
      },
      {
        selector: '.docs-nav-heading',
        properties: {
          marginBottom: 0,
          whiteSpace: 'nowrap',
        },
      },
      {
        selector: '.docs-nav-pkg',
        properties: {
          display: 'none',
        },
      },
      {
        selector: '.docs-nav-item',
        properties: {
          flexShrink: 0,
          whiteSpace: 'nowrap',
        },
      },
      {
        selector: '.docs-main',
        properties: {
          marginLeft: 0,
          padding: '28px 22px 56px',
        },
      },
    ],
  },
  {
    atRule: '@media (max-width: 720px)',
    rules: [
      {
        selector: '.docs-home-grid',
        properties: {
          gridTemplateColumns: '1fr',
        },
      },
      {
        selector: '.docs-card-grid',
        properties: {
          gridTemplateColumns: '1fr',
        },
      },
      {
        selector: '.docs-hero-title',
        properties: {
          fontSize: '34px',
        },
      },
      {
        selector: '.docs-title',
        properties: {
          fontSize: '26px',
        },
      },
    ],
  },
];
