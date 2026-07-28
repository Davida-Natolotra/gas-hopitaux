import type {ReactNode, SyntheticEvent} from "react";
import {useState} from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import ConfigImportTab from "../../features/configuration/config-import-tab.tsx";
import BackupTab from "../../features/configuration/backup-tab.tsx";
import OrganisationUnitCascade from "../../features/organisation-units/organisation-unit-cascade.tsx";

function TabPanel({children, value, index}: { children: ReactNode; value: number; index: number }) {
    if (value !== index) return null;
    return (
        <Box role="tabpanel" id={`parametres-tabpanel-${index}`} aria-labelledby={`parametres-tab-${index}`}>
            {children}
        </Box>
    );
}

function tabProps(index: number) {
    return {
        id: `parametres-tab-${index}`,
        "aria-controls": `parametres-tabpanel-${index}`,
    };
}

export default function ParametresPage() {
    const [tab, setTab] = useState(0);

    const handleChange = (_event: SyntheticEvent, value: number) => setTab(value);

    return (
        <div>

            <Box sx={{borderBottom: 1, borderColor: "divider"}}>
                <Tabs value={tab} onChange={handleChange}>
                    <Tab label="Configuration" {...tabProps(0)} />
                    <Tab label="Unité d'organisation" {...tabProps(1)} />
                    <Tab label="Sauvegarde" {...tabProps(2)} />
                </Tabs>
            </Box>
            <TabPanel value={tab} index={0}>
                <ConfigImportTab/>
            </TabPanel>
            <TabPanel value={tab} index={1}>
                <OrganisationUnitCascade/>
            </TabPanel>
            <TabPanel value={tab} index={2}>
                <BackupTab/>
            </TabPanel>
        </div>
    );
}
