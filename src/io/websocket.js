import handleRange from './handleRange';
import {CustEvent} from 'chimee-helper';
import {Log} from 'chimee-helper';

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
        this.tag = 'WebSocketLoader';
        this.range = {
            from: 0,
            to: 500000
        };
        this.src = src;
        this._ws = null;
        this._requestAbort = false;
        this._receivedLength = 0;
    }

    destroy() {
        if (this._ws) {
            this.abort();
        }
        super.destroy();
    }

    open(range, keyframePoint) {
        try {
            const ws = this._ws = new self.WebSocket(this.src);
            ws.binaryType = 'arraybuffer';
            ws.onopen = this._onWebSocketOpen.bind(this);
            ws.onclose = this._onWebSocketClose.bind(this);
            ws.onmessage = this._onWebSocketMessage.bind(this);
            ws.onerror = this._onWebSocketError.bind(this);
        } catch (e) {
            const info = {code: e.code, msg: e.message};

            if (this._onError) {
                this._onError(LoaderErrors.EXCEPTION, info);
            } else {
                throw new RuntimeException(info.msg);
            }
        }
    }

    abort() {
        const ws = this._ws;
        if (ws && (ws.readyState === 0 || ws.readyState === 1)) {  // CONNECTING || OPEN
            this._requestAbort = true;
            ws.close();
        }

        this._ws = null;
    }

    _onWebSocketOpen(e) {
    }

    _onWebSocketClose(e) {
        if (this._requestAbort === true) {
            this._requestAbort = false;
            return;
        }

        if (this._onComplete) {
            this._onComplete(0, this._receivedLength - 1);
        }
    }

    _onWebSocketMessage(e) {
        if (e.data instanceof ArrayBuffer) {
            this._dispatchArrayBuffer(e.data);
        } else if (e.data instanceof Blob) {
            let reader = new FileReader();
            reader.onload = () => {
                this._dispatchArrayBuffer(reader.result);
            };
            reader.readAsArrayBuffer(e.data);
        } else {
            let info = {code: -1, msg: 'Unsupported WebSocket message type: ' + e.data.constructor.name};

            if (this._onError) {
                this._onError(LoaderErrors.EXCEPTION, info);
            } else {
                throw new RuntimeException(info.msg);
            }
        }
    }

    _dispatchArrayBuffer(arraybuffer) {
        let chunk = arraybuffer;
        let byteStart = this._receivedLength;
        this._receivedLength += chunk.byteLength;

        if (this.arrivalDataCallback) {
            this.arrivalDataCallback(chunk, byteStart, this._receivedLength);
        }
    }

    _onWebSocketError(e) {
        let info = {
            code: e.code,
            msg: e.message
        };

        if (this._onError) {
            this._onError(LoaderErrors.EXCEPTION, info);
        } else {
            throw new RuntimeException(info.msg);
        }
    }

}