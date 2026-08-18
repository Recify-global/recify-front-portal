import { describe, expect, it } from 'vitest';
import type { TeamMember } from '@/types/team';
import {
  getTeamMemberDisplayName,
  getTeamMemberInitials,
  isCurrentTeamMember,
} from '@/utils/team-display';

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'u1',
    email: 'ana@recify.test',
    role: 'user',
    ...overrides,
  };
}

describe('team display', () => {
  it('prefers name, then first+last, then email', () => {
    expect(getTeamMemberDisplayName(member({ name: 'Ana López' }))).toBe('Ana López');
    expect(
      getTeamMemberDisplayName(member({ firstName: 'Ana', lastName: 'López' })),
    ).toBe('Ana López');
    expect(getTeamMemberDisplayName(member())).toBe('ana@recify.test');
  });

  it('does not render undefined names', () => {
    expect(getTeamMemberDisplayName(member({ name: '  ', firstName: null, lastName: undefined }))).toBe(
      'ana@recify.test',
    );
    expect(getTeamMemberDisplayName(member({ firstName: 'Ana', lastName: '  ' }))).toBe('Ana');
  });

  it('builds initials from the visible name or email', () => {
    expect(getTeamMemberInitials(member({ name: 'Ana López' }))).toBe('AL');
    expect(getTeamMemberInitials(member())).toBe('AN');
  });

  it('identifies the authenticated member by id', () => {
    expect(isCurrentTeamMember(member({ id: 'me' }), 'me')).toBe(true);
    expect(isCurrentTeamMember(member({ id: 'me' }), 'other')).toBe(false);
    expect(isCurrentTeamMember(member({ id: 'me' }), null)).toBe(false);
  });
});
