import json
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.current_xml = """
        <?xml version="1.0" encoding="UTF-8"?>
            <bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                            xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                            xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                            xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                            targetNamespace="http://bpmn.io/schema/bpmn"
                            id="Definitions_1">
            <bpmn:process id="Process_1" isExecutable="false">
                <bpmn:startEvent id="StartEvent_1"/>
            </bpmn:process>
            <bpmndi:BPMNDiagram id="BPMNDiagram_1">
                <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
                <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
                    <dc:Bounds height="36.0" width="36.0" x="173.0" y="102.0"/>
                </bpmndi:BPMNShape>
                </bpmndi:BPMNPlane>
            </bpmndi:BPMNDiagram>
            </bpmn:definitions>
        """
        self.locking_client: Optional[WebSocket] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        await websocket.send_text(json.dumps({"type": "update", "xml": self.current_xml}))
        if self.locking_client is not None:
            await websocket.send_text(json.dumps({"type": "lock", "locked": True}))

    def disconnect(self, websocket: WebSocket):
        if websocket == self.locking_client:
            self.locking_client = None
            # Unlock others asynchronously (use a loop since no sender)
            for connection in self.active_connections:
                if connection != websocket:
                    connection.send_text(json.dumps({"type": "lock", "locked": False}))
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str, sender: WebSocket):
        for connection in self.active_connections:
            if connection != sender:
                await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print(f"Connection attempt from {websocket.client}")
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            parsed = json.loads(data)
            if parsed.get("type") == "update":
                manager.current_xml = parsed["xml"]
                await manager.broadcast(data, websocket)
            elif parsed.get("type") == "lock":
                locked = parsed.get("locked", False)
                if locked:
                    if manager.locking_client is None:
                        manager.locking_client = websocket
                        await manager.broadcast(data, websocket)
                else:
                    if manager.locking_client == websocket:
                        manager.locking_client = None
                        await manager.broadcast(data, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)