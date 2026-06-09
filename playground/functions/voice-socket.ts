import { Live2DAudioQueueManager } from './audio-queue';

export class VoiceServerConnection {
    private wsUrl: string;
    private queueManager: Live2DAudioQueueManager;
    private socket: WebSocket | null = null;
    private reconnectTimeout: any = null;

    constructor(wsUrl: string, queueManager: Live2DAudioQueueManager) {
        this.wsUrl = wsUrl;
        this.queueManager = queueManager;
    }

    public connect(): void {
        console.log(`Initializing network socket connection to voice stream server at: ${this.wsUrl}`);
        
        this.socket = new WebSocket(this.wsUrl);
        this.socket.binaryType = "arraybuffer"; // Capture raw array bytes cleanly from backend

        this.socket.onopen = () => {
            console.log("Live2D Client successfully bonded with Voice server stream pipeline.");
        };

        this.socket.onmessage = async (event: MessageEvent) => {
            if (event.data instanceof ArrayBuffer) {
                // Pass raw array buffers straight into our new sequence runner
                await this.queueManager.enqueueAudioChunk(event.data);
            }
        };

        this.socket.onclose = () => {
            console.warn("Voice server connection dropped. Re-attempting connection routine in 5 seconds...");
            this.scheduleReconnect();
        };

        this.socket.onerror = (error) => {
            console.error("Network socket framework encountered an anomaly:", error);
            if (this.socket) {
                this.socket.close();
            }
        };
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, 5000);
    }

    public disconnect(): void {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.socket) {
            this.socket.onclose = null; // Clean up listeners to prevent double reconnection fires
            this.socket.close();
        }
    }
}