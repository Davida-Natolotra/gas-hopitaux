import "./App.scss";
import {Outlet} from "react-router-dom";
import ResponsiveAppBar from "./features/appbar/appbar-component.tsx";

function App() {

    return (
        <> <ResponsiveAppBar/>
            <main className="container">
                <Outlet/>
            </main>
        </>

    );
}

export default App;
