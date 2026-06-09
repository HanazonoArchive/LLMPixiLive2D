import { Application, Ticker, settings, SCALE_MODES } from 'pixi.js';
import { Live2DModel } from '../src';
import { Live2DAudioQueueManager } from './functions/audio-queue';
import { VoiceServerConnection } from './functions/voice-socket';

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

        // --- 🔒 AUTOMATED AUDIO SYSTEM INITIALIZATION LAYER ---
        let isAudioPlaying = false;
        let analyser: AnalyserNode | null = null;
        let dataArray: Uint8Array = new Uint8Array(0);
        let audioInitialized = false;

        const initializeAudioSystem = async () => {
            if (audioInitialized) return;
            audioInitialized = true;

            console.log("🔊 First user gesture detected. Initializing raw web audio matrix...");
            
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256; 
            analyser.connect(audioContext.destination);
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            // Create your decoupled pipeline structures safely inside the interaction window
            const queueManager = new Live2DAudioQueueManager(audioContext, analyser);
            const voiceSocket = new VoiceServerConnection("ws://127.0.0.1:8000/stream-audio", queueManager);

            // Connect event hooks to structural variables
            queueManager.onPlaybackStarted = () => { isAudioPlaying = true; };
            queueManager.onPlaybackEnded = () => { isAudioPlaying = false; };

            // Spin up web socket transmission pipes
            voiceSocket.connect();

            // Strip listeners off once everything is working
            window.removeEventListener('click', initializeAudioSystem);
            window.removeEventListener('touchstart', initializeAudioSystem);
        };

        // Bind background interaction triggers to wake the audio architecture safely
        window.addEventListener('click', initializeAudioSystem);
        window.addEventListener('touchstart', initializeAudioSystem);


        let currentMouthY = 0;
        let currentMouthForm = 0;
        let currentBodyBounce = 0;
        let smoothedVolume = 0; 

        // ==========================================
        // 🎛️ LIP-SYNC TUNING DASHBOARD
        // ==========================================
        const AUDIO_GAIN = 4.5;           
        const NOISE_GATE = 4;             
        const MOUTH_OPEN_SPEED = 0.85;    
        const MOUTH_CLOSE_SPEED = 0.5;    
        const BODY_BOUNCE_MULT = 0.25;    
        // ==========================================

        model.internalModel.on('afterMotionUpdate', () => {
            if (model.internalModel.focusController) {
                model.internalModel.focusController.focus(0, 0);
            }

            // Only run data extraction loops if user gesture has activated the analyser
            if (isAudioPlaying && analyser && dataArray.length > 0) {
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

                if (rawMidAvg > smoothedVolume) {
                    smoothedVolume = lerp(smoothedVolume, rawMidAvg, 0.9); 
                } else {
                    smoothedVolume = lerp(smoothedVolume, rawMidAvg, 0.15); 
                }

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

                const core = model.internalModel.coreModel;
                core.setParameterValueById('ParamMouthOpenY', currentMouthY);
                core.setParameterValueById('ParamMouthForm', currentMouthForm);
                core.addParameterValueById('ParamBodyAngleY', currentBodyBounce);

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