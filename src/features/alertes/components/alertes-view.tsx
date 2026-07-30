import {useEffect, useState} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import type {RapportHopitaux} from "../../rapports/model/rapport-model.ts";
import {SITUATION_STYLES} from "../../rapports/styles/situation-style.ts";
import type {AlerteProduit, AlertesProgrammeSection} from "../services/alertes-service.ts";
import {getAlertesSections, getLatestRapportFs} from "../services/alertes-service.ts";
import {formatMoisAnnee} from "../../../utils/date-format.ts";

function AlerteBloc({severity, label, count, total, produits}: {
    severity: "error" | "warning";
    label: string;
    count: number;
    total: number;
    produits: AlerteProduit[];
}) {
    const bg = severity === "error" ? SITUATION_STYLES.RUPTURE.bg : SITUATION_STYLES["SOUS STOCK"].bg;
    const titleColor = severity === "error" ? "#fff" : "text.primary";
    return (
        <Alert
            severity={severity}
            variant="outlined"
            sx={{
                p: 0,
                borderColor: bg,
                overflow: "hidden",
                "& .MuiAlert-icon": {bgcolor: bg, color: titleColor, m: 0, alignItems: "center", py: 1, pl: 2, pr: 1},
                "& .MuiAlert-message": {p: 0, flex: 1},
            }}
        >
            <AlertTitle sx={{bgcolor: bg, color: titleColor, m: 0, px: 2, py: 1, fontWeight: 700}}>
                {label} ({count}/{total})
            </AlertTitle>
            <Box sx={{px: 2, py: produits.length ? 0 : 1.5}}>
                {produits.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{py: 1}}>
                        Aucun produit en {label.toLowerCase()}.
                    </Typography>
                ) : (
                    <List dense disablePadding>
                        {produits.map((produit) => (
                            <Box key={produit.ppnId}>
                                <ListItem disableGutters>
                                    <ListItemText primary={produit.produitName}/>
                                </ListItem>
                                <Divider component="li"/>
                            </Box>
                        ))}
                    </List>
                )}
            </Box>
        </Alert>
    );
}

export default function AlertesView() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rapport, setRapport] = useState<RapportHopitaux | null>(null);
    const [sections, setSections] = useState<AlertesProgrammeSection[]>([]);
    const [tab, setTab] = useState(0);

    useEffect(() => {
        setLoading(true);
        setError(null);
        getLatestRapportFs()
            .then(async (latest) => {
                setRapport(latest);
                setSections(latest ? await getAlertesSections(latest.id) : []);
                setTab(0);
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

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

    const current = sections[tab] ?? null;

    return (
        <div>

            {!rapport ? (
                <Alert severity="info">
                    Aucun rapport FS trouvé. Vérifiez l'unité d'organisation enregistrée dans Paramètres.
                </Alert>
            ) : sections.length === 0 ? (
                <Alert severity="info">
                    Aucun produit configuré pour cette formation sanitaire.
                </Alert>
            ) : (
                <>
                    <h3>
                        Alertes stock basés sur le rapport du {formatMoisAnnee(rapport.mois_annee)}
                    </h3>

                    <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{mb: 3}}>
                        {sections.map((section) => (
                            <Tab key={section.programmeId} label={section.programmeName}/>
                        ))}
                    </Tabs>

                    {current && (
                        <Stack spacing={2}>
                            <AlerteBloc
                                severity="error"
                                label="RUPTURE"
                                count={current.rupture.length}
                                total={current.totalProduits}
                                produits={current.rupture}
                            />
                            <AlerteBloc
                                severity="warning"
                                label="SOUS STOCK"
                                count={current.sousStock.length}
                                total={current.totalProduits}
                                produits={current.sousStock}
                            />
                        </Stack>
                    )}
                </>
            )}
        </div>
    );
}
