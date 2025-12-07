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
  const containerRef = useRef<HTMLDivElement>(null);
  const [modeler, setModeler] = useState<Modeler | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  // const [lockedElements, setLockedElements] = useState<Map<string, string>>(new Map());
  const [ignoringNextChange, setIgnoringNextChange] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [userList, setUserList] = useState<string[]>([]);

  // Create modeler on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const m = new Modeler({ container: containerRef.current });

    m.createDiagram()
      .then(({ warnings }) => {
        if (warnings.length) console.warn("Creation warnings:", warnings);
        const canvas = m.get("canvas") as Canvas;
        canvas.zoom("fit-viewport");
        canvas.resized();
        setModeler(m);
      })
      .catch((err) => console.error("Creation error:", err));

    return () => m.destroy();
  }, []);

  // Handle window resize for canvas
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

  // Create WebSocket once modeler is ready
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
      } 
      // else if (data.type === "element_lock") {
      //   const newLocked = new Map(lockedElements);
      //   if (data.locked) {
      //     newLocked.set(data.element_id, data.user_id);
      //   } else {
      //     newLocked.delete(data.element_id);
      //   }
      //   setLockedElements(newLocked);
      // }
    };
    websocket.onclose = () => console.log("WebSocket closed");
    websocket.onerror = (err) => console.error("WebSocket error:", err);
    setWs(websocket);

    return () => websocket.close();
  }, [modeler]);

  // Attach event listeners when both modeler and ws are ready
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

    // Auto-fit viewport after changes for visibility
    eventBus.on("commandStack.changed", () => {
      const canvas = modeler.get("canvas") as Canvas;
      canvas.zoom("fit-viewport");
      canvas.resized();
    });

    return () => {
      eventBus.off("commandStack.changed", debouncedSend);
    };
  }, [modeler, ws, ignoringNextChange]);

  return (
    <div className="flex w-full h-screen">
      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{
          backgroundColor: "white",
        }}
      />
      <div className="w-48 bg-gray-100 p-4 overflow-y-auto border-l border-gray-300">
        <h3 className="text-lg font-bold mb-2">Active Users</h3>
        <ul>
          {userList.map((user) => (
            <li key={user} className={`text-sm ${user === clientId ? 'font-bold' : ''}`}>
              User {user} {user === clientId && '(You)'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;