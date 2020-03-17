import MseContriller from './core/mse-controller';
import Transmuxer from './core/transmuxer';
import defaultConfig from './config';
import {CustEvent, throttle, deepAssign, Log, UAParser, isNumber} from 'chimee-helper';
import PlayerLogger from './player-logger';
import { PLAYER_EVENTS } from './player-events';

class FlvRealtimeBeaconBuilder {
  constructor(src) {
    this._resetForNewSession(src);
    this._resetForNewInterval();
  }

  _resetForNewSession(src) {
    this.currentPlaybackSpeed = 1.0;
    this.lastDownloadedBytes = 0.0;
    this.playUrl = src;
    this.domain = new URL(src).hostname;
    this.playStartTimestampMillis = new Date().getTime();
    this.lastVideoBuffered = { start: -1e9, end: -1e9 };
  }

  _resetForNewInterval() {
    this.currentPlaybackSpeedTimestamp = new Date().getTime();
    this.playbackSpeedStat = {
      '0.75x': 0,
      '1.25x': 0,
      '1.5x': 0
    };
    this.statTimestampMillis = new Date().getTime();
    this.bufferingCount = 0;
    this.bufferingDurationMillis = 0;
    // null indicates not buffering, non-null indicates buffering
    this.bufferingStartTimestampMillis = this.bufferingStartTimestampMillis ? new Date().getTime() : null;
    this.downloadedBytes = 0;
    this.audioBufferedMillis = 0;
    this.videoBufferedMillis = 0;
    this.demuxedDurationSec = 0;
    this.excessiveDataDroppedSec = 0;
    // block时缓冲区仍然有数据的情况
    this.blockCountWithBuffer = 0;
    this.bufferDuringBlockSum = 0;
  }

  videoBufferedUpdated(buffered) {
    if (buffered.length === 0) {
      return;
    }
    let start = buffered.start(buffered.length - 1);
    let end = buffered.end(buffered.length - 1);
    if (start > this.lastVideoBuffered.end + 1e-3) {
      this.demuxedDurationSec += end - start;
      this.lastVideoBuffered = { start, end };
    } else {
      this.demuxedDurationSec += Math.max(0, end - this.lastVideoBuffered.end);
      this.lastVideoBuffered.end = end;
    }
  }

  playbackSpeedChanged(newSpeed) {
    let EPS = 1e-3;
    let now = new Date().getTime();
    let accumulatedMs = now - this.currentPlaybackSpeedTimestamp;
    let speedKey = Math.abs(newSpeed - 0.75) < EPS ? '0.75x' :
                   Math.abs(newSpeed - 1.25) < EPS ? '1.25x' :
                   Math.abs(newSpeed - 1.5) < EPS ? '1.5x' : null;
    if (!speedKey) {
      // Some speeds, like "1x", are not counted
      return;
    }
    this.playbackSpeedStat[speedKey] += accumulatedMs;
    this.currentPlaybackSpeedTimestamp = new Date().getTime();
  }

  bufferingStarted (bufferedLength) {
    const BUFFERED_THRESHOLD = 0.3;
    ++this.bufferingCount;
    this.bufferingStartTimestampMillis = new Date().getTime();

    // 卡时缓冲区>300ms数量
    if(bufferedLength > BUFFERED_THRESHOLD) {
      this.bufferDuringBlockSum += bufferedLength;
      this.blockCountWithBuffer++;
    }
  }

  bufferingEnded() {
    let now = new Date().getTime();
    if (this.bufferingStartTimestampMillis != null) {
      // If this.bufferingStartTimestampMillis is null or undefined
      // Do not accumulated buffering duration
      this.bufferingDurationMillis += now - this.bufferingStartTimestampMillis;
    }
    this.bufferingStartTimestampMillis = null;
  }

  updateDownloadedBytes(newDownloadedBytes) {
    let newlyDownloaded = newDownloadedBytes - this.lastDownloadedBytes;
    this.downloadedBytes += newlyDownloaded;
    this.lastDownloadedBytes = newDownloadedBytes;
  }

  setAudioBufferedSec(audioBufferedSec) {
    this.audioBufferedMillis = Math.round(audioBufferedSec * 1000);
  }

  setVideoBufferedSec(videoBufferedSec) {
    this.videoBufferedMillis = Math.round(videoBufferedSec * 1000);
  }

  excessiveDataDropped(droppedSec) {
    this.excessiveDataDroppedSec += droppedSec;
  }

  buildAndStartNewInterval() {
    let now = new Date().getTime();
    let ongoingBufferingDuration = this.bufferingStartTimestampMillis == null ? 0 : now - this.bufferingStartTimestampMillis;
    let ongoingBufferingCount = this.bufferingStartTimestampMillis == null ? 0 : 1;
    let ret = {
      'play_url': this.playUrl,
      'domain': this.domain,
      'play_start_time': this.playStartTimestampMillis,
      'tick_start': this.statTimestampMillis,
      'tick_duration': now - this.statTimestampMillis,
      'block_count': this.bufferingCount,
      'buffer_time': this.bufferingDurationMillis + ongoingBufferingDuration,
      'kbytes_received': this.downloadedBytes >> 10,
      'played_video_duration': now - this.statTimestampMillis - (this.bufferingDurationMillis + ongoingBufferingDuration),
      'demuxed_video_duration': Math.round(this.demuxedDurationSec * 1000),
      'dropped_packet_duration': Math.round(this.excessiveDataDroppedSec * 1000),
      'a_buf_len': this.audioBufferedMillis,
      'v_buf_len': this.videoBufferedMillis,
      'speed_chg_metric': this.playbackSpeedStat,
      'block_count_with_buffer': this.blockCountWithBuffer,
      'buffer_during_block': this.blockCountWithBuffer > 0 ? Math.round(this.bufferDuringBlockSum / this.blockCountWithBuffer * 1000) : 0
    };
    this._resetForNewInterval();
    return ret;
  }
}

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
    this.checkBufferTimer = null;
    this.realtimeBeaconTimer = null;
    this.config = deepAssign({}, defaultConfig, config);
    this.requestSetTime = false;
    this.throttle = null;
    this.bindEvents();
    this.attachMedia();
    this.initLogger();
    console.log('kernel', Flv.version);
  }
  /**
   * 初始化事件处理器
   */
  initLogger () {
    this.logger = new PlayerLogger();
    this.logger.on('performance', (handle)=> {
      this.emit('performance', handle.data);
    });
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
      
      this._onVideoCanplay = this._onVideoCanplay.bind(this);
      this._onVideoWaiting = this._onVideoWaiting.bind(this);
      this._onVideoPlaying = this._onVideoPlaying.bind(this);
      this._onVideoTimeupdate = this._onVideoTimeupdate.bind(this);
      this.video.addEventListener('canplay', this._onVideoCanplay);
      this.video.addEventListener('waiting', this._onVideoWaiting);
      this.video.addEventListener('playing', this._onVideoPlaying);
      this.video.addEventListener('timeupdate', this._onVideoTimeupdate);
      this._lastBufferd = null;
      this.checkBufferTimer = setInterval(this._checkBuffer.bind(this), 200);
  }
}
  /**
   *  移除mediasource事件
   */
  unbindMediaSourceEvent (mediaSource) {
    mediaSource.off('error');
    mediaSource.off('bufferFull');
    mediaSource.off('updateend');
    mediaSource.off('player-event');
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
    this.mediaSource.on('player-event', (handle)=> {
      this.logger.record(handle.data);
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
    this.realtimeBeaconBuilder = new FlvRealtimeBeaconBuilder(this.config.src);
    this.realtimeBeaconTimer = setInterval(this._sendRealtimeBeacon.bind(this), 10000);
    this.transmuxer = new Transmuxer(this.mediaSource, this.config, this.globalEvent);
    this.transmuxerEvent(this.transmuxer);
    this.transmuxer.loadSource();
  }
  /**
   * 移除transmuxer事件
   * @param {} transmuxer 
   */
  unbindTransmuxerEvent (transmuxer) {
    transmuxer.off('mediaSegment');
    transmuxer.off('mediaSegmentInit');
    transmuxer.off('error');
    transmuxer.off('end');
    transmuxer.off('heartbeat');
    transmuxer.off('performance');
    transmuxer.off('mediaInfo');
    transmuxer.off('player-event');
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
      this.realtimeBeaconBuilder.updateDownloadedBytes(handle.data.totalReceive);
    });
    transmuxer.on('performance', (handle)=> {
      const {type, value} = handle.data;
      if (type === 'first-flv-to-mp4') {
        this.firstFlvToMp4 = this.firstFlvToMp4 || 0;
        this.firstFlvToMp4 += value;
        return;
      }
      if (type === 'receive-first-package-duration') {
        this.receiveFirstPAckageDuration = this.receiveFirstPAckageDuration || 0;
        this.receiveFirstPAckageDuration += value;
        return;
      }
      if (type === 'first-flv-package-duration') {
        this.firstFlvPackageDuration = this.firstFlvPackageDuration || 0;
        this.firstFlvPackageDuration += value;
      }
    });

    transmuxer.on('mediaInfo', (mediaInfo)=> {
      if(!this.mediaInfo) {
        this.mediaInfo = mediaInfo;
        this.emit('mediaInfo', mediaInfo.data);
        mediaSource.init(mediaInfo.data);
        this.video.src = URL.createObjectURL(mediaSource.mediaSource);
        this.video.addEventListener('seeking', this._throttle.call(this));
      } else {
        // kwai 多次media上报也扔出去（应对metadata切换）
        this.emit('mediaInfo', mediaInfo.data);
      }
    });
    transmuxer.on('player-event', (handle)=> {
      this.logger.record(handle.data);
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

  _getBufferEnd(buffered, currentTime) {
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
   * get current buffer end
   * @memberof Flv
   */
  getCurrentBufferEnd () {
    return this._getBufferEnd(this.video.buffered, this.video.currentTime);
  }

  /**
   * _seek
   * @param {number} seek time
   * @memberof Flv
   */
  _seek (seconds) {
    if(!this.transmuxer) return
    
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
    if (this.mediaSource.sourceBuffer.video) {
      this.realtimeBeaconBuilder.videoBufferedUpdated(this.mediaSource.sourceBuffer.video.buffered);
    }
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
   * Check buffer length regularly and apply various policies to avoid buffering
   * @memberof Flv
   */
  _checkBuffer() {
    const EPS = 1e-3;
    if (this.config.isLive) {
      // Live stream, try to maintain buffer between 3s and 8s
      // TODO make 3s and 8s configurable
      let currentBufferEnd = this.getCurrentBufferEnd();
      if (typeof currentBufferEnd === 'undefined') {
        // QUICKFIX:
        // if getCurrentBuffereEnd() is undefined, check if currentTime is in a gap,
        // and if it is jump to the latest buffered area
        
        const buffered = this.video.buffered;
        const lenBuffered = buffered.length;
        if (lenBuffered > 0 
            && buffered.start(lenBuffered - 1) > this.video.currentTime + EPS) {
          // In a gap, jump to latest buffered area
          Log.verbose('currentTime being in no-data GaP detected. Jumping to '
              + buffered.start(lenBuffered - 1));
          this.video.currentTime = buffered.start(lenBuffered - 1);
          currentBufferEnd = buffered.end(lenBuffered - 1);
        } else {
          // Not in a gap, noop
          return;
        }
      }
      const buffered = currentBufferEnd - this.video.currentTime;
      if (this._lastBufferd != null) {
        const changePlaybackRate = (toRate) => {
          Log.verbose('Change playback rate from ' + this.video.playbackRate + ' to ' + toRate + ', buffered:' + buffered);
          this.video.playbackRate = toRate;
          this.realtimeBeaconBuilder.playbackSpeedChanged(toRate);
        };
        if (this.video.playbackRate < 1 - EPS) {
          // Slowed down case. If buffer recovers to >= 5s, resume regular speed
          if (buffered > 5 - EPS) {
            changePlaybackRate(1.0);
          }
        } else if (this.video.playbackRate > 1 + EPS) {
          // Speeded up case. If buffer recovers to <= 5s, resume regular speed
          if (buffered < 5 + EPS) {
            changePlaybackRate(1.0);
          } else if (buffered > 8 + EPS) {
            // drop excessive data
            // Log.verbose('Dropping excessive data, buffer: ' + buffered);
            // this.realtimeBeaconBuilder.excessiveDataDropped(buffered - 5);
            // this.video.currentTime += buffered - 5;
          }
        } else {
          // Regular speed case. If buffer drops to < 3s or grows to > 6s, adjust speed accordingly
          // If buffer significantly grows to > 10s, keep 5s and drop excessive data
          if (buffered < 3 - EPS) {
            // changePlaybackRate(0.75);
          } else if (buffered > 8 + EPS) {
            // drop excessive data
            // Log.verbose('Dropping excessive data, buffer: ' + buffered);
            // this.realtimeBeaconBuilder.excessiveDataDropped(buffered - 5);
            // this.video.currentTime += buffered - 5;
          } else if (buffered > 6 + EPS) {
            // changePlaybackRate(1.25);
          }
        }
      }
      this._lastBufferd = buffered;
    }
  }

  /**
   * Emit realtime analystic data
   */
  _sendRealtimeBeacon() {
    if (this.mediaSource.sourceBuffer.audio) {
      let bufferEnd = this._getBufferEnd(
          this.mediaSource.sourceBuffer.audio.buffered,
          this.video.currentTime);
      this.realtimeBeaconBuilder.setAudioBufferedSec(bufferEnd - this.video.currentTime);
    }
    if (this.mediaSource.sourceBuffer.video) {
      let bufferEnd = this._getBufferEnd(
          this.mediaSource.sourceBuffer.video.buffered,
          this.video.currentTime);
      this.realtimeBeaconBuilder.setVideoBufferedSec(bufferEnd - this.video.currentTime);
    }
    let beacon = this.realtimeBeaconBuilder.buildAndStartNewInterval();
    this.emit('realtimeBeacon', beacon);
  }
  /**
   * ‘canplay’ event listener
   */
  _onVideoCanplay () {
    this.logger.record({type: PLAYER_EVENTS.CANPLAY, ts: Date.now()});
    if(this.config.isLive) {
      this.video.play();
    }
    if(this.config.lockInternalProperty) {
      this.internalPropertyHandle();
    }
  }

  /**
   * 'waiting' event listener
   */
  _onVideoWaiting () {
    if(this.video && !this.video.seeking) {
      let bufferedLength = 0;
      let buffered = this.video.buffered;
      if(buffered.length > 0) {
        bufferedLength = this.video.buffered.end(buffered.length - 1) - this.video.currentTime;
      }
      this.realtimeBeaconBuilder.bufferingStarted(bufferedLength);
    }
  }

  /**
   * 'playing' event listener
   */
  _onVideoPlaying() {
    let bufferedLength = 0;
    let buffered = this.video.buffered;
    // console.log(buffered.start(0), buffered.end(0), this.video.currentTime);
    for (var i = 0; i < buffered.length; i++) {
      if(buffered.start(i) - 0.1 <= this.video.currentTime && buffered.end(i) >= this.video.currentTime) {
        bufferedLength = buffered.end(i) - this.video.currentTime;
        break;
      }
    }
    this.logger.record({type: PLAYER_EVENTS.PLAYING, buffered: bufferedLength, ts: Date.now()});
    this.realtimeBeaconBuilder.bufferingEnded();
  }

  /**
   * 'timeupdate' event listener
   */
  _onVideoTimeupdate () {
    console.log('time update');
    this.video.removeEventListener('timeupdate', this._onVideoTimeupdate);
    this.logger.record({ type: PLAYER_EVENTS.TIMEUPDATE, ts: Date.now() });
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
    window.clearInterval(this.checkBufferTimer);
    if (this.realtimeBeaconTimer) {
      window.clearInterval(this.realtimeBeaconTimer);
      // Send last realtime beacon
      this._sendRealtimeBeacon();
      this.realtimeBeaconTimer = null;
    }
    this.video.removeEventListener('canplay', this._onVideoCanplay);
    this.video.removeEventListener('seeking', this.throttle);
    this.video.removeEventListener('waiting', this._onVideoWaiting);
    this.video.removeEventListener('playing', this._onVideoPlaying);
    this.video.removeEventListener('timeupdate', this._onVideoTimeupdate);
    if(this.video) {
      URL.revokeObjectURL(this.video.src);
      this.video.src = '';
      this.video.removeAttribute('src');
      if(this.transmuxer) {
        this.unbindTransmuxerEvent(this.transmuxer);
        this.transmuxer.pause();
        this.transmuxer.destroy();
        this.transmuxer = null;
      }
      if(this.mediaSource) {
        this.unbindMediaSourceEvent(this.mediaSource);
        this.mediaSource.destroy();
        this.mediaSource = null;
      }
    }
    this.logger.off('performance');
    this.logger = null;
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
    if (this.realtimeBeaconTimer) {
      // Send the last realtime beacon and clear timer
      window.clearInterval(this.realtimeBeaconTimer);
      this._sendRealtimeBeacon();
      this.realtimeBeaconTimer = null;
    }
  }
}
