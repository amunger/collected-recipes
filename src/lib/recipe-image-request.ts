import type { RecipeImage } from "@/lib/copilot-ingredients";

const MAX_IMAGE_BYTES = 8_000_000;
const MAX_SPECIAL_INSTRUCTIONS_LENGTH = 2_000;

export interface RecipeImageRequest {
  readonly images: ReadonlyArray<RecipeImage>;
  readonly specialInstructions?: string;
}

function hasImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/gif":
      return (
        new TextDecoder()
          .decode(bytes.subarray(0, 6))
          .match(/^GIF8[79]a$/) !== null
      );
    case "image/webp":
      return (
        new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
      );
    default:
      return false;
  }
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      throw new Error("Recipe images must be JPEG, PNG, GIF, or WebP.");
  }
}

export async function parseRecipeImageRequest(
  formData: FormData,
): Promise<RecipeImageRequest> {
  const uploadedValues = formData.getAll("images");
  if (
    uploadedValues.length < 1 ||
    uploadedValues.length > 2 ||
    uploadedValues.some((value) => !(value instanceof File))
  ) {
    throw new Error("Upload one or two recipe images.");
  }

  const specialInstructionsValue = formData.get("specialInstructions");
  if (
    specialInstructionsValue !== null &&
    typeof specialInstructionsValue !== "string"
  ) {
    throw new Error("Special instructions must be text.");
  }
  const specialInstructions = specialInstructionsValue?.trim() || undefined;
  if (
    specialInstructions &&
    specialInstructions.length > MAX_SPECIAL_INSTRUCTIONS_LENGTH
  ) {
    throw new Error(
      "Special instructions must be 2,000 characters or fewer.",
    );
  }

  const files = uploadedValues as File[];
  const images = await Promise.all(
    files.map(async (file, index): Promise<RecipeImage> => {
      if (file.size === 0) {
        throw new Error(`Recipe image ${index + 1} is empty.`);
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(
          `Recipe image ${index + 1} must be 8 MB or smaller.`,
        );
      }

      const extension = extensionForMimeType(file.type);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!hasImageSignature(bytes, file.type)) {
        throw new Error(
          `Recipe image ${index + 1} does not match its file type.`,
        );
      }

      return {
        data: Buffer.from(bytes).toString("base64"),
        displayName: `recipe-page-${index + 1}.${extension}`,
        mimeType: file.type,
      };
    }),
  );

  return { images, specialInstructions };
}
