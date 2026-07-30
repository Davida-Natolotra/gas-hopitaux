import type {ReactNode} from "react";
import {useEffect, useState} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import EditIcon from "@mui/icons-material/Edit";
import RemoveIcon from "@mui/icons-material/Remove";
import {DatePicker} from "@mui/x-date-pickers/DatePicker";
import dayjs, {type Dayjs} from "dayjs";
import type {DetailSDU, RapportPhaGDisLigne} from "../model/rapport-model.ts";
import {isLigneComplete} from "../model/rapport-completeness.ts";
import {COMPLETENESS_STYLES, completenessStyle} from "../styles/completeness-style.ts";
import {situationStyle} from "../styles/situation-style.ts";
import type {RapportViewRow} from "../services/rapport-view-service.ts";
import {getDetailSdu, saveDetailSdu, saveRapportFsLigne} from "../services/rapport-view-service.ts";
import {refreshRapportFsStatus} from "../services/rapportfs-service.ts";
import {generateUuid} from "../../../services/id-service.ts";
import {formatMoisAnnee} from "../../../utils/date-format.ts";
import {useNotification} from "../../../notifications/notification-provider.tsx";
// Accent rule: for the "movement" quantities, filled-in data is olive, blanks
// are red (draws the eye to missing entries); the derived/computed fields
// (stock, SDU, ecart, CMM, CMMA, MSD) always get the teal accent regardless of data.
const ACCENT_FILLED = COMPLETENESS_STYLES.complete.bg;
const ACCENT_BLANK = COMPLETENESS_STYLES.incomplete.bg;
const ACCENT_COMPUTED = "#0ebaa8";

type NumericFieldKey =
    | "qte_dispo_deb_mois"
    | "qte_rec_mois"
    | "qte_dist_patient"
    | "qte_dist_ac"
    | "qte_perime_avarie_mois"
    | "qte_redepl_mois"
    | "nb_jour_rupture"
    | "stock_theorique"
    | "sdu_fin_mois"
    | "ecart"
    | "cmm"
    | "cmma"
    | "msd";

interface FieldDef {
    key: NumericFieldKey;
    label: string;
    kind: "conditional" | "computed";
    // True for the fields that are auto-derived from other inputs in the
    // edit form (see computeValues below) — rendered read-only there instead
    // of as a free-text input.
    derived?: boolean;
}

// Single source of truth for the field layout, shared by the read-only
// display grid and the edit dialog's form.
const FIELD_ROWS: FieldDef[][] = [
    [
        {key: "qte_dispo_deb_mois", label: "Quantité disponible au début du mois", kind: "conditional"},
        {key: "qte_rec_mois", label: "Quantité reçue au cours du mois", kind: "conditional"},
        {key: "qte_dist_patient", label: "Quantité distribuée aux patients au cours du mois", kind: "conditional"},
    ],
    [
        {key: "qte_dist_ac", label: "Quantité distribuée à l'AC au cours du mois", kind: "conditional"},
        {key: "qte_perime_avarie_mois", label: "Quantité périmée, avariée au cours du mois", kind: "conditional"},
        {key: "qte_redepl_mois", label: "Quantité redéployée au cours du mois", kind: "conditional"},
    ],
    [
        {key: "nb_jour_rupture", label: "Nombre de jours de rupture", kind: "conditional"},
        {key: "stock_theorique", label: "Stock théorique", kind: "computed", derived: true},
        {key: "sdu_fin_mois", label: "SDU fin du mois", kind: "computed", derived: true},
    ],
    [
        {key: "ecart", label: "Ecart", kind: "computed", derived: true},
        {key: "cmm", label: "CMM", kind: "computed"},
        {key: "cmma", label: "CMMA", kind: "computed", derived: true},
    ],
    [
        {key: "msd", label: "MSD", kind: "computed", derived: true},
    ],
];

function accentFor(kind: FieldDef["kind"], value: number | null | undefined): string {
    if (kind === "computed") return ACCENT_COMPUTED;
    return value === null || value === undefined ? ACCENT_BLANK : ACCENT_FILLED;
}

function displayValue(value: number | null | undefined): string {
    return value === null || value === undefined ? "—" : String(value);
}

function FieldBox({label, value, accent}: { label: string; value: ReactNode; accent: string }) {
    return (
        <Box sx={{borderLeft: `4px solid ${accent}`, bgcolor: "grey.100", px: 2, py: 1, borderRadius: "0 4px 4px 0"}}>
            <Typography variant="caption" color="text.secondary" component="div">
                {label}
            </Typography>
            <Typography variant="body1" component="div" sx={{fontWeight: 600}}>
                {value}
            </Typography>
        </Box>
    );
}

function FieldGrid({
                       ligne,
                       detailSdu,
                       loadingSdu,
                   }: {
    ligne: RapportPhaGDisLigne | null;
    detailSdu: DetailSDU[] | null;
    loadingSdu: boolean;
}) {
    const observation = ligne?.observation ?? "";
    const hasSdu = Boolean(detailSdu && detailSdu.length > 0);

    return (
        <Stack spacing={1.5}>
            {FIELD_ROWS.map((rowFields, i) => {
                const isLastRow = i === FIELD_ROWS.length - 1;
                return (
                    <Grid container spacing={2} key={i}>
                        {rowFields.map((field) => {
                            const value = ligne?.[field.key];
                            return (
                                <Grid size={4} key={field.key}>
                                    <FieldBox
                                        label={field.label}
                                        value={displayValue(value)}
                                        accent={accentFor(field.kind, value)}
                                    />
                                </Grid>
                            );
                        })}
                        {isLastRow && (
                            <Grid size={8}>
                                <FieldBox
                                    label="Observation"
                                    value={observation.trim() === "" ? "Aucune observation." : observation}
                                    accent={observation.trim() === "" ? ACCENT_BLANK : ACCENT_FILLED}
                                />
                            </Grid>
                        )}
                    </Grid>
                );
            })}
            <Grid container spacing={2}>
                <Grid size={12}>
                    <FieldBox
                        label="Détails SDU"
                        accent={hasSdu ? ACCENT_FILLED : ACCENT_BLANK}
                        value={
                            loadingSdu ? (
                                <CircularProgress size={16}/>
                            ) : hasSdu ? (
                                <Stack spacing={0.5}>
                                    {detailSdu!.map((d) => (
                                        <Stack key={d.id} direction="row" spacing={4}>
                                            <span>SDU : {d.sdu}</span>
                                            <span>Date de péremption : {formatMoisAnnee(d.date_peremption)}</span>
                                        </Stack>
                                    ))}
                                </Stack>
                            ) : (
                                "Aucun SDU enregistré."
                            )
                        }
                    />
                </Grid>
            </Grid>
        </Stack>
    );
}

type FormState = Record<NumericFieldKey, string>;

// When this produit's qte_dispo_deb_mois hasn't actually been entered this
// month yet — either there's no line at all, or one exists only because the
// rolling-CMM auto-fill created it (cmm/cmma set, nothing else) — it
// defaults to the previous consecutive month's sdu_fin_mois for the same
// produit (editable, not persisted until the user saves).
function ligneToFormState(ligne: RapportPhaGDisLigne | null, previousSduFinMois: number | null): FormState {
    const str = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
    return {
        qte_dispo_deb_mois: ligne?.qte_dispo_deb_mois != null ? str(ligne.qte_dispo_deb_mois) : str(previousSduFinMois),
        qte_rec_mois: str(ligne?.qte_rec_mois),
        qte_dist_patient: str(ligne?.qte_dist_patient),
        qte_dist_ac: str(ligne?.qte_dist_ac),
        qte_perime_avarie_mois: str(ligne?.qte_perime_avarie_mois),
        qte_redepl_mois: str(ligne?.qte_redepl_mois),
        nb_jour_rupture: str(ligne?.nb_jour_rupture),
        stock_theorique: str(ligne?.stock_theorique),
        sdu_fin_mois: str(ligne?.sdu_fin_mois),
        ecart: str(ligne?.ecart),
        cmm: str(ligne?.cmm),
        cmma: str(ligne?.cmma),
        msd: str(ligne?.msd ?? 0),
    };
}

interface ComputedValues {
    stock_theorique: number;
    ecart: number;
    sdu_fin_mois: number;
    cmm: number;
    msd: number;
    situation: string;
}

function computeSituation(msd: number): string {
    if (msd > 4) return "SURSTOCK";
    if (msd >= 2) return "NORMAL";
    if (msd > 0) return "SOUS STOCK";
    return "RUPTURE";
}

// stock_theorique and ecart recompute live from the quantity fields; SDU fin
// du mois recomputes live from the Détails SDU list; MSD recomputes from SDU
// and CMM; situation recomputes from MSD. Blank/invalid inputs count as 0
// rather than breaking the calculation. CMM is rounded to the nearest
// integer and MSD to 2 decimal places, matching how they're persisted.
function computeValues(form: FormState, sduRows: EditableSduRow[]): ComputedValues {
    const num = (value: string) => {
        if (value.trim() === "") return 0;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const stock_theorique =
        num(form.qte_dispo_deb_mois) +
        num(form.qte_rec_mois) -
        num(form.qte_redepl_mois) -
        num(form.qte_dist_patient) -
        num(form.qte_dist_ac) -
        num(form.qte_perime_avarie_mois);
    const ecart = num(form.qte_dispo_deb_mois) - stock_theorique;
    const sdu_fin_mois = sduRows.reduce((sum, row) => sum + num(row.sdu), 0);
    const cmm = Math.round(num(form.cmm));
    const msd = cmm ? Math.round((sdu_fin_mois / cmm) * 100) / 100 : 0;
    const situation = computeSituation(msd);
    return {stock_theorique, ecart, sdu_fin_mois, cmm, msd, situation};
}

function formStateToLigne(
    ppnId: string,
    form: FormState,
    computed: ComputedValues,
    observation: string,
    existing: RapportPhaGDisLigne | null,
): RapportPhaGDisLigne {
    const num = (value: string) => (value.trim() === "" ? null : Number(value));
    return {
        produit_programme_niveau_id: ppnId,
        qte_dispo_deb_mois: num(form.qte_dispo_deb_mois),
        qte_rec_mois: num(form.qte_rec_mois),
        qte_dist_patient: num(form.qte_dist_patient),
        qte_dist_ac: num(form.qte_dist_ac),
        qte_perime_avarie_mois: num(form.qte_perime_avarie_mois),
        qte_redepl_mois: num(form.qte_redepl_mois),
        nb_jour_rupture: num(form.nb_jour_rupture),
        stock_theorique: computed.stock_theorique,
        sdu_fin_mois: computed.sdu_fin_mois,
        ecart: computed.ecart,
        cmm: form.cmm.trim() === "" ? null : computed.cmm,
        cmma: num(form.cmma),
        msd: computed.msd,
        situation: computed.situation,
        observation,
        detail_sdu: existing?.detail_sdu ?? null,
    };
}

function EditFieldGrid({
                           values,
                           computed,
                           observation,
                           onChange,
                           onObservationChange,
                       }: {
    values: FormState;
    computed: ComputedValues;
    observation: string;
    onChange: (key: NumericFieldKey, value: string) => void;
    onObservationChange: (value: string) => void;
}) {
    return (
        <Stack spacing={1.5}>
            {FIELD_ROWS.map((rowFields, i) => {
                const isLastRow = i === FIELD_ROWS.length - 1;
                return (
                    <Grid container spacing={2} key={i}>
                        {rowFields.map((field) => {
                            // Derived fields (stock_theorique, sdu_fin_mois, ecart, msd) get
                            // their live value from computeValues; CMMA is also derived
                            // (read-only here) but has no formula, so it just echoes whatever
                            // value the line already has.
                            const computedValue = (computed as Partial<Record<NumericFieldKey, number>>)[field.key];
                            const raw = field.derived
                                ? (computedValue !== undefined ? String(computedValue) : values[field.key])
                                : values[field.key];
                            const parsed = raw.trim() === "" ? null : Number(raw);
                            return (
                                <Grid size={4} key={field.key}>
                                    {field.derived ? (
                                        <FieldBox
                                            label={field.label}
                                            value={displayValue(parsed)}
                                            accent={accentFor(field.kind, parsed)}
                                        />
                                    ) : (
                                        <Box
                                            sx={{
                                                borderLeft: `4px solid ${accentFor(field.kind, parsed)}`,
                                                bgcolor: "grey.100",
                                                px: 2,
                                                py: 1,
                                                borderRadius: "0 4px 4px 0",
                                            }}
                                        >
                                            <TextField
                                                variant="standard"
                                                label={field.label}
                                                type="number"
                                                fullWidth
                                                value={raw}
                                                onChange={(e) => onChange(field.key, e.target.value)}
                                                slotProps={{inputLabel: {shrink: true}}}
                                            />
                                        </Box>
                                    )}
                                </Grid>
                            );
                        })}
                        {isLastRow && (
                            <Grid size={8}>
                                <Box
                                    sx={{
                                        borderLeft: `4px solid ${observation.trim() === "" ? ACCENT_BLANK : ACCENT_FILLED}`,
                                        bgcolor: "grey.100",
                                        px: 2,
                                        py: 1,
                                        borderRadius: "0 4px 4px 0",
                                    }}
                                >
                                    <TextField
                                        variant="standard"
                                        label="Observation"
                                        fullWidth
                                        value={observation}
                                        onChange={(e) => onObservationChange(e.target.value)}
                                        slotProps={{inputLabel: {shrink: true}}}
                                    />
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                );
            })}
        </Stack>
    );
}

interface EditableSduRow {
    key: string;
    sdu: string;
    date_peremption: string;
}

// An <input type="month"> only accepts an exact "YYYY-MM" value — trim any
// day component from older "YYYY-MM-DD" records so the picker still shows it.
function toMonthInputValue(value: string | null): string {
    return value ? value.slice(0, 7) : "";
}

function detailSduToRows(entries: DetailSDU[]): EditableSduRow[] {
    return entries.map((d) => ({key: d.id, sdu: String(d.sdu), date_peremption: toMonthInputValue(d.date_peremption)}));
}

function SduMonthField({value, error, helperText, onChange}: {
    value: string;
    error: boolean;
    helperText?: string;
    onChange: (value: string) => void;
}) {
    return (
        <DatePicker
            label="Date de péremption"
            views={["year", "month"]}
            format="MM/YYYY"
            value={value ? dayjs(value, "YYYY-MM") : null}
            onChange={(newValue: Dayjs | null) => onChange(newValue?.isValid() ? newValue.format("YYYY-MM") : "")}
            slotProps={{
                textField: {
                    variant: "standard",
                    fullWidth: true,
                    required: true,
                    error,
                    helperText,
                },
            }}
        />
    );
}

function SduDetailsEditor({
                              rows,
                              onAdd,
                              onRemove,
                              onChange,
                          }: {
    rows: EditableSduRow[];
    onAdd: () => void;
    onRemove: (key: string) => void;
    onChange: (key: string, field: "sdu" | "date_peremption", value: string) => void;
}) {
    return (
        <Box sx={{mt: 3}}>
            <Stack direction="row" sx={{justifyContent: "space-between", alignItems: "center", mb: 1}}>
                <Typography variant="subtitle2" color="text.secondary">
                    Détails SDU
                </Typography>
                <Button variant="outlined" size="small" onClick={onAdd}>
                    + SDU
                </Button>
            </Stack>
            <Stack spacing={1.5}>
                {rows.map((row) => {
                    const dateMissing = row.sdu.trim() !== "" && row.date_peremption.trim() === "";
                    return (
                        <Stack key={row.key} direction="row" spacing={2} sx={{alignItems: "flex-end"}}>
                            <TextField
                                variant="standard"
                                label="SDU"
                                type="number"
                                fullWidth
                                value={row.sdu}
                                onChange={(e) => onChange(row.key, "sdu", e.target.value)}
                            />
                            <SduMonthField
                                value={row.date_peremption}
                                error={dateMissing}
                                helperText={dateMissing ? "Date requise" : undefined}
                                onChange={(value) => onChange(row.key, "date_peremption", value)}
                            />
                            <IconButton size="small" onClick={() => onRemove(row.key)} aria-label="Supprimer ce SDU">
                                <RemoveIcon fontSize="small"/>
                            </IconButton>
                        </Stack>
                    );
                })}
                {rows.length > 0 && <Divider/>}
            </Stack>
        </Box>
    );
}

interface EditLigneDialogProps {
    open: boolean;
    onClose: () => void;
    produitName: string;
    unit: string;
    ppnId: string;
    rapportfsId: string;
    ligne: RapportPhaGDisLigne | null;
    ligneId: string | null;
    previousSduFinMois: number | null;
    onSaved: (ligne: RapportPhaGDisLigne, ligneId: string, detailSdu: DetailSDU[]) => void;
}

function EditLigneDialog({
                             open,
                             onClose,
                             produitName,
                             unit,
                             ppnId,
                             rapportfsId,
                             ligne,
                             ligneId,
                             previousSduFinMois,
                             onSaved
                         }: EditLigneDialogProps) {
    const {notifySuccess} = useNotification();
    const [form, setForm] = useState<FormState>(() => ligneToFormState(ligne, previousSduFinMois));
    const [observation, setObservation] = useState(() => ligne?.observation ?? "");
    const [sduRows, setSduRows] = useState<EditableSduRow[]>([]);
    const [loadingSdu, setLoadingSdu] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setForm(ligneToFormState(ligne, previousSduFinMois));
        setObservation(ligne?.observation ?? "");
        setError(null);
        if (ligneId) {
            setLoadingSdu(true);
            getDetailSdu(ligneId)
                .then((entries) => setSduRows(detailSduToRows(entries)))
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setLoadingSdu(false));
        } else {
            setSduRows([]);
        }
    }, [open, ligne, ligneId, previousSduFinMois]);

    const handleChange = (key: NumericFieldKey, value: string) => setForm((prev) => ({...prev, [key]: value}));

    const handleAddSdu = () => setSduRows((prev) => [...prev, {
        key: generateUuid(),
        sdu: "",
        date_peremption: ""
    }]);
    const handleRemoveSdu = (key: string) => setSduRows((prev) => prev.filter((r) => r.key !== key));
    const handleSduChange = (key: string, field: "sdu" | "date_peremption", value: string) =>
        setSduRows((prev) => prev.map((r) => (r.key === key ? {...r, [field]: value} : r)));

    const computed = computeValues(form, sduRows);

    const handleSave = async () => {
        const missingDate = sduRows.some((row) => row.sdu.trim() !== "" && row.date_peremption.trim() === "");
        if (missingDate) {
            setError("Veuillez renseigner la date de péremption pour chaque SDU.");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const newLigne = formStateToLigne(ppnId, form, computed, observation, ligne);
            const newLigneId = await saveRapportFsLigne(rapportfsId, ppnId, newLigne);
            const sduEntries = sduRows
                .filter((row) => row.sdu.trim() !== "")
                .map((row) => ({sdu: Number(row.sdu), date_peremption: row.date_peremption || null}));
            await saveDetailSdu(newLigneId, sduEntries);
            const savedSdu = await getDetailSdu(newLigneId);
            await refreshRapportFsStatus(rapportfsId);
            onSaved(newLigne, newLigneId, savedSdu);
            notifySuccess("Ligne enregistrée.");
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    const style = situationStyle(computed.situation);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>
                <Stack direction="row" spacing={1.5} sx={{alignItems: "center", justifyContent: "space-between"}}>
                    <Stack direction="row" spacing={1.5} sx={{alignItems: "center"}}>
                        <span>{produitName}</span>
                        <Typography component="span" color="text.secondary">
                            ({unit})
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{alignItems: "center"}}>
                        <Typography component="span" color="text.secondary" variant={"body2"}>
                            SITUATION
                        </Typography>
                        <Chip label={computed.situation} size="small" sx={{bgcolor: style.bg, color: style.color}}/>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent>
                <Box sx={{pt: 1}}>
                    <EditFieldGrid
                        values={form}
                        computed={computed}
                        observation={observation}
                        onChange={handleChange}
                        onObservationChange={setObservation}
                    />
                </Box>

                {loadingSdu ? (
                    <Box sx={{display: "flex", justifyContent: "center", mt: 3}}>
                        <CircularProgress size={20}/>
                    </Box>
                ) : (
                    <SduDetailsEditor
                        rows={sduRows}
                        onAdd={handleAddSdu}
                        onRemove={handleRemoveSdu}
                        onChange={handleSduChange}
                    />
                )}

                {error && (
                    <Alert severity="error" sx={{mt: 2}}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>
                    Annuler
                </Button>
                <Button variant="contained" onClick={handleSave} disabled={saving}>
                    {saving ? <CircularProgress size={20} color="inherit"/> : "Enregistrer"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function ProduitRow({row, rapportfsId}: { row: RapportViewRow; rapportfsId: string }) {
    const [open, setOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [ligne, setLigne] = useState(row.ligne);
    const [ligneId, setLigneId] = useState(row.ligneId);
    const [detailSdu, setDetailSdu] = useState<DetailSDU[] | null>(null);
    const [loadingSdu, setLoadingSdu] = useState(false);

    const isComplete = isLigneComplete(ligne);

    const handleToggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && ligneId && detailSdu === null) {
            setLoadingSdu(true);
            try {
                setDetailSdu(await getDetailSdu(ligneId));
            } finally {
                setLoadingSdu(false);
            }
        }
    };

    const handleSaved = (newLigne: RapportPhaGDisLigne, newLigneId: string, newDetailSdu: DetailSDU[]) => {
        setLigne(newLigne);
        setLigneId(newLigneId);
        setDetailSdu(newDetailSdu);
    };

    return (
        <>
            <TableRow hover sx={{"& > *": {borderBottom: "unset"}}}>
                <TableCell width={48}>
                    <IconButton size="small" onClick={handleToggle}>
                        {open ? <KeyboardArrowUpIcon/> : <KeyboardArrowDownIcon/>}
                    </IconButton>
                </TableCell>
                <TableCell>{row.produitName}</TableCell>
                <TableCell>{row.unit}</TableCell>
                <TableCell>
                    <Chip
                        label={isComplete ? "Complet" : "Incomplet"}
                        size="small"
                        sx={{bgcolor: completenessStyle(isComplete).bg, color: completenessStyle(isComplete).color}}
                    />
                </TableCell>
                <TableCell>
                    <Chip
                        label={ligne?.situation || "—"}
                        size="small"
                        sx={{
                            bgcolor: situationStyle(ligne?.situation).bg,
                            color: situationStyle(ligne?.situation).color
                        }}
                    />
                </TableCell>
                <TableCell>
                    <IconButton size="small" onClick={() => setEditOpen(true)}>
                        <EditIcon fontSize="small"/>
                    </IconButton>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={6} sx={{py: 0, borderBottom: open ? undefined : "none"}}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{py: 2}}>
                            <FieldGrid ligne={ligne} detailSdu={detailSdu} loadingSdu={loadingSdu}/>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
            <EditLigneDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                produitName={row.produitName}
                unit={row.unit}
                ppnId={row.ppnId}
                rapportfsId={rapportfsId}
                ligne={ligne}
                ligneId={ligneId}
                previousSduFinMois={row.previousSduFinMois}
                onSaved={handleSaved}
            />
        </>
    );
}

export default function RapportProgrammeTable({rows, rapportfsId}: { rows: RapportViewRow[]; rapportfsId: string }) {
    return (
        <TableContainer component={Paper} variant="outlined">
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell width={48}/>
                        <TableCell>Produit</TableCell>
                        <TableCell>Unité</TableCell>
                        <TableCell>Statut saisie</TableCell>
                        <TableCell>Situation</TableCell>
                        <TableCell>Editer</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => (
                        <ProduitRow key={row.ppnId} row={row} rapportfsId={rapportfsId}/>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
