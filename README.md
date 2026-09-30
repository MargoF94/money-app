# Money Log

A personal money app for accounts, spending, card instalments and savings, in yen (and dollars
when needed). Runs entirely in the browser, hosted on GitHub Pages, like Reading Log. Your data stays
on your devices and syncs to a private GitHub repo (`money-data`).

See [PLAN.md](PLAN.md) for the full plan and the build stages.

## Using it

1. Open the site: `https://<your-username>.github.io/money-app/`
2. **Settings → Sync**: enter your GitHub username, `money-data`, and a fine-grained token with
   *Contents: Read and write* on that repo only.
3. On the iPhone, Safari → Share → **Add to Home Screen** to install it as an app.
4. **Accounts → Add**: your banks, Rakuten Card, PASMO/Starbucks (prepaid, top-ups paid with Rakuten
   Card), cash at home, money lent.

This repository only ever holds the app's code: never bank exports, statements or other personal data.

## Development

```sh
npm install
npm run dev      # local dev server
npm run check    # type check
npm test         # unit tests
npm run build    # production build into dist/
```

Pushes to the default branch are built and deployed by `.github/workflows/deploy.yml`.
