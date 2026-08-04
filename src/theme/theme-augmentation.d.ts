import "@mui/material/styles";
// Registers MuiDataGrid in `components` for the Win7/WebView2 109 colour
// overrides in theme-colors-context.tsx.
import "@mui/x-data-grid/themeAugmentation";
import "@mui/material/Button";
import "@mui/material/IconButton";
import "@mui/material/Chip";
import "@mui/material/SvgIcon";
import "@mui/material/Checkbox";
import "@mui/material/Radio";
import "@mui/material/Switch";

declare module "@mui/material/styles" {
    interface Palette {
        accent: Palette["primary"];
    }

    interface PaletteOptions {
        accent?: PaletteOptions["primary"];
    }
}

declare module "@mui/material/Button" {
    interface ButtonPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/IconButton" {
    interface IconButtonPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/Chip" {
    interface ChipPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/SvgIcon" {
    interface SvgIconPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/Checkbox" {
    interface CheckboxPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/Radio" {
    interface RadioPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/Switch" {
    interface SwitchPropsColorOverrides {
        accent: true;
    }
}
