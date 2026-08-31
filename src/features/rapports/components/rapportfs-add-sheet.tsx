import {useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import {DatePicker} from "@mui/x-date-pickers/DatePicker";
import dayjs, {type Dayjs} from "dayjs";
import type {MyOrganisationUnit} from "../../organisation-units/organisation-unit-model.ts";
import {getMyOrganisationUnit} from "../../organisation-units/organisation-units-service.ts";
import {createRapportFs, listRapportFs} from "../services/rapportfs-service.ts";
import {computeRollingCmm} from "../services/rapport-cmm-service.ts";
import {useNotification} from "../../../notifications/notification-provider.tsx";
import type {RapportHopitaux} from "../model/rapport-model.ts";
import {monthKey, parseMoisAnnee} from "../../../utils/mois-annee.ts";

interface RapportfsAddSheetProps {
    open: boolean;
    onClose: () => void;
    filterMoisAnnee?: RapportHopitaux[];
}

export default function RapportfsAddSheet({open, onClose, filterMoisAnnee}: RapportfsAddSheetProps) {
    const navigate = useNavigate();
    const {notifySuccess} = useNotification();
    const [loading, setLoading] = useState(true);
    const [orgUnit, setOrgUnit] = useState<MyOrganisationUnit | null>(null);
    const [moisAnnee, setMoisAnnee] = useState("");
    const [creating, setCreating] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);

    // Months already covered by an existing rapport — "YYYY-MM" keys, since
    // mois_annee is stored as either "YYYY-MM" or "YYYY-MM-DD".
    const takenMonths = useMemo(() => {
        const keys = new Set<string>();
        for (const rapport of filterMoisAnnee ?? []) {
            const parsed = parseMoisAnnee(rapport.mois_annee);
            if (parsed) keys.add(monthKey(parsed));
        }
        return keys;
    }, [filterMoisAnnee]);

    useEffect(() => {
        if (!open) return;
        setLoadError(null);
        setCreateError(null);
        setMoisAnnee("");
        setLoading(true);
        getMyOrganisationUnit()
            .then(setOrgUnit)
            .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, [open]);

    const handleCreate = async () => {
        if (!orgUnit || !moisAnnee) return;
        setCreating(true);
        setCreateError(null);
        try {
            const id = await createRapportFs({fsId: orgUnit.fs.id, moisAnnee});
            // If this is the 4th consecutive month, fill in CMM/CMMA right
            // away rather than waiting for the next list-page visit.
            await computeRollingCmm(await listRapportFs());
            notifySuccess("Rapport créé.");
            onClose();
            navigate(`/rapport-view/${id}`);
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : String(err));
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>Nouveau rapport hopitaux</DialogTitle>
            <DialogContent>
                {loading ? (
                    <Box sx={{display: "flex", justifyContent: "center", p: 2}}>
                        <CircularProgress size={24}/>
                    </Box>
                ) : loadError ? (
                    <Alert severity="error">{loadError}</Alert>
                ) : orgUnit ? (
                    <Box sx={{display: "flex", flexDirection: "column", gap: 2, pt: 1}}>
                        <TextField
                            label="Unité d'organisation"
                            value={orgUnit.fs.name}
                            slotProps={{input: {readOnly: true}}}
                            fullWidth
                        />
                        <DatePicker
                            label="Mois / Année"
                            views={["year", "month"]}
                            format="MM/YYYY"
                            value={moisAnnee ? dayjs(moisAnnee, "YYYY-MM") : null}
                            onChange={(newValue: Dayjs | null) =>
                                setMoisAnnee(newValue?.isValid() ? newValue.format("YYYY-MM") : "")
                            }
                            slotProps={{textField: {fullWidth: true}}}
                            maxDate={dayjs()}
                            shouldDisableMonth={(month) => takenMonths.has(month.format("YYYY-MM"))}
                        />
                        {createError && <Alert severity="error">{createError}</Alert>}
                    </Box>
                ) : (
                    <Alert severity="warning">
                        Aucune unité d'organisation enregistrée. Veuillez la configurer dans Paramètres.
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                {!loading && !loadError && !orgUnit ? (
                    <>
                        <Button onClick={onClose}>Annuler</Button>
                        <Button
                            variant="contained"
                            onClick={() => {
                                onClose();
                                navigate("/parametres");
                            }}
                        >
                            Aller aux paramètres
                        </Button>
                    </>
                ) : (
                    <>
                        <Button onClick={onClose} disabled={creating}>
                            Annuler
                        </Button>
                        <Button
                            variant="contained"
                            disabled={!orgUnit || !moisAnnee || creating}
                            onClick={handleCreate}
                        >
                            {creating ? <CircularProgress size={20} color="inherit"/> : "Créer"}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
