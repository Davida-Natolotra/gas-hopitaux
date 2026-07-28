import {createHashRouter, Navigate} from "react-router-dom";
import App from "./App.tsx";
import RapportfsListPage from "./pages/rapportfs-list/rapportfs-list-page.tsx";
import RapportEditPage from "./pages/rapport-edit/rapport-edit-page.tsx";
import RapportViewPage from "./pages/rapport-view/rapport-view-page.tsx";
import AlertesPage from "./pages/alertes/alertes-page.tsx";
import ParametresPage from "./pages/parametres/parameters.tsx";
import HelpPage from "./pages/help/help-page.tsx";

export const router = createHashRouter([
    {
        path: "/",
        element: <App/>,
        children: [
            {index: true, element: <RapportfsListPage/>},
            {path: "rapport-edit/:id", element: <RapportEditPage/>},
            {path: "rapport-view/:id", element: <RapportViewPage/>},
            {path: "alertes", element: <AlertesPage/>},
            {path: "parametres", element: <ParametresPage/>},
            {path: "help", element: <HelpPage/>},
            {path: "*", element: <Navigate to="/" replace/>},
        ],
    },
]);
