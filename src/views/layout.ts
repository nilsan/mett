import { VERSION_STRING } from '../version.js';

export function layout(title: string, body: string, activeSlug?: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title === 'Mega Empires Turn Tracker' ? title : `${title} — Mega Empires Turn Tracker`}</title>
  <meta name="description" content="Real-time census, leaderboard and A.S.T. tracker for Mega Empires board game sessions.">
  <meta property="og:title" content="${title === 'Mega Empires Turn Tracker' ? title : `${title} — Mega Empires Turn Tracker`}">
  <meta property="og:description" content="Real-time census, leaderboard and A.S.T. tracker for Mega Empires board game sessions.">
  <meta property="og:site_name" content="me[tt]">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header class="site-header container-fluid">
    <a href="/" class="mett-wordmark">me<span class="mw-bracket">[</span>tt<span class="mw-bracket">]</span></a>
    <span class="mett-tagline">MEGA EMPIRES TURN TRACKER</span>
    <a href="/admin" class="admin-gear" title="Admin">⚙</a>
  </header>
  <main class="container-fluid">
    ${body}
  </main>
  <footer class="version-footer" aria-hidden="true">${VERSION_STRING}</footer>
  <script src="https://unpkg.com/htmx.org@2.0.4" crossorigin="anonymous"></script>
  <script src="/js/toast.js"></script>
  <script src="/js/api.js"></script>
  <script src="/js/ws-client.js"></script>
</body>
</html>`;
}
