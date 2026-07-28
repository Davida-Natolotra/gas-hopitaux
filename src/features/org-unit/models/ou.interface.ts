export interface OrganisationUnit {
    id: string;
    name: string;
    level: number;
    parent_id: string | null;
}

export type OrgUnitState = {
    data: OrganisationUnit[];
    loading: boolean;
    error: string | null;
};

