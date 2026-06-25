import { TextNode } from "../nodes/TextNode";
import { TextGenerateNode } from "../nodes/TextGenerateNode";
import { ImageNode } from "../nodes/ImageNode";
import { ImageGenerateNode } from "../nodes/ImageGenerateNode";
import { VideoNode } from "../nodes/VideoNode";
import { AudioNode } from "../nodes/AudioNode";
import { ScriptNode } from "../nodes/ScriptNode";
import { ComposeNode } from "../nodes/ComposeNode";
import { Director3DNode } from "../nodes/Director3DNode";

export const nodeTypes = {
  text: TextNode,
  textGenerate: TextGenerateNode,
  image: ImageNode,
  imageGenerate: ImageGenerateNode,
  video: VideoNode,
  audio: AudioNode,
  script: ScriptNode,
  compose: ComposeNode,
  director_3d: Director3DNode
};
