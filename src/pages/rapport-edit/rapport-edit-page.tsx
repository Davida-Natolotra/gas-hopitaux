import {useParams} from "react-router-dom";
import type {RapportHopitaux} from "../../features/rapports/model/rapport-model.ts";

export default function RapportEditPage() {
    const {id} = useParams<{ id: RapportHopitaux["id"] }>();

    return (
        <div>
            <h1>Edition du rapport {id}</h1>
        </div>
    );
}
