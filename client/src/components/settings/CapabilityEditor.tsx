import { Input } from "../common/Input";
import { Select } from "../common/Select";
import { Textarea } from "../common/Textarea";
import type { DurationCapability, ModelCapabilities } from "../../types/model";

const defaultDuration: DurationCapability = { type: "enum", values: [5] };

export function CapabilityEditor({ value, onChange }: { value: ModelCapabilities; onChange: (value: ModelCapabilities) => void }) {
  const duration = value.duration ?? defaultDuration;
  const aspectRatios = value.aspectRatios ?? [];
  const resolutions = value.resolutions ?? [];
  return (
    <div className="space-y-3 rounded-[14px] border border-white/[0.07] bg-black/[0.16] p-3">
      <div className="grid grid-cols-4 gap-2">
        <Select value={duration.type} onChange={(event) => {
          const type = event.target.value;
          onChange({ ...value, duration: type === "fixed" ? { type, value: 5 } : type === "enum" ? { type, values: [5, 10] } : { type: "range", min: 2, max: 15, step: 1 } });
        }}>
          <option value="fixed">fixed</option>
          <option value="enum">enum</option>
          <option value="range">range</option>
        </Select>
        {duration.type === "fixed" && <Input type="number" value={duration.value} onChange={(event) => onChange({ ...value, duration: { type: "fixed", value: Number(event.target.value) } })} />}
        {duration.type === "enum" && <Input value={duration.values.join(",")} onChange={(event) => onChange({ ...value, duration: { type: "enum", values: event.target.value.split(",").map(Number).filter(Boolean) } })} />}
        {duration.type === "range" && (
          <>
            <Input type="number" value={duration.min} onChange={(event) => onChange({ ...value, duration: { ...duration, min: Number(event.target.value) } })} />
            <Input type="number" value={duration.max} onChange={(event) => onChange({ ...value, duration: { ...duration, max: Number(event.target.value) } })} />
            <Input type="number" value={duration.step} onChange={(event) => onChange({ ...value, duration: { ...duration, step: Number(event.target.value) } })} />
          </>
        )}
      </div>
      <Input value={aspectRatios.join(",")} onChange={(event) => onChange({ ...value, aspectRatios: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="16:9,9:16,1:1" />
      <Input value={resolutions.join(",")} onChange={(event) => onChange({ ...value, resolutions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="720P,1080P" />
      <Input value={value.inputModes.join(",")} onChange={(event) => onChange({ ...value, inputModes: event.target.value.split(",").map((item) => item.trim()) as ModelCapabilities["inputModes"] })} placeholder="text-to-video,image-to-video" />
      <Textarea
        className="min-h-[100px]"
        value={JSON.stringify(value.constraints ?? [], null, 2)}
        onChange={(event) => {
          try {
            onChange({ ...value, constraints: JSON.parse(event.target.value) });
          } catch {
            onChange(value);
          }
        }}
      />
    </div>
  );
}
