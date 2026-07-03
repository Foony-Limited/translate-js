# @foony/translate

TypeScript SDK and CLI for [Foony Translate](https://translate.foony.io) —
wrap your JSX in `<T>`, run one command, ship your app in any language.

```tsx
import { T, Var, Plural, TranslateProvider } from '@foony/translate/react';
import fr from './translations/fr.json';

<TranslateProvider locale="fr" translations={fr}>
  <T>
    Welcome back, <Var name="user">{user.name}</Var>! You have{' '}
    <Plural n={keys} one="one API key" other="several API keys" />.
  </T>
</TranslateProvider>;
```

```bash
npx foony-translate init                     # write foony-translate.json
echo 'FOONY_TRANSLATE_API_KEY=...' >> .env   # picked up from next to the config; env vars win
npx foony-translate translate                # scan, translate, write translations/<locale>.json
npx foony-translate check                    # offline CI gate
```

Keep the `.env` out of version control.

## How it works

- The CLI parses your sources (ts-morph AST) and serializes every `<T>`,
  `t()` string, and dictionary entry. Identity is a content hash of the
  serialized source + translator context, so identical strings share one
  translation and nothing needs a manual key. An optional `id` prop is a
  stable lookup alias (never hashed — adding one never re-translates).
- Dynamic values go in `<Var>`/`<Num>`/`<DateTime>`; their contents never
  leave your app. Conditional copy goes in `<Branch>`/`<Plural>` so every
  variant is translated; the CLI errors (file:line) on ternaries inside `<T>`.
- Translations are plain per-locale JSON files you commit. The runtime holds
  no locale state and fetches nothing: pass `locale` + the parsed JSON to
  `TranslateProvider`. Works in any React 18+ app, including Astro islands.
- Dictionary entries (`defineDict`) use JSDoc comments as translator context,
  including ancestor JSDoc — write the comment once, every leaf under it is
  translated with that context.

## Docs

Quickstart, component reference, and CLI reference: https://translate.foony.io/docs
