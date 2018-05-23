/**
* fetch firfox 直播 点播
* author songguangyu
* email 522963130@qq.com
*/
import handleQuery from './handleQuery';
import {CustEvent} from 'chimee-helper-events';
import Log from 'chimee-helper-log';
import {ERRORNO} from '$const';
/**
 * FetchLoader
 * @class FetchLoader
 * @param {string} video url
 * @param  {object} range.from range.to
 */
export default class FetchLoader extends CustEvent {

	/**
   * broswer is support moz-chunk
   */
	static isSupport () {
		if(self.fetch && self.ReadableStream) {
			return true;
		} else {
			return false;
		}
	}

	constructor (src, config) {
		super();
		this.tag = 'fetch';
		this.fetching = false;
		this.config = config;
		this.range = {
			from: 0,
			to: 524288
		};
		this.src = src;
		this.totalRange = null;
		this.block = 524288;
		this.reader = null;
		this.requestAbort = false;
		this.arrivalDataCallback = null;
		this.bytesStart = 0;
		this.heartbeat = null;
	}
	/**
   * if don't need range don't set
   * @param  {object} range.from range.to
   */
	open (range, keyframePoint) {
		this.requestAbort = false;
		const reqHeaders = new Headers();
		const r = range || {from: 0, to: -1};
		if(!this.config.isLive) {
			this.range.from = r.from;
			this.range.to = r.to;
			const queryResult = handleQuery(r, this.config);
			if(typeof queryResult === 'string') {
				this.src = this.config.src + queryResult;
			} else {
				for(const i in queryResult) {
					reqHeaders.append(i, queryResult[i]);
				}
			}
		}
		if (keyframePoint) {
			this.bytesStart = 0;
		}
		this.bytesStart = range.from;
		const params = {
			method: 'GET',
			headers: reqHeaders,
			mode: 'cors',
			cache: 'default',
			referrerPolicy: 'no-referrer-when-downgrade'
		};

		// kwai http建联时间统计
		const receiveStart = Date.now();
		fetch(this.src, params).then((res) => {
			this.emit('performance', {
				type: 'receive-first-package-duration',
				value: Date.now() - receiveStart
			});
			if (res.ok) {
				const reader = res.body.getReader();
				return this.pump(reader, keyframePoint);
			}
		}).catch((e)=>{
			this.emit('error', {errno: ERRORNO.NET_ERROR, errmsg: e.toString()});
		});
	}

	/**
   * pause video
   */
	pause () {
		this.requestAbort = true;
	}

	/**
   * pump data
   */
	pump (reader, keyframePoint) { // ReadableStreamReader
    return reader.read().then((result) => {
        if (result.done) {
					this.emit('end');
					Log.verbose(this.tag, 'load end');
        } else {
        	if (this.requestAbort === true) {
        		this.requestAbort = false;
        		return reader.cancel();
        	}
        	const chunk = result.value.buffer;
        	if(this.arrivalDataCallback) {
        		this.arrivalDataCallback(chunk, this.bytesStart, keyframePoint);
        		this.bytesStart += chunk.byteLength;
        	}
			setTimeout(() => {this.pump(reader);}, 0);
        }
      }).catch((e) => {
      	this.emit('error', {errno: ERRORNO.NET_ERROR, errmsg: e.message});
      });
	}
}
