import {useEffect, useState} from "react";
import {Navigate} from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import type {StartupRoute} from "../../services/startup-route-service.ts";
import {determineStartupRoute} from "../../services/startup-route-service.ts";

// Renders at "/": decides on mount where the app should actually land
// (Paramètres, Alertes, or Rapports — see startup-route-service.ts) and
// redirects there. Falls back to Paramètres if the check itself fails,
// since that's the one page that can't be blocked by missing setup data.
export default function HomeRedirectPage() {
    const [target, setTarget] = useState<StartupRoute | null>(null);

    useEffect(() => {
        let cancelled = false;
        determineStartupRoute()
            .then((route) => {
                if (!cancelled) setTarget(route);
            })
            .catch((err) => {
                console.error("Startup route check failed, defaulting to Paramètres:", err);
                if (!cancelled) setTarget("/parametres");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!target) {
        return (
            <Box sx={{display: "flex", justifyContent: "center", p: 4}}>
                <CircularProgress/>
            </Box>
        );
    }

    return <Navigate to={target} replace/>;
}
