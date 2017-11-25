import Kernel from '../src/index';

const vnodeFlv = document.createElement('video');
vnodeFlv.setAttribute('controls', 'controls');
vnodeFlv.setAttribute('autoplay', 'autoplay');
vnodeFlv.setAttribute('width', '500');
vnodeFlv.setAttribute('height', '300');
document.body.appendChild(vnodeFlv);
// var player = document.getElementById("player");
const playerFlv = new Kernel(vnodeFlv, {
    src: ' http://yunxianchang.live.ujne7.com/vod-system-bj/114_40402c0cbbe-5eba-42dc-8442-e6e09aa4152e.flv',
    box: 'flv',
	  isLive: false,
		webWorker: false,
		seekType: 'range',
		stashSize: 1024 * 384
});
describe('kernel_Flv_event', function () {

  it('mediaInfo', (done)=> {
    playerFlv.on('mediaInfo', (mediaInfo) => {
      expect(typeof mediaInfo.data).toBe('object');
      done();
    });
  });
  it('heartbeat', (done)=> {
    playerFlv.on('heartbeat', (heartbeat) => {
      expect(typeof heartbeat.data).toBe('object');
      done();
    });
  });
    // it('muted', function () {
    //     expect(playerFlv.muted).toBe(false);
    //     playerFlv.muted = true;
    //     expect(playerFlv.muted).toBe(true);
    // });

    // it('volume', function () {
    //     expect(typeof playerFlv.volume).toBe('number');
    //     playerFlv.volume = 0.5;
    //     expect(playerFlv.volume).toBe(0.5);
    // });

    // it('play pause', function (done) {
    //     vnodeFlv.addEventListener('canplay', function () {
    //         playerFlv.play();
    //         expect(vnodeFlv.paused).toBe(false);
    //         const currentTime = playerFlv.currentTime;
    //         expect(typeof currentTime).toBe('number');
    //         try {
    //             vnodeFlv.currentTime = 100;
    //         } catch (e) {
    //             expect(e.toString()).toBe('Error: can not set currentTime by youself');
    //         }
    //         playerFlv.seek(100);
    //         expect(playerFlv.currentTime).toBe(98);
    //         playerFlv.pause();
    //         expect(vnodeFlv.paused).toBe(true);
    //         done();
    //     });
    // });

    // afterAll(function () {
    //     playerFlv.destroy();
    //     expect(vnodeFlv.getAttribute('src')).toBe('');
    // });
});
playerFlv.load();