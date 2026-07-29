export const MIN_ART_DIRECTION_REFERENCES = 1;
export const MAX_ART_DIRECTION_REFERENCES = 3;

export type GameBrief = {
  description: string;
  genre: string;
  mood: string;
  targetPlatform: string;
  assetType: string;
};

export type ReferenceStyleHints = {
  lineStyle: string;
  lighting: string;
  materials: string[];
  shapeLanguage: string;
  detailLevel: string;
  compositionNotes: string[];
};

export type ReferenceItem = {
  id: string;
  title: string;
  imageUrl: string;
  sourceName: string;
  sourceUrl?: string;
  license?: string;
  palette: string[];
  traits: string[];
  description: string;
  styleHints: ReferenceStyleHints;
};

export type StyleSpec = {
  id: string;
  styleName: string;
  palette: string[];
  lineStyle: string;
  lighting: string;
  materials: string[];
  shapeLanguage: string;
  detailLevel: string;
  compositionNotes: string[];
  referenceIds: string[];
};

export type GenerationDirectionInput = {
  brief: GameBrief;
  styleSpec: StyleSpec;
  prompt?: string | null;
};

export function artDirectionDraftChanged(
  currentBrief: GameBrief,
  currentReferenceIds: readonly string[],
  nextBrief: GameBrief,
  nextReferenceIds: readonly string[],
) {
  return (
    currentBrief.description !== nextBrief.description ||
    currentBrief.genre !== nextBrief.genre ||
    currentBrief.mood !== nextBrief.mood ||
    currentBrief.targetPlatform !== nextBrief.targetPlatform ||
    currentBrief.assetType !== nextBrief.assetType ||
    currentReferenceIds.length !== nextReferenceIds.length ||
    currentReferenceIds.some(
      (referenceId, index) => referenceId !== nextReferenceIds[index],
    )
  );
}

export class ArtDirectionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtDirectionInputError";
  }
}

function normalizedText(value: string, field: string) {
  if (typeof value !== "string") {
    throw new ArtDirectionInputError(`${field} must be plain text.`);
  }

  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    throw new ArtDirectionInputError(`${field} is required.`);
  }
  return normalized;
}

function normalizeBrief(brief: GameBrief): GameBrief {
  if (!brief || typeof brief !== "object") {
    throw new ArtDirectionInputError("A game brief is required.");
  }

  return {
    description: normalizedText(brief.description, "Game description"),
    genre: normalizedText(brief.genre, "Genre"),
    mood: normalizedText(brief.mood, "Mood"),
    targetPlatform: normalizedText(brief.targetPlatform, "Target platform"),
    assetType: normalizedText(brief.assetType, "Asset type"),
  };
}

function uniqueStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/gu, " ").trim();
    const key = normalized.toLocaleLowerCase("en-US");
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}

function combinedDirection(label: string, values: readonly string[]) {
  const directions = uniqueStrings(values);
  if (directions.length === 1) return directions[0];
  return `${label}: ${directions.join(" / ")}`;
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function validateReferenceSelection(
  references: readonly ReferenceItem[],
): ReferenceItem[] {
  if (!Array.isArray(references)) {
    throw new ArtDirectionInputError("Reference selection must be a list.");
  }
  if (
    references.length < MIN_ART_DIRECTION_REFERENCES ||
    references.length > MAX_ART_DIRECTION_REFERENCES
  ) {
    throw new ArtDirectionInputError(
      `Choose between ${MIN_ART_DIRECTION_REFERENCES} and ${MAX_ART_DIRECTION_REFERENCES} references.`,
    );
  }

  const ids = new Set<string>();
  return references.map((reference) => {
    if (!reference || typeof reference !== "object") {
      throw new ArtDirectionInputError("Every selected reference must be valid.");
    }

    const id = normalizedText(reference.id, "Reference id");
    if (ids.has(id)) {
      throw new ArtDirectionInputError("Choose each reference only once.");
    }
    ids.add(id);
    return reference;
  });
}

export function createStyleSpec(
  briefInput: GameBrief,
  referenceInput: readonly ReferenceItem[],
): StyleSpec {
  const brief = normalizeBrief(briefInput);
  const references = validateReferenceSelection(referenceInput);
  const referenceIds = references.map((reference) => reference.id);
  const styleName = references.map((reference) => reference.title).join(" + ");
  const palette = uniqueStrings(
    references.flatMap((reference) => reference.palette),
  ).slice(0, 8);
  const materials = uniqueStrings(
    references.flatMap((reference) => reference.styleHints.materials),
  ).slice(0, 8);
  const compositionNotes = uniqueStrings([
    `Design one ${brief.assetType} for ${brief.targetPlatform} with an immediately readable gameplay silhouette.`,
    `Support a ${brief.mood} ${brief.genre} experience: ${brief.description}`,
    ...references.flatMap(
      (reference) => reference.styleHints.compositionNotes,
    ),
  ]);

  const direction = {
    styleName,
    palette,
    lineStyle: combinedDirection(
      "Blend line treatments",
      references.map((reference) => reference.styleHints.lineStyle),
    ),
    lighting: combinedDirection(
      "Blend lighting",
      references.map((reference) => reference.styleHints.lighting),
    ),
    materials,
    shapeLanguage: combinedDirection(
      "Blend shape languages",
      references.map((reference) => reference.styleHints.shapeLanguage),
    ),
    detailLevel: combinedDirection(
      "Resolve detail",
      references.map((reference) => reference.styleHints.detailLevel),
    ),
    compositionNotes,
    referenceIds,
  };

  return {
    id: `style-${stableHash(JSON.stringify({ brief, ...direction }))}`,
    ...direction,
  };
}

export function compileGenerationDirection({
  brief: briefInput,
  styleSpec,
  prompt,
}: GenerationDirectionInput) {
  const brief = normalizeBrief(briefInput);
  if (!styleSpec || typeof styleSpec !== "object") {
    throw new ArtDirectionInputError("A StyleSpec is required.");
  }
  if (
    styleSpec.referenceIds.length < MIN_ART_DIRECTION_REFERENCES ||
    styleSpec.referenceIds.length > MAX_ART_DIRECTION_REFERENCES
  ) {
    throw new ArtDirectionInputError(
      "The StyleSpec must be associated with one to three references.",
    );
  }

  const creativeDirection =
    typeof prompt === "string" ? prompt.replace(/\s+/gu, " ").trim() : "";
  const sections = [
    "Create exactly one production-ready game asset that follows the approved art direction.",
    [
      "GAME BRIEF",
      `Description: ${brief.description}`,
      `Genre: ${brief.genre}`,
      `Mood: ${brief.mood}`,
      `Target platform: ${brief.targetPlatform}`,
      `Asset type: ${brief.assetType}`,
    ].join("\n"),
    [
      "APPROVED STYLE SPEC",
      `Style: ${styleSpec.styleName}`,
      `Palette: ${styleSpec.palette.join(", ")}`,
      `Line style: ${styleSpec.lineStyle}`,
      `Lighting: ${styleSpec.lighting}`,
      `Materials: ${styleSpec.materials.join(", ")}`,
      `Shape language: ${styleSpec.shapeLanguage}`,
      `Detail level: ${styleSpec.detailLevel}`,
      `Composition: ${styleSpec.compositionNotes.join(" ")}`,
      `Source references: ${styleSpec.referenceIds.join(", ")}`,
    ].join("\n"),
    creativeDirection
      ? `ADDITIONAL DIRECTION\n${creativeDirection}`
      : "No additional direction was supplied. Resolve unspecified choices from the StyleSpec.",
    "Keep the subject, palette, shapes, materials, lighting, and level of detail internally consistent. Produce one asset only, not a contact sheet, alternate set, caption, mockup, or watermark.",
  ];

  return sections.join("\n\n");
}
