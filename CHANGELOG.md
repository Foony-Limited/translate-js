# Changelog

All notable changes to `@foony/translate`. Format loosely follows
[Keep a Changelog](https://keepachangelog.com). Versions are semver.

## 0.2.0

### Added

- The CLI loads a `.env` file sitting next to `foony-translate.json`, so
  `FOONY_TRANSLATE_API_KEY` can live with the project instead of your shell
  profile. Real environment variables still win, `export `-prefixed lines and
  quoted values are accepted, and other keys in the file are loaded too.

## 0.1.0

### Added

- **React runtime** (`@foony/translate/react`): `<T>` wraps static JSX for
  translation, identified by a content hash of its serialized children (plus an
  optional `id` alias and `context` for the translator). `<Var>`, `<Num>`, and
  `<DateTime>` mark dynamic values (never sent for translation, formatted with
  `Intl` per locale); `<Branch>` and `<Plural>` declare conditional variants so
  every branch is translatable. `TranslateProvider` supplies the locale and the
  parsed locale JSON; on any miss the English source renders unchanged.
- **String translation**: `useT()` returns `t(message, values?, {context?, id?})`
  for placeholders, aria-labels, and titles. Identical message + context anywhere
  in the codebase shares one translation.
- **Dictionaries**: `defineDict`/`createDict` (framework-free, usable from Astro
  frontmatter) and `useDict`. Entry ids are dot-paths; JSDoc comments on entries
  (and their ancestors) become translator context.
- **CLI** (`foony-translate`): `init`, `scan`, `translate` (upload entries, wait,
  download per-locale JSON), and `check` (offline CI gate). Scans with ts-morph
  and errors with file:line on untranslatable patterns (ternaries inside `<T>`,
  bare dynamic expressions, dynamic `t()` messages).
- **Dev mode**: `TranslateProvider dev={{apiKey}}` translates missing entries
  on demand while developing; results swap in place.
