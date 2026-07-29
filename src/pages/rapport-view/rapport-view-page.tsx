import {useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Fab from "@mui/material/Fab";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type {RapportFs} from "../../features/rapports/model/rapport-model.ts";
import {getRapportFsById} from "../../features/rapports/services/rapportfs-service.ts";
import type {ProgrammeSection} from "../../features/rapports/services/rapport-view-service.ts";
import {getProgrammeSections} from "../../features/rapports/services/rapport-view-service.ts";
import RapportProgrammeTable from "../../features/rapports/components/rapport-programme-table.tsx";
import {formatMoisAnnee} from "../../utils/date-format.ts";

export default function RapportViewPage() {
    const {id} = useParams<{ id: RapportFs["id"] }>();
    const navigate = useNavigate();

    const [rapport, setRapport] = useState<RapportFs | null>(null);
    const [sections, setSections] = useState<ProgrammeSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState(0);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        setError(null);
        Promise.all([getRapportFsById(id), getProgrammeSections(id)])
            .then(([rapportFs, programmeSections]) => {
                setRapport(rapportFs);
                setSections(programmeSections);
                setTab(0);
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <Box sx={{display: "flex", justifyContent: "center", p: 4}}>
                <CircularProgress/>
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error">{error}</Alert>;
    }

    if (!rapport) {
        return <Alert severity="warning">Rapport introuvable.</Alert>;
    }

    return (
        <div>
            <Stack direction="row" sx={{justifyContent: "space-between", alignItems: "center",}}>
                <Stack direction="row" sx={{alignItems: "center"}}>
                    <IconButton onClick={() => navigate("/rapports")} aria-label="Retour à la liste des rapports">
                        <ChevronLeftIcon/>
                    </IconButton>
                    <h3>
                        Rapport du {formatMoisAnnee(rapport.mois_annee)}
                    </h3>
                </Stack>
            </Stack>

            {sections.length === 0 ? (
                <Alert severity="info">
                    Aucun produit configuré pour cette formation sanitaire. Vérifiez l'unité d'organisation et la
                    configuration importée dans Paramètres.
                </Alert>
            ) : (
                <>
                    <Box sx={{borderBottom: 1, borderColor: "divider", mb: 2}}>
                        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
                            {sections.map((section) => (
                                <Tab key={section.programmeId} label={section.programmeName}/>
                            ))}
                        </Tabs>
                    </Box>
                    <RapportProgrammeTable rows={sections[tab].rows} rapportfsId={rapport.id}/>
                </>
            )}

            <Stack spacing={1.5} sx={{position: "fixed", bottom: 24, right: 24}}>
                <Fab
                    size="small"
                    color="primary"
                    aria-label="Défiler vers le bas"
                    onClick={() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: "smooth"})}
                >
                    <KeyboardArrowDownIcon/>
                </Fab>
                <Fab size="small" color="primary" aria-label="Retour à la liste des rapports"
                     onClick={() => navigate("/rapports")}>
                    <ChevronLeftIcon/>
                </Fab>
            </Stack>
        </div>
    );
}
