import { useState } from "react";
import { Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { Input } from "../common/Input";
import { Button } from "../common/Button";

export function ApiKeyInput({
  value,
  maskedValue,
  placeholder,
  onChange,
  onTest
}: {
  value: string;
  maskedValue?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onTest?: () => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input className="h-9" type={visible ? "text" : "password"} value={value} placeholder={maskedValue ?? placeholder ?? "API Key"} onChange={(event) => onChange(event.target.value)} />
        <Button className="h-9 w-9 px-0" variant="secondary" onClick={() => setVisible(!visible)} type="button" title="显示 / 隐藏">
          {visible ? <EyeOff size={15} strokeWidth={1.8} /> : <Eye size={15} strokeWidth={1.8} />}
        </Button>
        <Button className="h-9 w-9 px-0" variant="secondary" onClick={() => navigator.clipboard.writeText(value || maskedValue || "")} type="button" title="复制">
          <Copy size={15} strokeWidth={1.8} />
        </Button>
        <Button className="h-9 w-9 px-0" variant="secondary" onClick={() => onChange("")} type="button" title="清空">
          <Trash2 size={15} strokeWidth={1.8} />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Button className="h-9" variant="secondary" type="button" onClick={onTest}>
          测试连接
        </Button>
        <div className="text-[12px] text-[#7d8796]">编辑时不重新输入 API Key，会保留后端原密钥。</div>
      </div>
    </div>
  );
}
