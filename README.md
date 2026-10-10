# markette-web

The Markette web app: Angular 21 (standalone components, signals), served by nginx, which also
proxies `/api`, `/media` and `/mcp` to [markette-server](https://github.com/markette-org/markette-server).
The same build runs inside the mobile apps ([markette-mobile](https://github.com/markette-org/markette-mobile)).

## Development

Requires Node.js 22.

```bash
npm ci
npm start          # http://localhost:4200, proxies /api and /media to http://localhost:8000
npm run build      # dist/frontend/browser
```

`proxy.conf.json` points at the backend for development. In production the image's `nginx.conf`
serves the app and proxies the API, media and MCP endpoints to the `api` and `mcp` containers.

## Structure

- `src/app/core`: API client, auth, workspace/organization state, interceptors, guards and models.
  `core/native` holds the mobile-only code: server choice, share intake and external links.
- `src/app/shared`: components (charts, heatmap, previews, dialogs), pipes and utilities, including
  the per-network character counting.
- `src/app/features`: one folder per area: compose, calendar, posts, analytics, best times, campaigns,
  channels, organization, settings, platform (superadmin) and auth.

## Docker

```bash
docker build -t markette-web .
```

## License

[AGPL-3.0-only](LICENSE).
