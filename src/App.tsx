import {useEffect} from "react";
import "./App.scss";
import {Outlet} from "react-router-dom";
import ResponsiveAppBar from "./features/appbar/appbar-component.tsx";
import {getDeviceId} from "./services/device-service.ts";
import {NotificationProvider} from "./notifications/notification-provider.tsx";

function App() {
    useEffect(() => {
        getDeviceId().catch((err) => console.error("Failed to initialize device id:", err));
    }, []);

    return (
        <NotificationProvider>
            <ResponsiveAppBar/>
            <main className="container">
                <Outlet/>
            </main>
        </NotificationProvider>
    );
}

export default App;
