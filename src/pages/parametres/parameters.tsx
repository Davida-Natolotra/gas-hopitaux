import type {ReactNode} from "react";
import {useState} from "react";
import Box from "@mui/material/Box";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import UserProfile from "../../features/userprofile/components/user-profile.tsx";
import ConfigImportTab from "../../features/configuration/components/config-import-tab.tsx";
import BackupTab from "../../features/configuration/components/backup-tab.tsx";
import ProduitsProgrammeTable from "../../features/configuration/components/produits-programme-table.tsx";
import OrganisationUnitCascade from "../../features/organisation-units/organisation-unit-cascade.tsx";

const steps = [
    {label: "Profil utilisateur", content: <UserProfile/>},
    {label: "Configuration", content: <ConfigImportTab/>},
    {label: "Unité d'organisation", content: <OrganisationUnitCascade/>},
    {label: "Produits", content: <ProduitsProgrammeTable/>},
    {label: "Sauvegarde", content: <BackupTab/>},
];

function StepPanel({children, active}: { children: ReactNode; active: boolean }) {
    if (!active) return null;
    return <Box role="tabpanel">{children}</Box>;
}

export default function ParametresPage() {
    const [step, setStep] = useState(0);

    return (
        <div>
            <Box sx={{mb: 3}}>
                <Stepper nonLinear activeStep={step}>
                    {steps.map((s, index) => (
                        <Step key={s.label}>
                            <StepButton onClick={() => setStep(index)}>{s.label}</StepButton>
                        </Step>
                    ))}
                </Stepper>
            </Box>
            {steps.map((s, index) => (
                <StepPanel key={s.label} active={step === index}>
                    {s.content}
                </StepPanel>
            ))}
        </div>
    );
}
