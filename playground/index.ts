import { Application, Ticker, settings, SCALE_MODES } from 'pixi.js';
import { Live2DModel } from '../src';

// Fix blurriness BEFORE initializing the application
settings.SCALE_MODE = SCALE_MODES.LINEAR; 

// Register ticker for Live2D animations
Live2DModel.registerTicker(Ticker);

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const modelURL = '/hiyori_model/hiyori_free_t08.model3.json';

// --- UTILITY: Linear Interpolation for smooth movements ---
const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
};

async function main() {
    const app = new Application({
        view: canvas,
        resizeTo: window,
        resolution: window.devicePixelRatio || 1, 
        autoDensity: true,                                         
        antialias: true,                                           
        backgroundColor: 0x000000, 
        backgroundAlpha: 1,        
    });

    (window as any).app = app;
    window.__PIXI_APP__ = app;

    try {
        const model = await Live2DModel.from(modelURL, {
            overWriteBounds: { x0: 0, y0: -500, x1: 0, y1: 0 }
        });

        const baseScale = (app.renderer.screen.height * 0.85) / model.height;
        model.scale.set(baseScale * 4.5);
        model.anchor.set(0.5, 1);
        model.x = app.renderer.screen.width / 2;
        model.y = app.renderer.screen.height * 3.2; 
        
        model.interactive = true;
        app.stage.addChild(model);

        // --- 💎 SYSTEM UPGRADE: RAW AUDIO PIPELINE SETUP ---
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; 
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Connect our frequency analyzer tracking module directly to your system speakers
        analyser.connect(audioContext.destination);

        // Tracker variable to tell our animation engine if sound matrix is pushing through
        let isAudioPlaying = false;
        let currentAudioSource: AudioBufferSourceNode | null = null;

        let currentMouthY = 0;
        let currentMouthForm = 0;
        let currentBodyBounce = 0;
        let smoothedVolume = 0; 

        // ==========================================
        // 🎛️ LIP-SYNC TUNING DASHBOARD
        // ==========================================
        const AUDIO_GAIN = 4.5;           
        const NOISE_GATE = 4;             
        const MOUTH_OPEN_SPEED = 0.85;    // Instant opening on words
        const MOUTH_CLOSE_SPEED = 0.5;    // Jaw shrinks faster on syllables
        const BODY_BOUNCE_MULT = 0.25;    
        // ==========================================

        model.internalModel.on('afterMotionUpdate', () => {
            // LOCK EYES FORWARD
            if (model.internalModel.focusController) {
                model.internalModel.focusController.focus(0, 0);
            }

            // Read frequencies if our tracking engine registers active bytes
            if (isAudioPlaying) {
                analyser.getByteFrequencyData(dataArray);
                
                let bassTotal = 0, midTotal = 0, highTotal = 0;
                const third = Math.floor(dataArray.length / 3);

                for (let i = 0; i < dataArray.length; i++) {
                    if (i < third) bassTotal += dataArray[i];
                    else if (i < third * 2) midTotal += dataArray[i];
                    else highTotal += dataArray[i];
                }

                const bassAvg = bassTotal / third;       
                const rawMidAvg = midTotal / third;         
                const highAvg = highTotal / third;       

                // --- ENVELOPE FOLLOWER ---
                if (rawMidAvg > smoothedVolume) {
                    smoothedVolume = lerp(smoothedVolume, rawMidAvg, 0.9); // React instantly to spikes
                } else {
                    smoothedVolume = lerp(smoothedVolume, rawMidAvg, 0.15); // Rapid flutter down between syllables
                }

                // --- ADVANCED AUDIO MAPPING ---
                let targetMouthY = 0;
                if (smoothedVolume > NOISE_GATE) {
                    targetMouthY = ((smoothedVolume - NOISE_GATE) / 100) * AUDIO_GAIN;
                    targetMouthY = Math.min(targetMouthY, 1); 
                }

                const targetMouthForm = highAvg > (NOISE_GATE * 1.5) ? 0.5 : 0; 
                const targetBodyBounce = bassAvg > NOISE_GATE ? (bassAvg / 255) * BODY_BOUNCE_MULT : 0;

                const mouthLerpFactor = targetMouthY > currentMouthY ? MOUTH_OPEN_SPEED : MOUTH_CLOSE_SPEED;
                
                currentMouthY = lerp(currentMouthY, targetMouthY, mouthLerpFactor); 
                currentMouthForm = lerp(currentMouthForm, targetMouthForm, 0.2);
                currentBodyBounce = lerp(currentBodyBounce, targetBodyBounce, 0.05);

                // --- INJECT PARAMETERS ---
                const core = model.internalModel.coreModel;
                core.setParameterValueById('ParamMouthOpenY', currentMouthY);
                core.setParameterValueById('ParamMouthForm', currentMouthForm);
                core.addParameterValueById('ParamBodyAngleY', currentBodyBounce);

                // EXTREME OVERRIDE: Hard lock the eyeballs perfectly center
                core.setParameterValueById('ParamEyeBallX', 0);
                core.setParameterValueById('ParamEyeBallY', 0);

            } else {
                currentMouthY = lerp(currentMouthY, 0, MOUTH_CLOSE_SPEED);
                currentMouthForm = lerp(currentMouthForm, 0, 0.2);
                
                if (currentMouthY > 0.01) {
                    model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', currentMouthY);
                }
            }
        });

        // ==========================================
        // 📡 LIVE AUDIO HOOK: RECEIVE RE-ENGINEERED PIPELINE DATA
        // ==========================================
        (window as any).injectNewDialogueAudio = async (arrayBuffer: ArrayBuffer) => {
            console.log("🎙️ New binary array buffer intercepted! Decoding data inside system RAM...");
            
            // Resume the audio context if it was suspended due to browser security policies
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            // Stop any voice lines that are currently mid-speech to avoid overlap
            if (currentAudioSource) {
                try {
                    currentAudioSource.stop();
                } catch(e) {}
                currentAudioSource.disconnect();
            }

            try {
                // Decode the raw incoming filtered sound matrix directly into Web Audio native formats
                // Slice the buffer to prevent shared ownership mutations from tracking routines
                const cleanBuffer = arrayBuffer.slice(0);
                const decodedBuffer = await audioContext.decodeAudioData(cleanBuffer);

                // Generate a lightweight, virtual source node trigger
                const sourceNode = audioContext.createBufferSource();
                sourceNode.buffer = decodedBuffer;

                // Hook up the live memory buffer data track directly into the analysis node pipeline
                sourceNode.connect(analyser);
                currentAudioSource = sourceNode;

                // Fire trackers to notify the renderer loop that speech arrays have arrived
                sourceNode.onended = () => {
                    if (currentAudioSource === sourceNode) {
                        isAudioPlaying = false;
                        console.log("✨ Rei finished speaking current text sentence block.");
                    }
                };

                isAudioPlaying = true;
                sourceNode.start(0);

            } catch (decodeError) {
                console.error("🚨 Web Audio RAM compilation failed. Ensuring raw array byte configuration matches:", decodeError);
                isAudioPlaying = false;
            }
        };

        // UI control element fallback
        checkbox('System Active Listener Enabled', (checked) => {
            if (checked && audioContext.state === 'suspended') {
                audioContext.resume();
            }
        });

        // ==========================================
        // 🔌 LIVE WEBSOCKET CONNECTION LAYER
        // ==========================================
        function connectToVoiceServer() {
            const wsUrl = "ws://127.0.0.1:8000/stream-audio";
            console.log(`🔌 Attempting link to voice server at ${wsUrl}...`);
            
            const socket = new WebSocket(wsUrl);
            socket.binaryType = "arraybuffer"; // Capture raw array bytes cleanly

            socket.onopen = () => {
                console.log("✅ Live2D Avatar successfully bonded with Python Voice Pipeline.");
            };

            socket.onmessage = async (event) => {
                if (event.data instanceof ArrayBuffer) {
                    // Send the raw array buffer directly up to our hot-swap injector module
                    if ((window as any).injectNewDialogueAudio) {
                        (window as any).injectNewDialogueAudio(event.data);
                    }
                }
            };

            socket.onclose = () => {
                console.warn("⚠️ Voice server connection closed. Retrying link in 5 seconds...");
                isAudioPlaying = false;
                setTimeout(connectToVoiceServer, 5000); // Auto-reconnect safety loop
            };

            socket.onerror = (err) => {
                console.error("🚨 WebSocket encountered an error:", err);
                socket.close();
            };
        }

        // Kickstart the connection process
        connectToVoiceServer();

    } catch (error) {
        console.error('Failed to initialize Live2D Model:', error);
    }
}

main().catch(console.error);

function checkbox(name: string, onChange: (checked: boolean) => void) {
    const id = name.replace(/\W/g, '').toLowerCase();
    const controlPanel = document.getElementById('control');
    
    if (!controlPanel) return;

    const htmlString = `
        <p>
          <input type="checkbox" id="${id}" checked>
          <label for="${id}">${name}</label>
        </p>`;

    controlPanel.insertAdjacentHTML('beforeend', htmlString);

    const checkboxElement = document.getElementById(id) as HTMLInputElement;
    if (checkboxElement) {
        checkboxElement.addEventListener('change', () => {
            onChange(checkboxElement.checked);
        });
        onChange(checkboxElement.checked);
    }
}