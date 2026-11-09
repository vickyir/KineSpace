# How KineSpace meets the main technology requirement

KineSpace was planned with the **Devpost Learn skill pack** and built with **CLAD (Closed Loop Agentic Development) in Lens Studio**. An AI coding agent wrote, ran and checked the Lens through the Lens Studio MCP server. It worked in a closed loop: write code → compile → run in the Preview → read the logs and screenshots → fix.

## Products we used and what each one does

### Devpost Learn skill pack: planning

The skill pack produced the project brief. The brief holds the platform's hard rules, the session flow and the initial config, and the code cites it by section (for example "brief §6"). From it we wrote three working documents:

- [`lens-studio-agent.md`](../.claude/agents/lens-studio-agent.md), the agent brief that the AI agent follows on every change.
- [`Config.ts`](../Assets/Scripts/Config.ts), which holds every threshold, each citing its source.
- [`DEVIATIONS.md`](../DEVIATIONS.md), which records every change from the design and why.

### Lens Studio 5.24.1

The IDE and engine. It holds the scene, the 51 TypeScript components, and the Preview panel, where the full session runs on a simulated Spectacles device.

### CLAD: Lens Studio MCP server

Connects the agent to the editor. The tools we used:

| Tool | What it did in KineSpace |
|---|---|
| `scene-graphql` | Read and edit scene objects and component properties, such as the dev switches. |
| `SetLensStudioSelection` | Select objects in the Scene Hierarchy. |
| `RecompileTypeScriptTool` | Compile the TypeScript after each change. |
| `RunAndCollectLogsTool` | Run the Lens and read the Logger, including the 41 `FlowSelfTest` results. |
| `PreviewPanelTool`, `CapturePanelScreenshotTool` | Restart and screenshot the Preview, to compare each screen with the design. |
| `ConvertSvgToTexture` | Turn the SVG icons and silhouettes into textures. |
| `ExecuteEditorCode` | Run Editor API scripts. |

### CLAD project reference: `AGENTS.md` / `CLAUDE.md`

Lens Studio's guide for AI agents: runtime rules, units, the coordinate system and script execution order.

### Claude Code

The AI coding agent. It used a custom subagent, `lens-studio-agent`, that carries the brief's rules, and wrote all 51 scripts (about 8,800 lines).

### Spectacles Interaction Kit

Hand-tracking keypoints for the finger exercises, plus pinch and hand-ray input.

### Spectacles UI Kit 2.0

Windows, buttons and lazy-follow panels, styled to match the design.

### Lens APIs

| API | What it does in KineSpace |
|---|---|
| ASR | Voice commands: every button's label, plus "pause", "stop", "next" and "skip". |
| Persistent Storage | Saves calibration and progress on the device only, with no network calls. |
| Battery Level API | The low-battery guard that ends a session cleanly. |
| Audio | Plays the synthesised sound cues. |

### Figma, via its MCP server

The design source. The agent fetched each screen's screenshot and design context before building it.
