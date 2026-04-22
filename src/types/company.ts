export type CompanyStatus = 'active' | 'suspended';

export interface Company {
  _id: string;
  name: string;
  timezone: string;
  status: CompanyStatus;
  groupId?: string;
  created_at?: string;
  updated_at?: string;
}
