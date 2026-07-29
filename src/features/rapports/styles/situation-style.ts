export const SITUATION_STYLES: Record<string, { bg: string; color: string }> = {
    RUPTURE: {bg: "#d32f2f", color: "#fff"},
    "SOUS STOCK": {bg: "#fbc02d", color: "#000"},
    NORMAL: {bg: "#dce775", color: "#000"},
    SURSTOCK: {bg: "#00bcd4", color: "#ffffff"},
};
const SITUATION_STYLE_UNKNOWN = {bg: "grey.300", color: "text.secondary"};

export function situationStyle(situation: string | undefined): { bg: string; color: string } {
    if (!situation) return SITUATION_STYLE_UNKNOWN;
    return SITUATION_STYLES[situation] ?? SITUATION_STYLE_UNKNOWN;
}
