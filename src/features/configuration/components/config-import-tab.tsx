import {useCallback, useEffect, useRef, useState} from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {parseConfigFile} from "../models/config-model.ts";
import {importConfig} from "../services/config-import-service.ts";
import {getConfigVersion, type DeviceConfigVersion} from "../services/config-version-service.ts";

function formatImportedAt(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("fr-FR");
}

export default function ConfigImportTab() {
    const inputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [installed, setInstalled] = useState<DeviceConfigVersion | null>(null);

    const refreshInstalled = useCallback(async () => {
        setInstalled(await getConfigVersion());
    }, []);

    useEffect(() => {
        void refreshInstalled();
    }, [refreshInstalled]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setImporting(true);
        setResult(null);
        setError(null);
        try {
            const content = await file.text();
            const config = parseConfigFile(content);
            const summary = await importConfig(config);
            setResult(summary);
            await refreshInstalled();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setImporting(false);
        }
    };

    return (
        <Box sx={{display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, p: 1, maxWidth: 600}}>
            <h3>Importation du fichier de configuration</h3>

            {/* Which configuration this device is on. It is what every report
                exported from here is stamped with, so it needs to be visible
                without digging — "quelle version avez-vous ?" is the first
                question when a report looks wrong. */}
            <Box sx={{display: "flex", alignItems: "center", gap: 1}}>
                <Typography color="text.secondary">Configuration installée :</Typography>
                {installed ? (
                    <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={`v${installed.version} — importée le ${formatImportedAt(installed.importedAt)}`}
                    />
                ) : (
                    <Chip size="small" color="warning" variant="outlined" label="aucune"/>
                )}
            </Box>

            <Typography color="text.secondary">
                Importez le fichier de configuration exporté depuis le serveur (<code>utgl_config.json</code>).
                Les produits, programmes et unités d'organisation sont mis à jour. Un produit retiré de la
                configuration n'est pas supprimé : il cesse d'être proposé pour les nouveaux rapports, mais
                reste visible dans ceux déjà saisis.
            </Typography>
            <input
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleFileChange}
            />
            <Button
                variant="contained"
                startIcon={<UploadFileIcon/>}
                disabled={importing}
                onClick={() => inputRef.current?.click()}
            >
                Choisir le fichier de configuration
            </Button>
            {importing && (
                <Box sx={{display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary"}}>
                    <CircularProgress size={22}/>
                    <span>Importation en cours…</span>
                </Box>
            )}
            {result && <Alert severity="success">{result}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
        </Box>
    );
}
