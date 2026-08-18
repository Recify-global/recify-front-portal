import { describe, expect, it } from 'vitest';
import {
  TEAM_MEMBERS_QUERY_ROOT,
  teamKeys,
  teamMembersQueryKey,
  teamQueryCacheOptions,
} from '@/utils/team-queries';
import { ENTITY_QUERY_CACHE } from '@/utils/query-cache-policy';

describe('team query keys', () => {
  it('scopes members by companyId', () => {
    expect(teamMembersQueryKey('company-a')).toEqual([TEAM_MEMBERS_QUERY_ROOT, 'company-a']);
    expect(teamKeys.company('company-b')).toEqual(['team-members', 'company-b']);
    expect(teamMembersQueryKey('company-a')).not.toEqual(teamMembersQueryKey('company-b'));
  });

  it('does not use a company-less team key', () => {
    expect(teamKeys.all).toEqual([TEAM_MEMBERS_QUERY_ROOT]);
    expect(teamKeys.all).not.toEqual(teamMembersQueryKey('company-a'));
  });

  it('reuses the entity cache policy', () => {
    expect(teamQueryCacheOptions).toEqual(ENTITY_QUERY_CACHE);
  });
});
