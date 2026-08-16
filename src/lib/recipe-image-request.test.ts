import { describe, expect, test } from "vitest";
import { parseRecipeImageRequest } from "@/lib/recipe-image-request";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function createPng(name = "recipe.png"): File {
  return new File([pngBytes], name, { type: "image/png" });
}

describe("recipe image request parsing", () => {
  test("accepts one or two ordered recipe images", async () => {
    const formData = new FormData();
    formData.append("images", createPng("first.png"));
    formData.append("images", createPng("second.png"));
    formData.append("specialInstructions", " Double it. ");

    await expect(parseRecipeImageRequest(formData)).resolves.toEqual({
      images: [
        {
          data: Buffer.from(pngBytes).toString("base64"),
          displayName: "recipe-page-1.png",
          mimeType: "image/png",
        },
        {
          data: Buffer.from(pngBytes).toString("base64"),
          displayName: "recipe-page-2.png",
          mimeType: "image/png",
        },
      ],
      specialInstructions: "Double it.",
    });
  });

  test("rejects missing, excess, oversized, and disguised images", async () => {
    await expect(
      parseRecipeImageRequest(new FormData()),
    ).rejects.toThrow("one or two");

    const excess = new FormData();
    excess.append("images", createPng());
    excess.append("images", createPng());
    excess.append("images", createPng());
    await expect(parseRecipeImageRequest(excess)).rejects.toThrow(
      "one or two",
    );

    const oversized = new FormData();
    oversized.append(
      "images",
      new File([new Uint8Array(8_000_001)], "large.png", {
        type: "image/png",
      }),
    );
    await expect(parseRecipeImageRequest(oversized)).rejects.toThrow("8 MB");

    const disguised = new FormData();
    disguised.append(
      "images",
      new File(["not an image"], "fake.png", { type: "image/png" }),
    );
    await expect(parseRecipeImageRequest(disguised)).rejects.toThrow(
      "does not match",
    );
  });
});
