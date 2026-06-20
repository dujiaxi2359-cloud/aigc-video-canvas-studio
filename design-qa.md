**Findings**
- No actionable P0, P1, or P2 issues remain in the corrected connection state.
- Connected image/video ports now use a compact link dot instead of presenting another add action.
- Standalone text nodes expose only their output port; the incorrect left-side input add control is removed.
- Reference thumbnails load from the thumbnail URL first and fall back to the source URL.

**Open Questions**
- None.

**Implementation Checklist**
- [x] Text-node port direction corrected
- [x] Connected-port visual state added
- [x] Reference thumbnail fallback added
- [x] TypeScript and production build passed
- [x] Browser checked with a connected image-to-video workflow

**Follow-up Polish**
- None required for this state.

source visual truth path: `/var/folders/8g/0g2l_9ms7qn54kzn2ybzx1bc0000gn/T/codex-clipboard-4f5cab6f-523d-4152-9a93-d142c723ab8e.png`
implementation screenshot path: `/private/tmp/moon-port-qa.png`
viewport: in-app desktop browser
state: completed image asset connected to a completed video node
full-view comparison evidence: connected ports are compact dots; the unconnected video output remains an add control
focused region comparison evidence: both reference thumbnail images completed with natural width 480px and no broken-image state
patches made since previous QA: port state semantics, text-node input removal, thumbnail URL fallback
final result: passed
