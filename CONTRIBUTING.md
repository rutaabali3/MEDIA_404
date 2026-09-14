# Contributing

## Run locally

```bash
git clone https://github.com/rutaabali3/MEDIA_404.git
cd MEDIA_404
npm install
npm start
```

Open http://localhost:3000

## Tests

```bash
npm test              # extraction engine + SSRF guard
node tests/smoke.js   # frontend UI smoke test (installs jsdom on first run)
```

## Pull requests

1. Work on a branch off `main`.
2. Keep changes focused.
3. Run the tests above before opening a PR.
