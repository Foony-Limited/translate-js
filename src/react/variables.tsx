import type { ReactNode } from 'react';
import { useLocale } from './provider.js';

/**
 * Marks a dynamic value inside `<T>`. The value is never sent for translation —
 * it serializes to a named placeholder and is re-inserted after translation.
 * Standalone (outside `<T>`) it just renders its children.
 */
export function Var(props: { readonly name?: string; readonly children?: ReactNode }) {
  return <>{props.children}</>;
}

/**
 * A number slot inside `<T>` (or standalone): formats with `Intl.NumberFormat`
 * for the provider locale. Use `options={{style: 'currency', currency: 'USD'}}`
 * for money.
 */
export function Num(props: {
  readonly name?: string;
  readonly options?: Intl.NumberFormatOptions;
  readonly children?: number | string;
}) {
  const locale = useLocale();
  return <>{formatNum(props.children, locale, props.options)}</>;
}

/**
 * A date/time slot inside `<T>` (or standalone): formats with
 * `Intl.DateTimeFormat` for the provider locale.
 */
export function DateTime(props: {
  readonly name?: string;
  readonly options?: Intl.DateTimeFormatOptions;
  readonly children?: Date | number | string;
}) {
  const locale = useLocale();
  return <>{formatDateTime(props.children, locale, props.options)}</>;
}

/** Formats a `<Num>` value; non-numbers pass through as text. */
export function formatNum(value: unknown, locale: string, options?: Intl.NumberFormatOptions): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (typeof numeric !== 'number' || Number.isNaN(numeric)) {
    return String(value ?? '');
  }
  return new Intl.NumberFormat(locale, options).format(numeric);
}

/** Formats a `<DateTime>` value; unparseable values pass through as text. */
export function formatDateTime(value: unknown, locale: string, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : typeof value === 'number' || typeof value === 'string' ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    return String(value ?? '');
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}
