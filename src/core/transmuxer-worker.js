import F2M from 'chimee-flv2fmp4';
import IoLoader from '../io/io-loader';

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
    CPU = new F2M();
    CPU.onInitSegment = onRemuxerInitSegmentArrival;
    CPU.onMediaSegment = onRemuxerMediaSegmentArrival;
    CPU.onError = onCPUError;
    CPU.onMediaInfo = onMediaInfo;
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

  function seek (keyframe) {
    loader.pause();
    loader = new IoLoader(config);
    loader.arrivalDataCallback = arrivalDataCallbackWorker;
    loader.seek(keyframe.keyframePoint, false, keyframe.keyframetime);
  }

  function destroy () {
    loader.destroy();
    loader = null;
    CPU = null;
  }

  function arrivalDataCallbackWorker (data, byteStart, keyframePoint) {
    if(!CPU) {
      init();
    }
    if(keyframePoint) {
      CPU.seek(keyframePoint);
    }
    const consumed = CPU.setflv(data);
    return consumed;
  }
}
