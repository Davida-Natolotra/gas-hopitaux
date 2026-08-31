import {useEffect, useRef} from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import logoDataFi from "../../assets/Logo Dos DataFi_little.png";
import logoDplmt from "../../assets/Logo_DPLMT.png";
import logoMinsanp from "../../assets/Logo_Minsanp.jpg";

// Intrinsic pixel dimensions of the imported files, so each logo keeps its shape
// while the height scales down on narrow screens. Swapping an asset means
// updating the matching ratio — otherwise the logo is stretched.
const MINSANP_RATIO = "1268 / 1280"; // Logo_Minsanp.jpg
const DPLMT_RATIO = "960 / 752"; // Logo_DPLMT.png
const USG_DATAFI_RATIO = "871 / 171"; // Logo Dos DataFi_little.png

// Every height-driving dimension below is its full-size value times this factor.
// Lower it to make the bar shorter; the logos keep their aspect ratio either way.
const SCALE = 0.3;

const FooterComponent = () => {
    const ref = useRef<HTMLElement>(null);

    // The bar is out of flow, so nothing below it reserves room automatically.
    // Publish its measured height and let the page pad itself by that much
    // (see App.tsx) — measured rather than hardcoded, since the height changes
    // with the breakpoint and with SCALE.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const root = document.documentElement;
        // Border-box height: contentRect would omit the bar's own padding.
        const publish = () =>
            root.style.setProperty("--footer-height", `${el.getBoundingClientRect().height}px`);

        // Measure once up front so the first paint already reserves the room,
        // then keep it in sync with breakpoint changes, font loading and rewrap.
        publish();
        const observer = new ResizeObserver(publish);
        observer.observe(el);

        return () => {
            observer.disconnect();
            root.style.removeProperty("--footer-height");
        };
    }, []);

    return (
        <Box
            component="footer"
            id="footer"
            ref={ref}
            sx={{
                // Pinned to the viewport, so it sits in the same place on every
                // route and stays put while the page scrolls.
                position: "relative",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: (theme) => theme.zIndex.appBar,
                // Opaque: content scrolls underneath it.
                bgcolor: "background.paper",
                pt: 3 * SCALE,
                // The safe-area inset is a device measurement, not a design one,
                // so it stays unscaled.
                pb: `calc(${24 * SCALE}px + var(--safe-area-inset-bottom))`,
            }}
        >
            <Divider sx={{mb: 3 * SCALE}}/>
            <Container maxWidth="xl">
                <Stack
                    direction={{xs: "column", sm: "row"}}
                    spacing={{xs: 2 * SCALE, sm: 3 * SCALE}}
                    sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        textAlign: "center",
                    }}
                >
                    <Stack
                        direction="row"
                        spacing={2 * SCALE}
                        sx={{alignItems: "center", flexShrink: 0}}
                    >
                        <Box
                            component="img"
                            src={logoMinsanp}
                            alt="Logo Ministère de la Santé Publique"
                            sx={{
                                height: {xs: 56 * SCALE, sm: 72 * SCALE, md: 107 * SCALE},
                                aspectRatio: MINSANP_RATIO,
                                width: "auto",
                                maxWidth: "100%",
                                flexShrink: 0,
                            }}
                        />
                        <Box
                            component="img"
                            src={logoDplmt}
                            alt="Logo DPLMT"
                            sx={{
                                height: {xs: 56 * SCALE, sm: 72 * SCALE, md: 107 * SCALE},
                                aspectRatio: DPLMT_RATIO,
                                width: "auto",
                                maxWidth: "100%",
                                flexShrink: 0,
                            }}
                        />
                    </Stack>

                    <Box sx={{minWidth: 0}}>
                        <Typography variant="body2" color="text.secondary">
                            Copyright{" "}

                            &copy; 2026. Tous droits réservés.
                        </Typography>
                        {/*<Typography variant="caption" color="text.secondary">*/}
                        {/*    Conçu par Data.Fi*/}
                        {/*</Typography>*/}
                    </Box>

                    <Box
                        component="img"
                        src={logoDataFi}
                        alt="Gouvernement des États-Unis d'Amérique — projet Data.Fi"
                        sx={{
                            height: {xs: 40 * SCALE, sm: 56 * SCALE, md: 107 * SCALE},
                            aspectRatio: USG_DATAFI_RATIO,
                            width: "auto",
                            maxWidth: "100%",
                            flexShrink: 0,
                        }}
                    />
                </Stack>
            </Container>
        </Box>
    );
};

export default FooterComponent;
