import type { ImageSize, Ratio } from "@/lib/workflow";

export type ResolvedImageSize = {
  targetWidth: number;
  targetHeight: number;
  exportSize: string;
  generationSize: ImageSize;
  ratio: Ratio;
};

function ratioFromTarget(width: number, height: number): Ratio {
  const value = width / height;
  if (value > 1.35) return "16:9";
  if (value < 0.62) return "9:16";
  if (value < 0.78) return "3:4";
  if (value < 0.9) return "4:5";
  return "1:1";
}

function generationSizeForRatio(ratio: Ratio): ImageSize {
  if (ratio === "16:9" || ratio === "1464:600" || ratio === "1464:625") {
    return "1536x1024";
  }
  if (ratio === "1:1") {
    return "1024x1024";
  }
  return "1024x1536";
}

export function resolveGenerationSize(width: number, height: number): ResolvedImageSize {
  const ratio = ratioFromTarget(width, height);
  return {
    targetWidth: width,
    targetHeight: height,
    exportSize: `${width}x${height}`,
    generationSize: generationSizeForRatio(ratio),
    ratio,
  };
}
