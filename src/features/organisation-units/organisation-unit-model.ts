export interface OrganisationUnit {
    id: string;
    name: string;
    level: number;
    parent_id: string | null;
}

export interface MyOrganisationUnit {
    drsp: OrganisationUnit;
    sdsp: OrganisationUnit;
    commune: OrganisationUnit | null;
    fs: OrganisationUnit;
}
