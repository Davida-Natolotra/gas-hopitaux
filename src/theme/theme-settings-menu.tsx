import {useState} from "react";
import type {MouseEvent} from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import PaletteIcon from "@mui/icons-material/Palette";
import {useThemeColors} from "./theme-colors-context";
import type {ThemeColors} from "./theme-colors-context";

const colorFields: { key: keyof ThemeColors; label: string }[] = [
    {key: "primary", label: "Primary"},
    {key: "secondary", label: "Secondary"},
    {key: "accent", label: "Accent"},
];

function ThemeSettingsMenu() {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const {colors, setThemeColor, resetThemeColors} = useThemeColors();

    const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);

    return (
        <>
            <Tooltip title="Theme colors">
                <IconButton
                    color="inherit"
                    onClick={handleOpen}
                    aria-label="theme color settings"
                >
                    <PaletteIcon/>
                </IconButton>
            </Tooltip>
            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{vertical: "bottom", horizontal: "right"}}
                transformOrigin={{vertical: "top", horizontal: "right"}}
            >
                <Stack spacing={2} sx={{p: 2, minWidth: 220}}>
                    <Typography variant="subtitle1">Theme colors</Typography>
                    {colorFields.map(({key, label}) => (
                        <Box
                            key={key}
                            sx={{display: "flex", alignItems: "center", justifyContent: "space-between"}}
                        >
                            <Typography variant="body2">{label}</Typography>
                            <input
                                type="color"
                                value={colors[key]}
                                onChange={(e) => setThemeColor(key, e.target.value)}
                                aria-label={`${label} color`}
                                style={{width: 36, height: 28, border: "none", background: "none", cursor: "pointer"}}
                            />
                        </Box>
                    ))}
                    <Button size="small" onClick={resetThemeColors}>
                        Reset to defaults
                    </Button>
                </Stack>
            </Popover>
        </>
    );
}

export default ThemeSettingsMenu;
