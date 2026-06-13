export const PHOTO_BASE_PATH = "/photos";

export function photoPath(path = "") {
  if (!path || path === "/") return PHOTO_BASE_PATH;
  return `${PHOTO_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
