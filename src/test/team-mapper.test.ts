import { describe, expect, it } from 'vitest';
import { toTeamMember, toTeamMemberList, isTeamRole } from '@/mappers/team.mapper';
import { TeamMappingError } from '@/utils/team-errors';

describe('team mapper', () => {
  it('accepts only admin and user roles', () => {
    expect(isTeamRole('admin')).toBe(true);
    expect(isTeamRole('user')).toBe(true);
    expect(isTeamRole('viewer')).toBe(false);
    expect(isTeamRole('accountant')).toBe(false);
    expect(isTeamRole('owner')).toBe(false);
  });

  it('maps id or _id and optional name fields', () => {
    expect(
      toTeamMember({
        _id: 'u1',
        email: 'ana@recify.test',
        role: 'admin',
        name: 'Ana López',
        status: 'active',
      }),
    ).toEqual({
      id: 'u1',
      email: 'ana@recify.test',
      role: 'admin',
      name: 'Ana López',
      status: 'active',
    });
  });

  it('rejects unknown roles instead of mapping them', () => {
    expect(() =>
      toTeamMember({
        id: 'u1',
        email: 'ana@recify.test',
        role: 'viewer',
      }),
    ).toThrow(TeamMappingError);
  });

  it('rejects a non-array list payload', () => {
    expect(() => toTeamMemberList({ data: [] })).toThrow(TeamMappingError);
  });

  it('maps a valid list', () => {
    const list = toTeamMemberList([
      { id: 'u1', email: 'a@recify.test', role: 'admin' },
      { id: 'u2', email: 'b@recify.test', role: 'user', firstName: 'Bea' },
    ]);
    expect(list).toHaveLength(2);
    expect(list[1]?.firstName).toBe('Bea');
  });
});
