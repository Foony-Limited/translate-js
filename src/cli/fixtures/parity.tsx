/**
 * Parity fixtures: each <T> below is serialized twice — by the CLI scanner
 * (from this file's AST) and by the React runtime (from the rendered
 * elements) — and the content hashes must match exactly. Every serializer
 * change must keep this file passing.
 */
import { Branch, DateTime, Num, Plural, T, Var } from '@foony/translate/react';

const user = { name: 'Ada', role: 'admin', keys: 3 };

export function Fixtures() {
  return (
    <div>
      <T>Save changes</T>
      <T context="verb on a button">Save</T>
      <T id="welcome">Welcome back!</T>
      <T>
        Hello <b className="hi">there</b>, <Var name="user">{user.name}</Var>!
      </T>
      <T>
        Multi
        line text with a <i>styled</i> tail
      </T>
      <T>
        You have <Num>{user.keys}</Num> keys and joined <DateTime>{new Date(0)}</DateTime>.
      </T>
      <T>
        <Plural n={user.keys} one="One key." other="Many keys." />
      </T>
      <T>
        <Plural n={user.keys} one={<>Just one key.</>}>
          You have <Num>{user.keys}</Num> keys.
        </Plural>
      </T>
      <T>
        <Branch branch={user.role} admin={<p>Full access</p>} member="Read only">
          No access
        </Branch>
      </T>
      <T>
        Nested <span>elements <b>with</b> depth</span> and{' '}
        <Branch branch={user.role} admin={<em>admin badge</em>}>
          plain badge
        </Branch>
      </T>
    </div>
  );
}
