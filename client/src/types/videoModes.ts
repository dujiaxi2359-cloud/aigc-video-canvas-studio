export type OfficialVideoMode =
  | "text_to_video"
  | "image_to_video_first_frame"
  | "image_to_video_first_last_frame"
  | "reference_images_to_video"
  | "reference_video_to_video"
  | "video_continuation"
  | "video_extension"
  | "video_edit"
  | "video_to_video"
  | "audio_driven_video"
  | "motion_control";

export type OfficialVideoCategory =
  | "text_to_video"
  | "image_to_video"
  | "reference_to_video"
  | "first_last_frame_video"
  | "video_edit"
  | "video_extension";

export const officialVideoModeLabels: Record<OfficialVideoMode, string> = {
  text_to_video: "文生视频",
  image_to_video_first_frame: "首帧图生视频",
  image_to_video_first_last_frame: "首帧 + 尾帧图生视频",
  reference_images_to_video: "参考图生视频",
  reference_video_to_video: "参考视频生成",
  video_continuation: "视频续写",
  video_extension: "视频延展",
  video_edit: "视频编辑",
  video_to_video: "视频转视频",
  audio_driven_video: "音频驱动视频",
  motion_control: "运动控制"
};

export const officialVideoCategoryLabels: Record<OfficialVideoCategory, string> = {
  text_to_video: "文生视频",
  image_to_video: "图生视频",
  reference_to_video: "参考生视频",
  first_last_frame_video: "首尾帧视频",
  video_edit: "视频编辑",
  video_extension: "视频延展"
};

export function categoryForOfficialVideoMode(mode: OfficialVideoMode): OfficialVideoCategory {
  if (mode === "text_to_video") return "text_to_video";
  if (mode === "image_to_video_first_frame" || mode === "audio_driven_video") return "image_to_video";
  if (mode === "image_to_video_first_last_frame") return "first_last_frame_video";
  if (mode === "reference_images_to_video" || mode === "reference_video_to_video") return "reference_to_video";
  if (mode === "video_edit" || mode === "video_to_video" || mode === "motion_control") return "video_edit";
  return "video_extension";
}

export function officialModeToLegacyInputMode(mode: OfficialVideoMode): "text-to-video" | "image-to-video" | "first-last-frame" | "reference-to-video" | "video-to-video" {
  if (mode === "text_to_video") return "text-to-video";
  if (mode === "image_to_video_first_last_frame") return "first-last-frame";
  if (mode === "reference_images_to_video" || mode === "reference_video_to_video") return "reference-to-video";
  if (mode === "video_continuation" || mode === "video_extension" || mode === "video_edit" || mode === "video_to_video" || mode === "motion_control") return "video-to-video";
  return "image-to-video";
}

export function legacyInputModeToOfficialMode(inputMode?: string): OfficialVideoMode {
  if (inputMode === "text-to-video") return "text_to_video";
  if (inputMode === "first-last-frame") return "image_to_video_first_last_frame";
  if (inputMode === "reference-to-video") return "reference_images_to_video";
  if (inputMode === "video-to-video") return "video_to_video";
  return "image_to_video_first_frame";
}
