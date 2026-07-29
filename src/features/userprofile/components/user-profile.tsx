import {useEffect, useState} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import {getUserProfile, saveUserProfile} from "../services/user-profile-service.ts";
import {formatPhoneDisplay, isValidPhone, stripPhoneFormatting} from "../../../utils/phone-format.ts";

interface FormErrors {
    username?: string;
    poste?: string;
    phone?: string;
}

export default function UserProfile() {
    const [profileId, setProfileId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [username, setUsername] = useState("");
    const [poste, setPoste] = useState("");
    const [phoneDisplay, setPhoneDisplay] = useState("");
    const [touched, setTouched] = useState<Partial<Record<keyof FormErrors, boolean>>>({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setLoading(true);
        setLoadError(null);
        getUserProfile()
            .then((existing) => {
                if (existing) {
                    setProfileId(existing.id);
                    setUsername(existing.username);
                    setPoste(existing.poste);
                    setPhoneDisplay(formatPhoneDisplay(existing.phone));
                }
            })
            .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

    const phoneDigits = stripPhoneFormatting(phoneDisplay);

    const errors: FormErrors = {
        username: username.trim() === "" ? "Nom d'utilisateur requis." : undefined,
        poste: poste.trim() === "" ? "Poste requis." : undefined,
        phone:
            phoneDigits === ""
                ? "Téléphone requis."
                : !isValidPhone(phoneDigits)
                    ? "Numéro invalide (10 chiffres, doit commencer par 0)."
                    : undefined,
    };
    const hasErrors = Object.values(errors).some(Boolean);

    const markTouched = (field: keyof FormErrors) => setTouched((prev) => ({...prev, [field]: true}));

    const handleSave = async () => {
        setTouched({username: true, poste: true, phone: true});
        if (hasErrors) return;

        setSaving(true);
        setSaveError(null);
        setSaved(false);
        try {
            const result = await saveUserProfile({
                id: profileId,
                username: username.trim(),
                poste: poste.trim(),
                phone: phoneDigits,
            });
            setProfileId(result.id);
            setSaved(true);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{display: "flex", justifyContent: "center", p: 4}}>
                <CircularProgress/>
            </Box>
        );
    }

    if (loadError) {
        return <Alert severity="error">{loadError}</Alert>;
    }

    return (
        <Box sx={{maxWidth: 480}}>
            <Stack spacing={2}>
                <TextField
                    label="Nom d'utilisateur"
                    required
                    fullWidth
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onBlur={() => markTouched("username")}
                    error={Boolean(touched.username && errors.username)}
                    helperText={touched.username ? errors.username : undefined}
                />
                <TextField
                    label="Fonction"
                    required
                    fullWidth
                    value={poste}
                    onChange={(e) => setPoste(e.target.value)}
                    onBlur={() => markTouched("poste")}
                    error={Boolean(touched.poste && errors.poste)}
                    helperText={touched.poste ? errors.poste : undefined}
                />
                <TextField
                    label="Téléphone"
                    required
                    fullWidth
                    placeholder="03x xx xxx xx"
                    value={phoneDisplay}
                    onChange={(e) => setPhoneDisplay(formatPhoneDisplay(e.target.value))}
                    onBlur={() => markTouched("phone")}
                    error={Boolean(touched.phone && errors.phone)}
                    helperText={touched.phone ? errors.phone : undefined}
                    slotProps={{htmlInput: {inputMode: "numeric"}}}
                />
                {saveError && <Alert severity="error">{saveError}</Alert>}
                {saved && !saveError && <Alert severity="success">Profil enregistré.</Alert>}

                <Box>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>
                        {saving ? <CircularProgress size={20} color="inherit"/> : "Enregistrer"}
                    </Button>
                </Box>
            </Stack>
        </Box>
    );
}
