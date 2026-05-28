import { ModelConfigCenter } from "../components/settings/ModelConfigCenter";
import { NetworkDiagnosticsPanel } from "../components/settings/NetworkDiagnosticsPanel";
import { AgentSettingsPanel } from "../components/settings/AgentSettingsPanel";

export function SettingsPage() {
  return (
    <div className="h-full overflow-auto bg-[linear-gradient(180deg,#0a0b0f_0%,#090a0d_100%)] p-6">
      <div className="mx-auto max-w-[1180px]">
        <AgentSettingsPanel />
        <NetworkDiagnosticsPanel />
      </div>
      <ModelConfigCenter />
    </div>
  );
}
