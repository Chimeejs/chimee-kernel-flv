import IoLoader from '../io/io-loader';
import {CustEvent} from 'chimee-helper-events';
import work from 'webworkify-webpack';
import F2M from '../flv2fmp4';
import {ERRORNO} from '$const';
import {PLAYER_EVENTS} from '../player-events';
/**
 * Transmuxer controller
 * @class Transmuxer
 * @param {mediaSource} mediaSource
 * @param {object} config
 */
export default class Transmuxer extends CustEvent {
	constructor (mediaSource, config, globalEvent) {
		super();
		this.config = config || {};
		this.tag = 'transmuxer';
    this.loader = null;
    this.CPU = null;
    this.keyframePoint = false;
    this.w = null;
    if(this.config.webWorker) {
      this.onWorkMessage = this.onWorkMessage.bind(this);
      this.w = work(require.resolve('./transmuxer-worker'));
      this.w.addEventListener('message', this.onWorkMessage);
      this.w.postMessage(JSON.parse(JSON.stringify({cmd: 'init', data: config})));
    }
    this.lock = 0;
  }
  onWorkMessage (e) {
    this.parseCallback.call(this, e.data);
  }
   /**
   * instance ioloader
   */
	loadSource () {
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'loadSource'});
    } else {
      this.loader = new IoLoader(this.config);
      this.loader.arrivalDataCallback = this.arrivalDataCallback.bind(this);
      this.loaderBindEvent(this.loader);
      this.loader.open();
    }
  }
  /**
   * bindEvent
   */
  loaderBindEvent (loader) {
    loader.on('end', ()=> {
      this.emit('end');
    });
    loader.on('error', (handle)=> {
      this.emit('error', handle.data);
    });
    loader.on('heartbeat', (handle)=> {
      this.emit('heartbeat', handle.data);
    });
    this.loader.on('player-event', (handler)=> {
      this.emit('player-event', handler.data);
    });
  }
  /**
   * 解除事件绑定
   */
  loaderUnbindEvent (loader) {
    loader.off('end');
    loader.off('error');
    loader.off('heartbeat');
    loader.off('player-event');
  }
   /**
   * loader data callback
   * @param {arraybuffer} data
   * @param {number} bytestart
   * @param {keyframePoint} keyframe
   */
  arrivalDataCallback (data, byteStart, keyframePoint) {
    if(!this.CPU) {
      this.CPU = new F2M(this.config);
      this.CPU.onInitSegment = this.onRemuxerInitSegmentArrival.bind(this);
      this.CPU.onMediaSegment = this.onRemuxerMediaSegmentArrival.bind(this);
      this.CPU.onMediaInfo = this.onMediaInfo.bind(this);
      this.CPU.onCdnDropFrame = this.onCdnDropFrame.bind(this);
      this.CPU.on('error', (handle)=> {
        this.emit('error', {errno: ERRORNO.CODEC_ERROR, errmsg: handle.data});
      });
    }
    if(keyframePoint !== undefined) {
      this.CPU.seek(keyframePoint);
    }
    this.emit('player-event', {type: PLAYER_EVENTS.MEDIA_DEMUX_FLV, byteLength: data.byteLength, ts: Date.now()});
    const consumed = this.CPU.setflv(data);
    return consumed;
  }

  /**
   * loader data callback
   * @param {arraybuffer} data
   */
  parseCallback (data) {
    switch(data.cmd) {
      case 'mediaSegmentInit':
      this.emit('mediaSegmentInit', data.source);
      break;
      case 'mediaSegment':
      this.emit('mediaSegment', data.source);
      break;
      case 'mediainfo':
      this.mediaInfo = data.source;
      this.emit('mediaInfo', data.source);
      break;
      case 'end':
      this.emit('end');
      break;
      case 'error':
      this.emit('error', data.source);
      break;
      case 'player-event':
      this.emit('player-event', data.source);
      break;
      case 'heartbeat':
      this.emit('heartbeat', data.source);
      break;
      case 'cdnDropFrame':
      this.emit('cdnDropFrame', { dropAudio: data.source});
      break;
    }
  }

  /**
   * Demux mediaInfo
   *  @param {object} video message info
   */
  onMediaInfo (mediaInfo) {
    this.mediaInfo = mediaInfo;
    this.emit('mediaInfo', mediaInfo);
  }
  /**
   * cdn丢帧回调
   */
  onCdnDropFrame (len) {
    this.emit('cdnDropFrame', { dropAudio: len });
  }

  /**
   * remuxer init segment arrival
   * @param {arraybuffer} video data
   */
  onRemuxerInitSegmentArrival (video, audio) {
    this.emit('mediaSegmentInit', {
      type: 'video',
      data: video
    });
    if(audio) {
      this.emit('mediaSegmentInit', {
        type: 'audio',
        data: audio
      });
    }
  }

  /**
   * remuxer  segment arrival
   * @param {String} tag type
   * @param {arraybuffer} video data
   */
  onRemuxerMediaSegmentArrival (type, data) {
    this.emit('mediaSegment', {type, data});
  }

  /**
   * get video mediaInfo
   */
  getMediaInfo () {
    return this.mediaInfo;
  }

   /**
   * stop loader
   */
  pause () {
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'pause'});
    } else {
      this.loader.pause();
    }
  }

  /**
   * resume loader
   */
  resume () {
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'resume'});
    } else {
      this.loader.resume();
    }
  }
   /**
   * flv can seek
   */
  isSeekable () {
    return this.mediaInfo.hasKeyframesIndex;
  }
  /**
   * video seek
   * @param {object} 关键帧集合
   */
  seek (keyframe) {
    if(!this.isSeekable()) {
      this.emit('error', {errno: ERRORNO.CANNOT_SEEK, errmsg: '这个flv视频不支持seek'});
      return false;
    }
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'seek', keyframe});
    } else {
      this.loader.seek(keyframe.keyframePoint, false, keyframe.keyframetime);
    }
  }

  /**
   * destroy
   */
  destroy () {
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'destroy'});
      this.w.removeEventListener('message', this.onWorkMessage);
      this.w.terminate();
    } else {
      if(this.loader) {
        this.loaderUnbindEvent(this.loader);
        this.loader.destroy();
        this.loader = null;
      }
      if(this.CPU) {
        this.CPU.off('error');
        this.CPU = null;
      }
    }
  }

  /**
   * get nearlest keyframe binary search
   * @param {Number} video time
   */
  getNearestKeyframe (times) {
    if(this.mediaInfo && this.mediaInfo.keyframesIndex) {
      const keyframesList = this.mediaInfo.keyframesIndex.times;
      const keyframesPositions = this.mediaInfo.keyframesIndex.filepositions;
      const binarySearch = function (list, val) {
        const length = list.length;
        const index = Math.floor(length / 2);
        if(length === 1) {
          const position = keyframesList.indexOf(list[0]);
          return {
            keyframetime: list[0],
            keyframePoint: keyframesPositions[position]
          };
        } else if(list[index] > val) {
          return binarySearch(list.slice(0, index), val);
        } else if (list[index] < val) {
          return binarySearch(list.slice(index), val);
        } else {
          const position = keyframesList.indexOf(list[0]);
          return {
            keyframetime: list[0],
            keyframePoint: keyframesPositions[position]
          };
        }
      };
      return binarySearch(keyframesList, times);
    } else {
      return 0;
    }
  }
}
