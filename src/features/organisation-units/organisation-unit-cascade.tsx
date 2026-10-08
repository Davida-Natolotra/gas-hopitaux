import {useEffect, useMemo, useState} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import type {OrganisationUnit} from "./organisation-unit-model.ts";
import {
    getMyOrganisationUnit,
    listHopitauxUnitIds,
    listOrganisationUnits,
    saveMyOrganisationUnit,
} from "./organisation-units-service.ts";

const unitLabel = (unit: OrganisationUnit | null) => unit?.name ?? "";
const sameUnit = (a: OrganisationUnit, b: OrganisationUnit) => a.id === b.id;

export default function OrganisationUnitCascade() {
    const [allUnits, setAllUnits] = useState<OrganisationUnit[]>([]);
    const [hopitalIds, setHopitalIds] = useState<Set<string>>(() => new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const [drsp, setDrsp] = useState<OrganisationUnit | null>(null);
    const [sdsp, setSdsp] = useState<OrganisationUnit | null>(null);
    const [fs, setFs] = useState<OrganisationUnit | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [units, hopitaux, saved] = await Promise.all([
                    listOrganisationUnits(),
                    listHopitauxUnitIds(),
                    getMyOrganisationUnit(),
                ]);
                setAllUnits(units);
                setHopitalIds(new Set(hopitaux));
                if (saved) {
                    setDrsp(saved.drsp);
                    setSdsp(saved.sdsp);
                    setFs(saved.fs);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const drspOptions = useMemo(() => allUnits.filter((u) => u.level === 2), [allUnits]);
    const sdspOptions = useMemo(
        () => (drsp ? allUnits.filter((u) => u.level === 3 && u.parent_id === drsp.id) : []),
        [allUnits, drsp],
    );
    // Communes aren't user-selectable — they only exist here to group the FS
    // options below, across every commune of the selected district.
    const communeOptions = useMemo(
        () => (sdsp ? allUnits.filter((u) => u.level === 4 && u.parent_id === sdsp.id) : []),
        [allUnits, sdsp],
    );
    // FS options are grouped by commune, across every commune of the selected
    // district — mirroring utgl-csb, so an FS can be picked regardless of
    // which commune it belongs to. Hospitals are the members of the HOPITAUX
    // category.
    const {fsOptions, fsCommuneNames} = useMemo(() => {
        const names = new Map<string, string>();
        const list: OrganisationUnit[] = [];
        for (const c of communeOptions) {
            for (const u of allUnits) {
                if (u.level === 5 && u.parent_id === c.id && hopitalIds.has(u.id)) {
                    names.set(u.id, c.name);
                    list.push(u);
                }
            }
        }
        list.sort((a, b) => names.get(a.id)!.localeCompare(names.get(b.id)!) || a.name.localeCompare(b.name));
        return {fsOptions: list, fsCommuneNames: names};
    }, [allUnits, communeOptions, hopitalIds]);

    const handleDrspChange = (unit: OrganisationUnit | null) => {
        setDrsp(unit);
        setSdsp(null);
        setFs(null);
        setSaved(false);
    };

    const handleSdspChange = (unit: OrganisationUnit | null) => {
        setSdsp(unit);
        setFs(null);
        setSaved(false);
    };

    const handleFsChange = (unit: OrganisationUnit | null) => {
        setFs(unit);
        setSaved(false);
    };

    const handleReset = () => {
        setDrsp(null);
        setSdsp(null);
        setFs(null);
        setSaved(false);
        setError(null);
    };

    const canSave = Boolean(drsp && sdsp && fs);

    const handleSave = async () => {
        if (!drsp || !sdsp || !fs) return;
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            await saveMyOrganisationUnit({
                drspId: drsp.id,
                sdspId: sdsp.id,
                // The FS's parent is always its commune — derived rather than
                // user-selected, since there's no separate commune step.
                communeId: fs.parent_id,
                fsId: fs.id,
            });
            setSaved(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{display: "flex", flexDirection: "column", gap: 3, p: 3, maxWidth: 480}}>
            <Typography variant="h6">Zone géographique</Typography>

            <Stack spacing={2}>
                <Autocomplete
                    options={drspOptions}
                    value={drsp}
                    loading={loading}
                    getOptionLabel={unitLabel}
                    isOptionEqualToValue={sameUnit}
                    onChange={(_, value) => handleDrspChange(value)}
                    renderInput={(params) => (
                        <TextField {...params} label="DRSP *" placeholder="Sélectionner votre région"/>
                    )}
                />

                <Autocomplete
                    options={sdspOptions}
                    value={sdsp}
                    disabled={!drsp}
                    loading={loading}
                    getOptionLabel={unitLabel}
                    isOptionEqualToValue={sameUnit}
                    onChange={(_, value) => handleSdspChange(value)}
                    renderInput={(params) => (
                        <TextField {...params} label="SDSP *" placeholder="Sélectionner votre district"/>
                    )}
                    noOptionsText={drsp ? "Aucun district trouvé pour cette région." : "Veuillez choisir une région en premier."}
                />

                <Autocomplete
                    options={fsOptions}
                    value={fs}
                    disabled={!sdsp}
                    loading={loading}
                    groupBy={(unit) => fsCommuneNames.get(unit.id) ?? ""}
                    getOptionLabel={unitLabel}
                    isOptionEqualToValue={sameUnit}
                    onChange={(_, value) => handleFsChange(value)}
                    renderInput={(params) => (
                        <TextField {...params} label="Hôpital *"
                                   placeholder="Sélectionner votre hôpital"/>
                    )}
                    noOptionsText={sdsp ? "Aucun hôpital trouvée pour ce district." : "Veuillez choisir un district en premier."}
                />
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}
            {saved && <Alert severity="success">Hopital enregistrée.</Alert>}

            <Stack direction="row" spacing={2}>
                <Button variant="contained" disabled={!canSave || saving} onClick={handleSave}>
                    {saving ? <CircularProgress size={20} color="inherit"/> : "Enregistrer"}
                </Button>
                <Button onClick={handleReset} disabled={saving}>
                    Réinitialiser
                </Button>
            </Stack>
        </Box>
    );
}
