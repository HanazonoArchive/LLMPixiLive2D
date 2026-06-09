export class Live2DAudioQueueManager {
    private audioContext: AudioContext;
    private analyser: AnalyserNode;
    // 💎 UPGRADE: The queue now holds completely preloaded and pre-decoded ready-to-play AudioBuffers
    private queue: AudioBuffer[] = [];
    private isPlaying: boolean = false;
    private currentSource: AudioBufferSourceNode | null = null;
    
    public onPlaybackStarted: () => void = () => {};
    public onPlaybackEnded: () => void = () => {};

    constructor(audioContext: AudioContext, analyser: AnalyserNode) {
        this.audioContext = audioContext;
        this.analyser = analyser;
    }

    /**
     * Accepts raw binary incoming data, preloads/decodes it completely in the 
     * background FIRST, and only adds it to the queue once it's 100% fully rendered.
     */
    public async enqueueAudioChunk(arrayBuffer: ArrayBuffer): Promise<void> {
        console.log("📥 Raw network chunk received. Preloading/Decoding in background...");
        
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // 🛠️ PRELOAD LAYER: Decode the entire WAV structure out of network state right now
            const decodedBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
            
            // Safe check: Ensure we actually got valid audio frames
            if (decodedBuffer.duration === 0) {
                console.warn("⚠️ Empty audio chunk detected during preload step. Skipping.");
                return;
            }

            // Push the fully preloaded buffer into the line
            this.queue.push(decodedBuffer);
            console.log(`✅ Chunk fully preloaded! Duration: ${decodedBuffer.duration.toFixed(2)}s. Queue size: ${this.queue.length}`);
            
            // Trigger sequence runner if we are currently sitting idle
            if (!this.isPlaying) {
                this.processNextInQueue();
            }
        } catch (error) {
            console.error("🚨 Preload/Decode failure. Raw chunk was corrupted or incomplete:", error);
        }
    }

    /**
     * Pulls the perfectly preloaded audio item out of the queue and plays it instantly.
     */
    private processNextInQueue(): void {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            this.onPlaybackEnded();
            console.log("✨ All preloaded speech chunks completed. Queue is empty.");
            return;
        }

        this.isPlaying = true;
        this.onPlaybackStarted();
        
        // Grab the completely prepared buffer
        const readyBuffer = this.queue.shift()!;

        try {
            const sourceNode = this.audioContext.createBufferSource();
            sourceNode.buffer = readyBuffer; // No lag or static! The data is already raw PCM in RAM.
            sourceNode.connect(this.analyser);
            
            this.currentSource = sourceNode;

            sourceNode.onended = () => {
                if (this.currentSource === sourceNode) {
                    this.currentSource = null;
                    this.processNextInQueue(); // Cycle straight to the next preloaded thought
                }
            };

            sourceNode.start(0);
        } catch (error) {
            console.error("🚨 Playback ignition failure inside queue manager:", error);
            this.isPlaying = false;
            this.processNextInQueue();
        }
    }

    /**
     * Emergency clear hook
     */
    public purgeQueue(): void {
        this.queue = [];
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch (e) {}
            this.currentSource.disconnect();
            this.currentSource = null;
        }
        this.isPlaying = false;
        this.onPlaybackEnded();
    }
}