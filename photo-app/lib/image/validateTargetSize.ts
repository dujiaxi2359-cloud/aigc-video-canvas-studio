export function validateTargetSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 256 || height < 256) {
    throw new Error("目标导出尺寸无效，请检查平台尺寸配置。");
  }
}
