const CHUNK_SIZE = 4096; // ~256ms at 16kHz — large enough for reliable transcription

class PCMAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._buf = new Float32Array(CHUNK_SIZE);
        this._pos = 0;
    }

    process(inputs) {
        const channel = inputs[0]?.[0];
        if (!channel) return true;

        let i = 0;
        while (i < channel.length) {
            const space = CHUNK_SIZE - this._pos;
            const copy = Math.min(space, channel.length - i);
            this._buf.set(channel.subarray(i, i + copy), this._pos);
            this._pos += copy;
            i += copy;

            if (this._pos === CHUNK_SIZE) {
                this.port.postMessage(this._buf.slice());
                this._pos = 0;
            }
        }
        return true;
    }
}
registerProcessor("pcm-audio-processor", PCMAudioProcessor);
