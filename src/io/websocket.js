import {CustEvent} from 'chimee-helper-events';

export default class WebSocketLoader extends CustEvent {

    static isSupported() {
        try {
            return (typeof window.WebSocket !== 'undefined');
        } catch (e) {
            return false;
        }
    }

    constructor(src, config) {
        super();
        this.tag = 'WebSocket';
        this.src = src;
        this._ws = null;
        this._requestAbort = false;
        this._receivedLength = 0;
    }

    destroy() {
        if (this._ws) {
            this.abort();
        }
    }

    open(range, keyframePoint) {
        try {
            const ws = this._ws = new self.WebSocket(this.src);
            ws.binaryType = 'arraybuffer';
            ws.onopen = this.onWebSocketOpen.bind(this);
            ws.onclose = this.onWebSocketClose.bind(this);
            ws.onmessage = this.onWebSocketMessage.bind(this);
            ws.onerror = this.onWebSocketError.bind(this);
        } catch (e) {
            const info = {
                code: e.code, 
                msg: e.message
            };

            if (this._onError) {
                this._onError('Exception', info);
            } else {
                throw new Error(info.msg);
            }
        }
    }

    abort() {
        const ws = this._ws;
        if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
            this._requestAbort = true;
            ws.close();
        }

        this._ws = null;
    }

    onWebSocketClose(e) {
        if (this._requestAbort === true) {
            this._requestAbort = false;
            return;
        }
        this.emit('end');
    }

    onWebSocketMessage(e) {
        if (e.data instanceof ArrayBuffer) {
            this.dispatchArrayBuffer(e.data);
        } else if (e.data instanceof Blob) {
            let reader = new FileReader();
            reader.onload = () => {
                this.dispatchArrayBuffer(reader.result);
            };
            reader.readAsArrayBuffer(e.data);
        } else {
            let info = {code: -1, msg: 'Unsupported WebSocket message type: ' + e.data.constructor.name};

            if (this._onError) {
                this._onError('Exception', info);
            } else {
                throw new Error(info.msg);
            }
        }
    }

    dispatchArrayBuffer(arraybuffer) {
        let chunk = arraybuffer;
        let byteStart = this.receivedLength;
        this.receivedLength += chunk.byteLength;

        if (this.arrivalDataCallback) {
            this.arrivalDataCallback(chunk, byteStart, this.receivedLength);
        }
    }

    onWebSocketError(e) {
        let info = {
            code: e.code,
            msg: e.message
        };

        if (this._onError) {
            this._onError('Exception', info);
        } else {
            throw new Error(info.msg);
        }
    }

}