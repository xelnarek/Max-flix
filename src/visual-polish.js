const palette = {
  bgTop: '#050b14',
  bgBottom: '#0b1220',
  panel: '#0f172a',
  panelSoft: '#111827',
  panelAlt: '#1e293b',
  accent: '#f59e0b',
  accentStrong: '#fbbf24',
  blue: '#38bdf8',
  blueStrong: '#60a5fa',
  red: '#f87171',
  green: '#4ade80',
  text: '#e5edf8',
  muted: '#a5b4c8',
};

const visualEnhancements = `
  :root {
    --maxfliz-bg-1: ${palette.bgTop};
    --maxfliz-bg-2: ${palette.bgBottom};
    --maxfliz-panel: rgba(15, 23, 42, 0.74);
    --maxfliz-panel-strong: rgba(15, 23, 42, 0.9);
    --maxfliz-border: rgba(148, 163, 184, 0.22);
    --maxfliz-accent: ${palette.accent};
    --maxfliz-accent-2: ${palette.accentStrong};
    --maxfliz-blue: ${palette.blue};
    --maxfliz-blue-strong: ${palette.blueStrong};
    --maxfliz-red: ${palette.red};
    --maxfliz-green: ${palette.green};
    --maxfliz-text: ${palette.text};
    --maxfliz-muted: ${palette.muted};
  }

  html, body {
    background:
      radial-gradient(circle at top, rgba(56, 189, 248, 0.15), transparent 28%),
      radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.12), transparent 26%),
      linear-gradient(180deg, var(--maxfliz-bg-1) 0%, var(--maxfliz-bg-2) 100%);
  }

  #game-canvas-container {
    background:
      radial-gradient(circle at center, rgba(59, 130, 246, 0.08), transparent 38%),
      linear-gradient(180deg, rgba(6, 11, 20, 0.88), rgba(9, 15, 24, 1));
  }

  #game-canvas-container::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 28%, rgba(255,255,255,0.02));
    pointer-events: none;
    z-index: 2;
  }

  #game-canvas-container canvas {
    filter: saturate(1.08) contrast(1.03) brightness(1.02);
    box-shadow: inset 0 0 80px rgba(14, 165, 233, 0.1);
  }

  .game-screen,
  .game-modal,
  .title-sheet,
  .modal-card,
  .story-modal-card,
  .leaderboard-container,
  .char-details-box,
  .combat-guide-banner,
  .story-preview-card,
  .perk-card,
  .enemy-guide-card,
  .zone-card,
  .char-card {
    backdrop-filter: blur(18px) saturate(155%);
    -webkit-backdrop-filter: blur(18px) saturate(155%);
  }

  .title-backdrop {
    background:
      radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 35%),
      radial-gradient(circle at bottom, rgba(245, 158, 11, 0.16), transparent 30%),
      linear-gradient(180deg, rgba(4, 8, 15, 0.65), rgba(15, 23, 42, 0.9));
  }

  .title-sheet {
    background: rgba(10, 15, 26, 0.36);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 32px 80px rgba(2, 6, 23, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .menu-tabs-bar {
    background: rgba(13, 21, 34, 0.86);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 28px rgba(2, 6, 23, 0.28);
  }

  .menu-tab-btn {
    color: var(--maxfliz-muted);
    transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }

  .menu-tab-btn:hover {
    color: var(--maxfliz-text);
    transform: translateY(-1px);
  }

  .menu-tab-btn.active {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(251, 191, 36, 0.95));
    color: #111827;
    box-shadow: 0 6px 22px rgba(245, 158, 11, 0.45), inset 0 1px 0 rgba(255,255,255,0.32);
  }

  .char-card,
  .zone-card,
  .enemy-guide-card,
  .perk-card,
  .story-preview-card,
  .leaderboard-container,
  .char-details-box,
  .combat-guide-banner {
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.88));
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.28), inset 0 1px 0 rgba(255,255,255,0.04);
  }

  .char-card:hover,
  .zone-card:hover,
  .enemy-guide-card:hover,
  .perk-card:hover,
  .story-preview-card:hover,
  .leaderboard-item:hover {
    transform: translateY(-2px);
    border-color: rgba(251, 191, 36, 0.44);
    box-shadow: 0 16px 32px rgba(8, 15, 28, 0.4), 0 0 0 1px rgba(245, 158, 11, 0.15);
  }

  .char-card.active,
  .zone-card.active {
    border-color: rgba(251, 191, 36, 0.7);
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.96));
    box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.24), 0 16px 32px rgba(8, 15, 28, 0.45);
  }

  .btn-primary-start {
    background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 45%, #f97316 100%);
    border: 1px solid rgba(255,255,255,0.2);
    box-shadow: 0 16px 36px rgba(249, 115, 22, 0.34), inset 0 1px 0 rgba(255,255,255,0.4);
    color: #111827;
    letter-spacing: 0.08em;
  }

  .btn-primary-start:hover {
    filter: brightness(1.04);
    transform: translateY(-2px) scale(1.01);
    box-shadow: 0 18px 38px rgba(249, 115, 22, 0.42), inset 0 1px 0 rgba(255,255,255,0.42);
  }

  .story-modal-card,
  .modal-card {
    background: linear-gradient(180deg, rgba(9, 15, 25, 0.82), rgba(18, 25, 35, 0.9));
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 24px 68px rgba(2, 6, 23, 0.7), inset 0 1px 0 rgba(255,255,255,0.08);
  }

  .vhs-scanlines-overlay {
    background: repeating-linear-gradient(
      180deg,
      rgba(255,255,255,0.04),
      rgba(255,255,255,0.04) 1px,
      transparent 1px,
      transparent 3px
    );
    mix-blend-mode: screen;
    opacity: 0.7;
  }

  .hero-badge {
    border-color: rgba(245, 158, 11, 0.38);
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(30, 41, 59, 0.72));
  }

  .top-icon-btn,
  .stat-pill,
  .bottom-dock {
    box-shadow: 0 14px 32px rgba(2, 6, 23, 0.35), inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .floating-score-toast {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    padding: 8px 14px;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.55);
  }

  .leaderboard-item {
    background: linear-gradient(90deg, rgba(15, 23, 42, 0.72), rgba(17, 24, 39, 0.9));
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
  }

  .leaderboard-item.top-1 {
    border-color: rgba(245, 158, 11, 0.42);
    box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.08), 0 14px 28px rgba(245, 158, 11, 0.12);
  }

  .leaderboard-score-val {
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(59, 130, 246, 0.14));
    border: 1px solid rgba(251, 191, 36, 0.18);
    border-radius: 999px;
  }

  @media (min-width: 992px) {
    .title-sheet {
      max-width: 820px;
    }
  }

  @media (max-width: 900px) {
    .title-sheet {
      padding-left: 12px;
      padding-right: 12px;
    }

    .menu-tabs-bar {
      gap: 4px;
    }
  }

  .dialogue-box-card {
    background: linear-gradient(135deg, rgba(10, 15, 26, 0.45), rgba(10, 15, 26, 0.25)) !important;
    border: none !important;
    backdrop-filter: blur(12px) saturate(180%) !important;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4) !important;
    overflow: hidden;
  }

  .dialogue-box-card.hero-style {
    border-left: 4px solid var(--maxfliz-blue) !important;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.12), transparent) !important;
  }

  .dialogue-box-card.enemy-style {
    border-right: 4px solid var(--maxfliz-red) !important;
    background: linear-gradient(-90deg, rgba(248, 113, 113, 0.12), transparent) !important;
  }

  .dialogue-box-avatar {
    box-shadow: 0 4px 15px rgba(0,0,0,0.4) !important;
    transform: scale(1.05);
  }

  .dialogue-box-name {
    letter-spacing: 0.05em !important;
    font-weight: 900 !important;
    color: var(--maxfliz-accent) !important;
    text-transform: uppercase;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

const style = document.createElement('style');
style.id = 'maxfliz-visual-enhancements';
style.textContent = visualEnhancements;
document.head.appendChild(style);

const rendererTargets = document.querySelectorAll('canvas');
rendererTargets.forEach((canvas) => {
  canvas.style.filter = 'saturate(1.08) contrast(1.03) brightness(1.02)';
});

const root = document.documentElement;
root.style.setProperty('--maxfliz-bg-1', palette.bgTop);
root.style.setProperty('--maxfliz-bg-2', palette.bgBottom);
root.style.setProperty('--maxfliz-accent', palette.accent);
root.style.setProperty('--maxfliz-blue', palette.blue);
