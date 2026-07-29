import {useRef, useState} from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {parseConfigFile} from "../models/config-model.ts";
import {importConfig} from "../services/config-import-service.ts";
import ProduitsProgrammeTable from "./produits-programme-table.tsx";

export default function ConfigImportTab() {
    const inputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [produitsTableKey, setProduitsTableKey] = useState(0);

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
            setProduitsTableKey((key) => key + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setImporting(false);
        }
    };

    return (
        <Box sx={{display: "flex", flexDirection: "column", gap: 2, p: 1}}>
            <Box sx={{display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, maxWidth: 600}}>
                <h3>Importation du fichier de configuration</h3>
                <Typography color="text.secondary">
                    Importez le fichier de configuration exporté depuis le serveur (<code>utgl_config.json</code>).
                    Cette opération remplace toutes les données de référence : produits, programmes et unités
                    d'organisation.
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

            <ProduitsProgrammeTable key={produitsTableKey}/>
        </Box>
    );
}
