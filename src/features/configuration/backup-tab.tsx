import {useState} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import BackupIcon from "@mui/icons-material/Backup";
import RestoreIcon from "@mui/icons-material/Restore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {backupDatabase, restoreDatabase} from "./backup-service.ts";

export default function BackupTab() {
    const [backingUp, setBackingUp] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [message, setMessage] = useState<{severity: "success" | "error"; text: string} | null>(null);

    const handleBackup = async () => {
        setBackingUp(true);
        setMessage(null);
        try {
            const dest = await backupDatabase();
            if (dest) setMessage({severity: "success", text: "Sauvegarde créée avec succès."});
        } catch (err) {
            setMessage({severity: "error", text: "Erreur lors de la sauvegarde : " + String(err)});
        } finally {
            setBackingUp(false);
        }
    };

    const handleRestore = async () => {
        setRestoring(true);
        setMessage(null);
        try {
            const restored = await restoreDatabase();
            if (restored) {
                setMessage({
                    severity: "success",
                    text: "Sauvegarde restaurée. Veuillez redémarrer l'application.",
                });
            }
        } catch (err) {
            setMessage({severity: "error", text: "Erreur lors de la restauration : " + String(err)});
        } finally {
            setRestoring(false);
        }
    };

    return (
        <Box sx={{display: "flex", flexDirection: "column", gap: 3, p: 3, maxWidth: 600}}>
            <Stack spacing={2} sx={{alignItems: "flex-start"}}>
                <Stack direction="row" spacing={1.5} sx={{alignItems: "flex-start"}}>
                    <BackupIcon color="primary" sx={{mt: 0.5}}/>
                    <Box>
                        <Typography variant="subtitle1">Créer une sauvegarde</Typography>
                        <Typography color="text.secondary">
                            Exporte l'intégralité des données locales (rapports, configuration, unité
                            d'organisation) dans un fichier <code>.rfsbak</code>.
                        </Typography>
                    </Box>
                </Stack>
                <Button variant="contained" startIcon={<BackupIcon/>} disabled={backingUp} onClick={handleBackup}>
                    Sauvegarder
                </Button>
                {backingUp && (
                    <Box sx={{display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary"}}>
                        <CircularProgress size={22}/>
                        <span>Sauvegarde en cours…</span>
                    </Box>
                )}
            </Stack>

            <Divider/>

            <Stack spacing={2} sx={{alignItems: "flex-start"}}>
                <Stack direction="row" spacing={1.5} sx={{alignItems: "flex-start"}}>
                    <RestoreIcon color="error" sx={{mt: 0.5}}/>
                    <Box>
                        <Typography variant="subtitle1">Restaurer une sauvegarde</Typography>
                        <Typography color="text.secondary">
                            Remplace toutes les données actuelles par celles d'un fichier <code>.rfsbak</code>. Un
                            redémarrage de l'application est nécessaire après la restauration.
                        </Typography>
                    </Box>
                </Stack>
                <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit"/>}>
                    Cette opération est irréversible et remplace toutes les données existantes.
                </Alert>
                <Button
                    variant="contained"
                    color="error"
                    startIcon={<RestoreIcon/>}
                    disabled={restoring}
                    onClick={handleRestore}
                >
                    Restaurer
                </Button>
                {restoring && (
                    <Box sx={{display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary"}}>
                        <CircularProgress size={22}/>
                        <span>Restauration en cours…</span>
                    </Box>
                )}
            </Stack>

            {message && <Alert severity={message.severity}>{message.text}</Alert>}
        </Box>
    );
}
