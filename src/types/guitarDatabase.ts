/**
 * Espelha a estrutura de `src/data/guitarDatabase.json`.
 * Importe o JSON com `resolveJsonModule` e use `satisfies GuitarDatabase`.
 */

export type GuitarDatabaseVersion = 1;

export type ScaleFamily =
  | "major"
  | "minor_natural"
  | "minor_harmonic"
  | "minor_melodic"
  | "pentatonic_major"
  | "pentatonic_minor"
  | "blues"
  | "mode_ionian"
  | "mode_dorian"
  | "mode_phrygian"
  | "mode_lydian"
  | "mode_mixolydian"
  | "mode_aeolian"
  | "mode_locrian";

/** Afinação padrão: corda 6 (mi grave) → corda 1 (mi agudo). */
export type StringIndex = 1 | 2 | 3 | 4 | 5 | 6;

/** -1 = não tocada (X); 0 = solta; >0 = casa. */
export type FretPosition = number;

export type CagedLetter = "C" | "A" | "G" | "E" | "D";

export interface ScaleEntry {
  id: string;
  name: string;
  namePt: string;
  family: ScaleFamily;
  /** Semitons acima da tônica (0 = tônica). */
  intervalsSemitones: number[];
  /** Símbolos de intervalo relativos à tônica. */
  intervalSymbols: string[];
  /** Notas com tônica em C (referência). */
  notesWithRootC: string[];
  /** Número de graus (inclui tônica). */
  degreeCount: number;
}

export interface ChordVoicing {
  id: string;
  /** Forma CAGED de referência para o shape. */
  cagedForm: CagedLetter;
  /** Corda onde está o baixo mais grave tocado (1–6). */
  bassString: StringIndex;
  /** Casa do baixo na corda indicada (útil para shapes móveis). */
  bassFret: FretPosition;
  /** [corda6 … corda1], -1 = abafada/mute. */
  frets: [FretPosition, FretPosition, FretPosition, FretPosition, FretPosition, FretPosition];
  /** Sugestão de dedos [corda6 … corda1]; 0 = não especificado/polegar. */
  fingers?: [number, number, number, number, number, number];
  /** Notação compacta tipo diagrama (6→1). */
  diagram: string;
}

export interface ChordEntry {
  id: string;
  symbol: string;
  namePt: string;
  quality:
    | "major"
    | "minor"
    | "dominant7"
    | "major7"
    | "minor7"
    | "half_diminished"
    | "diminished"
    | "augmented"
    | "sus2"
    | "sus4"
    | "add9"
    | "sixth"
    | "ninth";
  /** Tonalidade de referência para as digitações listadas. */
  referenceKey: string;
  voicings: ChordVoicing[];
}

export type ProgressionGenre = "rock" | "blues" | "rock_blues";

export interface ProgressionEntry {
  id: string;
  name: string;
  namePt: string;
  genre: ProgressionGenre;
  /** Tom de exemplo para a sequência em `chords`. */
  keyExample: string;
  /** Acordes no tom de exemplo (símbolos). */
  chords: string[];
  /** Análise harmônica (romanos ou símbolos funcionais). */
  romanOrFunctions: string;
  /** Referência cultural opcional. */
  reference?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface GuitarDatabase {
  version: GuitarDatabaseVersion;
  scales: ScaleEntry[];
  chords: ChordEntry[];
  progressions: ProgressionEntry[];
}
