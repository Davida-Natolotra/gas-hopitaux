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
import type {DetailSDU, RapportHopitauxLigne} from "../model/rapport-model.ts";
import {isLigneComplete} from "../model/rapport-completeness.ts";
import {COMPLETENESS_STYLES, completenessStyle} from "../styles/completeness-style.ts";
import {situationStyle} from "../styles/situation-style.ts";
import type {RapportViewRow} from "../services/rapport-view-service.ts";
import {
    getDetailSdu,
    propagateQteDispoDebMois,
    saveDetailSdu,
    saveRapportFsLigne
} from "../services/rapport-view-service.ts";
import {refreshRapportFsStatus} from "../services/rapportfs-service.ts";
import {generateUuid} from "../../../services/id-service.ts";
import {formatMoisAnnee} from "../../../utils/date-format.ts";
import {daysInMonth, parseMoisAnnee} from "../../../utils/mois-annee.ts";
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
    // Smallest value the field accepts once something has been typed into it.
    // Enforced in the edit form and again before saving (see fieldError).
    min?: number;
    // Upper bound is the length of the rapport's own month (28-31), so it can
    // only be resolved once that month is known — see fieldMax.
    maxIsDaysInMonth?: boolean;
    // Upper bound is everything the FS actually had to hand over the month
    // (see stockDisponible), for the quantities that come out of that stock.
    maxIsStockDisponible?: boolean;
    // Minimum that takes over when nothing moved at all this month (see
    // MOVEMENT_FIELDS), for the fields whose floor depends on that.
    minWithoutMovement?: number;
}

// Single source of truth for the field layout, shared by the read-only
// display grid and the edit dialog's form. Twelve fields laid out as four
// full rows of three (each Grid size={4}); Observation gets its own
// full-width row below them.
const FIELD_ROWS: FieldDef[][] = [
    [
        {key: "qte_dispo_deb_mois", label: "Quantité disponible au début du mois", kind: "conditional"},
        {key: "qte_rec_mois", label: "Quantité reçue au cours du mois", kind: "conditional"},
        // Nothing can have been handed to a patient that the FS never had:
        // the ceiling is the opening stock plus everything received.
        {
            key: "qte_dist_patient",
            label: "Quantité distribuée aux patients au cours du mois",
            kind: "conditional",
            maxIsStockDisponible: true,
        },
    ],
    [
        {key: "qte_perime_avarie_mois", label: "Quantité périmée, avariée au cours du mois", kind: "conditional"},
        {key: "qte_redepl_mois", label: "Quantité redéployée au cours du mois", kind: "conditional"},
        // A rupture can't run for longer than the month being reported on, nor
        // for a negative number of days. And if nothing moved at all — no
        // opening stock, nothing received, nothing distributed — the produit
        // cannot have been available every day either, so at least one day of
        // rupture has to be reported.
        {
            key: "nb_jour_rupture",
            label: "Nombre de jours de rupture",
            kind: "conditional",
            min: 0,
            minWithoutMovement: 1,
            maxIsDaysInMonth: true,
        },
    ],
    [
        {key: "stock_theorique", label: "Stock théorique", kind: "computed", derived: true},
        {key: "sdu_fin_mois", label: "SDU fin du mois", kind: "computed", derived: true},
        {key: "ecart", label: "Ecart", kind: "computed", derived: true},
    ],
    [
        // A consommation moyenne mensuelle of 0 is not a real figure — it would
        // also drive MSD to 0 and report the produit as en RUPTURE whatever the
        // stock says. Anything entered here has to be at least 1.
        {key: "cmm", label: "CMM", kind: "conditional", min: 1},
        {key: "cmma", label: "CMMA", kind: "computed", derived: true},
        {key: "msd", label: "MSD", kind: "computed", derived: true},
    ],
];

function accentFor(kind: FieldDef["kind"], value: number | null | undefined): string {
    // A blank is a blank whichever kind of field it sits in: a computed field
    // with nothing to show (SDU fin du mois and the Ecart derived from it,
    // before any Détail SDU is entered) is a hole in the data too.
    if (value === null || value === undefined) return ACCENT_BLANK;
    return kind === "computed" ? ACCENT_COMPUTED : ACCENT_FILLED;
}

function displayValue(value: number | null | undefined): string {
    return value === null || value === undefined ? "—" : String(value);
}

// The quantities that record an actual movement of stock over the month.
const MOVEMENT_FIELDS: NumericFieldKey[] = [
    "qte_dispo_deb_mois",
    "qte_rec_mois",
    "qte_dist_patient",
    "qte_perime_avarie_mois",
    "qte_redepl_mois",
];

// True when not one of those quantities is above zero. A blank counts as
// nothing moved, the same way computeValues reads it as 0.
function hasNoMovement(form: FormState): boolean {
    return MOVEMENT_FIELDS.every((key) => {
        const raw = form[key].trim();
        return raw === "" || Number(raw) === 0;
    });
}

// Everything the FS had available to give out over the month: what was on the
// shelf on day one plus everything that came in. A blank counts as 0, the same
// way computeValues reads it.
function stockDisponible(form: FormState): number {
    const num = (raw: string) => {
        const parsed = Number(raw.trim());
        return raw.trim() !== "" && Number.isFinite(parsed) ? parsed : 0;
    };
    return num(form.qte_dispo_deb_mois) + num(form.qte_rec_mois);
}

// The ceiling in force for this field right now, with the message that
// explains it — same shape as fieldMin, and for the same reason: a limit
// computed from the rest of the form has to say where it comes from.
//
// Null means "no ceiling": either the field doesn't have one, or the rapport's
// mois_annee is missing/unparseable and we can't say how long its month was —
// better to accept the figure than to invent a limit.
function fieldMax(field: FieldDef, form: FormState, daysInMois: number | null): {
    value: number;
    message: string
} | null {
    if (field.maxIsDaysInMonth) {
        return daysInMois === null ? null : {value: daysInMois, message: `Valeur maximale : ${daysInMois}`};
    }
    if (field.maxIsStockDisponible) {
        const available = stockDisponible(form);
        return {
            value: available,
            message: `Au plus le stock disponible (début du mois + reçue) : ${available}`,
        };
    }
    return null;
}

// The floor in force for this field right now, with the message that explains
// it — a field whose minimum is raised by the state of the rest of the form
// has to say why, or the number on its own looks arbitrary.
function fieldMin(field: FieldDef, form: FormState): { value: number; message: string } | null {
    if (field.minWithoutMovement !== undefined && hasNoMovement(form)) {
        return {
            value: field.minWithoutMovement,
            message: `Aucun mouvement ce mois : au moins ${field.minWithoutMovement} jour de rupture`,
        };
    }
    if (field.min !== undefined) return {value: field.min, message: `Valeur minimale : ${field.min}`};
    return null;
}

// A field's rule only bites once something has been typed into it: a blank
// stays "pas encore saisi", which is allowed — the ligne simply keeps its
// "Incomplet" badge instead of blocking the save.
function fieldError(field: FieldDef, raw: string, form: FormState, daysInMois: number | null): string | null {
    if (raw.trim() === "") return null;
    const min = fieldMin(field, form);
    const max = fieldMax(field, form, daysInMois);
    if (min === null && max === null) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return "Valeur numérique attendue";
    if (min !== null && parsed < min.value) return min.message;
    if (max !== null && parsed > max.value) return max.message;
    return null;
}

// First rule broken across the whole form, labelled for the save-blocking
// alert. Returns null when everything entered so far is acceptable.
function firstFormError(form: FormState, daysInMois: number | null): string | null {
    for (const field of FIELD_ROWS.flat()) {
        const message = fieldError(field, form[field.key], form, daysInMois);
        if (message) return `${field.label} — ${message}.`;
    }
    return null;
}

function FieldBox({label, value, accent}: { label: string; value: ReactNode; accent: string }) {
    return (
        <Box sx={{
            borderLeft: `4px solid ${accent}`,
            bgcolor: "grey.100",
            px: 2,
            py: 1,
            borderRadius: "0 4px 4px 0",
            // Fill the grid cell so every box on a row is the same height,
            // whatever the tallest one on it happens to contain.
            height: "100%",
        }}>
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
    ligne: RapportHopitauxLigne | null;
    detailSdu: DetailSDU[] | null;
    loadingSdu: boolean;
}) {
    const observation = ligne?.observation ?? "";
    const hasSdu = Boolean(detailSdu && detailSdu.length > 0);

    return (
        <Stack spacing={1.5}>
            {FIELD_ROWS.map((rowFields, i) => (
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
                </Grid>
            ))}
            <Grid container spacing={2}>
                <Grid size={12}>
                    <FieldBox
                        label="Observation"
                        value={observation.trim() === "" ? "Aucune observation." : observation}
                        accent={observation.trim() === "" ? ACCENT_BLANK : ACCENT_FILLED}
                    />
                </Grid>
            </Grid>
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
function ligneToFormState(ligne: RapportHopitauxLigne | null, previousSduFinMois: number | null): FormState {
    const str = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
    return {
        qte_dispo_deb_mois: ligne?.qte_dispo_deb_mois != null ? str(ligne.qte_dispo_deb_mois) : str(previousSduFinMois),
        qte_rec_mois: str(ligne?.qte_rec_mois),
        qte_dist_patient: str(ligne?.qte_dist_patient),
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
    // Both blank until the line has at least one Détail SDU — see computeValues.
    ecart: number | null;
    sdu_fin_mois: number | null;
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
//
// SDU fin du mois is the exception: with no Détail SDU entered there is
// nothing to sum, and reporting a closing stock of 0 would claim the produit
// ran out — so it stays blank, and so does the Ecart measured against it. The
// line then counts as incomplete (MANDATORY_LIGNE_FIELDS) until the user
// enters the Détails SDU it is computed from. MSD can't be blank — its column
// is NOT NULL — but the situation label it drives is left empty rather than
// reporting a RUPTURE nobody has actually declared.
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
        num(form.qte_perime_avarie_mois);
    const enteredSdu = sduRows.filter((row) => row.sdu.trim() !== "");
    const sdu_fin_mois = enteredSdu.length === 0
        ? null
        : enteredSdu.reduce((sum, row) => sum + num(row.sdu), 0);
    const ecart = sdu_fin_mois === null ? null : sdu_fin_mois - stock_theorique;
    const cmm = Math.round(num(form.cmm));
    const msd = sdu_fin_mois !== null && cmm ? Math.round((sdu_fin_mois / cmm) * 100) / 100 : 0;
    const situation = sdu_fin_mois === null ? "" : computeSituation(msd);
    return {stock_theorique, ecart, sdu_fin_mois, cmm, msd, situation};
}

function formStateToLigne(
    ppnId: string,
    form: FormState,
    computed: ComputedValues,
    observation: string,
    existing: RapportHopitauxLigne | null,
): RapportHopitauxLigne {
    const num = (value: string) => (value.trim() === "" ? null : Number(value));
    return {
        produit_programme_niveau_id: ppnId,
        qte_dispo_deb_mois: num(form.qte_dispo_deb_mois),
        qte_rec_mois: num(form.qte_rec_mois),
        qte_dist_patient: num(form.qte_dist_patient),
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
                           daysInMois,
                           onChange,
                           onObservationChange,
                       }: {
    values: FormState;
    computed: ComputedValues;
    observation: string;
    daysInMois: number | null;
    onChange: (key: NumericFieldKey, value: string) => void;
    onObservationChange: (value: string) => void;
}) {
    return (
        <Stack spacing={1.5}>
            {FIELD_ROWS.map((rowFields, i) => (
                <Grid container spacing={2} key={i}>
                    {rowFields.map((field) => {
                        // Derived fields (stock_theorique, sdu_fin_mois, ecart, msd) get
                        // their live value from computeValues; CMMA is also derived
                        // (read-only here) but has no formula, so it just echoes whatever
                        // value the line already has. A computed null is a real blank
                        // (no Détail SDU yet), so it shows as one rather than as "null".
                        const computedValue = (computed as Partial<Record<NumericFieldKey, number | null>>)[field.key];
                        const raw = field.derived && computedValue !== undefined
                            ? (computedValue === null ? "" : String(computedValue))
                            : values[field.key];
                        const parsed = raw.trim() === "" ? null : Number(raw);
                        const errorText = field.derived ? null : fieldError(field, raw, values, daysInMois);
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
                                            // A value that breaks the field's rule is no better
                                            // than a blank one, so it gets the same red accent.
                                            borderLeft: `4px solid ${errorText ? ACCENT_BLANK : accentFor(field.kind, parsed)}`,
                                            bgcolor: "grey.100",
                                            px: 2,
                                            py: 1,
                                            borderRadius: "0 4px 4px 0",
                                            height: "100%",
                                        }}
                                    >
                                        <TextField
                                            variant="standard"
                                            label={field.label}
                                            type="number"
                                            fullWidth
                                            value={raw}
                                            error={Boolean(errorText)}
                                            helperText={errorText ?? undefined}
                                            onChange={(e) => onChange(field.key, e.target.value)}
                                            slotProps={{
                                                inputLabel: {shrink: true},
                                                // Undefined bounds render no attribute at all,
                                                // leaving the field unconstrained.
                                                htmlInput: {
                                                    min: fieldMin(field, values)?.value,
                                                    max: fieldMax(field, values, daysInMois)?.value,
                                                },
                                            }}
                                        />
                                    </Box>
                                )}
                            </Grid>
                        );
                    })}
                </Grid>
            ))}
            <Grid container spacing={2}>
                <Grid size={12}>
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
            </Grid>
        </Stack>
    );
}

interface EditableSduRow {
    key: string;
    sdu: string;
    date_peremption: string;
}

// An <input type="month"> only accepts an exact "YYYY-MM" value — trim anyx
// day component from older "YYYY-MM-DD" records so the picker still shows it.
function toMonthInputValue(value: string | null): string {
    return value ? value.slice(0, 7) : "";
}

// A row reporting no stock on hand has nothing that can expire, so its
// péremption date is left empty and never asked for.
function isZeroSdu(sdu: string): boolean {
    const trimmed = sdu.trim();
    return trimmed !== "" && Number(trimmed) === 0;
}

function detailSduToRows(entries: DetailSDU[]): EditableSduRow[] {
    return entries.map((d) => ({key: d.id, sdu: String(d.sdu), date_peremption: toMonthInputValue(d.date_peremption)}));
}

// minDate keeps the picker on the current month and later ones: a produit can
// only expire from this month onwards, never in a month already past.
function SduMonthField({value, error, helperText, disabled, onChange}: {
    value: string;
    error: boolean;
    helperText?: string;
    disabled?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <DatePicker
            label="Date de péremption"
            views={["year", "month"]}
            format="MM/YYYY"
            value={value ? dayjs(value, "YYYY-MM") : null}
            disabled={disabled}
            minDate={dayjs().startOf("month")}
            onChange={(newValue: Dayjs | null) => onChange(newValue?.isValid() ? newValue.format("YYYY-MM") : "")}
            slotProps={{
                textField: {
                    variant: "standard",
                    fullWidth: true,
                    required: !disabled,
                    error,
                    // Always reserve the helper line so the field keeps one
                    // height whether or not it has something to say, and the
                    // row it sits in doesn't shift as the message appears.
                    helperText: helperText ?? " ",
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
                <Button variant="outlined" color="warning" size="small" onClick={onAdd}>
                    <strong>+ Ajouter SDU</strong>
                </Button>
            </Stack>
            {/* SDU fin du mois has no other source, so say so here rather than
                leaving the user to wonder why the line stays incomplete. */}
            {!rows.some((row) => row.sdu.trim() !== "") && (
                <Alert severity="info" sx={{mb: 1.5}}>
                    Saisissez au moins un SDU : « SDU fin du mois » en est calculé, et la ligne reste incomplète tant
                    qu'il est vide.
                </Alert>
            )}
            <Stack spacing={1.5}>
                {rows.map((row) => {
                    const zeroSdu = isZeroSdu(row.sdu);
                    const dateMissing = row.sdu.trim() !== "" && !zeroSdu && row.date_peremption.trim() === "";
                    // Aligned from the top: both fields reserve a helper line,
                    // so their labels, inputs and helper text sit on the same
                    // three levels, and the delete button is nudged down onto
                    // the inputs' own line.
                    return (
                        <Stack key={row.key} direction="row" spacing={2} sx={{alignItems: "flex-start"}}>
                            <TextField
                                variant="standard"
                                label="SDU"
                                type="number"
                                fullWidth
                                value={row.sdu}
                                onChange={(e) => onChange(row.key, "sdu", e.target.value)}
                                helperText=" "
                                slotProps={{inputLabel: {shrink: true}}}
                            />
                            <SduMonthField
                                value={row.date_peremption}
                                error={dateMissing}
                                disabled={zeroSdu}
                                helperText={dateMissing ? "Date requise" : zeroSdu ? "Sans objet pour un SDU à 0" : undefined}
                                onChange={(value) => onChange(row.key, "date_peremption", value)}
                            />
                            {/* Offset onto the inputs' own line: 16px is the
                                standard TextField's gap between its shrunk
                                label and its input, +1px to centre the 30px
                                button on the 32px input. It has to be padding
                                on a wrapper — Stack resets the margins of its
                                direct children, so `mt` here would be dropped. */}
                            <Box sx={{pt: "17px"}}>
                                <IconButton
                                    size="small"
                                    onClick={() => onRemove(row.key)}
                                    aria-label="Supprimer ce SDU"
                                >
                                    <RemoveIcon fontSize="small"/>
                                </IconButton>
                            </Box>
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
    ligne: RapportHopitauxLigne | null;
    ligneId: string | null;
    previousSduFinMois: number | null;
    // Length of the month this rapport covers, ceiling for nb_jour_rupture.
    daysInMois: number | null;
    onSaved: (ligne: RapportHopitauxLigne, ligneId: string, detailSdu: DetailSDU[]) => void;
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
                             daysInMois,
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
    // Dropping the SDU to 0 also drops any date already picked, so a disabled
    // field never shows a value that wouldn't be saved.
    const handleSduChange = (key: string, field: "sdu" | "date_peremption", value: string) =>
        setSduRows((prev) =>
            prev.map((r) => {
                if (r.key !== key) return r;
                const next = {...r, [field]: value};
                return field === "sdu" && isZeroSdu(value) ? {...next, date_peremption: ""} : next;
            }),
        );

    const computed = computeValues(form, sduRows);

    const handleSave = async () => {
        const formError = firstFormError(form, daysInMois);
        if (formError) {
            setError(formError);
            return;
        }

        const missingDate = sduRows.some(
            (row) => row.sdu.trim() !== "" && !isZeroSdu(row.sdu) && row.date_peremption.trim() === "",
        );
        if (missingDate) {
            setError("Veuillez renseigner la date de péremption pour chaque SDU non nul.");
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
            // This month's SDU fin du mois is the next month's opening stock:
            // carry the new figure forward so already-filled later months stop
            // showing the superseded one.
            const touched = await propagateQteDispoDebMois(rapportfsId, ppnId, computed.sdu_fin_mois);
            onSaved(newLigne, newLigneId, savedSdu);
            notifySuccess(
                touched.length > 0
                    ? `Ligne enregistrée. Quantité disponible au début du mois reportée sur ${touched.length} rapport(s) ultérieur(s).`
                    : "Ligne enregistrée.",
            );
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
                        <Chip label={computed.situation || "—"} size="small"
                              sx={{bgcolor: style.bg, color: style.color}}/>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent>
                <Box sx={{pt: 1}}>
                    <EditFieldGrid
                        values={form}
                        computed={computed}
                        observation={observation}
                        daysInMois={daysInMois}
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
            <DialogActions sx={{px: 3, pb: 2}}>
                <Stack direction="row" spacing={1.5}>
                    <Button onClick={onClose} disabled={saving}>
                        Annuler
                    </Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>
                        {saving ? <CircularProgress size={20} color="inherit"/> : "Enregistrer"}
                    </Button></Stack>
            </DialogActions>
        </Dialog>
    );
}

function ProduitRow({row, rapportfsId, daysInMois}: {
    row: RapportViewRow;
    rapportfsId: string;
    daysInMois: number | null;
}) {
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

    const handleSaved = (newLigne: RapportHopitauxLigne, newLigneId: string, newDetailSdu: DetailSDU[]) => {
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
                <TableCell>
                    <Stack direction="row" spacing={1} sx={{alignItems: "center"}}>
                        <span>{row.produitName}</span>
                        {/* This produit has been withdrawn from the configuration
                            since. It is shown because this report was collected
                            against it — marked so it is not mistaken for
                            something still expected. */}
                        {row.archived && (
                            <Chip
                                label="Retiré"
                                size="small"
                                variant="outlined"
                                color="warning"
                                title="Retiré de la configuration ; conservé ici tel qu'il a été saisi."
                            />
                        )}
                    </Stack>
                </TableCell>
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
                daysInMois={daysInMois}
                onSaved={handleSaved}
            />
        </>
    );
}

export default function RapportProgrammeTable({rows, rapportfsId, moisAnnee}: {
    rows: RapportViewRow[];
    rapportfsId: string;
    // The rapport's own "YYYY-MM"; how long that month ran is the ceiling for
    // the number of days a produit can have been en rupture.
    moisAnnee: string | null;
}) {
    const ym = parseMoisAnnee(moisAnnee);
    const daysInMois = ym ? daysInMonth(ym) : null;

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
                        <ProduitRow key={row.ppnId} row={row} rapportfsId={rapportfsId} daysInMois={daysInMois}/>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
