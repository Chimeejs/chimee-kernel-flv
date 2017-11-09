import IoLoader from '../io/io-loader';
import {CustEvent} from 'chimee-helper-events';
import Log from 'chimee-helper-log';
import work from 'webworkify-webpack';
import F2M from '../cpu/flv2fmp4';
/**
 * Transmuxer controller
 * @class Transmuxer
 * @param {mediaSource} mediaSource
 * @param {object} config
 */
export default class Transmuxer extends CustEvent {
	constructor (mediaSource, config) {
		super();
		this.config = {};
		this.tag = 'transmuxer';
    this.loader = null;
    this.CPU = null;
    this.keyframePoint = false;
    this.w = null;
    Object.assign(this.config, config);
    if(this.config.webWorker) {
      this.w = work(require.resolve('./transmuxer-worker'));
      this.w.addEventListener('message', (e) => {
        this.parseCallback.call(this, e.data);
      });
      this.w.postMessage({cmd: 'init', data: config});
    }
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
      this.loader.open();
    }
  }
  /**
   * data arrive to webworker
   */
  // arrivalDataCallbackWorker (data, byteStart, keyframePoint) {
  //   if(keyframePoint) {
  //     this.w.postMessage({cmd: 'seek', source: data});
  //   }
  //   this.w.postMessage({cmd: 'pipe', source: data});
  //   return;
  // }
   /**
   * loader data callback
   * @param {arraybuffer} data
   * @param {number} bytestart
   * @param {keyframePoint} keyframe
   */
  arrivalDataCallback (data, byteStart, keyframePoint) {
    if(!this.CPU) {
      this.CPU = new F2M();
      this.CPU.onInitSegment = this.onRemuxerInitSegmentArrival.bind(this);
      this.CPU.onMediaSegment = this.onRemuxerMediaSegmentArrival.bind(this);
      this.CPU.onError = this.onCPUError.bind(this);
      this.CPU.onMediaInfo = this.onMediaInfo.bind(this);
      this.CPU.on('error', (handle)=> {
        this.emit('error', handle.data);
      });
    }
    if(keyframePoint) {
      this.CPU.seek(keyframePoint);
    }
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
    }
  }

  /**
   * Demux error
   *  @param {string} type
   *  @param {string} info
   */
  onDemuxError (type, info) {
  	Log.error(this.tag, `DemuxError: type = ${type}, info = ${info}`);
    this.emit('DemuxError', type, info);
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
   * cpu error
   * @param {object} error message
   */
  onCPUError (handle) {
    this.emit('ERROR', handle.data);
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
      this.emit('error', '这个flv视频不支持seek');
      return false;
    }
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'seek', keyframe});
    } else {
      // this.loader = new IoLoader(this.config);
      // this.loader.arrivalDataCallback = this.arrivalDataCallback.bind(this);
      this.loader.seek(keyframe.keyframePoint, false, keyframe.keyframetime);
    }
  }

  /**
   * refresh
   */
  refresh () {
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'refresh'});
    } else {
      this.pause();
      this.loader = new IoLoader(this.config);
      this.loader.arrivalDataCallback = this.arrivalDataCallback.bind(this);
      this.loader.open();
    }
  }

  /**
   * destroy
   */
  destroy () {
    if(this.config.webWorker) {
      this.w.postMessage({cmd: 'destroy'});
    } else {
      this.loader.destroy();
      this.loader = null;
      this.CPU = null;
    }
  }

  /**
   * get nearlest keyframe binary search
   * @param {Number} video time
   */
  getNearlestKeyframe (times) {
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
