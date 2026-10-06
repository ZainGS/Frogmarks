# Frogmarks

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 12.0.2.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Versioning / deploy check

The app shows its version at the bottom of the editor's **File** menu and in the Shell's **Settings** dialog, e.g.
`Frogmarks v0.01` with `built 2026-10-06 14:03 · Salsa 0.0.1 (dist 2026-10-05 00:53)` under it.

- **Bump before every deploy:** edit `APP_VERSION` in `src/app/app-version.ts` (`'0.01'` → `'0.02'` → …). That is the
  only place; `package.json` "version" is not used.
- **Build time + Salsa dist time** are stamped automatically: `npm run build` (= `scripts/build.mjs`, which is what
  `Frogmarks.csproj` runs on publish) runs `ng build` and then writes `<meta name="fm-build-time">`,
  `fm-salsa-version` and `fm-salsa-dist-time` into the built `index.html`. `ng serve` / `npm start` show "dev build".
- **To confirm a deploy** on the tablet: open File (or Shell → Settings) and check the version + build time. If it shows
  the old one, the browser has a cached `index.html`: reload.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
