import {getMyOrganisationUnit, hasAnyMyProduitProgrammeNiveau} from "../features/organisation-units/organisation-units-service.ts";
import {getUserProfile} from "../features/userprofile/services/user-profile-service.ts";
import {hasAnyRapportFs} from "../features/rapports/services/rapportfs-service.ts";

export type StartupRoute = "/parametres" | "/alertes" | "/rapports";

// Decides where the app should land when the user opens it (or clicks back
// to "/"): the 3 setup prerequisites (organisation unit, user profile, and
// the produits that follow from them) must exist first, otherwise the app
// isn't usable yet and belongs on the setup page. Once set up, "/" leans on
// Alertes if there's anything to report on, or the (empty) Rapports list
// otherwise so the user can create their first report.
export async function determineStartupRoute(): Promise<StartupRoute> {
    const [orgUnit, profile, hasProduits] = await Promise.all([
        getMyOrganisationUnit(),
        getUserProfile(),
        hasAnyMyProduitProgrammeNiveau(),
    ]);

    if (!orgUnit || !profile || !hasProduits) {
        return "/parametres";
    }

    return (await hasAnyRapportFs()) ? "/alertes" : "/rapports";
}
