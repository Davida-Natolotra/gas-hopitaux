import {useParams} from "react-router-dom";
import type {RapportFs} from "../../features/rapports/rapport-model.ts";

export default function RapportViewPage() {
    const {id} = useParams<{ id: RapportFs["id"] }>();

    return (
        <div>
            <h1>Rapport {id}</h1>
        </div>
    );
}
