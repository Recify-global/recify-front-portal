import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const vercelPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../vercel.json');

function contentSecurityPolicy(): string {
  const config = JSON.parse(readFileSync(vercelPath, 'utf8')) as {
    headers: Array<{ headers: Array<{ key: string; value: string }> }>;
  };
  const policy = config.headers
    .flatMap((group) => group.headers)
    .find((header) => header.key === 'Content-Security-Policy');
  if (!policy) throw new Error('Content-Security-Policy header is missing');
  return policy.value;
}

function directive(policy: string, name: string): string[] {
  const source = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  if (!source) throw new Error(`${name} is missing`);
  return source.split(/\s+/).slice(1);
}

describe('production content security policy', () => {
  const policy = contentSecurityPolicy();

  it('allows the production API and Google without the old Render host', () => {
    expect(directive(policy, 'connect-src')).toEqual([
      "'self'",
      'https://api.recify.com.mx',
      'https://accounts.google.com',
    ]);
    expect(policy).not.toContain('onrender.com');
    expect(directive(policy, 'connect-src').join(' ')).not.toContain('*');
  });

  it('keeps the remaining directives closed', () => {
    expect(directive(policy, 'default-src')).toEqual(["'self'"]);
    expect(directive(policy, 'script-src')).toEqual(["'self'", 'https://accounts.google.com']);
    expect(directive(policy, 'frame-src')).toEqual([
      "'self'",
      'https://accounts.google.com',
      'https://*.r2.cloudflarestorage.com',
    ]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
  });
});
