import {CustEvent} from 'chimee-helper';
import {Log} from 'chimee-helper';

export default class MSEController extends CustEvent {

  /**
   * mediasource 控制层
   * @class mediasource
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
    }
    this.sourceBuffer = {
      video: null,
      audio: null
    }
    this.mimeCodec = {
      video: null,
      audio: null
    }
  }

  /**
   * 初始化 控制层
   */
  init (mediaInfo) {
    if (this.mediaSource) {
      Log.Error(this.tag, 'MediaSource has been attached to an HTMLMediaElement!');
      throw new Error('MediaSource has been attached to an HTMLMediaElement!');
    }
    mediaInfo.data.videoCodec || (mediaInfo.data.videoCodec = 'avc1.640020');
    mediaInfo.data.audioCodec || (mediaInfo.data.audioCodec = 'mp4a.40.2');

    this.mimeCodec['video'] = `video/mp4; codecs="${mediaInfo.data.videoCodec}`;
    this.mimeCodec['audio'] = `video/mp4; codecs="${mediaInfo.data.audioCodec}`;

    const ms = this.mediaSource = new window.MediaSource();
    ms.addEventListener('sourceopen', this.e.onSourceOpen);
    ms.addEventListener('sourceended', this.e.onSourceEnded);
    ms.addEventListener('sourceclose', this.e.onSourceClose);
    // this.sourceBuffer.updating = true;
    this.sourceBufferEvent();
  }

  /**
   * mediaSource open
   */
  onSourceOpen () {
    Log.verbose(this.tag, 'MediaSource onSourceOpen');
    this.mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);
    this.addSourceBuffer('video');
    this.addSourceBuffer('audio');
    this.emit('source_open');
    // this.sourceBuffer.updating = false;
  }

  addSourceBuffer(type) {
    this.sourceBuffer[type] = this.mediaSource.addSourceBuffer(this.mimeCodec[type]);
    Log.verbose(this.tag, 'add sourcebuffer '+ type);
    const sb = this.sourceBuffer[type];
    sb.addEventListener('error', this.e.onSourceBufferError);
    sb.addEventListener('abort', () => Log.verbose(this.tag, 'sourceBuffer: abort'));
    sb.addEventListener('updateend', () => {
      //if(this.queue[type].length > 0) {
        if(!sb.updating) {
          if(this.needCleanupSourceBuffer(type)) {
            this.doCleanupSourceBuffer(type);
          } else {
            const data = this.queue[type].shift();
            this.appendBuffer(data, type);
          }
        }
      //}
      this.emit('updateend');
    });
    this.doUpdate(type);
  }

  doUpdate(type) {
    clearTimeout(this.timer[type]);
    if(this.queue[type].length > 0) {
      const data = this.queue[type].shift();
      this.appendBuffer(data, type);
    } else {
      this.timer[type] = setTimeout(()=>{
        this.doUpdate(type);
      }, 100)
    }
  }

  /**
   * sourceBuffer 事件
   */
  sourceBufferEvent () {
    this.on('mediaSegment', (handler)=> {
      const data = handler.data;
      const type = data.type;

      if(!this.sourceBuffer[type] || (this.sourceBuffer[type].updating || this.queue[type].length > 0)) {
        this.queue[type].push(data.data);
      } else {
        this.appendBuffer(data.data, type);
      }
    });

    this.on('mediaSegmentInit', (handler)=> {
      const data = handler.data;
      const type = data.type;
      if (!this.sourceBuffer[type] || (this.sourceBuffer[type].updating || this.queue[type].length > 0)) {
        this.queue[type].push(data.data);
      } else {
       this.appendBuffer(data.data, type);
      }
    });
  }

  /**
   * 是否需要清除sourcebuffer 里的buffer
   */
  needCleanupSourceBuffer (type) {
    const currentTime = this.video.currentTime;

    const sb = this.sourceBuffer[type];
    const buffered = sb.buffered;

    if (buffered.length >= 1) {
        if (currentTime - buffered.start(0) >= this.config.autoCleanupMaxBackwardDuration) {
            return true;
        }
        for (let i = 0; i < buffered.length; i++) {
          const start = buffered.start(i);
          const end = buffered.end(i);
          if( !(currentTime+3 > start &&  currentTime < end+3)) {
            return true;
          }
        }
    }
    return false;
  }

  /**
   * 清除buffer
   */
  doCleanupSourceBuffer (type) {
    Log.verbose(this.tag, 'docleanBuffer');
    const currentTime = this.video.currentTime;
    const sb = this.sourceBuffer[type];
    const buffered = sb.buffered;
    let doRemove = false;
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if(start < currentTime && currentTime < end) {
        if (start <= currentTime && currentTime < end + 3) {
          if (currentTime - start >= this.config.autoCleanupMaxBackwardDuration) {
            doRemove = true;
            const removeEnd = currentTime - this.config.autoCleanupMinBackwardDuration;
            this.removeRangesList[type].push({start, end: removeEnd});
          }
        } else if (end < currentTime) {
          doRemove = true;
          this.removeRangesList[type].push({start, end});
        }
      } else {
        doRemove = true;
        this.removeRangesList[type].push({start, end});
      }

      
    }
    if(doRemove && !this.sourceBuffer[type].updating) {
      this.cleanRangesList(type);
    }
  }

  /**
   * 清除bufferlist
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
   * 往sourcebuffer里添加数据
   */
  appendBuffer (data, type) {
    try {
      this.sourceBuffer[type].appendBuffer(data.buffer);
    }catch(e) {
      if(e.code === 22) {
        // chrome 大概会有350M
        Log.verbose(this.tag, 'MediaSource bufferFull');
        this.emit('bufferFull');
      }
    }
  }

  /**
   * sourcebuffer 结束
   */
  onSourceEnded () {
    Log.verbose(this.tag, 'MediaSource onSourceEnded');
  }

  /**
   * sourcebuffer 关闭
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
   * sourcebuffer 错误
   */
  onSourceBufferError (e) {
    console.log(e);
    // Log.info(e);
    Log.error(this.tag, `SourceBuffer Error: ${e}`);
  }

  /**
   * seek
   */
  seek () {

  }

  /**
   * 销毁
   */
  destroy () {
    if (this.mediaSource) {
        const ms = this.mediaSource;
        // pending segments should be discard
        this.queue = [];
        // remove all sourcebuffers
        const sb = this.sourceBuffer;
        if (sb) {
            if (ms.readyState !== 'closed') {
                ms.removeSourceBuffer(sb);
                sb.removeEventListener('error', this.e.onSourceBufferError);
                sb.removeEventListener('updateend', this.e.onSourceBufferUpdateEnd);
            }
            this.sourceBuffer = null;
        }
      if (ms.readyState === 'open') {
          try {
              ms.endOfStream();
          } catch (error) {
              Log.e(this.tag, error.message);
          }
      }
      ms.removeEventListener('sourceopen', this.e.onSourceOpen);
      ms.removeEventListener('sourceended', this.e.onSourceEnded);
      ms.removeEventListener('sourceclose', this.e.onSourceClose);
      this.mediaSource = null;
    }

    if (this._mediaElement) {
        this._mediaElement.src = '';
        this._mediaElement.removeAttribute('src');
        this._mediaElement = null;
    }
    if (this._mediaSourceObjectURL) {
        window.URL.revokeObjectURL(this._mediaSourceObjectURL);
        this._mediaSourceObjectURL = null;
    }
  }
}
