import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import type {GridRowSelectionModel} from "@mui/x-data-grid";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Stack from "@mui/material/Stack";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import TableList from "./table-list.tsx";
import RapportfsAddSheet from "./rapportfs-add-sheet.tsx";
import {deleteRapportFs, listRapportFs} from "./rapportfs-service.ts";
import type {RapportFs} from "./rapport-model.ts";

const emptySelection: GridRowSelectionModel = {type: "include", ids: new Set()};

function RapportTableList() {
    const navigate = useNavigate();
    const [addOpen, setAddOpen] = useState(false);
    const [rows, setRows] = useState<RapportFs[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>(emptySelection);

    const loadRows = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(await listRapportFs());
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
        await deleteRapportFs(selectedRow.id);
        setSelectionModel(emptySelection);
        await loadRows();
    };

    return (
        <div>
            <h3>Liste des rapports FS</h3>

            <Stack direction="row" sx={{justifyContent: "space-between", alignItems: "center", mb: 2}}>
                <Button variant="contained" onClick={() => setAddOpen(true)}>+ Nouveau rapport</Button>

                <Stack direction="row" spacing={1}>
                    <Tooltip title="Détails">
                        <span>
                            <IconButton disabled={!selectedRow} onClick={handleView}>
                                <VisibilityIcon fontSize="small"/>
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Exporter">
                        <span>
                            <IconButton disabled={!selectedRow?.status}>
                                <FileDownloadIcon fontSize="small"/>
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Supprimer">
                        <span>
                            <IconButton disabled={!selectedRow} onClick={handleDelete}>
                                <DeleteIcon fontSize="small"/>
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            </Stack>

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
