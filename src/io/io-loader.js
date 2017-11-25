/**
* 处理range的静态函数
* author songguangyu
* email 522963130@qq.com
*/

import FetchLoader from './fetch';
import RangeLoader from './xhr-range';
import WebsocketLoader from './websocket';
import MozChunkLoader from './xhr-moz-chunk';
import {CustEvent} from 'chimee-helper-events';

/**
 * Ioloader 处理io的调用器 缓存多余数据
 * @class Ioloader
 * @param  {object} video config
 */
export default class Ioloader extends CustEvent {

	constructor (config) {
		super();
		this.loader = null;
		this.config = {};
		Object.assign(this.config, config);
		this.bufferSize = 1024 * 1024 * 3; // initial size: 3MB
		this.cacheBuffer = new ArrayBuffer(this.bufferSize);
		this.cacheRemain = 0;
		this.stashByteStart = 0;
		this.enableStash = true;
		this.stashSize = this.config.stashSize || 1024 * 384;
		this.resumeFrom = 0;
		this.currentRange = {};
		this.totalReceive = 0;
		this.seekPonit = 0;
		this.timer = null;
		this.heartBeatInterval = null;
		this.preTotalReceive = 0;
    this.seekLock = false;
		this.webSocketURLReg = /wss?:\/\/(.+?)\//;
		this.selectLoader();
		this.bindEvent();
	}

	/**
	* 自动选择io处理器
	*/
	selectLoader () {
		const config = this.config;
		const url = this.config.src;
		if(this.webSocketURLReg.test(url)) {
			this.loader = new WebsocketLoader(url, config, this.queryHandle);
		}else if(FetchLoader.isSupport()) {
			this.loader = new FetchLoader(url, config, this.queryHandle);
		} else if(MozChunkLoader.isSupport()) {
			this.loader = new MozChunkLoader(url, config, this.queryHandle);
		} else if(RangeLoader.isSupport()) {
			this.loader = new RangeLoader(url, config, this.queryHandle);
		}
		this.loader.arrivalDataCallback = this.onLoaderChunkArrival.bind(this);
	}
	/**
	* 绑定事件
	*/
	bindEvent () {
		this.loader.on('end', ()=> {
			const buffer = this.cacheBuffer.slice(0, this.cacheRemain);
			this.arrivalDataCallback(buffer, this.stashByteStart);
			this.emit('end');
		});
		this.loader.on('error', (handle)=> {
			this.emit('error', handle.data);
		});
	}
	/**
	* 数据接收器
	* @param  {arrayBuffer} chunk data
	* @param  {number} chunk byte postion
	*/
	onLoaderChunkArrival (chunk, byteStart, keyframePoint) {
		if(this.seekLock && !keyframePoint) {
      return;
		}
		if(keyframePoint) {
			this.seekPonit = keyframePoint;
			this.seekLock = false;
		}
		if(this.arrivalDataCallback) {
			this.totalReceive += chunk.byteLength;

			if (this.cacheRemain === 0 && this.stashByteStart === 0) {
          // This is the first chunk after seek action
         this.stashByteStart = byteStart;
      }
      if (this.cacheRemain + chunk.byteLength <= this.stashSize) {
          // 小于cache大小 则看做数据太小 进行缓存 不进行下发
        const stashArray = new Uint8Array(this.cacheBuffer, 0, this.stashSize);
        stashArray.set(new Uint8Array(chunk), this.cacheRemain);
        this.cacheRemain += chunk.byteLength;
      } else { // 大于cache大小的 则把数据放入播放器 溢出数据进行缓存
        let stashArray = new Uint8Array(this.cacheBuffer, 0, this.bufferSize);
        if (this.cacheRemain > 0) {
					const buffer = this.cacheBuffer.slice(0, this.cacheRemain);
          let consumed = 0;
          if(this.seekPonit) {
          	consumed = this.arrivalDataCallback(buffer, this.stashByteStart, this.seekPonit);
          	this.seekPonit = 0;
          } else {
          	consumed = this.arrivalDataCallback(buffer, this.stashByteStart);
          }

          if (consumed < buffer.byteLength) {
            if (consumed > 0) {
              const remainArray = new Uint8Array(buffer, consumed);
              stashArray.set(remainArray, 0);
              this.cacheRemain = remainArray.byteLength;
              this.stashByteStart += consumed;
            }
          } else {
            this.cacheRemain = 0;
            this.stashByteStart += consumed;
          }
          if (this.cacheRemain + chunk.byteLength > this.bufferSize) {
            this.expandBuffer(this.cacheRemain + chunk.byteLength);
            stashArray = new Uint8Array(this.cacheBuffer, 0, this.bufferSize);
          }
          stashArray.set(new Uint8Array(chunk), this.cacheRemain);
          this.cacheRemain += chunk.byteLength;
        } else {
          let consumed = 0;
          if(this.seekPonit) {
          	consumed = this.arrivalDataCallback(chunk, byteStart, this.seekPonit);
          	this.seekPonit = 0;
          } else {
          	consumed = this.arrivalDataCallback(chunk, byteStart);
          }
          if (consumed < chunk.byteLength) {
            const remain = chunk.byteLength - consumed;
            if (remain > this.bufferSize) {
              this.expandBuffer(remain);
              stashArray = new Uint8Array(this.cacheBuffer, 0, this.bufferSize);
            }
            stashArray.set(new Uint8Array(chunk, consumed), 0);
            this.cacheRemain += remain;
            this.stashByteStart = byteStart + consumed;
          }
        }
      }
		}
	}
	/**
	* 清空缓存buffer
	*/
	initCacheBuffer () {
		this.cacheRemain = 0;
		this.cacheBuffer = new ArrayBuffer(this.bufferSize);
	}

	/**
	* 动态扩展buffer存储器大小
	* @param  {number} chunk byte size
	*/
	expandBuffer (expectedBytes) {
		let bufferNewSize = this.bufferSize;
		// while (bufferNewSize < expectedBytes) {
    //   bufferNewSize *= 2;
    // }
		if(bufferNewSize < expectedBytes) {
			bufferNewSize = expectedBytes;
		}
    this.cacheBuffer = new ArrayBuffer(bufferNewSize);
    this.bufferSize = bufferNewSize;
	}

	/**
	* 暂停
	*/
	pause () {
		this.loader.pause();
	}

	/**
	* 打开连接
	*/
	open (startBytes, keyframePoint) {
		this.loader.open({from: startBytes || 0, to: -1}, keyframePoint);
		this.heartbeat();
	}

	/**
	* 心跳
	*/
	heartbeat () {
		window.clearInterval(this.heartBeatInterval);
		this.heartBeatInterval = setInterval(()=>{
			this.emit('heartbeat', {
				speed: this.totalReceive - this.preTotalReceive,
				totalReceive: this.totalReceive
			});
			this.preTotalReceive = this.totalReceive;
		}, 1000);
	}

	/**
	* 重新播放
	*/
	resume () {
		this.paused = false;
		const bytes = this.totalReceive;
		this.open(bytes);
  }

  /**
	* seek
	*/
  seek (bytes, dropCache, keyframePoint) {
		this.totalReceive = bytes;
		this.preTotalReceive = bytes;
		this.initCacheBuffer();
		this.cacheRemain = 0;
		this.stashByteStart = 0;
		this.seekLock = true;
  	this.open(bytes, keyframePoint);
  }

	/**
	* destory
	*/
	destroy () {
		this.pause();
		window.clearInterval(this.heartBeatInterval);
		this.heartBeatInterval = null;
	}
}
