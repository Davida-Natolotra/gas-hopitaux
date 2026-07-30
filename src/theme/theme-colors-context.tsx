import type {ReactNode} from "react";
import {createContext, useContext, useMemo, useState} from "react";
import {createTheme, CssBaseline, ThemeProvider} from "@mui/material";
import {frFR} from "@mui/material/locale";
import {frFR as dataGridFrFR} from "@mui/x-data-grid/locales";
import {frFR as datePickersFrFR} from "@mui/x-date-pickers/locales";
import {LocalizationProvider} from "@mui/x-date-pickers/LocalizationProvider";
import {AdapterDayjs} from "@mui/x-date-pickers/AdapterDayjs";
import "dayjs/locale/fr";

export interface ThemeColors {
    primary: string;
    secondary: string;
    accent: string;
}

export const defaultThemeColors: ThemeColors = {
    primary: "#5f831f",
    secondary: "#2c7298",
    accent: "#ff9800",
};

interface ThemeColorsContextValue {
    colors: ThemeColors;
    setThemeColor: (key: keyof ThemeColors, value: string) => void;
    setThemeColors: (colors: Partial<ThemeColors>) => void;
    resetThemeColors: () => void;
}

const ThemeColorsContext = createContext<ThemeColorsContextValue | undefined>(undefined);

export function AppThemeProvider({children}: { children: ReactNode }) {
    const [colors, setColors] = useState<ThemeColors>(defaultThemeColors);

    const setThemeColor = (key: keyof ThemeColors, value: string) =>
        setColors((prev) => ({...prev, [key]: value}));

    const setThemeColors = (partial: Partial<ThemeColors>) =>
        setColors((prev) => ({...prev, ...partial}));

    const resetThemeColors = () => setColors(defaultThemeColors);

    const theme = useMemo(
        () =>
            createTheme(
                {
                    palette: {
                        primary: {main: colors.primary},
                        secondary: {main: colors.secondary},
                        accent: {main: colors.accent},
                    },
                },
                frFR,
                dataGridFrFR,
                datePickersFrFR,
            ),
        [colors],
    );

    return (
        <ThemeColorsContext.Provider value={{colors, setThemeColor, setThemeColors, resetThemeColors}}>
            <ThemeProvider theme={theme}>
                <CssBaseline/>
                <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
                    {children}
                </LocalizationProvider>
            </ThemeProvider>
        </ThemeColorsContext.Provider>
    );
}

export function useThemeColors() {
    const context = useContext(ThemeColorsContext);
    if (!context) {
        throw new Error("useThemeColors must be used within an AppThemeProvider");
    }
    return context;
}
