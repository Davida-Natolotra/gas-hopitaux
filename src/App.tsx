import {useEffect} from "react";
import Box from "@mui/material/Box";
import "./App.scss";
import {Outlet} from "react-router-dom";
import ResponsiveAppBar from "./features/appbar/appbar-component.tsx";
import {getDeviceId} from "./services/device-service.ts";
import {NotificationProvider} from "./notifications/notification-provider.tsx";
import FooterComponent from "./features/footer/footer-component.tsx";

function App() {
    useEffect(() => {
        getDeviceId().catch((err) => console.error("Failed to initialize device id:", err));
    }, []);

    return (
        <NotificationProvider>
            <Box sx={{display: "flex", flexDirection: "column", minHeight: "100dvh"}}>
                <ResponsiveAppBar/>
                {/* The footer sits in normal flow after this element, so it needs
                    no reserved space of its own. */}
                <main className="container" style={{flex: 1}}>
                    <Outlet/>
                </main>
                <FooterComponent/>
            </Box>
        </NotificationProvider>
    );
}

export default App;
