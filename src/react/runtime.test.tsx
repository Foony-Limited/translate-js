import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hashSource } from '../hash.js';
import type { TNode, Translations } from '../types.js';
import { Branch, Plural } from './branches.js';
import { TranslateProvider } from './provider.js';
import { serializeChildren } from './serialize.js';
import { T } from './T.js';
import { useT } from './useT.js';
import { DateTime, Num, Var } from './variables.js';

function tHash(children: React.ReactNode, context?: string): string {
  const { nodes } = serializeChildren(children);
  return hashSource({ source: nodes, context, format: 'jsx' });
}

describe('serializeChildren', () => {
  it('serializes text, elements, variables, and merges adjacent text', () => {
    const { nodes, registry } = serializeChildren(
      <>
        Hello <b className="hi">there</b>, <Var name="user">Ada</Var>!{' '}
        <Num>{5}</Num>
      </>,
    );
    expect(nodes).toEqual(['Hello ', { e: 0, c: ['there'] }, ', ', { v: 'user' }, '! ', { v: '_n1', f: 'num' }]);
    expect(registry.elements).toHaveLength(1);
    expect(registry.variables['user']).toMatchObject({ kind: 'var', value: 'Ada' });
    expect(registry.variables['_n1']).toMatchObject({ kind: 'num', value: 5 });
  });

  it('serializes branches with all options and keeps branch values in the registry', () => {
    const { nodes, registry } = serializeChildren(
      <Plural n={3} one="One key." other="Many keys." />,
    );
    expect(nodes).toEqual([{ b: 0, t: 'plural', o: { one: ['One key.'], other: ['Many keys.'] } }]);
    expect(registry.branches).toEqual([{ kind: 'plural', value: 3 }]);
  });

  it('maps Plural children to the other form and Branch children to _default', () => {
    const plural = serializeChildren(<Plural n={1} one="One">Lots</Plural>);
    expect(plural.nodes).toEqual([{ b: 0, t: 'plural', o: { one: ['One'], other: ['Lots'] } }]);
    const branch = serializeChildren(<Branch branch="x" a="A">Fallback</Branch>);
    expect(branch.nodes).toEqual([{ b: 0, t: 'branch', o: { a: ['A'], _default: ['Fallback'] } }]);
  });

  it('produces the same nodes regardless of branch/variable values', () => {
    const a = tHash(<p>Hi <Var name="n">Ada</Var> <Plural n={1} one="key" other="keys" /></p>);
    const b = tHash(<p>Hi <Var name="n">Bob</Var> <Plural n={7} one="key" other="keys" /></p>);
    expect(a).toBe(b);
  });
});

describe('T', () => {
  it('renders the English source without a provider', () => {
    expect(renderToStaticMarkup(<T>Save changes</T>)).toBe('Save changes');
  });

  it('renders a translated structure, preserving element props', () => {
    const children = (
      <p className="note">
        Hello <b>world</b>, <Var name="user">Ada</Var>!
      </p>
    );
    const hash = tHash(children);
    const translations: Translations = {
      [hash]: [{ e: 0, c: ['Bonjour ', { e: 1, c: ['le monde'] }, ', ', { v: 'user' }, ' !'] }] satisfies TNode[],
    };
    const html = renderToStaticMarkup(
      <TranslateProvider locale="fr" translations={translations}>
        <T>{children}</T>
      </TranslateProvider>,
    );
    expect(html).toBe('<p class="note">Bonjour <b>le monde</b>, Ada !</p>');
  });

  it('prefers an explicit id over the hash', () => {
    const html = renderToStaticMarkup(
      <TranslateProvider locale="fr" translations={{ greeting: ['Salut'] }}>
        <T id="greeting">Hi</T>
      </TranslateProvider>,
    );
    expect(html).toBe('Salut');
  });

  it('formats Num per locale inside a translation', () => {
    const children = <>Total: <Num options={{ maximumFractionDigits: 0 }}>{123456}</Num></>;
    const hash = tHash(children);
    const html = renderToStaticMarkup(
      <TranslateProvider locale="de" translations={{ [hash]: ['Summe: ', { v: '_n1', f: 'num' }] }}>
        <T>{children}</T>
      </TranslateProvider>,
    );
    expect(html).toBe('Summe: 123.456');
  });

  it('selects translated plural categories the source lacks', () => {
    const children = <Plural n={3} one="1 key" other="{n} keys" />;
    const hash = tHash(children);
    // Russian adds a 'few' category for 2-4.
    const translations: Translations = {
      [hash]: [{ b: 0, t: 'plural', o: { one: ['1 ключ'], few: ['несколько ключей'], other: ['много ключей'] } }],
    };
    const html = renderToStaticMarkup(
      <TranslateProvider locale="ru" translations={translations}>
        <T>{children}</T>
      </TranslateProvider>,
    );
    expect(html).toBe('несколько ключей');
  });

  it('selects a translated Branch option by live value, with _default fallback', () => {
    const make = (active: boolean) => {
      const children = <Branch branch={active} true="Live." false="Paused.">Unknown.</Branch>;
      const hash = tHash(children);
      return renderToStaticMarkup(
        <TranslateProvider
          locale="fr"
          translations={{ [hash]: [{ b: 0, t: 'branch', o: { true: ['En ligne.'], false: ['En pause.'], _default: ['Inconnu.'] } }] }}
        >
          <T>{children}</T>
        </TranslateProvider>,
      );
    };
    expect(make(true)).toBe('En ligne.');
    expect(make(false)).toBe('En pause.');
  });
});

describe('standalone components', () => {
  it('Plural picks by CLDR category with a zero special case', () => {
    const render = (n: number) =>
      renderToStaticMarkup(
        <TranslateProvider locale="en">
          <Plural n={n} zero="No keys" one="One key" other="Some keys" />
        </TranslateProvider>,
      );
    expect(render(0)).toBe('No keys');
    expect(render(1)).toBe('One key');
    expect(render(5)).toBe('Some keys');
  });

  it('Branch matches String(branch) and falls back to children', () => {
    expect(renderToStaticMarkup(<Branch branch="admin" admin="Admin" member="Member">Guest</Branch>)).toBe('Admin');
    expect(renderToStaticMarkup(<Branch branch="other" admin="Admin">Guest</Branch>)).toBe('Guest');
  });

  it('Num and DateTime format for the provider locale', () => {
    const html = renderToStaticMarkup(
      <TranslateProvider locale="de">
        <Num>{1234.5}</Num> | <DateTime options={{ year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }}>{new Date('2026-07-02T00:00:00Z')}</DateTime>
      </TranslateProvider>,
    );
    expect(html).toBe('1.234,5 | 02.07.2026');
  });
});

describe('useT', () => {
  function Label(props: { readonly name: string }) {
    const t = useT();
    return <span>{t('Hello, {{name}}!', { name: props.name }, { context: 'greeting' })}</span>;
  }

  it('translates by content hash and interpolates', () => {
    const hash = hashSource({ source: 'Hello, {{name}}!', context: 'greeting', format: 'text' });
    const html = renderToStaticMarkup(
      <TranslateProvider locale="fr" translations={{ [hash]: 'Bonjour, {{name}} !' }}>
        <Label name="Ada" />
      </TranslateProvider>,
    );
    expect(html).toBe('<span>Bonjour, Ada !</span>');
  });

  it('falls back to the source message on a miss', () => {
    const html = renderToStaticMarkup(
      <TranslateProvider locale="fr">
        <Label name="Ada" />
      </TranslateProvider>,
    );
    expect(html).toBe('<span>Hello, Ada!</span>');
  });
});
