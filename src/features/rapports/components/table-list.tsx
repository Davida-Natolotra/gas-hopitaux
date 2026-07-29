import {DataGrid, GridColDef, GridRowSelectionModel} from "@mui/x-data-grid";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import type {RapportFs} from "../model/rapport-model.ts";
import {formatDate, formatMoisAnnee} from "../../../utils/date-format.ts";
import {completenessStyle} from "../styles/completeness-style.ts";

interface RapportfsTableProps {
    rows: RapportFs[];
    loading: boolean;
    error: string | null;
    selectionModel: GridRowSelectionModel;
    onSelectionModelChange: (model: GridRowSelectionModel) => void;
}

export default function RapportfsTable({
                                           rows,
                                           loading,
                                           error,
                                           selectionModel,
                                           onSelectionModelChange
                                       }: RapportfsTableProps) {
    const columns: GridColDef[] = [
        {
            field: "mois_annee",
            headerName: "Mois/Année",
            width: 130,
            valueFormatter: (value: string | null) => formatMoisAnnee(value),
        },
        {field: "name", headerName: "Nom", flex: 1, minWidth: 200},
        {
            field: "status",
            headerName: "Statut",
            width: 140,
            renderCell: ({value}) => (
                <Chip
                    label={value ? "Complet" : "Incomplet"}
                    size="small"
                    sx={{bgcolor: completenessStyle(value).bg, color: completenessStyle(value).color}}
                />
            ),
        },
        {
            field: "exported_date",
            headerName: "Date d'export",
            width: 150,
            valueFormatter: (value: string | null) => formatDate(value),
        },
    ];

    if (error) {
        return <Alert severity="error">{error}</Alert>;
    }

    return (
        <Paper sx={{height: 500, width: "100%"}}>
            <DataGrid
                rows={rows}
                columns={columns}
                loading={loading}
                getRowId={(row) => row.id}
                initialState={{pagination: {paginationModel: {page: 0, pageSize: 10}}}}
                pageSizeOptions={[10, 25]}
                disableMultipleRowSelection
                rowSelectionModel={selectionModel}
                onRowSelectionModelChange={onSelectionModelChange}
                sx={{border: 0}}
            />
        </Paper>
    );
}
