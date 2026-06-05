export type VeoPersonInput = {
  noPerson?: boolean;
  hasPerson?: boolean;
  prompt?: string;
};

export type VeoSensitiveTermMatch = {
  term: string;
  replacement: string;
};

const safetyBoundary =
  "fictional adult model, commercial product video, non-violent, no injury, no weapons, no minors, no celebrity likeness, no political content, no sexually suggestive content, original scene";

const sensitiveTerms: Array<{ pattern: RegExp; term: string; replacement: string }> = [
  { pattern: /\bchild\b/i, term: "child", replacement: "adult" },
  { pattern: /\bkid\b/i, term: "kid", replacement: "adult" },
  { pattern: /\bschool\b/i, term: "school", replacement: "neutral studio environment" },
  { pattern: /\bblood\b/i, term: "blood", replacement: "clean scene" },
  { pattern: /\bwound\b/i, term: "wound", replacement: "no injury" },
  { pattern: /\binjury\b/i, term: "injury", replacement: "safe movement" },
  { pattern: /\bgun\b/i, term: "gun", replacement: "no weapons" },
  { pattern: /\bknife\b/i, term: "knife", replacement: "no weapons" },
  { pattern: /\bexplosion\b/i, term: "explosion", replacement: "calm lighting" },
  { pattern: /\bfight\b/i, term: "fight", replacement: "peaceful movement" },
  { pattern: /\bkill\b/i, term: "kill", replacement: "safe action" },
  { pattern: /\bsexy\b/i, term: "sexy", replacement: "neutral commercial styling" },
  { pattern: /\bnude\b/i, term: "nude", replacement: "fully clothed" },
  { pattern: /\bcelebrity\b/i, term: "celebrity", replacement: "fictional adult model" },
  { pattern: /\bpolitician\b/i, term: "politician", replacement: "non-political fictional adult" },
  { pattern: /\bTrump\b/i, term: "Trump", replacement: "fictional adult model" },
  { pattern: /\bBiden\b/i, term: "Biden", replacement: "fictional adult model" },
  { pattern: /\bPutin\b/i, term: "Putin", replacement: "fictional adult model" },
  { pattern: /\bDisney\b/i, term: "Disney", replacement: "original brand-safe style" },
  { pattern: /\bMarvel\b/i, term: "Marvel", replacement: "original brand-safe style" },
  { pattern: /小孩/g, term: "小孩", replacement: "成年人" },
  { pattern: /儿童/g, term: "儿童", replacement: "成年人" },
  { pattern: /学生/g, term: "学生", replacement: "成年模特" },
  { pattern: /学校/g, term: "学校", replacement: "中性商业场景" },
  { pattern: /血/g, term: "血", replacement: "干净安全画面" },
  { pattern: /伤口/g, term: "伤口", replacement: "无受伤" },
  { pattern: /受伤/g, term: "受伤", replacement: "安全动作" },
  { pattern: /枪/g, term: "枪", replacement: "无武器" },
  { pattern: /刀/g, term: "刀", replacement: "无武器" },
  { pattern: /爆炸/g, term: "爆炸", replacement: "平稳灯光" },
  { pattern: /打架/g, term: "打架", replacement: "平和动作" },
  { pattern: /杀/g, term: "杀", replacement: "安全动作" },
  { pattern: /性感/g, term: "性感", replacement: "中性商业展示" },
  { pattern: /裸/g, term: "裸", replacement: "完整穿着" },
  { pattern: /明星/g, term: "明星", replacement: "虚构成年模特" },
  { pattern: /名人/g, term: "名人", replacement: "虚构成年模特" },
  { pattern: /总统/g, term: "总统", replacement: "非政治虚构成年人" },
  { pattern: /政治/g, term: "政治", replacement: "非政治商业内容" },
  { pattern: /迪士尼/g, term: "迪士尼", replacement: "原创安全风格" },
  { pattern: /漫威/g, term: "漫威", replacement: "原创安全风格" }
];

export function detectSensitiveTerms(prompt: string): VeoSensitiveTermMatch[] {
  const matches: VeoSensitiveTermMatch[] = [];
  for (const item of sensitiveTerms) {
    if (item.pattern.test(prompt) && !matches.some((match) => match.term === item.term)) {
      matches.push({ term: item.term, replacement: item.replacement });
    }
  }
  return matches;
}

export function sanitizePrompt(prompt: string) {
  let sanitized = prompt.trim();
  for (const item of sensitiveTerms) sanitized = sanitized.replace(item.pattern, item.replacement);
  const boundaries = safetyBoundary.split(", ");
  const lower = sanitized.toLowerCase();
  const missingBoundaries = boundaries.filter((boundary) => !lower.includes(boundary.toLowerCase()));
  return [sanitized, missingBoundaries.join(", ")].filter(Boolean).join("\n\nSafety boundary: ");
}

export function buildNegativePrompt(sceneType?: string) {
  const parts = [
    "violence, blood, injury, weapons, explosion, dangerous acts, minors, children, school, celebrity likeness, politician, copyrighted character, nudity, sexual content, hate symbols, illegal activities, self-harm, surveillance, private personal data, distorted face, deformed hands, text artifacts, logo distortion"
  ];
  if (sceneType === "product_ad") {
    parts.push("fake celebrity endorsement, medical claims, brand impersonation, unsafe product demonstration");
  }
  return parts.join(", ");
}

export function getPersonGenerationMode(input?: VeoPersonInput) {
  const prompt = input?.prompt ?? "";
  if (input?.noPerson || /无人物|不要人物|纯产品|product-only|no human|no person/i.test(prompt)) return "disallow";
  return input?.hasPerson === false ? "disallow" : "allow_adult";
}

export function veoPersonGenerationUiHint() {
  return "Veo 仅支持成年虚构人物，不能使用名人脸、未成年人、政治人物或未授权真人肖像";
}

export function buildRaiSuggestion(input: { sanitizedPrompt: string; reasons?: string[] }) {
  const reasons = input.reasons?.join(" ").toLowerCase() ?? "";
  if (/audio|voice|speech|music|lyrics|song|口播|声音|音乐|歌词/.test(reasons)) {
    return `${input.sanitizedPrompt}\n\nsilent commercial video, no spoken dialogue, no lyrics, no copyrighted music, only visual product showcase`;
  }
  return `${input.sanitizedPrompt}\n\nKeep the scene neutral and product-focused. Use only fictional adult people if people appear. Avoid face emphasis, celebrity likeness, minors, political content, dangerous action, copyrighted characters, or audio risks.`;
}

export function buildAudioSafePrompt() {
  return "silent commercial video, no spoken dialogue, no lyrics, no copyrighted music, only visual product showcase";
}

export function buildProductOnlyPrompt() {
  return "clean product-only commercial video, no human face, no voice, no dangerous action, studio lighting, realistic camera movement";
}
