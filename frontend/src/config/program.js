export const SOLZAAR_PROGRAM_ID = import.meta.env.VITE_SOLZAAR_PROGRAM_ID || "";

export function shortenProgramId(value) {
    if (!value) return "Unavailable";
    return `${value.slice(0, 6)}...${value.slice(-6)}`;
}