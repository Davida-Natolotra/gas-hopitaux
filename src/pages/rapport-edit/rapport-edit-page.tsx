import {useParams} from "react-router-dom";
import type {RapportFs} from "../../features/rapports/model/rapport-model.ts";

export default function RapportEditPage() {
    const {id} = useParams<{ id: RapportFs["id"] }>();

    return (
        <div>
            <h1>Edition du rapport {id}</h1>
        </div>
    );
}
