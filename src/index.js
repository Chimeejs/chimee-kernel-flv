import MseContriller from './core/mse-controller';
import Transmuxer from './core/transmuxer';
import defaultConfig from './config';
import {CustEvent, throttle, deepAssign, Log, UAParser, isNumber} from 'chimee-helper';

/**
 * flv controller
 * @export
 * @class Flv
 */
export default class Flv extends CustEvent {

  static isSupport () {
    const parser = new UAParser();
    const info = parser.getBrowser();
    if(info.name === 'Safari' && parseInt(info.major) < 10) {
      return false;
    }
    if(window.MediaSource && window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.640020,mp4a.40.2"')) {
      return true;
    } else {
      return false;
    }
  }

  static get version () {
    return __VERSION__;
  }

  /**
	 * flv Wrapper
	 * @param {any} wrap videoElement
	 * @param {any} option
	 * @class Flv
	 */
	constructor (videodom, config) {
    super();
    this.tag = 'flv-player';
    this.video = videodom;
    this.box = 'flv';
    this.timer = null;
    this.seekTimer = null;
    this.config = deepAssign({}, defaultConfig, config);
    this.requestSetTime = false;
    this.throttle = null;
    this.bindEvents();
    this.attachMedia();
  }
  /**
   * internal set currentTime
   * @memberof Flv
   */
  internalPropertyHandle () {
    if(!Object.getOwnPropertyDescriptor) {
      return;
    }
    const _this = this;
    const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');

    Object.defineProperty(this.video, 'currentTime', {
      get: ()=> {
        return time.get.call(_this.video);
      },
      set: (t)=> {
        if(!_this.currentTimeLock) {
          throw new Error('can not set currentTime by youself');
        } else {
          return time.set.call(_this.video, t);
        }
      }
    });
  }

  /**
   * bind events
   * @memberof Flv
   */
  bindEvents () {
    if(this.video) {
      this.video.addEventListener('canplay', () => {
        if(this.config.isLive) {
          this.video.play();
        }
        if(this.config.lockInternalProperty) {
          this.internalPropertyHandle();
        }
      });
    }
  }

  /**
   * new mediaSource
   * @memberof Flv
   */
  attachMedia () {
    this.mediaSource = new MseContriller(this.video, this.config);

    this.mediaSource.on('error', (errorMessage)=>{
      this.emit('error', errorMessage.data);
      if(this.transmuxer) {
        this.transmuxer.pause();
      }
    });
    this.mediaSource.on('bufferFull', ()=>{
      this.pauseTransmuxer();
    });
    this.mediaSource.on('updateend', ()=>{
      this.onmseUpdateEnd();
    });
  }

  /**
   * load
   * @param {string} video url
   * @memberof Flv
   */
  load (src) {
    if(src) {
      this.config.src = src;
    }
    this.transmuxer = new Transmuxer(this.mediaSource, this.config, this.globalEvent);
    this.transmuxerEvent(this.transmuxer);
    this.transmuxer.loadSource();
  }

  transmuxerEvent (transmuxer) {
    const mediaSource = this.mediaSource;
    transmuxer.on('mediaSegment', (handle)=> {
      mediaSource.emit('mediaSegment', handle.data);
    });

    transmuxer.on('mediaSegmentInit', (handle)=> {
      mediaSource.emit('mediaSegmentInit', handle.data);
    });

    transmuxer.on('error', (errorMessage)=> {
      this.emit('error', errorMessage.data);
      transmuxer.pause();
      mediaSource.pause();
    });

    transmuxer.on('end', (handle)=> {
      mediaSource.endOfStream();
    });

    transmuxer.on('heartbeat', (handle)=> {
      this.emit('heartbeat', handle.data);
    });

    transmuxer.on('mediaInfo', (mediaInfo)=> {
      if(!this.mediaInfo) {
        this.mediaInfo = mediaInfo;
        this.emit('mediaInfo', mediaInfo.data);
        mediaSource.init(mediaInfo.data);
        this.video.src = URL.createObjectURL(mediaSource.mediaSource);
        this.video.addEventListener('seeking', this._throttle.call(this));
      }
    });
  }

  _throttle () {
    this.throttle = throttle(this._seek.bind(this), 200, {leading: false});
    return this.throttle;
  }

  /**
   * seek in buffered
   * @param {number} seek time
   * @memberof Flv
   */
  isTimeinBuffered (seconds) {
    const buffered = this.video.buffered;
    for (let i = 0; i < buffered.length; i++) {
      const from = buffered.start(i);
      const to = buffered.end(i);
      if (seconds >= from && seconds < to) {
        return true;
      }
    }
    return false;
  }

  /**
   * get current buffer end
   * @memberof Flv
   */
  getCurrentBufferEnd () {
    const buffered = this.video.buffered;
    const currentTime = this.video.currentTime;
    let currentRangeEnd = 0;

    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (start <= currentTime && currentTime < end) {
        currentRangeEnd = end;
        return currentRangeEnd;
      }
    }
  }
  /**
   * _seek
   * @param {number} seek time
   * @memberof Flv
   */
  _seek (seconds) {
    this.currentTimeLock = true;
    let currentTime = isNumber(seconds) && !isNaN(seconds) ? seconds : this.video.currentTime;
    if(this.requestSetTime) {
      this.requestSetTime = false;
      this.currentTimeLock = false;
      return;
    }
    if(this.isTimeinBuffered(currentTime)) {
      if(this.config.alwaysSeekKeyframe) {
        const nearlestkeyframe = this.transmuxer.getNearestKeyframe(Math.floor(currentTime * 1000));
        if (nearlestkeyframe) {
          this.requestSetTime = true;
          this.video.currentTime = nearlestkeyframe.keyframetime / 1000;
        }
      }
    } else {
      Log.verbose(this.tag, 'do seek');
      this.transmuxer.pause();
      const nearlestkeyframe = this.transmuxer.getNearestKeyframe(Math.floor(currentTime * 1000));
      currentTime = nearlestkeyframe.keyframetime / 1000;
      this.seekTimer = setTimeout(()=>{
        this.mediaSource.seek(currentTime);
        this.transmuxer.seek(nearlestkeyframe);
      }, 100);
      this.requestSetTime = true;
      this.video.currentTime = currentTime;
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.currentTimeLock = false;
    return currentTime;
  }

  /**
   * mediaSource updateend
   * @memberof Flv
   */
  onmseUpdateEnd () {
    if (this.config.isLive) {
      return;
    }
    const currentBufferEnd = this.getCurrentBufferEnd();
    const currentTime = this.video.currentTime;
    if (currentBufferEnd >= currentTime + this.config.lazyLoadMaxDuration && this.timer === null) {
      Log.verbose(this.tag, 'Maximum buffering duration exceeded, suspend transmuxing task');
      this.pauseTransmuxer();
    }
  }
  /**
   * heartbeat
   * @memberof Flv
   */
  heartbeat () {
    const currentTime = this.video.currentTime;
    const buffered = this.video.buffered;
    let needResume = false;
    for (let i = 0; i < buffered.length; i++) {
      const from = buffered.start(i);
      const to = buffered.end(i);
      if (currentTime >= from && currentTime < to) {
        if (currentTime >= to - this.config.lazyLoadRecoverDuration) {
          needResume = true;
        }
        break;
      }
    }

    if (needResume) {
      window.clearInterval(this.timer);
      this.timer = null;
      Log.verbose(this.tag, 'Continue loading from paused position');
      this.transmuxer.resume();
      this.mediaSource.resume();
    }
  }

  /**
   * pause transmuxer
   * @memberof Flv
   */
  pauseTransmuxer () {
    this.transmuxer.pause();
    this.mediaSource.pause();
    if(!this.timer) {
      this.timer = setInterval(this.heartbeat.bind(this), 1000);
    }
  }

  resume () {
    this._seek(0);
  }

  /**
   * destroy
   * @memberof Flv
   */
  destroy () {
    window.clearInterval(this.timer);
    window.clearInterval(this.seekTimer);
    this.video.removeEventListener('seeking', this.throttle);
    if(this.video) {
      URL.revokeObjectURL(this.video.src);
      this.video.src = '';
      this.video.removeAttribute('src');
      if(this.transmuxer) {
        this.transmuxer.pause();
        this.transmuxer.destroy();
        this.transmuxer = null;
      }
      if(this.mediaSource) {
        this.mediaSource.destroy();
        this.mediaSource = null;
      }
    }
  }

  seek (seconds) {
    return this._seek(seconds);
  }

  play () {
    return this.video.play();
  }

  pause () {
    return this.video.pause();
  }

  refresh () {
    if(this.transmuxer && this.mediaSource) {
      this._seek(0);
    } else {
      Log.verbose(this.tag, 'transmuxer & mediaSource not ready');
    }
  }

  /**
   * stop stream load
   * @memberof Flv
   */
  stopLoad () {
    this.transmuxer && this.transmuxer.pause();
    this.mediaSource && this.mediaSource.pause();
  }
}
