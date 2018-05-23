import {CustEvent} from 'chimee-helper-events';
import Log from 'chimee-helper-log';
import {ERRORNO} from '$const';
import {PLAYER_EVENTS} from '../player-events';

export default class MSEController extends CustEvent {

  /**
   * Mediasource 控制层
   * @class Mediasource
   * @param {Element} videoElement
   * @param {object} config
   */
  constructor (videoElement, config) {
    super();
    this.video = videoElement;
    this.config = config;
    this.tag = 'mse-controller';
    this.e = {
      onSourceOpen: this.onSourceOpen.bind(this),
      onSourceEnded: this.onSourceEnded.bind(this),
      onSourceClose: this.onSourceClose.bind(this),
      onSourceBufferError: this.onSourceBufferError.bind(this)
    };
    this.hasVideo = true;
    this.hasAudio = true;
    this.removeRangesList = {
      video: [],
      audio: []
    };
    this.removeBucketing = false;
    this.timer = {
      video: null,
      audio: null
    };
    this.queue = {
      video: [],
      audio: []
    };
    this.sourceBuffer = {
      video: null,
      audio: null
    };
    this.mimeCodec = {
      video: null,
      audio: null
    };
    this.sourceBufferEvent();
    this.complete = false;
  }

  /**
   * mediaSource init
   * @param {Object} mediaInfo
   */
  init (mediaInfo) {
    this.emit('player-event', {type: PLAYER_EVENTS.MEDIA_INFO, ts: Date.now()});
    if (this.mediaSource) {
      Log.Error(this.tag, 'MediaSource has been attached to an HTMLMediaElement!');
      this.emit('error', {errno: ERRORNO.MEDIASOURCE_ERROR, errmsg: 'MediaSource has been attached to an HTMLMediaElement!'});
      return;
    }

    if(mediaInfo.hasAudio) {
      this.mimeCodec['audio'] = `audio/mp4; codecs="${mediaInfo.audioCodec}"`;
    } else {
      this.hasAudio = false;
    }
    if(mediaInfo.hasVideo) {
      this.mimeCodec['video'] = `video/mp4; codecs="${mediaInfo.videoCodec}"`;
    } else {
      this.hasVideo = false;
    }
    const ms = this.mediaSource = new window.MediaSource();
    ms.addEventListener('sourceopen', this.e.onSourceOpen);
    ms.addEventListener('sourceended', this.e.onSourceEnded);
    ms.addEventListener('sourceclose', this.e.onSourceClose);
  }

  /**
   * mediaSource open
   */
  onSourceOpen () {
    Log.verbose(this.tag, 'MediaSource onSourceOpen');
    this.mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);
    if(this.hasAudio) {
      this.addSourceBuffer('audio');
    }
    if(this.hasVideo) {
      this.addSourceBuffer('video');
    }
    if(this.hasQueueList()) {
      this.doUpdate();
    }
    this.emit('source_open');
  }

  /**
   * addSourceBuffer
   * @param {String} tag type
   */
  addSourceBuffer (type) {
    this.sourceBuffer[type] = this.mediaSource.addSourceBuffer(this.mimeCodec[type]);
    Log.verbose(this.tag, 'add sourcebuffer ' + type);
    const sb = this.sourceBuffer[type];
    sb.addEventListener('error', this.e.onSourceBufferError);
    sb.addEventListener('abort', () => Log.verbose(this.tag, 'sourceBuffer: abort'));
    sb.addEventListener('updateend', () => {
      if(!this.sourceBuffer) {
        return;
      }
      if(this.hasRemoveList()) {
        if(this.removeRangesList.video.length) {
          this.cleanRangesList('video');
        }
        if(this.removeRangesList.audio.length) {
          this.cleanRangesList('audio');
        }
      } else if(this.hasQueueList()) {
        this.doUpdate();
      } else if(this.complete && !this.sourceBuffer[type].updating) {
        this.endOfStream();
      }
      this.emit('updateend');
    });
  }

  hasRemoveList () {
    return this.removeRangesList.video.length || this.removeRangesList.audio.length;
  }

  hasQueueList () {
    return this.queue.video.length || this.queue.audio.length;
  }

   /**
   * addSourceBuffer
   */
  doUpdate () {
    for(const type in this.queue) {
      if(this.queue[type].length > 0 && !this.sourceBuffer[type].updating) {
        const data = this.queue[type].shift();
        this.appendBuffer(data, type);
      }
    }
  }

  /**
   * sourceBuffer event
   */
  sourceBufferEvent () {
    this.on('mediaSegment', (handler)=> {
      const data = handler.data;
      const type = data.type;
      this.emit('player-event', {type: PLAYER_EVENTS.MEDIA_SEGMENT, byteLength: data.data.byteLength, ts: Date.now()});
      if(this.needCleanupSourceBuffer(type)) {
        this.doCleanupSourceBuffer(type);
      }
      // if(!this.sourceBuffer[type] || (this.sourceBuffer[type].updating || this.queue[type].length > 0)) {
      //   this.queue[type].push(data.data);
      // } else {
      //   this.appendBuffer(data.data, type);
      // }
      this.queue[type].push(data.data);
      if(this.sourceBuffer[type] && !this.hasRemoveList()) {
        this.doUpdate();
      }
    });

    this.on('mediaSegmentInit', (handler)=> {
      this.emit('player-event', {type: PLAYER_EVENTS.MEDIA_SEGMENT_INIT, ts: Date.now()});
      const data = handler.data;
      const type = data.type;
      // if (!this.sourceBuffer[type] || (this.sourceBuffer[type].updating || this.queue[type].length > 0)) {
      //   this.queue[type].push(data.data);
      // } else {
      //  this.appendBuffer(data.data, type);
      // }
      this.queue[type].push(data.data);
    });
  }

  /**
   * need clean sourcebuffer
   * @param {String} tag type
   */
  needCleanupSourceBuffer (type) {
    const currentTime = this.video.currentTime;

    // const sb = this.sourceBuffer[type];
    // const buffered = sb.buffered;
    const buffered = this.video.buffered;
    if (buffered.length >= 1) {
      if (currentTime - buffered.start(0) >= this.config.autoCleanupMaxBackwardDuration) {
        return true;
      }
    }
    return false;
  }

  /**
   * clean buffer
   * @param {String} tag type
   */
  doCleanupSourceBuffer (type) {
    const currentTime = this.video.currentTime;
    const sb = this.sourceBuffer[type];
    const buffered = sb.buffered;
    let doRemove = false;
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if(start <= currentTime && currentTime < end + 3) {
        if (currentTime - start >= this.config.autoCleanupMaxBackwardDuration) {
          doRemove = true;
          const removeEnd = currentTime - this.config.autoCleanupMinBackwardDuration;
          this.removeRangesList[type].push({start, end: removeEnd});
        }
      }
    }
    if(doRemove && !this.sourceBuffer[type].updating) {
      this.cleanRangesList(type);
    }
  }

  /**
   * clean bufferlist
   * @param {String} tag type
   */
  cleanRangesList (type) {
    if (this.sourceBuffer[type].updating) {
      return;
    }
    const sb = this.sourceBuffer[type];
    while (this.removeRangesList[type].length && !sb.updating) {
      const ranges = this.removeRangesList[type].shift();
      sb.remove(ranges.start, ranges.end);
    }
  }

  /**
   * appendBuffer
   * @param {Object} data
   * @param {String} tag type
   */
  appendBuffer (data, type) {
    if(!this.sourceBuffer[type]) {
      return;
    }
    try {
      this.sourceBuffer[type].appendBuffer(data.buffer);
    } catch (e) {
      const removeEnd = this.video.currentTime - 3;
      console.log('removeEnd', removeEnd);
      if(removeEnd > 0) {
        for(const t in this.sourceBuffer) {
          this.sourceBuffer[t].remove(0, removeEnd);
        }
      }
      this.queue[type].unshift(data);
      // 清理缓存
      setTimeout(this.doUpdate.bind(this), 100);
      console.error(e);
      // if(e.code === 22) {
      //   // chrome can cache about 350M
      //   Log.verbose(this.tag, 'MediaSource bufferFull');
      //   this.emit('bufferFull');
      // } else {
      //   // this.emit('error', {errno: ERRORNO.APPENDBUFFER_ERROR, errmsg: e});
      // }
    }
  }

  /**
   * sourcebuffer end
   */
  onSourceEnded () {
    Log.verbose(this.tag, 'MediaSource onSourceEnded');
  }

  /**
   * sourcebuffer close
   */
  onSourceClose () {
    Log.verbose(this.tag, 'MediaSource onSourceClose');
    if (this.mediaSource && this.e !== null) {
      this.mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);
      this.mediaSource.removeEventListener('sourceended', this.e.onSourceEnded);
      this.mediaSource.removeEventListener('sourceclose', this.e.onSourceClose);
    }
  }

   /**
   * sourcebuffer error
   * @param {Object} evnet
   */
  onSourceBufferError (e) {
    this.emit('error', {errnono: ERRORNO.SOURCEBUFFER_ERROR, errmsg: e.message});
    Log.error(this.tag, `SourceBuffer Error: ${e}`);
  }

  /**
   * seek
   */
  seek () {
    for (const type in this.sourceBuffer) {
      const sb = this.sourceBuffer[type];
      if(!sb) {
        continue;
      }
      if(this.mediaSource.readyState === 'open') {
        try {
          sb.abort();
        } catch (e) {
          this.emit('error', {errno: ERRORNO.SBABORT_ERROR, errmsg: e});
          Log.error(this.tag, e.message);
        }
      }
      this.queue[type] = [];
      for (let i = 0; i < sb.buffered.length; i++) {
        const start = sb.buffered.start(i);
        const end = sb.buffered.end(i);
        this.removeRangesList[type].push({start, end});
      }
      if (!sb.updating) {
        this.cleanRangesList(type);
      }
    }
  }

  /**
   * resume
   */
  resume () {
    this.doUpdate();
  }

  /**
   * pause
   */
  pause () {
    // this.endOfStream();
  }

  endOfStream () {
    if (this.mediaSource) {
      const ms = this.mediaSource;
      this.complete = true;
      const sb = this.sourceBuffer;
      if(sb.video && sb.video.updating || sb.audio && sb.audio.updating) {
        return;
      } else {
        if (ms.readyState === 'open') {
          try {
            ms.endOfStream();
            this.complete = false;
          } catch (error) {
            Log.verbose(this.tag, error);
            this.emit('error', {errno: ERRORNO.ENDOFSTREAM_ERROR, errmsg: error});
          }
        }
      }
    }
  }

  /**
   * destroy
   */
  destroy () {
    if (this.mediaSource) {
      const ms = this.mediaSource;
      // pending segments should be discard
      this.queue = {
        video: [],
        audio: []
      };
      this.sourceBuffer = {
        video: null,
        audio: null
      };
      this.mimeCodec = {
        video: null,
        audio: null
      };
      // remove all sourcebuffers
      const sb = this.sourceBuffer;
      this.complete = false;
      this.endOfStream();
      if (sb) {
        if (ms.readyState !== 'closed') {
          ms.removeSourceBuffer(sb);
          sb.removeEventListener('error', this.e.onSourceBufferError);
          sb.removeEventListener('updateend', this.e.onSourceBufferUpdateEnd);
        }
        this.sourceBuffer = null;
      }
      ms.removeEventListener('sourceopen', this.e.onSourceOpen);
      ms.removeEventListener('sourceended', this.e.onSourceEnded);
      ms.removeEventListener('sourceclose', this.e.onSourceClose);
      this.mediaSource = null;
    }
    this.off('mediaSegmentInit');
    this.off('mediaSegment');
  }
}
