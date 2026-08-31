import type {ReactNode} from "react";
import {useEffect, useState} from "react";
import {getVersion} from "@tauri-apps/api/app";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import logoMinsanp from "../../assets/Logo_Minsanp.jpg";
import logoDplmt from "../../assets/Logo_DPLMT.png";
import logoUsGovDataFi from "../../assets/Logo Dos DataFi_little.png";

// Each logo is sized by height alone; these are the intrinsic pixel dimensions
// of the imported files, so the rendered box keeps the source proportions and
// reserves the right space before the image loads. Swapping an asset means
// updating the matching ratio — otherwise the logo is stretched.
const MINSANP_RATIO = "1268 / 1280"; // Logo_Minsanp.jpg
const DPLMT_RATIO = "960 / 752"; // Logo_DPLMT.png
const USG_DATAFI_RATIO = "871 / 171"; // Logo Dos DataFi_little.png

// One height for all three partner logos. The three have to fit side by side
// on a single row, and at equal heights the wide Data.Fi banner (~5:1) takes
// up more than both ministry logos together — so the ceiling is the row's own
// width: 900px (Container maxWidth="md") less the Paper's padding at md, and
// the viewport itself below that. These are the tallest values that still
// leave the row some slack at the narrow end of each breakpoint.
const LOGO_HEIGHT = {xs: 56, sm: 64, md: 96};

const FONCTIONNALITES = [
    "Saisie du rapport mensuel de l'hôpital, produit par programme par niveau.",
    "Calcul automatique du stock théorique, de l'écart, du stock disponible utilisable (SDU), de la consommation moyenne mensuelle (CMM) et du nombre de mois de stock disponible (MSD).",
    "Alertes de rupture et de sous-stock, présentées par programme à partir du dernier rapport saisi.",
    "Import de la configuration transmise par le niveau central : unités d'organisation, programmes et produits.",
    "Export du rapport validé, au format .utglhp, destiné pour l'importation dans la plateforme UTGL.",
    "Sauvegarde et restauration de la base de données de l'appareil.",
    "Suivi des configurations et non destructive des produits.",
];

function Section({title, children}: { title: string; children: ReactNode }) {
    return (
        <Box component="section">
            <Typography variant="h6" component="h2" gutterBottom sx={{fontWeight: 600}}>
                {title}
            </Typography>
            {children}
        </Box>
    );
}

export default function HelpPage() {
    // Read from the bundle rather than hardcoded, so it cannot drift from the
    // installed build. Unavailable outside the Tauri runtime, where the chip is
    // simply not shown.
    const [version, setVersion] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getVersion()
            .then((value) => {
                if (!cancelled) setVersion(value);
            })
            .catch(() => {
                /* Not running inside the app shell — the version stays hidden. */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <Container maxWidth="md" disableGutters sx={{py: 2}}>
            <Stack spacing={4}>
                <Box component="header">
                    <Typography variant="overline" color="text.secondary">
                        À propos
                    </Typography>
                    <Stack direction="row" spacing={1.5} sx={{alignItems: "baseline", flexWrap: "wrap"}}>
                        <Typography
                            variant="h4"
                            component="h1"
                            sx={{fontWeight: 700, textAlign: "left", letterSpacing: ".02em"}}
                        >
                            GAS Hôpitaux
                        </Typography>
                        {version && <Chip size="small" variant="outlined" label={`Version ${version}`}/>}
                    </Stack>
                    <Typography variant="subtitle1" color="text.secondary">
                        Rapports d'utilisation mensuels de stock des hôpitaux
                    </Typography>
                </Box>

                <Divider/>

                <Section title="Présentation">
                    <Typography variant="body1" sx={{mb: 2}}>
                        GAS Hôpitaux accompagne le personnel de la pharmacie hospitalière dans la saisie, le contrôle
                        et la transmission des données logistiques des produits de santé. L'application est installée
                        sur l'ordinateur de l'établissement et couvre l'ensemble du cycle du rapport
                        mensuel, de sa création à son envoi au niveau supérieur. Cette application est compatible avec
                        Windows 7 et antérieure.
                    </Typography>
                    <Typography variant="body1">
                        Elle fonctionne intégralement hors connexion : les données sont conservées sur l'appareil, la
                        saisie reste possible en l'absence de réseau, et le rapport validé est exporté sous forme de
                        fichier lorsque les conditions le permettent. Les calculs sont réalisés automatiquement, afin de
                        réduire les erreurs de report et d'harmoniser les pratiques entre les sites.
                    </Typography>
                </Section>

                <Section title="Fonctionnalités principales">
                    <Box component="ul" sx={{m: 0, pl: 3}}>
                        {FONCTIONNALITES.map((item) => (
                            <Typography key={item} component="li" variant="body1" sx={{mb: 0.75}}>
                                {item}
                            </Typography>
                        ))}
                    </Box>
                </Section>

                <Section title="Partenaires">
                    <Paper variant="outlined" sx={{p: {xs: 2.5, sm: 3}}}>
                        <Stack
                            direction={{xs: "column", sm: "row"}}
                            // Tightened from the old 8/10: at a shared height
                            // the three logos need the room, and the row has to
                            // stay a single row.
                            spacing={{xs: 4, sm: 2, md: 5}}
                            sx={{alignItems: "center", justifyContent: "center"}}
                        >
                            <Box
                                component="img"
                                src={logoMinsanp}
                                alt="Ministère de la Santé Publique (MinSanP)"
                                sx={{
                                    height: LOGO_HEIGHT,
                                    aspectRatio: MINSANP_RATIO,
                                    width: "auto",
                                    maxWidth: "100%",
                                    flexShrink: 0,
                                }}
                            />
                            <Box
                                component="img"
                                src={logoDplmt}
                                alt="Direction de la Pharmacie, des Laboratoires et de la Médecine Traditionnelle (DPLMT)"
                                sx={{
                                    height: LOGO_HEIGHT,
                                    aspectRatio: DPLMT_RATIO,
                                    width: "auto",
                                    maxWidth: "100%",
                                    flexShrink: 0,
                                }}
                            />
                            <Box
                                component="img"
                                src={logoUsGovDataFi}
                                alt="Gouvernement des États-Unis d'Amérique — projet Data.Fi"
                                sx={{
                                    height: LOGO_HEIGHT,
                                    aspectRatio: USG_DATAFI_RATIO,
                                    width: "auto",
                                    maxWidth: "100%",
                                    flexShrink: 0,
                                }}
                            />
                        </Stack>

                        <Divider sx={{my: 3}}/>

                        <Typography variant="body1">
                            GAS Hôpitaux est le fruit de la collaboration entre le Ministère de la santé publique via
                            la Direction de la Pharmacie, des Laboratoires et de la Médecine Traditionnelle (DPLMT)
                            et le Gouvernement des États-Unis d'Amérique, à travers le projet Data.Fi.
                        </Typography>
                    </Paper>
                </Section>

            </Stack>
        </Container>
    );
}
