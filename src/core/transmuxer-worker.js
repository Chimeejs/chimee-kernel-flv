import F2M from '../flv2fmp4';
import IoLoader from '../io/io-loader';
import { PLAYER_EVENTS } from '..//player-events';

export default function (ctx) {
  let CPU = null;
  let loader = null;
  let config = {};
  ctx.addEventListener('message', function (e) {
    switch (e.data.cmd) {
      case 'init':
        config = e.data.data;
      break;
      case 'loadSource':
        loader = new IoLoader(config);
        loaderBindEvent();
        loader.arrivalDataCallback = arrivalDataCallbackWorker;
        loader.open();
      break;
      case 'pause':
      loader.pause();
      break;
      case 'seek':
      seek(e.data.keyframe);
      break;
      case 'resume':
      loader.resume();
      break;
      case 'destroy':
      destroy();
      break;
    };
  });

  function init () {
    CPU = new F2M(config);
    CPU.onInitSegment = onRemuxerInitSegmentArrival;
    CPU.onMediaSegment = onRemuxerMediaSegmentArrival;
    CPU.onError = onCPUError;
    CPU.onMediaInfo = onMediaInfo;
    CPU.onCdnDropFrame = onCdnDropFrame;
    CPU.on('error', (handle)=> {
      self.postMessage({cmd: 'error', source: handle.data});
    });
  }

  function onRemuxerInitSegmentArrival (video, audio) {
    self.postMessage({
      cmd: 'mediaSegmentInit',
      source: {
        type: 'video',
        data: video
      }
    });
    if(audio) {
      self.postMessage({
        cmd: 'mediaSegmentInit',
        source: {
          type: 'audio',
          data: audio
        }
      });
    }
  }

  function onRemuxerMediaSegmentArrival (type, data) {
    self.postMessage({cmd: 'mediaSegment', source: {type, data}});
  }

  function onCPUError (error) {
    self.postMessage({cmd: 'error', source: error});
  }

  function onMediaInfo (mediainfo) {
    self.postMessage({cmd: 'mediainfo', source: mediainfo});
  }

  /**
   * cdn丢帧回调
   */
  function onCdnDropFrame (len) {
    self.postMessage({cmd: 'cdnDropFrame', source: len});
  }

  function seek (keyframe) {
    loader.seek(keyframe.keyframePoint, false, keyframe.keyframetime);
  }

  function destroy () {
    if(loader) {
      loader.destroy();
      loaderUnbindEvent(loader);
      loader = null;
    }
    if(CPU) {
      CPU.off('error');
      CPU = null;
    }
  }

  function arrivalDataCallbackWorker (data, byteStart, keyframePoint) {
    if(!CPU) {
      init();
    }
    if(keyframePoint) {
      CPU.seek(keyframePoint);
    }
    self.postMessage({cmd: 'player-event', source: {type: PLAYER_EVENTS.MEDIA_DEMUX_FLV, ts: Date.now()}});
    const consumed = CPU.setflv(data);
    return consumed;
  }

  /**
   * 给loader绑定事件
   */
  function loaderBindEvent () {
    if(loader) {
      loader.on('end', ()=> {
        self.postMessage({cmd: 'end'});
      });
      loader.on('error', (handle)=> {
        self.postMessage({cmd: 'error', source: handle.data});
      });
      loader.on('heartbeat', (handle)=> {
        self.postMessage({cmd: 'heartbeat', source: handle.data});
      });
      loader.on('player-event', (handle)=> {
        self.postMessage({cmd: 'player-event', source: handle.data});
      });
    }
  }
  /**
   * 解除事件绑定
   */
  function loaderUnbindEvent (target) {
    if(target) {
      target.off('end');
      target.off('error');
      target.off('heartbeat');
      target.off('player-event');
    }
  }
}
