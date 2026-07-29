// "Complet"/"Incomplet" status chip colors — light tint background, with the
// text taking the color that used to be the (solid) background.
export const COMPLETENESS_STYLES = {
    complete: {bg: "#7ca611", color: "#ffffff"}, // light lemon bg, MUI success.main text
    incomplete: {bg: "#f17d0a", color: "#ffffff"}, // light red bg, MUI error.main text
};

export function completenessStyle(isComplete: boolean): { bg: string; color: string } {
    return isComplete ? COMPLETENESS_STYLES.complete : COMPLETENESS_STYLES.incomplete;
}
