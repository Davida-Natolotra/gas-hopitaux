import {useEffect, useMemo, useState} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Paper from "@mui/material/Paper";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import SaveIcon from "@mui/icons-material/Save";
import type {ProgrammeProduits} from "../../organisation-units/organisation-units-service.ts";
import {listMyProduitsByProgramme, saveProduitSelection} from "../../organisation-units/organisation-units-service.ts";
import {useNotification} from "../../../notifications/notification-provider.tsx";

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((id) => b.has(id));

// Shows what the saved FS is actually configured for right now (one tab per
// programme, produit + unit + niveau per row), and lets the hospital choose which
// of them it reports: every checked row appears on each of its reports, an
// unchecked one does not (see ppn_exclusion). Nothing is saved until "Enregistrer".
// Renders nothing at all when my_produitprogrammeniveau is empty — there's nothing
// meaningful to show until a config import has been done and has produits for the
// saved FS.
export default function ProduitsProgrammeTable() {
    const {notifySuccess, notifyError} = useNotification();
    const [sections, setSections] = useState<ProgrammeProduits[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState(0);
    // The rows unchecked as saved, and as currently edited.
    const [savedUnselected, setSavedUnselected] = useState<Set<string>>(new Set());
    const [unselected, setUnselected] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLoading(true);
        setError(null);
        listMyProduitsByProgramme()
            .then((result) => {
                setSections(result);
                const initial = new Set(
                    result.flatMap((section) => section.produits.filter((p) => !p.selected).map((p) => p.ppnId)),
                );
                setSavedUnselected(initial);
                setUnselected(new Set(initial));
                setTab(0);
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

    const dirty = useMemo(() => !sameSet(unselected, savedUnselected), [unselected, savedUnselected]);

    if (loading) {
        return (
            <Box sx={{display: "flex", justifyContent: "center", p: 2}}>
                <CircularProgress size={24}/>
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error">{error}</Alert>;
    }

    if (sections.length === 0) return null;

    const current = sections[tab] ?? sections[0];
    const checkedHere = current.produits.filter((produit) => !unselected.has(produit.ppnId)).length;

    const toggle = (ppnIds: string[], checked: boolean) => {
        setUnselected((previous) => {
            const next = new Set(previous);
            for (const ppnId of ppnIds) {
                if (checked) next.delete(ppnId);
                else next.add(ppnId);
            }
            return next;
        });
    };

    const save = async () => {
        setSaving(true);
        try {
            const changed = await saveProduitSelection([...unselected]);
            setSavedUnselected(new Set(unselected));
            notifySuccess(
                "Produits à rapporter enregistrés." +
                (changed > 0 ? ` Le statut de ${changed} rapport(s) a été mis à jour.` : ""),
            );
        } catch (err) {
            notifyError(`Échec de l'enregistrement : ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{p: 1}}>
            <h3>Liste des produits à rapporter</h3>
            <Typography variant="body2" color="text.secondary" sx={{mb: 1}}>
                Cochez les produits que l'hôpital rapporte : seuls les produits cochés apparaissent sur ses
                rapports. Les quantités déjà saisies pour un produit décoché sont conservées.
            </Typography>
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{mb: 2}}>
                {sections.map((section) => (
                    <Tab key={section.programmeId} label={section.programmeName}/>
                ))}
            </Tabs>
            <Stack direction="row" spacing={3} sx={{mb: 1.5}}>
                <Typography variant="body2" color="text.secondary">
                    Niveau : {current.niveaux.length > 0 ? current.niveaux.join(", ") : "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Total produits : {current.produits.length} ({checkedHere} à rapporter)
                </Typography>
            </Stack>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={checkedHere === current.produits.length}
                                    indeterminate={checkedHere > 0 && checkedHere < current.produits.length}
                                    onChange={(event) => toggle(
                                        current.produits.map((produit) => produit.ppnId),
                                        event.target.checked,
                                    )}
                                    disabled={saving}
                                    slotProps={{input: {"aria-label": `Tout cocher pour ${current.programmeName}`}}}
                                />
                            </TableCell>
                            <TableCell>Produit</TableCell>
                            <TableCell>Unité</TableCell>
                            <TableCell>Niveau</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {current.produits.map((produit) => {
                            const checked = !unselected.has(produit.ppnId);
                            return (
                                <TableRow
                                    key={produit.ppnId}
                                    hover
                                    onClick={() => !saving && toggle([produit.ppnId], !checked)}
                                    sx={{cursor: saving ? "default" : "pointer", "& td": checked ? {} : {color: "text.disabled"}}}
                                >
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            checked={checked}
                                            // The row toggles on click too; this one must not reach it.
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) => toggle([produit.ppnId], event.target.checked)}
                                            disabled={saving}
                                            slotProps={{input: {"aria-label": produit.produitName}}}
                                        />
                                    </TableCell>
                                    <TableCell>{produit.produitName}</TableCell>
                                    <TableCell>{produit.unit}</TableCell>
                                    <TableCell>{produit.niveau || "—"}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <Stack direction="row" spacing={1.5} sx={{mt: 2, alignItems: "center"}}>
                <Button
                    variant="contained"
                    startIcon={saving ? <CircularProgress size={16} color="inherit"/> : <SaveIcon/>}
                    onClick={save}
                    disabled={!dirty || saving}
                >
                    Enregistrer
                </Button>
                <Button onClick={() => setUnselected(new Set(savedUnselected))} disabled={!dirty || saving}>
                    Annuler les modifications
                </Button>
                {dirty && (
                    <Typography variant="body2" color="warning.main">
                        Modifications non enregistrées
                    </Typography>
                )}
            </Stack>
        </Box>
    );
}
