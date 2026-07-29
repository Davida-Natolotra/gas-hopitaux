import {createContext, useCallback, useContext, useMemo, useState} from "react";
import type {ReactNode} from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

type Severity = "success" | "error";

interface NotificationState {
    key: number;
    open: boolean;
    message: string;
    severity: Severity;
}

interface NotificationContextValue {
    notifySuccess: (message: string) => void;
    notifyError: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// App-wide success/failure toast for submit-style actions (create, save,
// delete, import, export, backup/restore, ...). Mounted once at the app
// root so it survives dialogs closing/navigating away right after a submit.
export function NotificationProvider({children}: { children: ReactNode }) {
    const [state, setState] = useState<NotificationState>({key: 0, open: false, message: "", severity: "success"});

    const notify = useCallback((message: string, severity: Severity) => {
        setState((prev) => ({key: prev.key + 1, open: true, message, severity}));
    }, []);

    const value = useMemo<NotificationContextValue>(
        () => ({
            notifySuccess: (message: string) => notify(message, "success"),
            notifyError: (message: string) => notify(message, "error"),
        }),
        [notify],
    );

    const handleClose = (_event: unknown, reason?: string) => {
        if (reason === "clickaway") return;
        setState((prev) => ({...prev, open: false}));
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
            <Snackbar
                key={state.key}
                open={state.open}
                autoHideDuration={6000}
                onClose={handleClose}
                anchorOrigin={{vertical: "bottom", horizontal: "center"}}
            >
                <Alert
                    onClose={handleClose}
                    severity={state.severity}
                    variant="filled"
                    action={
                        <IconButton size="small" color="inherit" onClick={handleClose} aria-label="Fermer">
                            <CloseIcon fontSize="small"/>
                        </IconButton>
                    }
                    sx={{width: "100%"}}
                >
                    {state.message}
                </Alert>
            </Snackbar>
        </NotificationContext.Provider>
    );
}

export function useNotification(): NotificationContextValue {
    const ctx = useContext(NotificationContext);
    if (!ctx) throw new Error("useNotification must be used within a NotificationProvider");
    return ctx;
}
