import {useEffect, useState} from "react";
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
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import type {ProgrammeProduits} from "../../organisation-units/organisation-units-service.ts";
import {listMyProduitsByProgramme} from "../../organisation-units/organisation-units-service.ts";

// Shows what the saved FS is actually configured for right now (one tab per
// programme, produit + unit per row). Renders nothing at all when
// my_produitprogrammeniveau is empty — there's nothing meaningful to show
// until a config import has been done and matches the saved FS's group.
export default function ProduitsProgrammeTable() {
    const [sections, setSections] = useState<ProgrammeProduits[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState(0);

    useEffect(() => {
        setLoading(true);
        setError(null);
        listMyProduitsByProgramme()
            .then((result) => {
                setSections(result);
                setTab(0);
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

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

    return (
        <Box sx={{p: 1}}>
            <h3>Liste des produits à rapporter</h3>
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
                    Total produits : {current.produits.length}
                </Typography>
            </Stack>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Produit</TableCell>
                            <TableCell>Unité</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {current.produits.map((produit) => (
                            <TableRow key={produit.ppnId}>
                                <TableCell>{produit.produitName}</TableCell>
                                <TableCell>{produit.unit}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
