/**
 * A node in the serialized form of `<T>` children. This is the wire and storage
 * format shared by the runtime, the CLI, the backend, and the locale JSON files.
 *
 * - `string` — translatable text.
 * - `{e}` — an element placeholder, numbered by source-tree traversal order. Tags
 *   and props never leave the app; the runtime maps the number back to the real
 *   React element and re-parents the translated children into it.
 * - `{v}` — a variable placeholder by name. `f` is a hint for the translator
 *   ("this slot is a number/date"), not a runtime instruction: formatting is
 *   decided by the `<Num>`/`<DateTime>` element captured in the registry.
 * - `{b}` — a branch point (`<Branch>` or `<Plural>`), numbered like elements,
 *   carrying every branch option as its own sub-tree. Translations may contain
 *   plural categories the source lacks (e.g. `few`/`many` for Russian or Polish).
 */
export type TNode =
  | string
  | { readonly e: number; readonly c?: readonly TNode[] }
  | { readonly v: string; readonly f?: 'num' | 'datetime' }
  | { readonly b: number; readonly t: 'branch' | 'plural'; readonly o: Readonly<Record<string, readonly TNode[]>> };

/**
 * A parsed locale JSON file: a flat map from entry key (explicit id or dictionary
 * dot-path when present, else content hash) to the translated value. Strings are
 * plain-text entries; `TNode[]` are JSX entries.
 */
export type Translations = Readonly<Record<string, string | readonly TNode[]>>;

/**
 * One source entry as uploaded by the CLI (or the dev-mode runtime) to the
 * Foony Translate API.
 */
export type SourceEntry = {
  /** fnv1a64 hex(16) of the canonical form of {source, context, format}. */
  readonly contentHash: string;
  /** English source: plain string for text entries, TNode[] for JSX entries. */
  readonly source: string | readonly TNode[];
  readonly format: 'text' | 'jsx';
  /** Translator context (a `<T context>` prop or joined JSDoc comments). */
  readonly context?: string;
  /** Stable lookup alias (explicit id prop or dictionary dot-path). Not hashed. */
  readonly id?: string;
  /** Source location, for dashboard display only. */
  readonly file?: string;
  readonly line?: number;
};

/** All dot-separated paths to string leaves of a nested dictionary object. */
export type DotPaths<D> = {
  [K in keyof D & string]: D[K] extends string ? K : D[K] extends object ? `${K}.${DotPaths<D[K]>}` : never;
}[keyof D & string];
