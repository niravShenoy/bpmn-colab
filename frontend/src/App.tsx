import { useEffect, useRef, useState } from "react";
import Modeler from "bpmn-js/lib/Modeler";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Canvas from "diagram-js/lib/core/Canvas";
import debounce from "lodash/debounce";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-codes.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import Overlays from "diagram-js/lib/features/overlays/Overlays";
import "./App.css";

interface BpmnEvent {
  element?: any;
  context?: {
    shape?: any;
  };
}

function App() {
  const overlaysRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [modeler, setModeler] = useState<Modeler | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  // const [lockedElements, setLockedElements] = useState<Map<string, string>>(new Map());
  const [ignoringNextChange, setIgnoringNextChange] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [userList, setUserList] = useState<string[]>([]);

  // Add a lock overlay bubble
  const addLockOverlay = (elementId: string, color: string) => {
    if (!overlaysRef.current) return;

    overlaysRef.current.add(elementId, {
      position: { top: -8, right: -8 },
      html: `
      <div style="
        background: ${color};
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-size:12px;
        font-weight:bold;
        box-shadow:0 0 4px rgba(0,0,0,0.3);
      ">
        🔒
      </div>
    `,
    });
  };

  // Remove all overlays for an element
  const removeLockOverlay = (elementId: string) => {
    if (!overlaysRef.current) return;
    overlaysRef.current.remove({ element: elementId });
  };

  // Create modeler on page load
  useEffect(() => {
    if (!containerRef.current) return;

    const m = new Modeler({ container: containerRef.current });

    m.createDiagram()
      .then(({ warnings }) => {
        if (warnings.length) console.warn("Creation warnings:", warnings);
        const canvas = m.get("canvas") as Canvas;
        canvas.zoom("fit-viewport");
        canvas.resized();
        overlaysRef.current = m.get("overlays");
        setModeler(m);
      })
      .catch((err) => console.error("Creation error:", err));

    return () => m.destroy();
  }, []);

  // Window resize for canvas
  useEffect(() => {
    const handleResize = () => {
      if (modeler) {
        const canvas = modeler.get("canvas") as Canvas;
        canvas.resized();
        canvas.zoom("fit-viewport");
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [modeler]);

  // Create WebSocket when modeler is ready
  useEffect(() => {
    if (!modeler) return;

    const websocket = new WebSocket("ws://localhost:8001/ws");
    websocket.onopen = () => console.log("WebSocket connected");
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "update" && modeler) {
        setIgnoringNextChange(true);
        modeler
          .importXML(data.xml)
          .then(() => {
            const canvas = modeler.get("canvas") as Canvas;
            canvas.zoom("fit-viewport");
            canvas.resized();
          })
          .catch((err) => console.error("Import error:", err));
      } else if (data.type === "client_id") {
        setClientId(data.id);
      } else if (data.type === "user_list") {
        setUserList(data.users);
      } else if (data.type === "element_lock") {
        const { element_id, user_id, locked } = data;

        if (!locked) {
          removeLockOverlay(element_id);
          return;
        }
        const color = user_id === clientId ? "#22c55e" : "#f97316";

        addLockOverlay(element_id, color);
      }
    };
    websocket.onclose = () => alert("WebSocket closed");
    websocket.onerror = (err) => console.error("WebSocket error:", err);
    setWs(websocket);

    return () => websocket.close();
  }, [modeler]);

  // Event listeners when both modeler and ws are ready
  useEffect(() => {
    if (!modeler || !ws) return;

    const eventBus = modeler.get("eventBus") as EventBus;

    const sendUpdate = async () => {
      if (ignoringNextChange) {
        setIgnoringNextChange(false);
        return;
      }
      try {
        const result = await modeler.saveXML({ format: true });
        if (result.xml && ws) {
          ws.send(JSON.stringify({ type: "update", xml: result.xml }));
        }
      } catch (err) {
        console.error("Error saving XML:", err);
      }
    };

    const debouncedSend = debounce(sendUpdate, 300);
    eventBus.on("commandStack.changed", debouncedSend);

    eventBus.on("commandStack.changed", () => {
      const canvas = modeler.get("canvas") as Canvas;
      canvas.zoom("fit-viewport");
      canvas.resized();
    });

    eventBus.on("selection.changed", (e: any) => {
      const element = e.newSelection?.[0];

      if (!ws) return;

      if (element) {
        ws.send(
          JSON.stringify({
            type: "element_lock",
            element_id: element.id,
            locked: true,
            user_id: clientId,
          })
        );
      }
    });

    eventBus.on("selection.changed", (e: any) => {
      const prev = e.oldSelection?.[0];
      if (prev && !e.newSelection?.length) {
        ws.send(
          JSON.stringify({
            type: "element_lock",
            element_id: prev.id,
            locked: false,
            user_id: clientId,
          })
        );
      }
    });

    return () => {
      eventBus.off("commandStack.changed", debouncedSend);
    };
  }, [modeler, ws, ignoringNextChange]);

  return (
    <div className="flex w-full h-screen bg-[#2e2c2c]">
      <div className="flex-1 relative p-4">
        <div
          ref={containerRef}
          className="w-full h-full rounded-xl bg-white shadow-md border"
        />
      </div>

      <aside className="w-64 bg-[#292626] border-l  p-6 flex flex-col shadow-sm">
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
          Active Users
        </h3>

        <ul className="space-y-2">
          {userList.map((user) => (
            <li
              key={user}
              className={`flex items-center gap-3 text-sm px-3 py-2 rounded-lg
              transition-all duration-150
              ${
                user === clientId
                  ? "bg-green-50 text-green-700 font-semibold"
                  : "text-white hover:bg-gray-700"
              }`}
            >
              <span
                className={`w-3 h-3 rounded-full ${
                  user === clientId ? "bg-green-500" : "bg-green-400"
                }`}
              ></span>

              <span>User {user}</span>

              {user === clientId && (
                <span className="text-xs text-green-600">(You)</span>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

export default App;