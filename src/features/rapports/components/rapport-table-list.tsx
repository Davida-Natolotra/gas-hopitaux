import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import type {GridRowSelectionModel} from "@mui/x-data-grid";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import TableList from "./table-list.tsx";
import RapportfsAddSheet from "./rapportfs-add-sheet.tsx";
import {deleteRapportFs, listRapportFs, markRapportFsExported} from "../services/rapportfs-service.ts";
import {computeRollingCmm} from "../services/rapport-cmm-service.ts";
import {exportRapportFsToUtglfs} from "../services/rapportfs-export-service.ts";
import type {RapportPhagdis} from "../model/rapport-model.ts";
import {useNotification} from "../../../notifications/notification-provider.tsx";

const emptySelection: GridRowSelectionModel = {type: "include", ids: new Set()};

function RapportTableList() {
    const navigate = useNavigate();
    const {notifySuccess, notifyError} = useNotification();
    const [addOpen, setAddOpen] = useState(false);
    const [rows, setRows] = useState<RapportPhagdis[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>(emptySelection);
    const [exporting, setExporting] = useState(false);
    const [exportMessage, setExportMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);

    const loadRows = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const initial = await listRapportFs();
            const touchedIds = await computeRollingCmm(initial);
            setRows(touchedIds.length > 0 ? await listRapportFs() : initial);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRows();
    }, [loadRows]);

    const selectedRow = useMemo(() => {
        if (selectionModel.type !== "include" || selectionModel.ids.size === 0) return null;
        const [id] = selectionModel.ids;
        return rows.find((row) => row.id === id) ?? null;
    }, [rows, selectionModel]);

    const handleView = () => {
        if (!selectedRow) return;
        navigate(`/rapport-view/${selectedRow.id}`);
    };

    const handleDelete = async () => {
        if (!selectedRow) return;
        if (!window.confirm("Supprimer ce rapport FS ?")) return;
        try {
            await deleteRapportFs(selectedRow.id);
            setSelectionModel(emptySelection);
            await loadRows();
            notifySuccess("Rapport supprimé.");
        } catch (err) {
            notifyError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleExport = async () => {
        if (!selectedRow) return;
        setExporting(true);
        setExportMessage(null);
        try {
            const dest = await exportRapportFsToUtglfs(selectedRow.id, selectedRow.name);
            if (dest) {
                await markRapportFsExported(selectedRow.id);
                await loadRows();
                setExportMessage({severity: "success", text: `Rapport exporté : ${dest}`});
            }
        } catch (err) {
            setExportMessage({severity: "error", text: err instanceof Error ? err.message : String(err)});
        } finally {
            setExporting(false);
        }
    };

    return (
        <div>
            <h3>Liste des rapports</h3>

            <Stack direction="row" sx={{justifyContent: "space-between", alignItems: "center", mb: 2}}>
                <Button variant="contained" onClick={() => setAddOpen(true)}>+ Nouveau rapport</Button>

                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" startIcon={<VisibilityIcon/>} disabled={!selectedRow}
                            onClick={handleView}>
                        Détails
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={exporting ? <CircularProgress size={16}/> : <FileDownloadIcon/>}
                        disabled={!selectedRow?.status || exporting}
                        onClick={handleExport}
                    >
                        Exporter
                    </Button>
                    <Button variant="outlined" color="error" startIcon={<DeleteIcon/>} disabled={!selectedRow}
                            onClick={handleDelete}>
                        Supprimer
                    </Button>
                </Stack>
            </Stack>

            {exportMessage && (
                <Alert severity={exportMessage.severity} sx={{mb: 2}} onClose={() => setExportMessage(null)}>
                    {exportMessage.text}
                </Alert>
            )}

            <TableList
                rows={rows}
                loading={loading}
                error={error}
                selectionModel={selectionModel}
                onSelectionModelChange={setSelectionModel}
            />
            <RapportfsAddSheet open={addOpen} onClose={() => setAddOpen(false)}/>
        </div>
    )
}

export default RapportTableList
