import json
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uuid

app = FastAPI()

latest_xml = """
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

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}  # client_id: websocket
        self.current_xml = latest_xml
        self.locking_client: Optional[WebSocket] = None
        self.locked_elements: dict[str, str] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        client_id = str(uuid.uuid4())[:8]  # Short unique ID
        self.active_connections[client_id] = websocket
        await websocket.send_text(json.dumps({"type": "client_id", "id": client_id}))
        await websocket.send_text(json.dumps({"type": "update", "xml": self.current_xml}))
        if self.locking_client is not None:
            await websocket.send_text(json.dumps({"type": "lock", "locked": True}))
        await self.broadcast_user_list()

    async def disconnect(self, client_id: str):
        websocket = self.active_connections.pop(client_id, None)
        latest_xml = self.current_xml
        if websocket and websocket == self.locking_client:
            self.locking_client = None
            # Unlock others
            for conn in self.active_connections.values():
                await conn.send_text(json.dumps({"type": "lock", "locked": False}))
        await self.broadcast_user_list()

    async def broadcast(self, message: str, sender: WebSocket):
        for connection in self.active_connections.values():
            if connection != sender:
                await connection.send_text(message)

    async def broadcast_user_list(self):
        user_list = list(self.active_connections.keys())
        message = json.dumps({"type": "user_list", "users": user_list})
        for connection in self.active_connections.values():
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
            elif parsed.get("type") == "element_lock":
                locked = parsed.get("locked", False)
                user_id = parsed.get("user_id")
                element_id = parsed.get("element_id")
                if locked:
                    if element_id not in manager.locked_elements:
                        manager.locked_elements[element_id] = user_id
                        await manager.broadcast(data, websocket)
                else:
                    if element_id in manager.locked_elements:
                        del manager.locked_elements[element_id]
                        await manager.broadcast(data, websocket)
    except WebSocketDisconnect:
        # Find client_id by websocket
        for cid, ws in list(manager.active_connections.items()):
            if ws == websocket:
                manager.disconnect(cid)
                break

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)